// Cuenta con Google y copia en la nube (Firebase). Se carga solo si hay configuración en .env.local.
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { db, type Transaction } from './db';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
};

export const cloudEnabled = !!(config.apiKey && config.projectId);

let fb: Promise<{ auth: Auth; fs: Firestore }> | null = null;
function load() {
  if (!cloudEnabled) return Promise.reject(new Error('Falta configurar Firebase'));
  fb ??= (async () => {
    const [{ initializeApp }, { getAuth, setPersistence, indexedDBLocalPersistence }, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore')
    ]);
    const app = initializeApp(config);
    const auth = getAuth(app);
    await setPersistence(auth, indexedDBLocalPersistence);
    auth.languageCode = 'es';
    return { auth, fs: getFirestore(app) };
  })();
  return fb;
}

// ---------- Sesión ----------
export interface CloudUser { uid: string; name: string; email: string; photo?: string }
const toUser = (u: User | null): CloudUser | null => (u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? undefined } : null);

let current: CloudUser | null = null;
const subs = new Set<(u: CloudUser | null) => void>();
export function onUser(cb: (u: CloudUser | null) => void) {
  subs.add(cb);
  cb(current);
  return () => { subs.delete(cb); };
}

export async function initCloud() {
  if (!cloudEnabled) return;
  const { auth } = await load();
  const { onAuthStateChanged, getRedirectResult } = await import('firebase/auth');
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, (u) => {
    current = toUser(u);
    subs.forEach((s) => s(current));
  });
}

export async function signInWithGoogle() {
  const { auth } = await load();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await signInWithRedirect(auth, provider);
    else if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) throw e;
  }
}

export async function signOut() {
  const { auth } = await load();
  const { signOut: so } = await import('firebase/auth');
  await so(auth);
}

// ---------- Copia en la nube ----------
// Se guarda en trozos de ~700 KB (Firestore admite 1 MB por documento). Las fotos se quedan en el móvil.
const CHUNK = 700_000;

async function snapshot() {
  const txs = await db.transactions.toArray();
  return JSON.stringify({
    app: 'eco',
    version: 2,
    savedAt: new Date().toISOString(),
    wallets: await db.wallets.toArray(),
    categories: await db.categories.toArray(),
    recurring: await db.recurring.toArray(),
    budgets: await db.budgets.toArray(),
    people: await db.people.toArray(),
    settings: (await db.settings.toArray()).filter((s) => s.key !== 'privacy'),
    transactions: txs.map(({ photo: _p, ...t }) => t)
  });
}

export async function backupNow() {
  if (!current) throw new Error('Inicia sesión primero');
  const { fs } = await load();
  const { doc, writeBatch } = await import('firebase/firestore');
  const json = await snapshot();
  const parts = Math.ceil(json.length / CHUNK);
  const batch = writeBatch(fs);
  for (let i = 0; i < parts; i++) batch.set(doc(fs, 'users', current.uid, 'backup', `part${i}`), { data: json.slice(i * CHUNK, (i + 1) * CHUNK) });
  batch.set(doc(fs, 'users', current.uid), { parts, savedAt: Date.now(), name: current.name }, { merge: true });
  await batch.commit();
  localStorage.setItem('eco:lastBackup', String(Date.now()));
  return Date.now();
}

export async function cloudInfo(): Promise<{ savedAt: number; parts: number } | null> {
  if (!current) return null;
  const { fs } = await load();
  const { doc, getDoc } = await import('firebase/firestore');
  const d = await getDoc(doc(fs, 'users', current.uid));
  return d.exists() ? (d.data() as { savedAt: number; parts: number }) : null;
}

export async function restoreFromCloud() {
  if (!current) throw new Error('Inicia sesión primero');
  const { fs } = await load();
  const { doc, getDoc } = await import('firebase/firestore');
  const info = await cloudInfo();
  if (!info) throw new Error('Todavía no hay ninguna copia en la nube');
  let json = '';
  for (let i = 0; i < info.parts; i++) json += ((await getDoc(doc(fs, 'users', current.uid, 'backup', `part${i}`))).data()?.data as string) ?? '';
  const data = JSON.parse(json);
  // Conservamos las fotos que hubiera en este móvil
  const photos = new Map((await db.transactions.toArray()).filter((t) => t.photo).map((t) => [t.id, t.photo]));
  await db.transaction('rw', [db.wallets, db.categories, db.recurring, db.budgets, db.settings, db.transactions, db.people], async () => {
    await Promise.all([db.wallets.clear(), db.categories.clear(), db.recurring.clear(), db.budgets.clear(), db.transactions.clear(), db.people.clear()]);
    await db.wallets.bulkAdd(data.wallets);
    await db.categories.bulkAdd(data.categories);
    await db.recurring.bulkAdd(data.recurring);
    await db.budgets.bulkAdd(data.budgets);
    await db.people.bulkAdd(data.people ?? []);
    await db.settings.bulkPut(data.settings);
    await db.transactions.bulkAdd((data.transactions as Transaction[]).map((t) => (photos.has(t.id) ? { ...t, photo: photos.get(t.id) } : t)));
  });
}

// Copia automática: un rato después del último cambio
let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleBackup() {
  if (!current) return;
  clearTimeout(timer);
  timer = setTimeout(() => backupNow().catch(() => {}), 20_000);
}

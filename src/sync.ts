// Modo pareja: un «espacio compartido» en Firestore que se sincroniza en tiempo real con la base local.
//
//  households/{hid}            { name, members: [uid], names: {uid: nombre}, photos, code, createdAt }
//  households/{hid}/docs/{t_id} { t: tabla, id, d: JSON del registro, del?: true, u: fecha servidor, by: uid }
//  invites/{code}              { hid, owner }
//
// La app sigue leyendo y escribiendo en Dexie (funciona sin conexión). Unos ganchos apuntan cada cambio
// en una cola (localStorage) que se sube a Firestore, y un listener baja los cambios de la otra persona.
import type { Unsubscribe } from 'firebase/firestore';
import { db, SYNC_TABLES, type SyncTable, type Transaction } from './db';
import { currentUser, load, onUser, backupNow } from './cloud';

export interface Household {
  id: string;
  name: string;
  members: string[];
  names: Record<string, string>;
  photos?: Record<string, string>;
  code: string;
}

const LS_HOUSE = 'eco:household';
const LS_OUTBOX = 'eco:outbox';
const LS_PULL = 'eco:lastPull';

// ---------- Estado ----------
let house: Household | null = (() => {
  try { return JSON.parse(localStorage.getItem(LS_HOUSE) || 'null'); } catch { return null; }
})();
const subs = new Set<(h: Household | null) => void>();
const setHouse = (h: Household | null) => {
  house = h;
  if (h) localStorage.setItem(LS_HOUSE, JSON.stringify(h));
  else localStorage.removeItem(LS_HOUSE);
  subs.forEach((s) => s(h));
};
export const getHousehold = () => house;
export function onHousehold(cb: (h: Household | null) => void) {
  subs.add(cb);
  cb(house);
  return () => { subs.delete(cb); };
}

// ---------- Cola de cambios locales ----------
const outbox = new Set<string>(JSON.parse(localStorage.getItem(LS_OUTBOX) || '[]'));
const saveOutbox = () => localStorage.setItem(LS_OUTBOX, JSON.stringify([...outbox]));
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function enqueue(t: SyncTable, id: unknown) {
  if (!house || id == null) return;
  outbox.add(`${t}:${id}`);
  saveOutbox();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => {}), 600);
}

// Los cambios que llegan de la otra persona se aplican en transacciones marcadas como «remote»
type MaybeRemote = { remote?: boolean };
for (const t of SYNC_TABLES) {
  const table = db.table(t);
  table.hook('creating', function (primKey, obj: { id?: number; by?: string }, tx) {
    if ((tx as unknown as MaybeRemote).remote) return;
    if (t === 'transactions' && house && !obj.by) obj.by = currentUser()?.uid;
    // El id se asigna en el gancho de db.ts; lo recogemos cuando termine
    this.onsuccess = (key) => enqueue(t, key ?? primKey ?? obj.id);
  });
  table.hook('updating', function (_mods, primKey, _obj, tx) {
    if (!(tx as unknown as MaybeRemote).remote) enqueue(t, primKey);
  });
  table.hook('deleting', function (primKey, _obj, tx) {
    if (!(tx as unknown as MaybeRemote).remote) enqueue(t, primKey);
  });
}

function serialize(rec: Record<string, unknown>) {
  const { photo: _photo, ...rest } = rec as { photo?: unknown };
  return JSON.stringify(rest);
}

/** Sube los cambios pendientes. */
export async function flush() {
  if (!house || !outbox.size || !currentUser()) return;
  const { fs } = await load();
  const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
  const keys = [...outbox].slice(0, 400);
  const batch = writeBatch(fs);
  for (const k of keys) {
    const [t, rawId] = k.split(':') as [SyncTable, string];
    const id = Number(rawId);
    const rec = await db.table(t).get(id);
    const ref = doc(fs, 'households', house.id, 'docs', `${t}_${id}`);
    if (rec) batch.set(ref, { t, id, d: serialize(rec), u: serverTimestamp(), by: currentUser()!.uid });
    else batch.set(ref, { t, id, del: true, u: serverTimestamp(), by: currentUser()!.uid });
  }
  await batch.commit();
  keys.forEach((k) => outbox.delete(k));
  saveOutbox();
  if (outbox.size) await flush();
}

/** Sube todo lo que hay en este móvil (al crear el espacio). */
async function uploadAll() {
  for (const t of SYNC_TABLES) {
    const keys = await db.table(t).toCollection().primaryKeys();
    keys.forEach((k) => outbox.add(`${t}:${k}`));
  }
  saveOutbox();
  await flush();
}

// ---------- Escuchar los cambios de la otra persona ----------
let unsubDocs: Unsubscribe | null = null;
let unsubHouse: Unsubscribe | null = null;

async function listen() {
  stopListening();
  const me = currentUser();
  if (!house || !me) return;
  const { fs } = await load();
  const { collection, doc, onSnapshot, query, where, Timestamp } = await import('firebase/firestore');
  const since = Number(localStorage.getItem(LS_PULL) || 0);

  unsubHouse = onSnapshot(doc(fs, 'households', house.id), (snap) => {
    if (!snap.exists() || !(snap.data().members as string[]).includes(me.uid)) {
      // Nos han sacado del espacio (o se ha borrado): seguimos con los datos locales como personales
      stopListening();
      setHouse(null);
      return;
    }
    setHouse({ id: snap.id, ...(snap.data() as Omit<Household, 'id'>) });
  }, (err) => {
    if (err.code === 'permission-denied') { stopListening(); setHouse(null); }
  });

  const q = query(collection(fs, 'households', house.id, 'docs'), where('u', '>=', Timestamp.fromMillis(since)));
  unsubDocs = onSnapshot(q, async (snap) => {
    const changes = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
    if (!changes.length) return;
    let maxU = since;
    await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async (tx) => {
      (tx as unknown as MaybeRemote).remote = true;
      for (const c of changes) {
        const v = c.doc.data() as { t: SyncTable; id: number; d?: string; del?: boolean; u?: { toMillis(): number } };
        if (v.u) maxU = Math.max(maxU, v.u.toMillis());
        if (!SYNC_TABLES.includes(v.t)) continue;
        // Si aquí hay un cambio sin subir de ese mismo registro, gana el local
        if (outbox.has(`${v.t}:${v.id}`)) continue;
        const table = db.table(v.t);
        if (v.del) await table.delete(v.id);
        else if (v.d) {
          const rec = JSON.parse(v.d);
          if (v.t === 'transactions') {
            const old = (await table.get(v.id)) as Transaction | undefined;
            if (old?.photo) rec.photo = old.photo; // las fotos se quedan en cada móvil
          }
          await table.put(rec);
        }
      }
    });
    localStorage.setItem(LS_PULL, String(maxU));
  });
}

function stopListening() {
  unsubDocs?.();
  unsubHouse?.();
  unsubDocs = unsubHouse = null;
}

// ---------- Crear, unirse, salir ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** Crea el espacio compartido con los datos de este móvil y devuelve el código de invitación. */
export async function createHousehold(name = 'Nuestra casa') {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  const { fs } = await load();
  const { collection, doc, setDoc, writeBatch } = await import('firebase/firestore');
  const ref = doc(collection(fs, 'households'));
  const code = makeCode();
  const data = { name, members: [me.uid], names: { [me.uid]: me.name || me.email }, photos: me.photo ? { [me.uid]: me.photo } : {}, code, createdAt: Date.now() };
  await setDoc(ref, data);
  const b = writeBatch(fs);
  b.set(doc(fs, 'invites', code), { hid: ref.id, owner: me.uid });
  await b.commit();
  // Marcamos los movimientos existentes como apuntados por mí
  await db.transactions.toCollection().modify((t) => { if (!t.by) t.by = me.uid; });
  setHouse({ id: ref.id, ...data });
  localStorage.setItem(LS_PULL, String(Date.now()));
  await uploadAll();
  await listen();
  return code;
}

/** Busca un código de invitación (para enseñar a qué espacio te vas a unir). */
export async function lookupInvite(code: string) {
  const { fs } = await load();
  const { doc, getDoc } = await import('firebase/firestore');
  const inv = await getDoc(doc(fs, 'invites', code.trim().toUpperCase()));
  if (!inv.exists()) throw new Error('Ese código no existe. Revisa que esté bien escrito.');
  return inv.data() as { hid: string; owner: string };
}

/** Se une a un espacio: guarda antes una copia de sus datos personales y descarga los compartidos. */
export async function joinHousehold(code: string) {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  const { fs } = await load();
  const { doc, getDoc, updateDoc, arrayUnion } = await import('firebase/firestore');
  const c = code.trim().toUpperCase();
  const { hid } = await lookupInvite(c);
  await backupNow().catch(() => {}); // por si quiere volver a sus datos de antes
  await updateDoc(doc(fs, 'households', hid), {
    members: arrayUnion(me.uid),
    [`names.${me.uid}`]: me.name || me.email,
    ...(me.photo ? { [`photos.${me.uid}`]: me.photo } : {}),
    joinCode: c
  });
  const snap = await getDoc(doc(fs, 'households', hid));
  // Empezamos de cero con los datos del espacio
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async (tx) => {
    (tx as unknown as MaybeRemote).remote = true;
    await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()));
  });
  outbox.clear();
  saveOutbox();
  localStorage.setItem(LS_PULL, '0');
  setHouse({ id: hid, ...(snap.data() as Omit<Household, 'id'>) });
  await listen();
}

/** Sale del espacio. Los datos se quedan en este móvil como personales. */
export async function leaveHousehold() {
  const me = currentUser();
  if (!house || !me) return setHouse(null);
  const { fs } = await load();
  const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
  await flush().catch(() => {});
  stopListening();
  await updateDoc(doc(fs, 'households', house.id), { members: arrayRemove(me.uid) });
  setHouse(null);
}

/** Nombre corto de un miembro. */
export function memberName(uid?: string) {
  if (!uid || !house) return undefined;
  return (house.names[uid] ?? '').split(' ')[0];
}

// Al iniciar o cerrar sesión, se activa o se para la sincronización
export function initSync() {
  onUser((u) => {
    if (u && house) {
      listen().catch(() => {});
      flush().catch(() => {});
    } else stopListening();
  });
  window.addEventListener('online', () => flush().catch(() => {}));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && flush().catch(() => {}));
}

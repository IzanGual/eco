// Compartir carteras con tu pareja.
//
// Cada uno tiene su Eco. Cuando conectáis, eliges qué carteras compartes: esas carteras y sus movimientos
// (y sus repeticiones) se sincronizan en tiempo real entre los dos móviles. Todo lo demás sigue siendo tuyo.
//
//  households/{hid}             { name, members: [uid], names: {uid: nombre}, photos, code, createdAt }
//  households/{hid}/docs/{t_id} { t: tabla, id, d: JSON del registro, del?: true, u: fecha servidor, by: uid }
//  invites/{code}               { hid, owner }
//
// Las categorías no se sincronizan: cada movimiento viaja con el nombre de su categoría y en el otro móvil
// se busca (o se crea) una con el mismo nombre. Así cada uno conserva sus categorías.
import type { Unsubscribe } from 'firebase/firestore';
import { db, newId, SHARED_TABLES, type Category, type Recurring, type SharedTable, type Transaction, type Wallet } from './db';
import { currentUser, load, onUser } from './cloud';

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
const LS_SENT = 'eco:sharedKeys';

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

const loadSet = (k: string) => new Set<string>(JSON.parse(localStorage.getItem(k) || '[]'));
// Cola de cambios locales pendientes de subir
const outbox = loadSet(LS_OUTBOX);
const saveOutbox = () => localStorage.setItem(LS_OUTBOX, JSON.stringify([...outbox]));
// Registros que están (o estuvieron) en el espacio compartido: solo de esos se envían borrados
const sent = loadSet(LS_SENT);
const saveSent = () => localStorage.setItem(LS_SENT, JSON.stringify([...sent]));

let flushTimer: ReturnType<typeof setTimeout> | undefined;
function enqueue(t: SharedTable, id: unknown) {
  if (!house || id == null) return;
  outbox.add(`${t}:${id}`);
  saveOutbox();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => {}), 500);
}

// Los cambios que llegan de la pareja se aplican en transacciones marcadas como «remote»
type MaybeRemote = { remote?: boolean };
for (const t of SHARED_TABLES) {
  const table = db.table(t);
  table.hook('creating', function (primKey, obj: { id?: number; by?: string }, tx) {
    if ((tx as unknown as MaybeRemote).remote) return;
    if ((t === 'transactions' || t === 'recurring') && house && !obj.by) obj.by = currentUser()?.uid;
    this.onsuccess = (key) => enqueue(t, key ?? primKey ?? obj.id);
  });
  table.hook('updating', function (_mods, primKey, _obj, tx) {
    if (!(tx as unknown as MaybeRemote).remote) enqueue(t, primKey);
  });
  table.hook('deleting', function (primKey, _obj, tx) {
    if (!(tx as unknown as MaybeRemote).remote) enqueue(t, primKey);
  });
}

/** ¿Este registro viaja a la pareja? (es de una cartera compartida y no está marcado «Solo para mí») */
async function isShared(t: SharedTable, rec: Record<string, unknown>) {
  if (t === 'wallets') return !!rec.shared;
  if (rec.private) return false;
  for (const id of [rec.walletId, rec.toWalletId]) {
    if (id != null && (await db.wallets.get(id as number))?.shared) return true;
  }
  return false;
}

// ---------- Categorías y personas por nombre ----------
interface CatRef { name: string; type: Category['type']; icon: string; color: string; parent?: { name: string; icon: string; color: string } }
async function catRef(id?: number): Promise<CatRef | undefined> {
  if (id == null) return undefined;
  const c = await db.categories.get(id);
  if (!c) return undefined;
  const p = c.parentId != null ? await db.categories.get(c.parentId) : undefined;
  return { name: c.name, type: c.type, icon: c.icon, color: c.color, parent: p ? { name: p.name, icon: p.icon, color: p.color } : undefined };
}
export async function resolveCat(r?: CatRef): Promise<number | undefined> {
  if (!r) return undefined;
  const all = await db.categories.toArray();
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let parentId: number | null = null;
  if (r.parent) {
    let p = all.find((c) => c.type === r.type && c.parentId == null && same(c.name, r.parent!.name));
    if (!p) {
      const id = await db.categories.add({ name: r.parent.name, icon: r.parent.icon, color: r.parent.color, type: r.type, parentId: null, order: 99 });
      p = { id, name: r.parent.name, icon: r.parent.icon, color: r.parent.color, type: r.type, parentId: null, order: 99 };
      all.push(p);
    }
    parentId = p.id!;
  }
  const hit = all.find((c) => c.type === r.type && c.parentId === parentId && same(c.name, r.name));
  if (hit) return hit.id;
  return db.categories.add({ name: r.name, icon: r.icon, color: r.color, type: r.type, parentId, order: 99 });
}
async function resolvePerson(r?: { name: string; color: string }): Promise<number | undefined> {
  if (!r) return undefined;
  const hit = (await db.people.toArray()).find((p) => p.name.trim().toLowerCase() === r.name.trim().toLowerCase());
  return hit?.id ?? db.people.add({ name: r.name, color: r.color });
}

async function serialize(t: SharedTable, rec: Record<string, unknown>) {
  const { photo: _photo, ...rest } = rec as { photo?: unknown; categoryId?: number; personId?: number };
  if (t === 'transactions' || t === 'recurring') {
    const r = rest as { categoryId?: number; personId?: number };
    const person = r.personId != null ? await db.people.get(r.personId) : undefined;
    return JSON.stringify({ ...rest, _cat: await catRef(r.categoryId), _person: person ? { name: person.name, color: person.color } : undefined });
  }
  return JSON.stringify(rest);
}

/** Sube los cambios pendientes. */
export async function flush() {
  if (!house || !outbox.size || !currentUser()) return;
  const { fs } = await load();
  const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
  const keys = [...outbox].slice(0, 400);
  const batch = writeBatch(fs);
  let writes = 0;
  for (const k of keys) {
    const [t, rawId] = k.split(':') as [SharedTable, string];
    const id = Number(rawId);
    const rec = (await db.table(t).get(id)) as Record<string, unknown> | undefined;
    const ref = doc(fs, 'households', house.id, 'docs', `${t}_${id}`);
    const base = { t, id, u: serverTimestamp(), by: currentUser()!.uid };
    if (rec && (await isShared(t, rec))) {
      batch.set(ref, { ...base, d: await serialize(t, rec) });
      sent.add(k);
      writes++;
    } else if (sent.has(k)) {
      // Estaba compartido y ya no (borrado, privado o cartera dejada de compartir): se retira
      batch.set(ref, { ...base, del: true });
      sent.delete(k);
      writes++;
    }
  }
  if (writes) await batch.commit();
  keys.forEach((k) => outbox.delete(k));
  saveOutbox();
  saveSent();
  if (outbox.size) await flush();
}

// ---------- Escuchar los cambios de la pareja ----------
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
    type Doc = { t: SharedTable; id: number; d?: string; del?: boolean; u?: { toMillis(): number } };
    const order = { wallets: 0, recurring: 1, transactions: 2 } as Record<string, number>;
    const changes = snap.docChanges()
      .filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
      .map((c) => c.doc.data() as Doc)
      .filter((v) => (SHARED_TABLES as readonly string[]).includes(v.t))
      .sort((a, b) => order[a.t] - order[b.t]); // primero las carteras, luego lo que cuelga de ellas
    if (!changes.length) return;
    let maxU = since;
    await db.transaction('rw', [db.wallets, db.transactions, db.recurring, db.categories, db.people], async (tx) => {
      (tx as unknown as MaybeRemote).remote = true;
      for (const v of changes) {
        if (v.u) maxU = Math.max(maxU, v.u.toMillis());
        const key = `${v.t}:${v.id}`;
        if (outbox.has(key)) continue; // hay un cambio local sin subir: gana el local
        const table = db.table(v.t);
        const local = (await table.get(v.id)) as Transaction | undefined;
        if (local?.private) continue; // lo «Solo para mí» nunca se toca desde fuera
        if (v.del) {
          await table.delete(v.id);
          sent.delete(key);
          if (v.t === 'wallets') {
            // Si dejan de compartirte una cartera, desaparece con sus movimientos
            await db.transactions.where('walletId').equals(v.id).delete();
            await db.recurring.filter((r) => r.walletId === v.id).delete();
          }
          continue;
        }
        if (!v.d) continue;
        const rec = JSON.parse(v.d) as Record<string, unknown> & { _cat?: CatRef; _person?: { name: string; color: string } };
        if (v.t === 'transactions' || v.t === 'recurring') {
          rec.categoryId = await resolveCat(rec._cat);
          rec.personId = await resolvePerson(rec._person);
          delete rec._cat;
          delete rec._person;
          if (local?.photo) rec.photo = local.photo; // las fotos se quedan en cada móvil
        }
        await table.put(rec);
        sent.add(key);
      }
    });
    saveSent();
    localStorage.setItem(LS_PULL, String(maxU));
  });
}

function stopListening() {
  unsubDocs?.();
  unsubHouse?.();
  unsubDocs = unsubHouse = null;
}

// ---------- Compartir una cartera ----------
/** Las carteras antiguas tienen ids pequeños (1, 2…) que chocarían con los de tu pareja: se les da uno nuevo. */
export async function rekeyWallet(id: number): Promise<number> {
  if (id >= 1e12) return id;
  const nid = newId();
  await db.transaction('rw', db.wallets, db.transactions, db.recurring, async () => {
    const w = (await db.wallets.get(id)) as Wallet;
    await db.wallets.add({ ...w, id: nid });
    await db.wallets.delete(id);
    await db.transactions.where('walletId').equals(id).modify({ walletId: nid });
    await db.transactions.where('toWalletId').equals(id).modify({ toWalletId: nid });
    await db.recurring.filter((r) => r.walletId === id).modify({ walletId: nid });
    await db.recurring.filter((r) => r.toWalletId === id).modify({ toWalletId: nid });
    // Repeticiones y movimientos con ids antiguos, también
    const recMap = new Map<number, number>();
    for (const r of await db.recurring.filter((r) => (r.walletId === nid || r.toWalletId === nid) && r.id! < 1e12).toArray()) {
      const rid = newId();
      recMap.set(r.id!, rid);
      await db.recurring.delete(r.id!);
      await db.recurring.add({ ...(r as Recurring), id: rid });
    }
    for (const t of await db.transactions.filter((t) => t.walletId === nid || t.toWalletId === nid).toArray()) {
      const recurringId = t.recurringId != null ? recMap.get(t.recurringId) ?? t.recurringId : undefined;
      if (t.id! < 1e12) {
        await db.transactions.delete(t.id!);
        await db.transactions.add({ ...t, id: newId(), recurringId });
      } else if (recurringId !== t.recurringId) await db.transactions.update(t.id!, { recurringId });
    }
  });
  if (localStorage.getItem('eco:lastWallet') === String(id)) localStorage.setItem('eco:lastWallet', String(nid));
  return nid;
}

/** Comparte (o deja de compartir) una cartera con tu pareja. Devuelve el id de la cartera (puede cambiar). */
export async function setWalletShared(id: number, on: boolean) {
  const me = currentUser();
  if (!house || !me) throw new Error('Primero conecta con tu pareja en Ajustes → En pareja');
  const wid = on ? await rekeyWallet(id) : id;
  await db.wallets.update(wid, { shared: on || undefined, owner: on ? me.uid : undefined });
  // Sus movimientos y repeticiones se envían (o se retiran)
  const txs = await db.transactions.filter((t) => t.walletId === wid || t.toWalletId === wid).toArray();
  if (on) await db.transactions.filter((t) => (t.walletId === wid || t.toWalletId === wid) && !t.by).modify({ by: me.uid });
  txs.forEach((t) => enqueue('transactions', t.id));
  (await db.recurring.filter((r) => r.walletId === wid || r.toWalletId === wid).toArray()).forEach((r) => enqueue('recurring', r.id));
  enqueue('wallets', wid);
  await flush();
  return wid;
}

// ---------- Conectar, unirse, salir ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** Crea la conexión con tu pareja (aún no comparte nada) y devuelve el código de invitación. */
export async function createHousehold(name = 'Nuestra casa') {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  const { fs } = await load();
  const { collection, doc, setDoc } = await import('firebase/firestore');
  const ref = doc(collection(fs, 'households'));
  const code = makeCode();
  const data = { name, members: [me.uid], names: { [me.uid]: me.name || me.email }, photos: me.photo ? { [me.uid]: me.photo } : {}, code, createdAt: Date.now() };
  await setDoc(ref, data);
  await setDoc(doc(fs, 'invites', code), { hid: ref.id, owner: me.uid });
  setHouse({ id: ref.id, ...data });
  localStorage.setItem(LS_PULL, '0');
  await listen();
  return code;
}

/** Busca un código de invitación. */
export async function lookupInvite(code: string) {
  const { fs } = await load();
  const { doc, getDoc } = await import('firebase/firestore');
  const inv = await getDoc(doc(fs, 'invites', code.trim().toUpperCase()));
  if (!inv.exists()) throw new Error('Ese código no existe. Revisa que esté bien escrito.');
  return inv.data() as { hid: string; owner: string };
}

/** Se une a la conexión de su pareja. No toca sus datos: solo empezará a ver las carteras que le compartan. */
export async function joinHousehold(code: string) {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  const { fs } = await load();
  const { doc, getDoc, updateDoc, arrayUnion } = await import('firebase/firestore');
  const c = code.trim().toUpperCase();
  const { hid } = await lookupInvite(c);
  await updateDoc(doc(fs, 'households', hid), {
    members: arrayUnion(me.uid),
    [`names.${me.uid}`]: me.name || me.email,
    ...(me.photo ? { [`photos.${me.uid}`]: me.photo } : {}),
    joinCode: c
  });
  const snap = await getDoc(doc(fs, 'households', hid));
  localStorage.setItem(LS_PULL, '0');
  setHouse({ id: hid, ...(snap.data() as Omit<Household, 'id'>) });
  await listen();
}

/** Se desconecta. Las carteras compartidas se quedan en este móvil como tuyas, pero dejan de sincronizarse. */
export async function leaveHousehold() {
  const me = currentUser();
  if (!house || !me) return setHouse(null);
  const { fs } = await load();
  const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
  await flush().catch(() => {});
  stopListening();
  await updateDoc(doc(fs, 'households', house.id), { members: arrayRemove(me.uid) });
  await db.wallets.toCollection().modify((w) => { if (w.shared) { delete w.shared; delete w.owner; } });
  sent.clear();
  saveSent();
  setHouse(null);
}

/** Nombre corto de un miembro. */
export function memberName(uid?: string) {
  if (!uid || !house) return undefined;
  return (house.names[uid] ?? '').split(' ')[0];
}

/** Nombre de la pareja (el otro miembro). */
export function partnerName() {
  const me = currentUser()?.uid;
  const other = house?.members.find((m) => m !== me);
  return other ? memberName(other) : undefined;
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

/** Vuelve a enviar unos registros. */
export function resend(t: SharedTable, ids: number[]) {
  ids.forEach((id) => enqueue(t, id));
}

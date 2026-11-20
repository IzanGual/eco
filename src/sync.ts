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
import { currentUser, load, onUser, type CloudUser } from './cloud';
import { APP_VERSION } from './update';

export interface Household {
  id: string;
  name: string;
  members: string[];
  names: Record<string, string>;
  photos?: Record<string, string>;
  code: string;
  createdAt?: number;
  versions?: Record<string, string>; // versión de la app de cada uno (para avisar si alguien va atrasado)
}

const LS_HOUSE = 'eco:household';
const LS_HOUSE_USER = 'eco:householdUser'; // con qué cuenta de Google se conectó este móvil
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

type HouseUser = { uid: string; email: string };
const getHouseUser = (): HouseUser | null => {
  try { return JSON.parse(localStorage.getItem(LS_HOUSE_USER) || 'null'); } catch { return null; }
};
const setHouseUser = (u: HouseUser | null) => {
  if (u) localStorage.setItem(LS_HOUSE_USER, JSON.stringify(u));
  else localStorage.removeItem(LS_HOUSE_USER);
};

// Algo no cuadra con la cuenta (se ve en «En pareja»). Nunca se desconecta solo: lo decide la persona.
//  otherAccount: este móvil se conectó con otra cuenta de Google distinta a la de ahora
//  notMember:    con la cuenta de ahora no estás en ningún espacio de pareja
export type SyncProblem = { kind: 'otherAccount' | 'notMember'; email: string; boundEmail?: string } | null;
let problem: SyncProblem = null;
const problemSubs = new Set<(p: SyncProblem) => void>();
const setProblem = (p: SyncProblem) => {
  problem = p;
  problemSubs.forEach((s) => s(p));
};
export function onSyncProblem(cb: (p: SyncProblem) => void) {
  problemSubs.add(cb);
  cb(problem);
  return () => { problemSubs.delete(cb); };
}
const toastLater = (text: string) => { import('./components/ui').then((ui) => ui.toast(text)).catch(() => {}); };
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

// Cada cambio local lleva un número: si un registro cambia otra vez mientras se sube (con poca cobertura la subida
// puede tardar mucho), no se quita de la cola al terminar y se vuelve a subir con lo último
let changeSeq = 0;
const changedAt = new Map<string, number>();

let flushTimer: ReturnType<typeof setTimeout> | undefined;
function enqueue(t: SharedTable, id: unknown) {
  if (!house || id == null) return;
  const k = `${t}:${id}`;
  outbox.add(k);
  changedAt.set(k, ++changeSeq);
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
  return inSharedWallet(rec);
}

/** ¿Este movimiento o repetición toca alguna cartera compartida de este móvil? */
async function inSharedWallet(rec: object) {
  const r = rec as { walletId?: number; toWalletId?: number };
  for (const id of [r.walletId, r.toWalletId]) {
    if (id != null && (await db.wallets.get(id))?.shared) return true;
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

/** Sube los cambios pendientes (una sola subida a la vez; lo que llegue mientras tanto va en la siguiente). */
let flushing: Promise<void> | null = null;
let flushAgain = false;
export function flush(): Promise<void> {
  if (flushing) { flushAgain = true; return flushing; }
  flushing = (async () => {
    do {
      flushAgain = false;
      while (await flushBatch()) { /* hasta vaciar la cola */ }
    } while (flushAgain);
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Sube hasta 400 cambios. Devuelve true si aún queda algo por subir. */
async function flushBatch(): Promise<boolean> {
  if (!house || !outbox.size || !currentUser()) return false;
  const { fs } = await load();
  const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
  const keys = [...outbox].slice(0, 400);
  const seqs = keys.map((k) => changedAt.get(k));
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
  keys.forEach((k, i) => {
    if (changedAt.get(k) !== seqs[i]) return; // cambió mientras subía: se queda para la siguiente
    outbox.delete(k);
    changedAt.delete(k);
  });
  saveOutbox();
  saveSent();
  return outbox.size > 0;
}

// ---------- Escuchar los cambios de la pareja ----------
let unsubDocs: Unsubscribe | null = null;
let unsubHouse: Unsubscribe | null = null;

let listenRun = 0;
const rechecked = new Set<string>();

async function listen() {
  stopListening();
  const run = ++listenRun; // si se vuelve a llamar mientras tanto, esta llamada se retira
  const me = currentUser();
  if (!house || !me) return;
  const { fs } = await load();
  const { collection, doc, onSnapshot, query, where, Timestamp, updateDoc } = await import('firebase/firestore');
  await cleanLegacy(house.id, me.uid).catch(() => {});
  if (!house || run !== listenRun) return;
  const hid = house.id;
  const since = Number(localStorage.getItem(LS_PULL) || 0);

  unsubHouse = onSnapshot(doc(fs, 'households', hid), (snap) => {
    const data = snap.data() as Omit<Household, 'id'> | undefined;
    if (!data || !data.members.includes(me.uid)) return recheck(hid);
    setHouse({ id: snap.id, ...data });
    // Cada uno apunta qué versión usa: así «En pareja» avisa si el otro va atrasado
    if (data.versions?.[me.uid] !== APP_VERSION) updateDoc(snap.ref, { [`versions.${me.uid}`]: APP_VERSION }).catch(() => {});
  }, (err) => {
    // Sin permiso = la nube dice que no eres miembro (o has entrado con otra cuenta). No se desconecta a ciegas:
    // se pregunta a la nube en qué espacio estás de verdad.
    if (err.code === 'permission-denied') recheck(hid);
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
        // Solo se toca lo que es de una cartera compartida: lo personal de cada uno nunca se pisa ni se borra
        // (y se ignoran los restos de la versión antigua, que lo compartía todo)
        if (v.t === 'wallets') {
          if (local && !(local as unknown as Wallet).shared) continue;
        } else if (local && !(await inSharedWallet(local))) continue;
        if (v.del) {
          if (!local) continue;
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
        if (v.t === 'wallets' && !rec.shared) continue;
        if (v.t !== 'wallets' && (rec.private || !(await inSharedWallet(rec)))) continue;
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

// ---------- Limpieza de la versión antigua ----------
// La primera versión del modo pareja lo compartía todo: al unirse, el móvil de quien se unía se quedaba con
// una copia de TODAS las carteras de quien creó la conexión, como si fueran suyas. Aquí se quitan de este
// móvil las carteras que subió la pareja con esa versión y que ahora no están compartidas (con sus
// movimientos y repeticiones). Lo que la pareja comparta de verdad vuelve a llegar solo.
// Se hace una vez por conexión y se guarda una copia de lo quitado en Ajustes (clave «legacyBackup»).
async function cleanLegacy(hid: string, me: string) {
  const flag = `eco:legacyClean:${hid}`;
  if (localStorage.getItem(flag)) return;
  const { fs } = await load();
  const { collection, getDocs, query, where } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(fs, 'households', hid, 'docs'), where('t', '==', 'wallets')));
  // Las carteras con id pequeño (1, 2…) son las de antes de conectar de quien creó la conexión
  const creator = house?.members[0] === me;
  const gone = new Set<number>();
  for (const d of snap.docs) {
    const v = d.data() as { id: number; d?: string; del?: boolean; by?: string };
    if (v.del || !v.d) continue;
    if (v.id < 1e12 ? creator : v.by === me) continue;
    let rec: { shared?: boolean };
    try { rec = JSON.parse(v.d); } catch { continue; }
    if (rec.shared) continue;
    const local = await db.wallets.get(v.id);
    if (!local || local.shared) continue;
    // Si en ella hay algo apuntado por ti, es tuya (aunque la tocara tu pareja por última vez): no se quita
    if (await db.transactions.filter((t) => (t.walletId === v.id || t.toWalletId === v.id) && t.by === me).count()) continue;
    gone.add(v.id);
  }
  if (gone.size) {
    const inGone = (id?: number) => id != null && gone.has(id);
    // Se quitan los movimientos que solo tocan esas carteras; un traspaso desde/hacia una tuya se queda
    const only = (r: { walletId: number; toWalletId?: number }) => inGone(r.walletId) && (r.toWalletId == null || inGone(r.toWalletId));
    await db.transaction('rw', [db.wallets, db.transactions, db.recurring, db.settings], async (tx) => {
      (tx as unknown as MaybeRemote).remote = true;
      const wallets = await db.wallets.bulkGet([...gone]);
      const txs = await db.transactions.filter(only).toArray();
      const recs = await db.recurring.filter(only).toArray();
      await db.settings.put({
        key: 'legacyBackup',
        value: { at: Date.now(), wallets, recurring: recs, transactions: txs.map(({ photo: _p, ...t }) => t) }
      });
      await db.transactions.bulkDelete(txs.map((t) => t.id!));
      await db.recurring.bulkDelete(recs.map((r) => r.id!));
      await db.wallets.bulkDelete([...gone]);
    });
    if (gone.has(Number(localStorage.getItem('eco:lastWallet')))) localStorage.removeItem('eco:lastWallet');
    const n = gone.size;
    import('./components/ui').then((ui) => ui.toast(n === 1 ? `Quitada 1 cartera de ${partnerName() ?? 'tu pareja'} que no está compartida` : `Quitadas ${n} carteras de ${partnerName() ?? 'tu pareja'} que no están compartidas`)).catch(() => {});
  }
  localStorage.setItem(flag, '1');
}

/** Copia de lo que quitó la limpieza de la versión antigua (para poder recuperarlo). */
export interface LegacyBackup { at: number; wallets: (Wallet | undefined)[]; recurring: Recurring[]; transactions: Transaction[] }

/** Vuelve a poner en este móvil una cartera que quitó la limpieza, con sus movimientos y repeticiones. */
export async function restoreLegacyWallet(id: number) {
  await db.transaction('rw', [db.wallets, db.transactions, db.recurring, db.settings], async (tx) => {
    (tx as unknown as MaybeRemote).remote = true; // es personal: no viaja a nadie
    const b = (await db.settings.get('legacyBackup'))?.value as LegacyBackup | undefined;
    const w = b?.wallets.find((x) => x?.id === id);
    if (!b || !w) return;
    const touches = (r: { walletId: number; toWalletId?: number }) => r.walletId === id || r.toWalletId === id;
    const { shared: _s, owner: _o, ...plain } = w;
    await db.wallets.put(plain);
    await db.transactions.bulkPut(b.transactions.filter(touches));
    await db.recurring.bulkPut(b.recurring.filter(touches));
    const rest: LegacyBackup = {
      at: b.at,
      wallets: b.wallets.filter((x) => x && x.id !== id),
      transactions: b.transactions.filter((t) => !touches(t)),
      recurring: b.recurring.filter((r) => !touches(r))
    };
    if (rest.wallets.length) await db.settings.put({ key: 'legacyBackup', value: rest });
    else await db.settings.delete('legacyBackup');
  });
}

export const dismissLegacyBackup = () => db.settings.delete('legacyBackup');

// ---------- ¿En qué espacio estoy? ----------
// La conexión se guarda en el móvil, pero quien manda es la nube: al entrar con Google se le pregunta en qué
// espacio estás. Así, si el móvil la pierde (reinstalar, borrar datos, un error), se recupera sola.
/** Devuelve true si este móvil ha cambiado de espacio (o lo ha recuperado). */
async function reconcile(me: CloudUser): Promise<boolean> {
  const bound = getHouseUser();
  if (house && bound && bound.uid !== me.uid) {
    setProblem({ kind: 'otherAccount', email: me.email, boundEmail: bound.email });
    return false;
  }
  const { fs } = await load();
  const { collection, deleteDoc, doc, getDocs, query, updateDoc, arrayRemove, where } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(fs, 'households'), where('members', 'array-contains', me.uid)));
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Household, 'id'>) }));
  if (!all.length) {
    // Con esta cuenta no estás en ningún espacio. Si el móvil creía que sí, se avisa (no se borra nada)
    setProblem(house ? { kind: 'notMember', email: me.email, boundEmail: bound?.email } : null);
    return false;
  }
  setProblem(null);
  // El bueno: el que tiene a los dos; a igualdad, el que ya tenía este móvil; luego el más reciente
  const score = (h: Household) => (h.members.length > 1 ? 2 : 0) + (h.id === house?.id ? 1 : 0);
  all.sort((a, b) => score(b) - score(a) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const best = all[0];
  // Invitaciones sin usar que sobran (p. ej. «Invitar» pulsado al verte desconectado): se retiran
  for (const h of all.slice(1)) {
    if (h.members.length !== 1) continue;
    await updateDoc(doc(fs, 'households', h.id), { members: arrayRemove(me.uid) }).catch(() => {});
    if (h.code) await deleteDoc(doc(fs, 'invites', h.code)).catch(() => {});
  }
  const changed = house?.id !== best.id;
  if (changed) localStorage.setItem(LS_PULL, '0'); // se baja todo lo compartido otra vez
  setHouse(best);
  setHouseUser({ uid: me.uid, email: me.email });
  if (changed && best.members.length > 1) toastLater(`Reconectado con ${partnerName() ?? 'tu pareja'}`);
  return changed;
}

/** El espacio ha dicho que no eres miembro: se pregunta a la nube (una vez) y se actúa según la respuesta. */
function recheck(hid: string) {
  stopListening();
  const me = currentUser();
  if (!me || rechecked.has(hid)) return;
  rechecked.add(hid);
  reconcile(me)
    .then((changed) => { if (house && (changed || house.id !== hid)) return start(changed); })
    .catch(() => {});
}

/**
 * Tras recuperar la conexión: sube lo de las carteras compartidas que se apuntó mientras este móvil estaba
 * desconectado (lo que no está en la nube). Y quita las copias de repeticiones de tu pareja que este móvil
 * generó por su cuenta mientras tanto (saldrían duplicadas: las suyas las genera su móvil).
 */
async function pushMissing(hid: string, me: string) {
  const sharedIds = new Set((await db.wallets.toArray()).filter((w) => w.shared).map((w) => w.id!));
  if (!sharedIds.size) return;
  const { fs } = await load();
  const { collection, getDocs } = await import('firebase/firestore');
  const remote = new Set((await getDocs(collection(fs, 'households', hid, 'docs'))).docs.map((d) => d.id));
  if (!house || house.id !== hid) return;
  const inShared = (r: { walletId: number; toWalletId?: number }) => sharedIds.has(r.walletId) || (r.toWalletId != null && sharedIds.has(r.toWalletId));
  for (const w of await db.wallets.bulkGet([...sharedIds])) {
    if (w && (!w.owner || w.owner === me) && !remote.has(`wallets_${w.id}`)) enqueue('wallets', w.id);
  }
  for (const r of await db.recurring.filter((r) => inShared(r) && !r.private).toArray()) {
    if (!remote.has(`recurring_${r.id}`) && (!r.by || r.by === me)) enqueue('recurring', r.id);
  }
  const dupes: number[] = [];
  for (const t of await db.transactions.filter((t) => inShared(t) && !t.private).toArray()) {
    if (remote.has(`transactions_${t.id}`)) continue;
    if (!t.by || t.by === me) enqueue('transactions', t.id);
    else if (t.recurringId != null) dupes.push(t.id!);
  }
  if (dupes.length) {
    await db.transaction('rw', db.transactions, async (tx) => {
      (tx as unknown as MaybeRemote).remote = true;
      await db.transactions.bulkDelete(dupes);
    });
  }
}

/** Arranca la sincronización (y, si hace falta, sube lo que faltaba). */
async function start(resync = false) {
  const me = currentUser();
  if (!house || !me || problem) return; // con la cuenta equivocada no se sincroniza nada
  const hid = house.id;
  await listen();
  flush().catch(() => {});
  const flag = `eco:resync:${hid}`;
  if (resync || !localStorage.getItem(flag)) {
    await pushMissing(hid, me.uid).then(() => localStorage.setItem(flag, '1')).catch(() => {});
  }
  // Las repeticiones propias que tocaban mientras no había sesión
  import('./lib').then((l) => l.processRecurring()).catch(() => {});
}

/** «En pareja» → usar la cuenta con la que has entrado ahora (olvida con qué cuenta se conectó este móvil). */
export async function switchToCurrentAccount() {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  setHouseUser(null);
  rechecked.clear();
  const changed = await reconcile(me);
  if (!house) return;
  if (problem?.kind === 'notMember') {
    // Tampoco con esta cuenta: este móvil se queda sin conexión (los datos no se tocan)
    stopListening();
    setHouse(null);
    setProblem(null);
    return;
  }
  await start(changed);
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

/**
 * Crea la conexión con tu pareja (aún no comparte nada). Si en la nube ya estabas conectado (o ya tenías una
 * invitación), no crea otra: recupera esa. Devuelve el código y si ya existía.
 */
export async function createHousehold(name = 'Nuestra casa'): Promise<{ code: string; existing: boolean }> {
  const me = currentUser();
  if (!me) throw new Error('Inicia sesión con Google primero');
  setHouseUser(null);
  const changed = await reconcile(me);
  if (house) {
    await start(changed);
    return { code: house.code, existing: true };
  }
  const { fs } = await load();
  const { collection, doc, setDoc } = await import('firebase/firestore');
  const ref = doc(collection(fs, 'households'));
  const code = makeCode();
  const data = { name, members: [me.uid], names: { [me.uid]: me.name || me.email }, photos: me.photo ? { [me.uid]: me.photo } : {}, code, createdAt: Date.now() };
  await setDoc(ref, data);
  await setDoc(doc(fs, 'invites', code), { hid: ref.id, owner: me.uid });
  setHouse({ id: ref.id, ...data });
  setHouseUser({ uid: me.uid, email: me.email });
  localStorage.setItem(LS_PULL, '0');
  await listen();
  return { code, existing: false };
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
  setHouseUser({ uid: me.uid, email: me.email });
  setProblem(null);
  await start(true);
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
  setHouseUser(null);
  setProblem(null);
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
    if (!u) return stopListening();
    // Con lo que hay guardado en el móvil se empieza ya, sin esperar a la red (con poca cobertura la pregunta
    // a la nube puede tardar mucho). A la vez se pregunta a la nube en qué espacio estás de verdad (aunque este
    // móvil lo hubiera perdido) y, si cambia algo, se vuelve a arrancar.
    const bound = getHouseUser();
    const startedLocal = !!house && (!bound || bound.uid === u.uid);
    if (startedLocal) start().catch(() => {});
    reconcile(u)
      .then((changed) => {
        if (problem) return stopListening();
        if (changed || !startedLocal) return start(changed);
      }, () => { if (!startedLocal) return start(); })
      .catch(() => {});
  }, { init: false });
  window.addEventListener('online', () => flush().catch(() => {}));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && flush().catch(() => {}));
}

/** Vuelve a enviar unos registros. */
export function resend(t: SharedTable, ids: number[]) {
  ids.forEach((id) => enqueue(t, id));
}

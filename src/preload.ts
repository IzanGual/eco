// Datos leídos por index.html antes de que arranque la app (ver window.__ecoPreload).
// Se ordenan igual que las consultas de store.tsx, para que el primer frame ya sea el definitivo.
import Dexie from 'dexie';
import type { Budget, Category, Person, Recurring, Setting, Transaction, Wallet } from './db';

export interface Preload {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  recurring: Recurring[];
  budgets: Budget[];
  settings: Setting[];
  people: Person[];
}

declare global {
  interface Window { __ecoPreload?: Promise<Partial<Preload> | null> }
}

// Cualquier escritura en la base de datos desde que se leyó la precarga la deja vieja
let writes = 0;
Dexie.on('storagemutated', () => { writes++; });
/** ¿Sigue la precarga igual que la base de datos? (nadie ha escrito desde que se leyó) */
export const preloadFresh = () => writes === 0;

let data: Preload | null = null;
export const preloaded = () => data;
export const dropPreload = () => { data = null; };

// Dexie, al ordenar por un índice, deja fuera los registros sin ese campo: aquí igual
const isKey = (v: unknown) => typeof v === 'string' || (typeof v === 'number' && !Number.isNaN(v));
const byKey = <T>(field: keyof T) => (list: T[]) =>
  list.filter((r) => isKey(r[field])).sort((a, b) => {
    const x = a[field] as unknown as number | string;
    const y = b[field] as unknown as number | string;
    if (x !== y) return typeof x === typeof y ? (x < y ? -1 : 1) : typeof x === 'number' ? -1 : 1; // en IndexedDB los números van antes que los textos
    return (a as { id?: number }).id! - (b as { id?: number }).id!;
  });

export async function takePreload(): Promise<Preload | null> {
  let raw: Partial<Preload> | null = null;
  try { raw = (await window.__ecoPreload) ?? null; } catch { raw = null; }
  window.__ecoPreload = undefined;
  if (!raw || !raw.wallets || !raw.categories || !raw.transactions || !raw.recurring || !raw.budgets || !raw.settings || !raw.people) return null;
  data = {
    wallets: byKey<Wallet>('order')(raw.wallets),
    categories: byKey<Category>('order')(raw.categories),
    transactions: byKey<Transaction>('date')(raw.transactions).reverse(),
    recurring: raw.recurring,
    budgets: byKey<Budget>('order')(raw.budgets),
    settings: raw.settings,
    people: byKey<Person>('name')(raw.people)
  };
  return data;
}

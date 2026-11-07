import Dexie, { type Table } from 'dexie';
import { EMOJI_TO_ICON, ICONS, OLD_COLOR_TO_NEW } from './icons';

/** debt = préstamo con una persona: no cuenta como gasto ni ingreso */
export type TxType = 'expense' | 'income' | 'transfer' | 'debt';
export type DebtDir = 'out' | 'in'; // out: sale dinero hacia la persona · in: la persona me da dinero
export type CatType = 'expense' | 'income';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Wallet {
  id?: number;
  name: string;
  icon: string;
  color: string;
  initialBalance: number; // céntimos
  order: number;
  archived?: boolean;
  private?: boolean; // cartera solo mía: no se comparte, ni ella ni sus movimientos
}

export interface Category {
  id?: number;
  name: string;
  icon: string;
  color: string;
  type: CatType;
  parentId: number | null;
  order: number;
}

export interface Transaction {
  id?: number;
  type: TxType;
  amount: number; // céntimos, siempre positivo
  walletId: number;
  toWalletId?: number; // solo transferencias
  categoryId?: number;
  date: string; // YYYY-MM-DD
  note: string;
  photo?: Blob;
  recurringId?: number;
  personId?: number; // solo préstamos
  dir?: DebtDir; // solo préstamos
  by?: string; // uid de quien lo apuntó (modo pareja)
  private?: boolean; // «Solo para mí»: no se comparte con la pareja
  createdAt: number;
}

export interface Person {
  id?: number;
  name: string;
  color: string;
  archived?: boolean;
}

export interface Recurring {
  id?: number;
  type: TxType;
  amount: number;
  walletId: number;
  toWalletId?: number;
  categoryId?: number;
  note: string;
  frequency: Frequency;
  nextDate: string; // próxima fecha pendiente de generar
  active: boolean;
  private?: boolean;
  by?: string; // en pareja: quién la creó (solo su móvil genera los movimientos)
}

export interface Budget {
  id?: number;
  name: string;
  amount: number; // céntimos
  period: BudgetPeriod;
  categoryIds: number[]; // vacío = todos los gastos
  order: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

class EcoDB extends Dexie {
  wallets!: Table<Wallet, number>;
  categories!: Table<Category, number>;
  transactions!: Table<Transaction, number>;
  recurring!: Table<Recurring, number>;
  budgets!: Table<Budget, number>;
  settings!: Table<Setting, string>;
  people!: Table<Person, number>;

  constructor() {
    super('eco');
    this.version(1).stores({
      wallets: '++id, order',
      categories: '++id, type, parentId, order',
      transactions: '++id, date, type, walletId, toWalletId, categoryId, recurringId',
      recurring: '++id, nextDate, active',
      budgets: '++id, order',
      settings: 'key'
    });
    // v2: los emojis pasan a ser iconos Carbon y los colores, la paleta «Papel»
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const fix = (o: { icon: string; color: string }) => {
          o.icon = EMOJI_TO_ICON[o.icon] ?? (ICONS[o.icon] ? o.icon : 'tag');
          o.color = OLD_COLOR_TO_NEW[o.color.toLowerCase()] ?? o.color;
        };
        await tx.table('categories').toCollection().modify(fix);
        await tx.table('wallets').toCollection().modify(fix);
      });
    // v3: personas y préstamos
    this.version(3).stores({
      transactions: '++id, date, type, walletId, toWalletId, categoryId, recurringId, personId',
      people: '++id, name'
    });
  }
}

export const db = new EcoDB();

/** Tablas que se comparten en el modo pareja. */
export const SYNC_TABLES = ['wallets', 'categories', 'transactions', 'recurring', 'budgets', 'people'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

// IDs aleatorios grandes para que dos móviles no creen el mismo id a la vez (cabe en 53 bits)
export const newId = () => Math.floor(Date.now() / 1000) * 1_000_000 + Math.floor(Math.random() * 1_000_000);
for (const t of SYNC_TABLES) {
  db.table(t).hook('creating', function (primKey, obj: { id?: number }) {
    if (primKey === undefined && obj.id === undefined) {
      obj.id = newId();
      return obj.id;
    }
  });
}

type Seed = [string, string, string, [string, string][]?];

const EXPENSE_SEED: Seed[] = [
  ['Comida', 'cart', '#C99A2E', [['Supermercado', 'cart'], ['Restaurantes', 'restaurant'], ['Cafeterías', 'cafe'], ['A domicilio', 'delivery']]],
  ['Casa', 'home', '#5A5A9E', [['Alquiler / hipoteca', 'building'], ['Luz', 'idea'], ['Agua', 'water'], ['Internet y móvil', 'wifi'], ['Hogar', 'home']]],
  ['Transporte', 'car', '#4F6D8F', [['Gasolina', 'gas'], ['Transporte público', 'train'], ['Taxi / VTC', 'taxi'], ['Parking', 'car'], ['Mantenimiento', 'tools']]],
  ['Ocio', 'events', '#C0627A', [['Salir', 'bar'], ['Cine y eventos', 'ticket'], ['Viajes', 'plane'], ['Hobbies', 'game']]],
  ['Compras', 'bag', '#8A4F7D', [['Ropa', 'bag'], ['Electrónica', 'mobile'], ['Regalos', 'gift']]],
  ['Salud', 'health', '#C4572E', [['Farmacia', 'medication'], ['Médico', 'stethoscope'], ['Gimnasio', 'running']]],
  ['Suscripciones', 'repeat', '#2F7A78', [['Streaming', 'screen'], ['Apps', 'app']]],
  ['Cuidado personal', 'cut', '#A86F4C'],
  ['Mascotas', 'pet', '#7C8B3A'],
  ['Educación', 'education', '#4F6D8F'],
  ['Otros', 'package', '#6B6760']
];

const INCOME_SEED: Seed[] = [
  ['Nómina', 'briefcase', '#5E8C6A'],
  ['Extra', 'star', '#7C8B3A'],
  ['Regalos', 'gift', '#2F7A78'],
  ['Devoluciones', 'undo', '#5A5A9E'],
  ['Otros ingresos', 'money', '#6B6760']
];

export async function seedIfEmpty() {
  const count = await db.wallets.count();
  if (count > 0) {
    if ((await db.transactions.count()) > 0 && !(await db.settings.get('onboarded'))) await db.settings.put({ key: 'onboarded', value: true });
    return;
  }
  await db.transaction('rw', db.wallets, db.categories, async () => {
    await db.wallets.bulkAdd([
      { name: 'Banco', icon: 'bank', color: '#4F6D8F', initialBalance: 0, order: 0 },
      { name: 'Efectivo', icon: 'money', color: '#5E8C6A', initialBalance: 0, order: 1 }
    ]);
    const add = async (seed: Seed[], type: CatType) => {
      let order = 0;
      for (const [name, icon, color, subs] of seed) {
        const parentId = await db.categories.add({ name, icon, color, type, parentId: null, order: order++ });
        let subOrder = 0;
        for (const [sName, sIcon] of subs ?? []) {
          await db.categories.add({ name: sName, icon: sIcon, color, type, parentId, order: subOrder++ });
        }
      }
    };
    await add(EXPENSE_SEED, 'expense');
    await add(INCOME_SEED, 'income');
  });
}

// ---------- Ajustes ----------
export interface AppSettings {
  currency: string;
  monthStartDay: number; // 1-28: ciclo de cobro a cobro
  theme: 'system' | 'light' | 'dark';
  privacy: boolean; // «ojito»: difumina todas las cifras
  onboarded: boolean; // ya ha pasado la bienvenida
}

export const DEFAULT_SETTINGS: AppSettings = { currency: 'EUR', monthStartDay: 1, theme: 'system', privacy: false, onboarded: false };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s as unknown as AppSettings;
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  return db.settings.put({ key, value });
}

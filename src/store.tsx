import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type AppSettings, type Category, type Person, type Recurring, type Transaction, type Wallet, type Budget } from './db';
import { setCurrency } from './lib';

interface Data {
  wallets: Wallet[]; // sin archivadas
  allWallets: Wallet[];
  walletMap: Map<number, Wallet>;
  categories: Category[];
  catMap: Map<number, Category>;
  txs: Transaction[];
  recurring: Recurring[];
  budgets: Budget[];
  people: Person[];
  personMap: Map<number, Person>;
  settings: AppSettings;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const allWallets = useLiveQuery(() => db.wallets.orderBy('order').toArray());
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray());
  const txs = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray());
  const recurring = useLiveQuery(() => db.recurring.toArray());
  const budgets = useLiveQuery(() => db.budgets.orderBy('order').toArray());
  const settingRows = useLiveQuery(() => db.settings.toArray());
  const people = useLiveQuery(() => db.people.orderBy('name').toArray());

  const settings = useMemo<AppSettings>(() => {
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of settingRows ?? []) s[r.key] = r.value;
    return s as unknown as AppSettings;
  }, [settingRows]);

  setCurrency(settings.currency);

  // Tema claro / oscuro
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12110f' : '#f2eee6');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // Modo privacidad: difumina las cifras
  useEffect(() => {
    document.documentElement.classList.toggle('privacy', !!settings.privacy);
  }, [settings.privacy]);

  const value = useMemo<Data | null>(() => {
    if (!allWallets || !categories || !txs || !recurring || !budgets || !settingRows || !people) return null;
    return {
      allWallets,
      wallets: allWallets.filter((w) => !w.archived),
      walletMap: new Map(allWallets.map((w) => [w.id!, w])),
      categories,
      catMap: new Map(categories.map((c) => [c.id!, c])),
      txs,
      recurring,
      budgets,
      people,
      personMap: new Map(people.map((p) => [p.id!, p])),
      settings
    };
  }, [allWallets, categories, txs, recurring, budgets, settingRows, settings, people]);

  if (!value) return <div className="min-h-dvh bg-paper" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fuera de DataProvider');
  return v;
}

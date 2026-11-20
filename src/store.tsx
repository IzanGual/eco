import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Dexie, { liveQuery } from 'dexie';
import { db, DEFAULT_SETTINGS, type AppSettings, type Category, type Person, type Recurring, type Transaction, type Wallet, type Budget } from './db';
import { setCurrency } from './lib';
import { scheduleBackup } from './cloud';
import { preloaded, preloadFresh } from './preload';

/**
 * Consulta en vivo que arranca con los datos precargados por index.html (así la app se pinta en el primer frame).
 * Si nadie ha escrito desde la precarga, la primera respuesta es idéntica y se descarta: sin un segundo render.
 */
function useLive<T>(query: () => Promise<T>, initial: T | undefined): T | undefined {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let first = initial !== undefined;
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        if (first && preloadFresh()) { first = false; return; }
        first = false;
        setValue(v);
      },
      error: () => {}
    });
    return () => sub.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

// Copia automática en la nube tras cada cambio en la base de datos (si hay sesión)
Dexie.on('storagemutated', () => scheduleBackup());

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
  const pre = preloaded();
  const allWallets = useLive(() => db.wallets.orderBy('order').toArray(), pre?.wallets);
  const categories = useLive(() => db.categories.orderBy('order').toArray(), pre?.categories);
  const txs = useLive(() => db.transactions.orderBy('date').reverse().toArray(), pre?.transactions);
  const recurring = useLive(() => db.recurring.toArray(), pre?.recurring);
  const budgets = useLive(() => db.budgets.orderBy('order').toArray(), pre?.budgets);
  const settingRows = useLive(() => db.settings.toArray(), pre?.settings);
  const people = useLive(() => db.people.orderBy('name').toArray(), pre?.people);

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
    // index.html lo lee antes de pintar el primer frame
    if (settingRows) try { localStorage.setItem('eco:theme', settings.theme); } catch { /* sin almacenamiento */ }
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, !!settingRows]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Con los datos ya pintados, la capa de arranque de index.html se desvanece encima de la app
  const ready = !!value;
  useEffect(() => {
    if (!ready) return;
    performance.mark?.('eco:ready'); // cuánto tarda en estar lista (se ve en las herramientas del navegador)
    const boot = document.getElementById('boot');
    if (!boot) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      boot.classList.add('out');
      setTimeout(() => boot.remove(), 400);
    }));
  }, [ready]);

  if (!value) return <div className="min-h-dvh bg-paper" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData fuera de DataProvider');
  return v;
}

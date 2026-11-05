import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home as HomeIcon, ListBoxes, ChartPie, Settings as SettingsIcon, Add } from '@carbon/icons-react';
import { NavCtx, type Nav, type Screen } from './nav';
import { parseAmount, processRecurring } from './lib';
import { OverlayHost, Press, spring } from './components/ui';
import { Home } from './screens/Home';
import { Transactions, Filtered } from './screens/Transactions';
import { Stats } from './screens/Stats';
import { Settings } from './screens/Settings';
import { TxEditor } from './screens/TxEditor';
import { Budgets, BudgetEdit } from './screens/Budgets';
import { Wallets, WalletEdit, Categories, CategoryEdit, RecurringList } from './screens/Manage';
import { Summary } from './screens/Summary';
import { Landing, shouldShowLanding } from './screens/Landing';
import { People, PersonDetail } from './screens/People';
import { ImportCSV } from './screens/Import';
import type { TxType } from './db';

type Tab = 'home' | 'txs' | 'stats' | 'settings';

function initialStack(): Screen[] {
  // Atajo: /?nuevo=gasto | ingreso | transferencia abre directamente el formulario
  const p = new URLSearchParams(location.search).get('nuevo');
  if (p == null) return [];
  const qs = new URLSearchParams(location.search);
  const type: TxType = p === 'ingreso' ? 'income' : p === 'transferencia' ? 'transfer' : p === 'prestamo' ? 'debt' : 'expense';
  // Desde un Atajo de iOS: ?nuevo=gasto&importe=12,50&nota=Mercadona
  const amount = qs.get('importe') ? parseAmount(qs.get('importe')!) : undefined;
  const note = qs.get('nota') ?? undefined;
  history.replaceState(null, '', location.pathname);
  return [{ name: 'editor', type, defaults: { type, amount: amount || undefined, note } }];
}

let keySeq = 0;

export default function App() {
  // Si no está instalada, primero la landing con el botón de instalar (salvo enlaces directos)
  const [landing, setLanding] = useState(() => shouldShowLanding() && !location.search.includes('nuevo='));
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<(Screen & { key: number })[]>(() => initialStack().map((s) => ({ ...s, key: keySeq++ })));

  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const nav = useMemo<Nav>(
    () => ({
      push: (s) => {
        history.pushState({ eco: true }, '');
        setStack((st) => [...st, { ...s, key: keySeq++ }]);
      },
      pop: () => {
        if (history.state?.eco) history.back();
        else setStack((st) => st.slice(0, -1));
      }
    }),
    []
  );

  useEffect(() => {
    processRecurring();
    const onVis = () => document.visibilityState === 'visible' && processRecurring();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const selectTab = (t: Tab) => {
    if (t === tab) return window.scrollTo({ top: 0, behavior: 'smooth' });
    setTab(t);
    window.scrollTo(0, 0);
  };

  if (landing) return <Landing onContinue={() => setLanding(false)} />;

  return (
    <NavCtx.Provider value={nav}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="min-h-dvh pb-36"
        >
          {tab === 'home' && <Home />}
          {tab === 'txs' && <Transactions />}
          {tab === 'stats' && <Stats />}
          {tab === 'settings' && <Settings />}
        </motion.main>
      </AnimatePresence>

      <TabBar tab={tab} onTab={selectTab} onAdd={() => nav.push({ name: 'editor' })} />

      <AnimatePresence>
        {stack.map((s, i) => (
          <div key={s.key} className="fixed inset-0" style={{ zIndex: 40 + i }}>
            <ScreenView s={s} />
          </div>
        ))}
      </AnimatePresence>

      <OverlayHost />
    </NavCtx.Provider>
  );
}

function ScreenView({ s }: { s: Screen }) {
  switch (s.name) {
    case 'editor': return <TxEditor id={s.id} type={s.type} defaults={s.defaults} />;
    case 'wallets': return <Wallets />;
    case 'walletEdit': return <WalletEdit id={s.id} />;
    case 'categories': return <Categories />;
    case 'categoryEdit': return <CategoryEdit id={s.id} parentId={s.parentId} type={s.type} />;
    case 'budgets': return <Budgets />;
    case 'budgetEdit': return <BudgetEdit id={s.id} />;
    case 'recurring': return <RecurringList />;
    case 'summary': return <Summary kind={s.kind} offset={s.offset} />;
    case 'people': return <People />;
    case 'person': return <PersonDetail id={s.id} />;
    case 'import': return <ImportCSV />;
    case 'filtered': return <Filtered {...s} />;
  }
}

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Inicio', Icon: HomeIcon },
  { id: 'txs', label: 'Historial', Icon: ListBoxes },
  { id: 'stats', label: 'Análisis', Icon: ChartPie },
  { id: 'settings', label: 'Ajustes', Icon: SettingsIcon }
];

/** Barra flotante de vidrio líquido + botón de añadir separado, al estilo iOS 26. */
function TabBar({ tab, onTab, onAdd }: { tab: Tab; onTab: (t: Tab) => void; onAdd: () => void }) {
  return (
    <div className="mb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-center gap-2.5 px-4">
      <nav className="glass pointer-events-auto flex flex-1 max-w-[340px] rounded-full p-1">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <Press key={id} scale={0.9} onClick={() => onTab(id)} className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-2" aria-label={label}>
              {active && <motion.span layoutId="tab-glass" transition={spring} className="glass-tint absolute inset-0 rounded-full" />}
              <motion.span
                className={`relative ${active ? 'text-accent' : 'text-ink2'}`}
                animate={active ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
                transition={{ duration: 0.38, ease: 'easeOut' }}
              >
                <Icon size={22} />
              </motion.span>
              <span className={`relative max-w-full truncate text-[10.5px] font-semibold ${active ? 'text-accent' : 'text-ink2'}`}>{label}</span>
            </Press>
          );
        })}
      </nav>
      <Press
        scale={0.86}
        whileHover={{ rotate: 90 }}
        onClick={onAdd}
        aria-label="Añadir movimiento"
        className="pointer-events-auto flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_28px_-6px_rgb(var(--accent)/0.6),inset_0_1px_0.5px_rgb(255_255_255/0.45)]"
      >
        <Add size={30} />
      </Press>
    </div>
  );
}

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
import { Landing, isStandalone, shouldShowLanding } from './screens/Landing';
import { Onboarding } from './screens/Onboarding';
import { useData } from './store';
import { useRef } from 'react';
import { People, PersonDetail } from './screens/People';
import { ImportCSV } from './screens/Import';
import { Couple } from './screens/Couple';
import type { TxType } from './db';

type Tab = 'home' | 'txs' | 'stats' | 'settings';

// Enlace de invitación de pareja: ?unirse=CODIGO (se guarda hasta que haya sesión y bienvenida)
const joinParam = new URLSearchParams(location.search).get('unirse');
if (joinParam) {
  localStorage.setItem('eco:pendingJoin', joinParam.toUpperCase());
  history.replaceState(null, '', location.pathname);
}

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
  const [pillHidden, setPillHidden] = useState(false);
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

  // Bienvenida la primera vez; al acabar, si no hay nada apuntado, abrimos el formulario
  const { settings, txs } = useData();
  const wasOnboarded = useRef(settings.onboarded);
  useEffect(() => {
    if (!wasOnboarded.current && settings.onboarded && txs.length === 0) nav.push({ name: 'editor' });
    wasOnboarded.current = settings.onboarded;
  }, [settings.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Con una pantalla o una hoja abierta, lo de detrás no se mueve (iOS arrastraba el scroll del fondo)
  useEffect(() => {
    const lock = stack.length > 0;
    document.documentElement.classList.toggle('scroll-locked', lock);
  }, [stack.length]);

  // Invitación pendiente: abrimos la pantalla de pareja con el código ya puesto
  useEffect(() => {
    const code = localStorage.getItem('eco:pendingJoin');
    if (code && settings.onboarded && !landing) nav.push({ name: 'couple', code });
  }, [settings.onboarded, landing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (landing) return <Landing onContinue={() => setLanding(false)} />;
  if (!settings.onboarded) return <Onboarding />;

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

      {!isStandalone() && !pillHidden && (
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }} className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),10px)+84px)] z-20 flex justify-center px-4">
          <div className="glass flex items-center gap-1 rounded-full py-1 pl-4 pr-1 text-[14px]">
            <span className="text-ink2">Estás en el navegador.</span>
            <Press scale={0.94} onClick={() => setLanding(true)} className="rounded-full bg-ink px-3.5 py-1.5 font-semibold text-paper">Instalar</Press>
            <button onClick={() => setPillHidden(true)} className="p-1.5 text-ink3" aria-label="Ocultar">×</button>
          </div>
        </motion.div>
      )}

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
    case 'editor': return <TxEditor id={s.id} type={s.type} defaults={s.defaults} repeat={s.repeat} />;
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
    case 'couple': return <Couple code={s.code} />;
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

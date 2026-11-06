import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Add, ArrowLeft, ChartPie, Checkmark, Close, UserMultiple, View } from '@carbon/icons-react';
import { db, setSetting } from '../db';
import { centsToInput, fmt, parseAmount } from '../lib';
import { useData } from '../store';
import { cloudEnabled, cloudInfo, onUser, restoreFromCloud, signInWithGoogle, type CloudUser } from '../cloud';
import { PALETTE } from '../icons';
import { Logo, Press, Tile, spring, toast } from '../components/ui';

const ease = [0.22, 1, 0.36, 1] as const;
type Step = 'welcome' | 'account' | 'restore' | 'wallets' | 'payday' | 'tour';

const QUICK_WALLETS = [
  { name: 'Ahorro', icon: 'piggy' },
  { name: 'Tarjeta', icon: 'card' },
  { name: 'Bizum / PayPal', icon: 'mobile' },
  { name: 'Inversiones', icon: 'chart' }
];

/** Bienvenida de la primera vez: cuenta (opcional), dinero de partida, día de cobro y mini tutorial. */
export function Onboarding() {
  const { wallets, txs } = useData();
  const [step, setStep] = useState<Step>('welcome');
  const [dir, setDir] = useState(1);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupAt, setBackupAt] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [payday, setPayday] = useState(1);

  useEffect(() => onUser(setUser), []);
  useEffect(() => {
    setAmounts((a) => {
      const n = { ...a };
      for (const w of wallets) if (n[w.id!] === undefined) n[w.id!] = w.initialBalance ? centsToInput(w.initialBalance) : '';
      return n;
    });
  }, [wallets]);

  const order: Step[] = ['welcome', ...(cloudEnabled ? (['account'] as Step[]) : []), 'wallets', 'payday', 'tour'];
  const idx = Math.max(0, order.indexOf(step === 'restore' ? 'account' : step));
  const go = (s: Step, d = 1) => { setDir(d); setStep(s); };
  const next = () => go(order[Math.min(order.length - 1, idx + 1)]);
  const back = () => go(order[Math.max(0, idx - 1)], -1);

  async function google() {
    setBusy(true);
    try {
      await signInWithGoogle();
      const info = await cloudInfo().catch(() => null);
      if (info?.savedAt) { setBackupAt(info.savedAt); go('restore'); }
      else next();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Si ya había sesión (por ejemplo, volviendo de la página de Google), comprobamos si hay copia
  useEffect(() => {
    if (step === 'account' && user) cloudInfo().then((i) => { if (i?.savedAt) { setBackupAt(i.savedAt); go('restore'); } }).catch(() => {});
  }, [user, step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore() {
    setBusy(true);
    try {
      await restoreFromCloud();
      await setSetting('onboarded', true);
      toast('Datos recuperados');
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  async function saveWallets() {
    await db.transaction('rw', db.wallets, async () => {
      for (const w of wallets) await db.wallets.update(w.id!, { initialBalance: parseAmount(amounts[w.id!] ?? '') });
    });
    next();
  }

  async function addWallet(name: string, icon: string) {
    if (wallets.some((w) => w.name === name)) return;
    await db.wallets.add({ name, icon, color: PALETTE[(wallets.length * 3) % PALETTE.length], initialBalance: 0, order: wallets.length });
  }

  async function finish() {
    await setSetting('monthStartDay', payday);
    await setSetting('onboarded', true);
  }

  const total = wallets.reduce((s, w) => s + parseAmount(amounts[w.id!] ?? ''), 0);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-paper">
      {/* Progreso */}
      <div className="pt-safe flex items-center gap-3 px-5 pb-2">
        <div className="w-10">
          {idx > 0 && step !== 'tour' && (
            <Press scale={0.88} onClick={back} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05]" aria-label="Atrás"><ArrowLeft size={20} /></Press>
          )}
        </div>
        <div className="flex flex-1 justify-center gap-1.5">
          {order.map((s, i) => (
            <motion.span key={s} className="h-1.5 rounded-full" animate={{ width: i === idx ? 22 : 6, background: i <= idx ? 'rgb(var(--ink))' : 'rgb(var(--ink) / 0.15)' }} transition={spring} />
          ))}
        </div>
        <div className="w-10" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ x: `${dir * 100}%`, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: `${-dir * 40}%`, opacity: 0 }}
            transition={{ duration: 0.45, ease }}
            className="absolute inset-0 overflow-y-auto overscroll-contain"
          >
            <div className="flex min-h-full flex-col px-6 pb-6 [&>*]:shrink-0 [&>.flex-1]:shrink">
            {step === 'welcome' && (
              <>
                <div className="flex-1" />
                <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}>
                  <Logo size={84} />
                </motion.div>
                <Title>Hola. Esto es Eco.</Title>
                <Sub>Vamos a dejarla lista en un minuto: guardamos tus datos, apuntamos cuánto dinero tienes y te enseñamos lo básico.</Sub>
                <div className="flex-1" />
                <Primary onClick={next}>Empezar</Primary>
              </>
            )}

            {step === 'account' && (
              <>
                <Eyebrow>Paso 1 · Tu cuenta</Eyebrow>
                <Title>Que no se pierda nada</Title>
                <Sub>Entra con Google y guardaremos una copia en la nube cada vez que apuntes algo. Si cambias de móvil o se te borra la app, lo recuperas todo.</Sub>
                <div className="mt-8 space-y-3">
                  {['Copia automática tras cada cambio', 'Recupera tus datos en otro móvil', 'Solo tú puedes ver tus datos'].map((t, i) => (
                    <motion.div key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }} className="flex items-center gap-3 text-[15px]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pos text-white"><Checkmark size={14} /></span>
                      {t}
                    </motion.div>
                  ))}
                </div>
                <div className="flex-1" />
                {user ? (
                  <>
                    <div className="mb-3 flex items-center gap-3 rounded-[22px] bg-surface p-4">
                      {user.photo ? <img src={user.photo} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-semibold text-paper">{user.name[0]}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{user.name}</p>
                        <p className="truncate text-[13px] text-ink3">{user.email}</p>
                      </div>
                      <Checkmark size={20} className="text-pos" />
                    </div>
                    <Primary onClick={next}>Continuar</Primary>
                  </>
                ) : (
                  <>
                    <Press scale={0.97} disabled={busy} onClick={google} className="flex h-[58px] w-full items-center justify-center gap-3 rounded-full bg-raised text-[17px] font-semibold shadow-[0_2px_8px_rgb(var(--shadow)/0.12),inset_0_0_0_1px_rgb(var(--line)/0.08)]">
                      <GoogleG /> {busy ? 'Conectando…' : 'Continuar con Google'}
                    </Press>
                    <Press scale={0.97} onClick={next} className="mt-3 w-full py-3 text-center text-[15px] font-semibold text-ink3">Ahora no</Press>
                    <p className="text-center text-[12px] text-ink3">Puedes hacerlo luego en Ajustes. Sin cuenta, tus datos solo viven en este móvil.</p>
                  </>
                )}
              </>
            )}

            {step === 'restore' && (
              <>
                <Eyebrow>Hemos encontrado tus datos</Eyebrow>
                <Title>¿Los recuperamos?</Title>
                <Sub>Tienes una copia en la nube guardada {backupAt ? new Date(backupAt).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}. Recuperarla trae tus movimientos, carteras, categorías y presupuestos.</Sub>
                <div className="flex-1" />
                <Primary onClick={restore} disabled={busy}>{busy ? 'Recuperando…' : 'Recuperar mis datos'}</Primary>
                <Press scale={0.97} onClick={() => go('wallets')} className="mt-3 w-full py-3 text-center text-[15px] font-semibold text-ink3">No, empezar de cero</Press>
              </>
            )}

            {step === 'wallets' && (
              <>
                <Eyebrow>Paso {cloudEnabled ? 2 : 1} · Tu dinero ahora</Eyebrow>
                <Title>¿Cuánto tienes ahora mismo?</Title>
                <Sub>Mira tu app del banco y la cartera. Si no lo sabes exacto, pon algo aproximado: se puede cambiar después.</Sub>
                <div className="mt-6 divide-hair overflow-hidden rounded-[22px] bg-surface">
                  {wallets.map((w) => (
                    <label key={w.id} className="flex items-center gap-3 px-4 py-3">
                      <Tile icon={w.icon} color={w.color} size={38} />
                      <span className="flex-1 text-[16px] font-medium">{w.name}</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={amounts[w.id!] ?? ''}
                        onChange={(e) => setAmounts({ ...amounts, [w.id!]: e.target.value.replace(/[^\d.,-]/g, '') })}
                        className="w-28 bg-transparent text-right font-serif text-[24px] outline-none placeholder:text-ink3"
                      />
                      <span className="font-serif text-[20px] text-ink3">€</span>
                      {wallets.length > 1 && (
                        <button onClick={async (e) => { e.preventDefault(); await db.wallets.delete(w.id!); }} className="ml-1 text-ink3" aria-label={`Quitar ${w.name}`}><Close size={16} /></button>
                      )}
                    </label>
                  ))}
                </div>
                <p className="eyebrow px-1 pb-2 pt-5">¿Tienes más sitios con dinero?</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_WALLETS.filter((q) => !wallets.some((w) => w.name === q.name)).map((q) => (
                    <Press key={q.name} scale={0.92} onClick={() => addWallet(q.name, q.icon)} className="flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[14px] font-medium">
                      <Add size={16} /> {q.name}
                    </Press>
                  ))}
                </div>
                <div className="flex-1" />
                <p className="pb-3 pt-6 text-center text-[14px] text-ink2">En total: <span className="font-serif text-[22px] text-ink">{fmt(total)}</span></p>
                <Primary onClick={saveWallets}>Continuar</Primary>
              </>
            )}

            {step === 'payday' && (
              <>
                <Eyebrow>Paso {cloudEnabled ? 3 : 2} · Tu mes</Eyebrow>
                <Title>¿Qué día cobras?</Title>
                <Sub>Así tus meses irán de nómina a nómina, que es como de verdad se gasta. Si no lo tienes claro, deja el mes natural.</Sub>
                <div className="mt-7 grid grid-cols-7 gap-2">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <Press key={d} scale={0.85} onClick={() => setPayday(d)} className={`aspect-square rounded-full text-[15px] font-semibold transition-colors ${payday === d ? 'bg-ink text-paper' : 'bg-surface'}`}>{d}</Press>
                  ))}
                </div>
                <p className="mt-4 text-center text-[14px] text-ink2">{payday === 1 ? 'Mes natural: del 1 al último día' : `Tus meses irán del ${payday} al ${payday - 1} del mes siguiente`}</p>
                <div className="flex-1" />
                <Primary onClick={next}>Continuar</Primary>
              </>
            )}

            {step === 'tour' && <Tour onDone={finish} hasData={txs.length > 0} />}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------- Mini tutorial ----------
const TOUR: { icon: ReactNode; title: string; text: string; demo: ReactNode }[] = [
  {
    icon: <Add size={26} />,
    title: 'Apunta con el botón +',
    text: 'Escribe el importe con el teclado, toca la categoría y guarda. Puedes sumar: 12,50 + 8 y lo calcula solo.',
    demo: (
      <div className="flex items-center justify-center gap-3">
        <span className="font-serif text-[52px]">20,50 €</span>
        <motion.span animate={{ scale: [1, 0.85, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white"><Add size={28} /></motion.span>
      </div>
    )
  },
  {
    icon: <UserMultiple size={26} />,
    title: 'Préstamos, aparte',
    text: '¿Le haces un Bizum a tu madre y te lo devuelve? Elige «Préstamo». No cuenta como gasto y Eco recuerda quién te debe qué.',
    demo: (
      <div className="rounded-[20px] bg-surface p-4">
        <p className="text-[13px] text-ink3">Mamá te debe</p>
        <p className="font-serif text-[36px] text-pos">150,00 €</p>
      </div>
    )
  },
  {
    icon: <ChartPie size={26} />,
    title: 'Tu semana, cada lunes',
    text: 'En Inicio y en Análisis tienes un resumen tipo historia: cuánto gastaste, tu día más caro y a dónde fue el dinero.',
    demo: (
      <div className="flex h-24 items-end gap-2 rounded-[20px] bg-ink p-4">
        {[30, 60, 25, 90, 45, 10, 35].map((h, i) => (
          <motion.div key={i} className={`flex-1 rounded-[4px] ${i === 3 ? 'bg-accent' : 'bg-paper/30'}`} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.2 + i * 0.06, type: 'spring', stiffness: 180, damping: 16 }} />
        ))}
      </div>
    )
  },
  {
    icon: <View size={26} />,
    title: 'El ojito',
    text: 'Toca el ojo de arriba a la derecha para difuminar todas las cifras. Perfecto para enseñar la app sin enseñar tu dinero.',
    demo: (
      <div className="flex items-center justify-center gap-4">
        <span className="font-serif text-[44px]">3.622 €</span>
        <span className="font-serif text-[44px] blur-[9px]">3.622 €</span>
      </div>
    )
  }
];

function Tour({ onDone, hasData }: { onDone: () => void; hasData: boolean }) {
  const [i, setI] = useState(0);
  const t = TOUR[i];
  const last = i === TOUR.length - 1;
  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Cómo se usa · {i + 1} de {TOUR.length}</Eyebrow>
        <button onClick={onDone} className="text-[14px] font-semibold text-ink3">Saltar</button>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease }} className="flex flex-1 flex-col">
          <span className="mt-6 flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface text-accent">{t.icon}</span>
          <Title>{t.title}</Title>
          <Sub>{t.text}</Sub>
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full">{t.demo}</div>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mb-4 flex justify-center gap-1.5">
        {TOUR.map((_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-ink' : 'bg-ink/20'}`} />)}
      </div>
      <Primary onClick={() => (last ? onDone() : setI(i + 1))}>{last ? (hasData ? 'Ir a Eco' : 'Apuntar mi primer gasto') : 'Siguiente'}</Primary>
    </>
  );
}

// ---------- Piezas ----------
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="pt-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">{children}</p>;
}
function Title({ children }: { children: ReactNode }) {
  return <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6, ease }} className="mt-3 font-serif text-[44px] leading-[1.02]">{children}</motion.h1>;
}
function Sub({ children }: { children: ReactNode }) {
  return <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-3 text-[16px] leading-relaxed text-ink2">{children}</motion.p>;
}
function Primary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="pb-safe pt-2">
      <Press scale={0.97} disabled={disabled} onClick={onClick} className="btn-ink h-[58px] w-full text-[17px] disabled:opacity-40">{children}</Press>
    </div>
  );
}
function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

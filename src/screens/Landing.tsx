import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Add, ChartPie, Checkmark, Copy, Download, Launch, UserMultiple, View } from '@carbon/icons-react';
import { Logo, Press, Sheet, spring } from '../components/ui';
import { cloudEnabled, onUser, signInWithGoogle, type CloudUser } from '../cloud';

import { installListeners, installState, isStandalone, platform, SKIP } from '../install';
export { isStandalone };

const FEATURES = [
  { icon: Add, title: 'Apunta en tres segundos', text: 'Teclado propio, categorías frecuentes y notas que se autocompletan.' },
  { icon: ChartPie, title: 'Entiende a dónde va', text: 'Análisis por semana, mes y año, y un resumen tipo historia cada lunes.' },
  { icon: UserMultiple, title: 'Préstamos sin líos', text: 'El Bizum a tu madre no es un gasto. Eco sabe quién te debe qué.' },
  { icon: View, title: 'Ojito', text: 'Enséñala sin enseñar tu dinero: todas las cifras se difuminan.' }
];

export function Landing({ onContinue }: { onContinue: () => void }) {
  const [, force] = useState(0);
  const [guide, setGuide] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [busy, setBusy] = useState(false);
  const p = platform();
  useEffect(() => onUser(setUser), []);

  async function google() {
    setBusy(true);
    try { await signInWithGoogle(); setTimeout(() => install(), 400); } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => { installListeners.delete(l); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  async function install() {
    if (installState.deferred) {
      await installState.deferred.prompt();
      const { outcome } = await installState.deferred.userChoice;
      installState.deferred = null;
      if (outcome === 'accepted') setInstalled(true);
      force((n) => n + 1);
      return;
    }
    setGuide(true);
  }

  function skip() {
    try { sessionStorage.setItem(SKIP, '1'); } catch { /* sin almacenamiento */ }
    onContinue();
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-paper">
      <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10">
        <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between pt-2">
          <span className="flex items-center gap-2 font-serif text-[26px]">
            <Logo size={34} /> Eco
          </span>
          <button onClick={skip} className="text-[14px] font-semibold text-ink3">Usar en el navegador</button>
        </motion.header>

        {/* Hero */}
        <section className="pt-14">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-[14px] font-semibold uppercase tracking-[0.16em] text-accent">
            Control de gastos
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-serif text-[58px] leading-[0.95] tracking-[-0.01em]">
            Tu dinero,<br />
            <span className="italic text-ink2">sin límites</span><br />
            ni letra pequeña.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-5 text-[17px] leading-relaxed text-ink2">
            Una app hecha a nuestra medida. Sin anuncios, sin pagos y con tus datos en tu móvil.
          </motion.p>
        </section>

        {/* Mini-pantalla animada */}
        <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ delay: 0.3, ...spring }} className="mt-10 rounded-[28px] bg-ink p-5 text-paper shadow-[0_30px_60px_-20px_rgb(var(--shadow)/0.45)]">
          <p className="text-[13px] opacity-60">Tu semana hasta hoy</p>
          <p className="font-serif text-[30px] leading-tight">Has gastado 186,40 €</p>
          <div className="mt-4 flex h-16 items-end gap-2">
            {[40, 75, 20, 95, 55, 0, 30].map((h, i) => (
              <div key={i} className="flex h-full flex-1 flex-col justify-end">
                <motion.div className={`rounded-[5px] ${i === 3 ? 'bg-accent' : 'bg-paper/30'}`} style={{ height: `${Math.max(5, h)}%`, transformOrigin: 'bottom' }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.6 + i * 0.07, type: 'spring', stiffness: 180, damping: 18 }} />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Ventajas */}
        <div className="mt-10 space-y-5">
          {FEATURES.map(({ icon: I, title, text }, i) => (
            <motion.div key={title} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-surface text-accent"><I size={22} /></span>
              <div>
                <p className="text-[16px] font-semibold">{title}</p>
                <p className="text-[14px] leading-relaxed text-ink2">{text}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex-1" />

        {/* CTA */}
        <div className="sticky bottom-0 -mx-6 mt-10 bg-gradient-to-t from-paper via-paper to-transparent px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <AnimatePresence mode="wait">
            {installed ? (
              <motion.div key="ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] bg-surface p-5 text-center">
                <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-pos text-white"><Checkmark size={22} /></span>
                <p className="font-serif text-[24px]">¡Instalada!</p>
                <p className="text-[14px] text-ink2">Ábrela desde tu pantalla de inicio.</p>
              </motion.div>
            ) : p.inApp ? (
              <InAppNotice key="inapp" />
            ) : (
              <motion.div key={user ? 'cta-user' : 'cta'} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {cloudEnabled && p.mobile && !user ? (
                  <>
                    {/* Paso 1: entrar con Google aquí, donde el móvil ya tiene tu cuenta. La app instalada entrará sola. */}
                    <Press scale={0.97} disabled={busy} onClick={google} className="flex h-[60px] w-full items-center justify-center gap-3 rounded-full bg-raised text-[17px] font-semibold shadow-[0_8px_24px_-10px_rgb(var(--shadow)/0.35),inset_0_0_0_1px_rgb(var(--line)/0.08)]">
                      <GoogleG /> {busy ? 'Conectando…' : 'Entrar con Google e instalar'}
                    </Press>
                    <p className="mt-2.5 text-center text-[13px] text-ink3">Usa la cuenta que ya tienes en el móvil. Así la app se abrirá con tu sesión iniciada.</p>
                    <button onClick={install} className="mt-1 w-full py-2 text-center text-[14px] font-semibold text-ink2">Instalar sin cuenta</button>
                  </>
                ) : (
                <>
                {user && (
                  <div className="mb-3 flex items-center justify-center gap-2 text-[14px] text-ink2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pos text-white"><Checkmark size={13} /></span>
                    Hola, {user.name.split(' ')[0] || user.email}. Ahora instálala.
                  </div>
                )}
                <Press scale={0.97} onClick={install} className="relative flex h-[60px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-full bg-accent text-[18px] font-semibold text-white shadow-[0_14px_30px_-8px_rgb(var(--accent)/0.6)]">
                  <motion.span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" initial={{ x: '-150%' }} animate={{ x: '350%' }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut', repeatDelay: 1.2 }} />
                  <Download size={22} /> Instalar Eco
                </Press>
                <p className="mt-3 text-center text-[13px] text-ink3">
                  {p.ios ? 'Gratis · Sin App Store · Ocupa menos de 1 MB' : p.android ? 'Gratis · Sin Play Store · Ocupa menos de 1 MB' : 'Ábrela en tu móvil para instalarla'}
                </p>
                </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{guide && <InstallGuide key="g" p={p} onClose={() => setGuide(false)} />}</AnimatePresence>
    </div>
  );
}

function InAppNotice() {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-surface p-5">
      <p className="font-serif text-[22px] leading-tight">Ábrela en tu navegador</p>
      <p className="mt-1.5 text-[14px] text-ink2">Desde aquí no se puede instalar. Toca ··· y elige «Abrir en Safari» (o en Chrome), o copia el enlace.</p>
      <Press scale={0.97} onClick={async () => { await navigator.clipboard?.writeText(location.href.split('?')[0]); setCopied(true); }} className="btn-ink mt-4 w-full">
        {copied ? <><Checkmark size={18} /> Copiado</> : <><Copy size={18} /> Copiar enlace</>}
      </Press>
    </motion.div>
  );
}

/** Guía animada: en iPhone no hay botón de instalar, así que señalamos el de Compartir. */
/** Guía animada: en iPhone no hay botón de instalar, así que señalamos dónde tocar según el navegador. */
function InstallGuide({ p, onClose }: { p: ReturnType<typeof platform>; onClose: () => void }) {
  const box = (c: React.ReactNode) => <span className="flex h-8 min-w-8 items-center justify-center rounded-[9px] border-[1.5px] border-current px-1 text-[13px] font-bold">{c}</span>;
  const add = { title: 'Añadir a pantalla de inicio', text: 'Si no la ves, baja en el menú o toca «Ver más».', icon: box(<Add size={18} />) };
  const done = { title: 'Pulsa «Añadir»', text: 'Arriba a la derecha. Eco aparecerá con su icono, como una app más.', icon: <Logo size={32} /> };
  // Dónde está el botón: Safari 26+ lo esconde en «···» (abajo a la derecha); Chrome en iPhone, arriba a la derecha
  const where: 'bottom-right' | 'bottom' | 'top-right' = !p.ios ? 'top-right' : p.crios ? 'top-right' : p.safariVersion >= 26 ? 'bottom-right' : 'bottom';
  const steps = !p.ios
    ? [
        { title: 'Abre el menú del navegador', text: 'Los tres puntos, arriba a la derecha.', icon: <span className="text-[22px] font-bold leading-none">⋮</span> },
        { title: 'Instalar aplicación', text: 'O «Añadir a pantalla de inicio».', icon: <Launch size={22} /> },
        { title: 'Confirma', text: 'Eco aparecerá con su icono, como una app más.', icon: <Logo size={32} /> }
      ]
    : where === 'bottom-right'
      ? [
          { title: 'Toca los tres puntos', text: 'Abajo a la derecha, en la barra de Safari (junto a la dirección).', icon: box(<Dots />) },
          { title: 'Toca Compartir', text: 'El cuadrado con la flecha hacia arriba.', icon: <ShareGlyph /> },
          add,
          done
        ]
      : [
          { title: 'Toca Compartir', text: where === 'top-right' ? 'Arriba a la derecha, en la barra de direcciones.' : 'El cuadrado con la flecha, en la barra de abajo.', icon: <ShareGlyph /> },
          add,
          done
        ];
  const arrow = {
    'bottom-right': 'bottom-1 right-6 justify-end',
    bottom: 'bottom-1 inset-x-0 justify-center',
    'top-right': 'top-[max(env(safe-area-inset-top),6px)] right-4 justify-end rotate-180'
  }[where];
  return (
    <>
      <Sheet onClose={onClose} title={`Instalar en ${steps.length} toques`}>
        <div className="pb-safe space-y-2.5 px-5 pb-6 pt-3">
          {steps.map((st, i) => (
            <motion.div key={st.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12 }} className="flex items-center gap-4 rounded-[22px] bg-surface p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paper text-accent">{st.icon}</span>
              <div>
                <p className="text-[16px] font-semibold"><span className="text-ink3">{i + 1}.</span> {st.title}</p>
                <p className="text-[14px] text-ink2">{st.text}</p>
              </div>
            </motion.div>
          ))}
          <p className="px-1 pt-1 text-center text-[13px] text-ink3">Es la única forma que permite Apple: ninguna web puede instalarse sola en iPhone.</p>
          <Press scale={0.97} onClick={onClose} className="btn-ink mt-1 w-full">Entendido</Press>
        </div>
      </Sheet>
      {/* Flecha que señala el botón del navegador */}
      {p.ios && (
        <motion.div className={`pointer-events-none fixed z-[60] flex text-accent ${arrow}`} initial={{ opacity: 0 }} animate={{ opacity: 1, y: where === 'top-right' ? [0, -10, 0] : [0, 10, 0] }} exit={{ opacity: 0 }} transition={{ y: { repeat: Infinity, duration: 1.1 }, delay: 0.6 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15M5 12l7 7 7-7" /></svg>
        </motion.div>
      )}
    </>
  );
}

function Dots() {
  return (
    <svg width="18" height="6" viewBox="0 0 18 6" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="2" /><circle cx="9" cy="3" r="2" /><circle cx="15" cy="3" r="2" /></svg>
  );
}

function ShareGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
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

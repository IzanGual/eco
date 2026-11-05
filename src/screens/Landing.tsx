import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Add, ChartPie, Checkmark, Copy, Download, Launch, UserMultiple, View } from '@carbon/icons-react';
import { Press, Sheet, spring } from '../components/ui';

// ---------- Detección de plataforma ----------
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  // Navegadores dentro de otras apps (Instagram, WhatsApp, Gmail…) no dejan instalar
  const inApp = /Instagram|FBAN|FBAV|Line\/|WhatsApp|GSA\/|Snapchat|TikTok|wv\)/.test(ua);
  return { ios, android, inApp, mobile: ios || android };
}

const SKIP = 'eco:skipLanding';
export const shouldShowLanding = () => {
  if (isStandalone()) return false;
  try { return localStorage.getItem(SKIP) !== '1'; } catch { return true; }
};

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
  const p = platform();

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => { listeners.delete(l); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') setInstalled(true);
      force((n) => n + 1);
      return;
    }
    setGuide(true);
  }

  function skip() {
    try { localStorage.setItem(SKIP, '1'); } catch { /* sin almacenamiento */ }
    onContinue();
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-paper">
      <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10">
        <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between pt-2">
          <span className="flex items-center gap-2 font-serif text-[26px]">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[10px]" /> Eco
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
                <motion.div className={`rounded-[5px] ${i === 3 ? 'bg-accent' : 'bg-paper/30'}`} initial={{ height: 0 }} animate={{ height: `${Math.max(5, h)}%` }} transition={{ delay: 0.6 + i * 0.07, type: 'spring', stiffness: 180, damping: 18 }} />
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
              <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Press scale={0.97} onClick={install} className="relative flex h-[60px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-full bg-accent text-[18px] font-semibold text-white shadow-[0_14px_30px_-8px_rgb(var(--accent)/0.6)]">
                  <motion.span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" initial={{ x: '-150%' }} animate={{ x: '350%' }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut', repeatDelay: 1.2 }} />
                  <Download size={22} /> Instalar Eco
                </Press>
                <p className="mt-3 text-center text-[13px] text-ink3">
                  {p.ios ? 'Gratis · Sin App Store · Ocupa menos de 1 MB' : p.android ? 'Gratis · Sin Play Store · Ocupa menos de 1 MB' : 'Ábrela en tu móvil para instalarla'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{guide && <InstallGuide key="g" ios={p.ios} onClose={() => setGuide(false)} />}</AnimatePresence>
    </div>
  );
}

function InAppNotice() {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-surface p-5">
      <p className="font-serif text-[22px] leading-tight">Ábrela en tu navegador</p>
      <p className="mt-1.5 text-[14px] text-ink2">Desde aquí no se puede instalar. Toca ··· y elige «Abrir en Safari» (o en Chrome), o copia el enlace.</p>
      <Press scale={0.97} onClick={async () => { await navigator.clipboard?.writeText(location.origin); setCopied(true); }} className="btn-ink mt-4 w-full">
        {copied ? <><Checkmark size={18} /> Copiado</> : <><Copy size={18} /> Copiar enlace</>}
      </Press>
    </motion.div>
  );
}

/** Guía animada: en iPhone no hay botón de instalar, así que señalamos el de Compartir. */
function InstallGuide({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  const steps = ios
    ? [
        { n: 1, title: 'Toca Compartir', text: 'El cuadrado con la flecha hacia arriba, en la barra de Safari.', icon: <ShareGlyph /> },
        { n: 2, title: 'Añadir a pantalla de inicio', text: 'Desliza hacia abajo en el menú si no la ves.', icon: <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border-[1.5px] border-current"><Add size={18} /></span> },
        { n: 3, title: 'Pulsa «Añadir»', text: 'Arriba a la derecha. Eco aparecerá con su icono, como una app más.', icon: <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[9px]" /> }
      ]
    : [
        { n: 1, title: 'Abre el menú del navegador', text: 'Los tres puntos, arriba a la derecha.', icon: <span className="text-[22px] font-bold leading-none">⋮</span> },
        { n: 2, title: 'Instalar aplicación', text: 'O «Añadir a pantalla de inicio».', icon: <Launch size={22} /> },
        { n: 3, title: 'Confirma', text: 'Eco aparecerá con su icono, como una app más.', icon: <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[9px]" /> }
      ];
  return (
    <>
      <Sheet onClose={onClose} title="Instalar en 3 pasos">
        <div className="pb-safe space-y-3 px-5 pb-6 pt-3">
          {steps.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12 }} className="flex items-center gap-4 rounded-[22px] bg-surface p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paper text-accent">{s.icon}</span>
              <div>
                <p className="text-[16px] font-semibold"><span className="text-ink3">{s.n}.</span> {s.title}</p>
                <p className="text-[14px] text-ink2">{s.text}</p>
              </div>
            </motion.div>
          ))}
          <Press scale={0.97} onClick={onClose} className="btn-ink mt-2 w-full">Entendido</Press>
        </div>
      </Sheet>
      {/* Flecha que señala la barra de Safari (abajo en iPhone) */}
      {ios && (
        <motion.div className="pointer-events-none fixed inset-x-0 bottom-1 z-[60] flex justify-center text-accent" initial={{ opacity: 0 }} animate={{ opacity: 1, y: [0, 10, 0] }} exit={{ opacity: 0 }} transition={{ y: { repeat: Infinity, duration: 1.1 }, delay: 0.6 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15M5 12l7 7 7-7" /></svg>
        </motion.div>
      )}
    </>
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

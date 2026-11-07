import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useScroll, useTransform, type PanInfo } from 'framer-motion';
import { ArrowLeft, Close, Checkmark, View, ViewOff } from '@carbon/icons-react';
import { useData } from '../store';
import { setSetting } from '../db';
import { CatIcon, ICON_NAMES, PALETTE } from '../icons';
import { fmt } from '../lib';
import { LOGO_DOT, LOGO_E } from '../logo-path';

export const spring = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

// ---------- Botón con rebote ----------
type PressProps = React.ComponentProps<typeof motion.button> & { scale?: number };
export function Press({ scale = 0.96, children, ...rest }: PressProps) {
  return (
    <motion.button whileTap={{ scale }} transition={spring} {...rest}>
      {children}
    </motion.button>
  );
}

// ---------- Icono de categoría ----------
export function Tile({ icon, color, size = 40, active }: { icon: string; color: string; size?: number; active?: boolean }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center transition-colors"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        background: active ? color : `color-mix(in srgb, ${color} 15%, transparent)`,
        color: active ? '#fff' : color
      }}
    >
      <CatIcon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

// ---------- Número animado ----------
export function Amount({ cents, className, sign, compact }: { cents: number; className?: string; sign?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(cents);
  // Escribimos directamente en el DOM: un render de React por fotograma iba a tirones en iPhone
  useEffect(() => {
    const ctl = animate(mv, cents, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = fmt(Math.round(v), { sign, compact }); } });
    return () => ctl.stop();
  }, [cents]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={className}>{fmt(cents, { sign, compact })}</span>;
}

const splitAmount = (v: number) => {
  const m = fmt(v).match(/^(.*?)(,\d{2})?(\s?€)?$/);
  return [m?.[1] ?? '', `${m?.[2] ?? ''}${m?.[3] ?? ''}`];
};

/** Importe grande en serif con los céntimos más pequeños: 4.564,10 € */
export function BigAmount({ cents, className = '', animated = true }: { cents: number; className?: string; animated?: boolean }) {
  const intRef = useRef<HTMLSpanElement>(null);
  const decRef = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(cents);
  const [first] = useState(() => splitAmount(cents));
  useEffect(() => {
    const paint = (x: number) => {
      const [a, b] = splitAmount(Math.round(x));
      if (intRef.current) intRef.current.textContent = a;
      if (decRef.current) decRef.current.textContent = b;
    };
    if (!animated) { mv.set(cents); paint(cents); return; }
    const ctl = animate(mv, cents, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: paint });
    return () => ctl.stop();
  }, [cents]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`num leading-none ${className}`}>
      <span ref={intRef}>{first[0]}</span>
      <span ref={decRef} className="text-[0.55em]">{first[1]}</span>
    </span>
  );
}

// ---------- Segmentado con indicador de vidrio ----------
export function Segmented<T extends string>({ value, onChange, options, className = '', id }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  id: string;
}) {
  return (
    <div className={`flex rounded-full bg-ink/[0.06] p-1 ${className}`}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="relative flex-1 rounded-full px-3 py-2 text-[14px] font-semibold">
          {value === o.value && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-raised shadow-[0_1px_3px_rgb(var(--shadow)/0.12)]" />}
          <span className={`relative transition-colors ${value === o.value ? 'text-ink' : 'text-ink3'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Barra de progreso ----------
export function Progress({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const c = color ?? (value >= 1 ? 'rgb(var(--accent))' : value >= 0.8 ? 'rgb(var(--warn))' : 'rgb(var(--ink))');
  return (
    <div className="h-[5px] w-full overflow-hidden rounded-full bg-ink/[0.08]">
      <motion.div className="h-full w-full rounded-full" initial={{ scaleX: 0 }} animate={{ scaleX: pct }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} style={{ background: c, transformOrigin: 'left' }} />
    </div>
  );
}

// ---------- Estado vacío ----------
export function Empty({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.05] text-ink2">
        <CatIcon name={icon} size={26} />
      </span>
      <p className="font-serif text-[24px] leading-tight">{title}</p>
      {text && <p className="mt-1.5 text-[14px] text-ink2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

// ---------- Cabecera grande que se encoge al hacer scroll ----------
export function LargeTitle({ title, scrollRef, left, right, eyebrow }: {
  title: string;
  scrollRef?: React.RefObject<HTMLElement>;
  left?: ReactNode;
  right?: ReactNode;
  eyebrow?: ReactNode;
}) {
  const { scrollY } = useScroll(scrollRef ? { container: scrollRef } : undefined);
  const barOpacity = useTransform(scrollY, [24, 56], [0, 1]);
  const bigOpacity = useTransform(scrollY, [0, 40], [1, 0]);
  const bigScale = useTransform(scrollY, [-80, 0], [1.12, 1]);
  return (
    <>
      <div className="pt-safe pointer-events-none sticky top-0 z-20 -mb-[52px]">
        <motion.div style={{ opacity: barOpacity }} className="glass absolute inset-0 rounded-none !shadow-[0_0.5px_0_rgb(var(--line)/0.12)]" />
        <div className="pointer-events-auto relative flex h-[52px] items-center gap-2 px-3">
          <div className="flex min-w-[44px] items-center">{left}</div>
          <motion.span style={{ opacity: barOpacity }} className="flex-1 truncate text-center text-[16px] font-semibold">{title}</motion.span>
          <div className="flex min-w-[44px] items-center justify-end gap-1">{right}</div>
        </div>
      </div>
      <motion.div style={{ opacity: bigOpacity, scale: bigScale, transformOrigin: 'left center' }} className="px-5 pb-3 pt-[60px]">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="font-serif text-[40px] leading-[1.02] tracking-[-0.01em]">{title}</h1>
      </motion.div>
    </>
  );
}

export function GlassIconButton({ onClick, label, children, className = '' }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <Press scale={0.88} onClick={onClick} aria-label={label} className={`glass flex h-10 w-10 items-center justify-center rounded-full ${className}`}>
      {children}
    </Press>
  );
}

// ---------- Pantalla apilada (entra desde la derecha) ----------
export function Page({ title, onBack, right, children, footer, eyebrow }: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      className="fixed inset-0 flex flex-col bg-paper will-change-transform"
    >
      <div ref={ref} className="flex-1 overflow-y-auto overscroll-contain pb-10">
        <LargeTitle title={title} scrollRef={ref} eyebrow={eyebrow} left={<GlassIconButton onClick={onBack} label="Atrás"><ArrowLeft size={20} /></GlassIconButton>} right={right} />
        <div className="px-5">{children}</div>
      </div>
      {footer && <div className="pb-safe px-5 pt-3">{footer}</div>}
    </motion.div>
  );
}

// ---------- Hoja modal (sube desde abajo, se cierra arrastrando) ----------
export function Sheet({ onClose, children, title, right, full }: { onClose: () => void; children: ReactNode; title?: string; right?: ReactNode; full?: boolean }) {
  const y = useMotionValue(0);
  const controls = useDragControls();
  const backdrop = useTransform(y, [0, 400], [1, 0]);
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }
  return (
    <div className="fixed inset-0">
      <motion.div className="absolute inset-0 bg-black/35" style={{ opacity: backdrop }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[30px] bg-paper ${full ? 'top-[max(env(safe-area-inset-top),14px)]' : 'max-h-[88dvh]'}`}
        style={{ y }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 42 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onDragEnd}
      >
        {/* Solo se arrastra desde la cabecera, así el contenido puede hacer scroll */}
        <div className="touch-none" onPointerDown={(e) => controls.start(e)}>
          <div className="flex justify-center pb-1 pt-2.5"><span className="h-[5px] w-10 rounded-full bg-ink/15" /></div>
          {(title || right) && (
            <div className="flex items-center gap-2 px-4 pb-1">
              <GlassIconButton onClick={onClose} label="Cerrar"><Close size={20} /></GlassIconButton>
              <span className="flex-1 text-center text-[16px] font-semibold">{title}</span>
              <div className="flex min-w-10 justify-end">{right}</div>
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </motion.div>
    </div>
  );
}

// ---------- Diálogo de confirmación y avisos (sin window.confirm) ----------
interface ConfirmReq { title: string; message?: string; confirm: string; destructive?: boolean; resolve: (v: boolean) => void }
let confirmState: ConfirmReq | null = null;
let toastState: { id: number; text: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function confirmDialog(title: string, opts: { message?: string; confirm?: string; destructive?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    confirmState = { title, message: opts.message, confirm: opts.confirm ?? 'Eliminar', destructive: opts.destructive ?? true, resolve };
    emit();
  });
}
export function toast(text: string) {
  toastState = { id: Date.now(), text };
  emit();
  const id = toastState.id;
  setTimeout(() => { if (toastState?.id === id) { toastState = null; emit(); } }, 2600);
}

export function OverlayHost() {
  const c = useSyncExternalStore(subscribe, () => confirmState);
  const t = useSyncExternalStore(subscribe, () => toastState);
  const close = (v: boolean) => { c?.resolve(v); confirmState = null; emit(); };
  return (
    <>
      {c && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-3">
          <motion.div className="absolute inset-0 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => close(false)} />
          <motion.div initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={spring} className="mb-safe relative w-full max-w-md space-y-2">
            <div className="glass overflow-hidden rounded-[26px]">
              <div className="px-5 pb-4 pt-5 text-center">
                <p className="font-serif text-[22px] leading-tight">{c.title}</p>
                {c.message && <p className="mt-1.5 text-[14px] text-ink2">{c.message}</p>}
              </div>
              <Press scale={0.98} onClick={() => close(true)} className={`w-full border-t py-4 text-[17px] font-semibold hair ${c.destructive ? 'text-accent' : 'text-ink'}`}>{c.confirm}</Press>
            </div>
            <Press scale={0.98} onClick={() => close(false)} className="glass w-full rounded-[22px] py-4 text-[17px] font-semibold">Cancelar</Press>
          </motion.div>
        </div>
      )}
      {t && (
        <motion.div key={t.id} initial={{ y: -40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={spring} className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[110] flex justify-center">
          <div className="glass mt-1 flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold">
            <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: 0.1 }} className="flex h-5 w-5 items-center justify-center rounded-full bg-pos text-white">
              <Checkmark size={14} />
            </motion.span>
            {t.text}
          </div>
        </motion.div>
      )}
    </>
  );
}

// ---------- Selectores de color e icono ----------
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {PALETTE.map((c) => (
        <Press key={c} scale={0.85} onClick={() => onChange(c)} className="relative aspect-square rounded-full" style={{ background: c }} aria-label={c}>
          {value === c && (
            <motion.span layoutId="color-ring" transition={spring} className="absolute -inset-[5px] rounded-full border-2" style={{ borderColor: c }} />
          )}
        </Press>
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (i: string) => void; color: string }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {ICON_NAMES.map((n) => (
        <Press key={n} scale={0.85} onClick={() => onChange(n)} className="flex aspect-square items-center justify-center rounded-2xl transition-colors" style={value === n ? { background: color, color: '#fff' } : { color: 'rgb(var(--ink-2))' }} aria-label={n}>
          <CatIcon name={n} size={22} />
        </Press>
      ))}
    </div>
  );
}

/** Lista agrupada (estilo iOS) sobre papel. */
export function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-hair overflow-hidden rounded-[22px] bg-surface ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-2.5 pt-7">
      <h2 className="font-serif text-[24px] leading-none">{children}</h2>
      {action}
    </div>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Press scale={0.94} onClick={onClick} className="text-[14px] font-semibold text-accent">
      {children}
    </Press>
  );
}

// ---------- Ojito: oculta / muestra las cifras ----------
export function PrivacyToggle() {
  const { settings } = useData();
  const on = !!settings.privacy;
  return (
    <GlassIconButton onClick={() => setSetting('privacy', !on)} label={on ? 'Mostrar cifras' : 'Ocultar cifras'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={on ? 'off' : 'on'} initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0, rotate: 30 }} transition={spring} className={on ? 'text-accent' : ''}>
          {on ? <ViewOff size={20} /> : <View size={20} />}
        </motion.span>
      </AnimatePresence>
    </GlassIconButton>
  );
}

// ---------- Logo «e.» que sigue el tema (tinta sobre papel / papel sobre tinta) ----------
export function Logo({ size = 32, plain }: { size?: number; plain?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="Eco" role="img" className="shrink-0">
      {!plain && <rect width="512" height="512" rx="120" fill="rgb(var(--ink))" />}
      <path d={LOGO_E} fill={plain ? 'rgb(var(--ink))' : 'rgb(var(--paper))'} />
      <circle cx={LOGO_DOT.cx} cy={LOGO_DOT.cy} r={LOGO_DOT.r} fill="rgb(var(--accent))" />
    </svg>
  );
}

/**
 * iOS solo abre el teclado si el foco se pone en el mismo toque del usuario. El formulario se monta un instante
 * después, así que enfocamos un campo invisible ya mismo y el formulario le «roba» el foco al montarse:
 * el teclado numérico aparece sin tener que tocar el importe.
 */
export function focusKeyboard() {
  let el = document.getElementById('kbd-proxy') as HTMLInputElement | null;
  if (!el) {
    el = document.createElement('input');
    el.id = 'kbd-proxy';
    el.setAttribute('inputmode', 'decimal');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.focus({ preventScroll: true });
}

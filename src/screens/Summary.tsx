import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Close } from '@carbon/icons-react';
import { addDays, daysBetween, dayLabel, fmt, fromISO, getPeriod, todayISO, totals } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { BigAmount, Press, Tile } from '../components/ui';

const DURATION = 6000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ease = [0.22, 1, 0.36, 1] as const;

/** Resumen semanal o mensual, en formato historia. */
export function Summary({ kind, offset }: { kind: 'week' | 'month'; offset: number }) {
  const { txs, catMap, settings } = useData();
  const nav = useNav();
  const today = todayISO();

  const data = useMemo(() => {
    const p = getPeriod(kind, offset, settings.monthStartDay);
    const prev = getPeriod(kind, offset - 1, settings.monthStartDay);
    const end = p.end < today ? p.end : today;
    const inP = txs.filter((t) => t.date >= p.start && t.date <= end);
    const span = daysBetween(p.start, end);
    const prevEnd = end < p.end && addDays(prev.start, span) < prev.end ? addDays(prev.start, span) : prev.end;
    const inPrev = txs.filter((t) => t.date >= prev.start && t.date <= prevEnd);
    const tt = totals(inP);
    const tp = totals(inPrev);
    const expenses = inP.filter((t) => t.type === 'expense');

    const nDays = daysBetween(p.start, p.end) + 1;
    const elapsed = Math.max(1, daysBetween(p.start, end) + 1);
    const days = Array.from({ length: nDays }, (_, i) => ({ date: addDays(p.start, i), v: 0 }));
    for (const t of expenses) days[daysBetween(p.start, t.date)].v += t.amount;
    const maxDay = days.reduce((a, b) => (b.v > a.v ? b : a), days[0]);
    const zeroDays = days.slice(0, elapsed).filter((d) => d.v === 0).length;

    const byCat = new Map<number | undefined, number>();
    for (const t of expenses) {
      const c = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
      const k = c?.parentId ?? c?.id;
      byCat.set(k, (byCat.get(k) ?? 0) + t.amount);
    }
    const cats = [...byCat.entries()]
      .map(([id, v]) => ({ c: id != null ? catMap.get(id) : undefined, v, pct: tt.expense ? v / tt.expense : 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);

    const biggest = expenses.reduce<(typeof expenses)[number] | undefined>((a, b) => (!a || b.amount > a.amount ? b : a), undefined);
    return { p, tt, tp, days, maxDay, zeroDays, elapsed, cats, biggest, count: inP.length, partial: end < p.end };
  }, [txs, catMap, kind, offset, settings.monthStartDay, today]);

  const { p, tt, tp, days, maxDay, zeroDays, elapsed, cats, biggest } = data;
  const diff = tp.expense ? (tt.expense - tp.expense) / tp.expense : null;
  const unit = kind === 'week' ? 'semana' : 'mes';
  const maxV = Math.max(1, ...days.map((d) => d.v));
  const saved = tt.income - tt.expense;

  const slides: ReactNode[] = [];
  if (tt.expense === 0 && tt.income === 0) {
    slides.push(
      <Slide key="empty" eyebrow={p.label}>
        <Title>Un{kind === 'week' ? 'a semana' : ' mes'} en blanco</Title>
        <Text>No hay movimientos apuntados en este periodo. Cuando los haya, aquí verás tu resumen.</Text>
      </Slide>
    );
  } else {
    slides.push(
      <Slide key="intro" eyebrow={`Tu ${unit} · ${p.label}`}>
        <Title>Has gastado</Title>
        <BigAmount cents={tt.expense} className="mt-2 block text-[76px] tracking-[-0.02em]" />
        {diff != null && (
          <Reveal delay={0.9}>
            <span className={`mt-6 inline-block rounded-full px-4 py-2 text-[15px] font-semibold ${diff > 0 ? 'bg-accent text-white' : 'bg-pos text-white'}`}>
              {diff > 0 ? `${Math.round(diff * 100)} % más` : `${Math.abs(Math.round(diff * 100))} % menos`} que {kind === 'week' ? 'la semana' : 'el mes'} anterior{data.partial ? ' a estas alturas' : ''}
            </span>
          </Reveal>
        )}
        <Reveal delay={1.2}><Text>{data.count} movimientos · <span className="money">{fmt(Math.round(tt.expense / elapsed))}</span> al día de media</Text></Reveal>
      </Slide>
    );

    if (maxDay.v > 0)
      slides.push(
        <Slide key="days" eyebrow="Día a día">
          <Title>
            {kind === 'week' ? `El ${WEEKDAYS[fromISO(maxDay.date).getDay()]}` : `El ${fromISO(maxDay.date).getDate()}`} fue tu día más caro
          </Title>
          <Reveal delay={0.4}><p className="num mt-2 text-[44px] text-accent">{fmt(maxDay.v)}</p></Reveal>
          <div className="money-chart mt-10 flex h-44 items-end gap-[3px]">
            {days.map((d, i) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <motion.div
                  className={`w-full rounded-[5px] ${d.date === maxDay.date ? 'bg-accent' : 'bg-paper/35'}`}
                  initial={{ height: 0 }}
                  animate={{ height: d.v ? `${Math.max(4, (d.v / maxV) * 100)}%` : 3 }}
                  transition={{ delay: 0.5 + i * (kind === 'week' ? 0.08 : 0.025), type: 'spring', stiffness: 160, damping: 18 }}
                />
                {kind === 'week' && <span className="text-[12px] opacity-50">{'LMXJVSD'[i]}</span>}
              </div>
            ))}
          </div>
        </Slide>
      );

    if (cats.length)
      slides.push(
        <Slide key="cats" eyebrow="A dónde fue">
          <Title>
            El {Math.round(cats[0].pct * 100)} % se fue en {cats[0].c?.name.toLowerCase() ?? 'otras cosas'}
          </Title>
          <div className="mt-10 space-y-5">
            {cats.map((x, i) => (
              <Reveal key={i} delay={0.4 + i * 0.15}>
                <div className="flex items-center gap-3.5">
                  <Tile icon={x.c?.icon ?? 'tag'} color={x.c?.color ?? '#9A9386'} size={44} active />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[16px] font-semibold">{x.c?.name ?? 'Sin categoría'}</span>
                      <span className="num text-[22px]">{fmt(x.v, { compact: true })}</span>
                    </div>
                    <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-paper/15">
                      <motion.div className="h-full rounded-full" style={{ background: x.c?.color ?? '#9A9386' }} initial={{ width: 0 }} animate={{ width: `${x.pct * 100}%` }} transition={{ delay: 0.6 + i * 0.15, duration: 0.9, ease }} />
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Slide>
      );

    if (biggest) {
      const c = biggest.categoryId != null ? catMap.get(biggest.categoryId) : undefined;
      slides.push(
        <Slide key="big" eyebrow="El gasto más grande">
          <motion.div initial={{ scale: 0.5, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.2 }}>
            <Tile icon={c?.icon ?? 'tag'} color={c?.color ?? '#9A9386'} size={88} active />
          </motion.div>
          <Title className="mt-8">{biggest.note || c?.name || 'Sin categoría'}</Title>
          <Reveal delay={0.5}><p className="num mt-2 text-[64px] leading-none">{fmt(biggest.amount)}</p></Reveal>
          <Reveal delay={0.8}><Text>{dayLabel(biggest.date)}{tt.expense ? ` · el ${Math.round((biggest.amount / tt.expense) * 100)} % de tu ${unit}` : ''}</Text></Reveal>
        </Slide>
      );
    }

    slides.push(
      <Slide key="zero" eyebrow="Días sin gastar">
        <Title>
          {zeroDays === 0 ? 'Ni un día sin gastar' : zeroDays === 1 ? 'Un día sin gastar nada' : `${zeroDays} días sin gastar nada`}
        </Title>
        <div className={`mt-10 grid gap-2.5 ${kind === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
          {days.slice(0, elapsed).map((d, i) => (
            <motion.span
              key={d.date}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 400, damping: 15 }}
              className={`flex aspect-square items-center justify-center rounded-full text-[13px] font-semibold ${d.v === 0 ? 'bg-pos text-white' : 'bg-paper/15 opacity-70'}`}
            >
              {fromISO(d.date).getDate()}
            </motion.span>
          ))}
        </div>
        <Reveal delay={0.8}><Text>{zeroDays >= elapsed / 3 ? 'Muy bien. Los días a cero son los que más se notan a final de mes.' : 'Prueba a encadenar algún día a cero: se nota más de lo que parece.'}</Text></Reveal>
      </Slide>
    );

    slides.push(
      <Slide key="end" eyebrow={`Balance del ${unit}`}>
        <Title>{saved >= 0 ? 'Te quedaste con' : 'Gastaste más de lo que entró'}</Title>
        <BigAmount cents={Math.abs(saved)} className={`mt-2 block text-[72px] ${saved >= 0 ? 'text-pos' : 'text-accent'}`} />
        <Reveal delay={0.6}>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-[20px] bg-paper/10 p-4"><p className="text-[13px] opacity-60">Entró</p><p className="num text-[26px]">{fmt(tt.income, { compact: true })}</p></div>
            <div className="rounded-[20px] bg-paper/10 p-4"><p className="text-[13px] opacity-60">Salió</p><p className="num text-[26px]">{fmt(tt.expense, { compact: true })}</p></div>
          </div>
        </Reveal>
        {tt.income > 0 && saved > 0 && <Reveal delay={0.9}><Text>Has ahorrado el {Math.round((saved / tt.income) * 100)} % de lo que entró.</Text></Reveal>}
        <Reveal delay={1.1}>
          <Press scale={0.96} className="btn mt-8 bg-paper text-ink" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); nav.pop(); }}>Hecho</Press>
        </Reveal>
      </Slide>
    );
  }

  return <Story slides={slides} onClose={nav.pop} />;
}

// ---------- Motor de historias ----------
function Story({ slides, onClose }: { slides: ReactNode[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const last = useRef(performance.now());
  const pressAt = useRef(0);

  useEffect(() => {
    let raf = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      if (!paused) {
        setProgress((p) => {
          const np = p + dt / DURATION;
          if (np >= 1) {
            if (i < slides.length - 1) {
              setI(i + 1);
              return 0;
            }
            return 1;
          }
          return np;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, paused, slides.length]);

  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return setProgress(0);
    if (n >= slides.length) return onClose();
    setI(n);
    setProgress(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.3, ease }}
      className="fixed inset-0 select-none overflow-hidden bg-[#141311] text-[#F1ECE2] [--paper:241_236_226] [--ink:20_19_17]"
      onPointerDown={() => { pressAt.current = performance.now(); setPaused(true); }}
      onPointerUp={(e) => {
        setPaused(false);
        if (performance.now() - pressAt.current > 250) return; // mantener = pausa
        const x = e.clientX / window.innerWidth;
        go(x < 0.3 ? -1 : 1);
      }}
      onPointerCancel={() => setPaused(false)}
    >
      <div className="pt-safe absolute inset-x-0 top-0 z-10 px-3">
        <div className="flex gap-1">
          {slides.map((_, k) => (
            <div key={k} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-white" style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-serif text-[20px]">Eco</span>
          <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); onClose(); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="Cerrar">
            <Close size={22} />
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35, ease }} className="absolute inset-0 flex flex-col justify-center px-7">
          {slides[i]}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function Slide({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div>
      <Reveal delay={0.05}><p className="mb-4 text-[14px] font-semibold uppercase tracking-[0.14em] opacity-50">{eyebrow}</p></Reveal>
      {children}
    </div>
  );
}
function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6, ease }} className={`font-serif text-[44px] leading-[1.02] ${className}`}>
      {children}
    </motion.h2>
  );
}
function Text({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-[17px] leading-relaxed opacity-70">{children}</p>;
}
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.55, ease }}>
      {children}
    </motion.div>
  );
}

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ChevronLeft, ChevronRight } from '@carbon/icons-react';
import type { CatType } from '../db';
import { addDays, daysBetween, fmt, fromISO, getPeriod, monthShort, todayISO, totals, type PeriodKind } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { BigAmount, Empty, LargeTitle, PrivacyToggle, Press, Segmented, Tile, toast } from '../components/ui';
import { useHousehold } from '../useHousehold';

type Kind = Exclude<PeriodKind, 'day'>;

export function Stats() {
  const { txs, settings, catMap, categories } = useData();
  const nav = useNav();
  const [kind, setKind] = useState<Kind>('month');
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<CatType>('expense');
  const [drill, setDrill] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const today = todayISO();

  const period = getPeriod(kind, offset, settings.monthStartDay);
  const prev = getPeriod(kind, offset - 1, settings.monthStartDay);
  const cur = useMemo(() => txs.filter((t) => t.date >= period.start && t.date <= period.end && t.date <= today), [txs, period.start, period.end, today]);
  // Si el periodo está en curso, comparamos con los mismos días del anterior
  const prevEnd = offset === 0 ? (addDays(prev.start, daysBetween(period.start, today)) < prev.end ? addDays(prev.start, daysBetween(period.start, today)) : prev.end) : prev.end;
  const before = useMemo(() => txs.filter((t) => t.date >= prev.start && t.date <= prevEnd), [txs, prev.start, prevEnd]);
  const t = totals(cur);
  const p = totals(before);
  const value = type === 'expense' ? t.expense : t.income;
  const prevValue = type === 'expense' ? p.expense : p.income;
  const diff = prevValue ? (value - prevValue) / prevValue : null;

  const bars = useMemo(() => {
    const out: { label: string; value: number; key: string }[] = [];
    if (kind === 'year') {
      for (let m = 0; m < 12; m++) out.push({ key: String(m), label: monthShort(m)[0].toUpperCase(), value: 0 });
      for (const x of cur) if (x.type === type) out[fromISO(x.date).getMonth()].value += x.amount;
    } else {
      const n = daysBetween(period.start, period.end) + 1;
      const idx = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const d = addDays(period.start, i);
        idx.set(d, i);
        out.push({ key: d, label: kind === 'week' ? 'LMXJVSD'[i] : String(fromISO(d).getDate()), value: 0 });
      }
      for (const x of cur) if (x.type === type) out[idx.get(x.date)!].value += x.amount;
    }
    return out;
  }, [cur, kind, type, period.start, period.end]);
  const maxBar = Math.max(1, ...bars.map((b) => b.value));
  const elapsed = Math.max(1, Math.min(daysBetween(period.start, today), daysBetween(period.start, period.end)) + 1);
  const avg = kind === 'year' ? Math.round(value / Math.max(1, offset === 0 ? new Date().getMonth() + 1 : 12)) : Math.round(value / (offset === 0 ? elapsed : bars.length));

  const house = useHousehold();
  const byMember = useMemo(() => {
    if (!house) return [];
    const m = new Map<string, number>();
    for (const x of cur) if (x.type === 'expense' && x.by) m.set(x.by, (m.get(x.by) ?? 0) + x.amount);
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return house.members.map((uid) => ({ uid, name: (house.names[uid] || '?').split(' ')[0], v: m.get(uid) ?? 0, pct: total ? (m.get(uid) ?? 0) / total : 0 }));
  }, [cur, house]);

  // Resumen en texto para pegarlo en ChatGPT, Claude o la IA que uses (en Soldi esto es de pago)
  async function shareForAI() {
    const lines = [`Mis finanzas personales (${period.label}). Ingresos: ${fmt(t.income)}. Gastos: ${fmt(t.expense)}. Ahorro: ${fmt(t.net)}.`, '', 'Gastos por categoría:'];
    const byCat = new Map<string, number>();
    for (const x of cur) {
      if (x.type !== 'expense') continue;
      const c = x.categoryId != null ? catMap.get(x.categoryId) : undefined;
      const p = c?.parentId != null ? catMap.get(c.parentId) : c;
      byCat.set(p?.name ?? 'Sin categoría', (byCat.get(p?.name ?? 'Sin categoría') ?? 0) + x.amount);
    }
    [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, v]) => lines.push(`- ${n}: ${fmt(v)}`));
    lines.push('', 'Gastos más grandes:');
    cur.filter((x) => x.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 8)
      .forEach((x) => lines.push(`- ${x.date} · ${x.note || catMap.get(x.categoryId!)?.name || ''}: ${fmt(x.amount)}`));
    lines.push('', '¿Qué patrones ves y qué me recomiendas para ahorrar más el próximo periodo?');
    const text = lines.join(String.fromCharCode(10));
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelado */ }
    }
    await navigator.clipboard?.writeText(text);
    toast('Resumen copiado: pégalo en tu IA');
  }

  const slices = useMemo(() => {
    const map = new Map<number | undefined, number>();
    for (const x of cur) {
      if (x.type !== type) continue;
      const c = x.categoryId != null ? catMap.get(x.categoryId) : undefined;
      let k: number | undefined;
      if (drill == null) k = c?.parentId ?? c?.id;
      else {
        if (x.categoryId !== drill && c?.parentId !== drill) continue;
        k = c?.id;
      }
      map.set(k, (map.get(k) ?? 0) + x.amount);
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return {
      total,
      items: [...map.entries()]
        .map(([id, v], i) => {
          const c = id != null ? catMap.get(id) : undefined;
          return { id, value: v, pct: total ? v / total : 0, name: drill != null && id === drill ? `${c?.name} (general)` : c?.name ?? 'Sin categoría', icon: c?.icon ?? 'tag', color: drill == null ? c?.color ?? '#9A9386' : shade(c?.color ?? '#9A9386', i) };
        })
        .sort((a, b) => b.value - a.value)
    };
  }, [cur, type, drill, catMap]);
  const drillCat = drill != null ? catMap.get(drill) : undefined;
  const shown = hover != null ? bars[hover] : null;

  return (
    <div>
      <LargeTitle title="Análisis" right={<PrivacyToggle />} />
      <div className="px-5">
        <Segmented id="kind" value={kind} onChange={(k) => { setKind(k); setOffset(0); }} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} />

        <div className="mt-5 flex items-center justify-between">
          <Press scale={0.85} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05]" onClick={() => setOffset((o) => o - 1)} aria-label="Anterior"><ChevronLeft size={20} /></Press>
          <motion.span key={period.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-serif text-[24px]">{period.label}</motion.span>
          <Press scale={0.85} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] disabled:opacity-30" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} aria-label="Siguiente"><ChevronRight size={20} /></Press>
        </div>

        {/* Resumen */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ['Entra', t.income, 'text-pos'],
            ['Sale', t.expense, 'text-accent'],
            ['Queda', t.net, t.net < 0 ? 'text-accent' : '']
          ].map(([l, v, c]) => (
            <div key={l as string} className="rounded-[20px] bg-surface px-3 py-3">
              <p className="text-[12px] text-ink3">{l}</p>
              <p className={`num text-[20px] leading-tight ${c}`}>{fmt(v as number, { compact: true })}</p>
            </div>
          ))}
        </div>

        {(kind === 'week' || kind === 'month') && (
          <Press scale={0.98} onClick={() => nav.push({ name: 'summary', kind, offset })} className="mt-3 flex w-full items-center justify-between rounded-[20px] bg-ink px-4 py-3.5 text-paper">
            <span className="text-[15px] font-semibold">Ver el resumen {kind === 'week' ? 'de la semana' : 'del mes'}</span>
            <ArrowUpRight size={18} />
          </Press>
        )}
        <Press scale={0.98} onClick={shareForAI} className="mt-2 flex w-full items-center justify-between rounded-[20px] bg-surface px-4 py-3.5">
          <span className="text-[15px] font-semibold">Pedir consejo a una IA</span>
          <span className="text-[13px] text-ink3">Copia el resumen</span>
        </Press>

        {/* Pareja: cuánto ha apuntado cada uno */}
        {house && house.members.length > 1 && byMember.length > 0 && (
          <div className="mt-3 rounded-[20px] bg-surface p-4">
            <p className="text-[13px] text-ink3">Gastos apuntados por cada uno</p>
            <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full">
              {byMember.map((m, i) => <div key={m.uid} style={{ width: `${m.pct * 100}%`, background: i === 0 ? 'rgb(var(--ink))' : 'rgb(var(--accent))' }} />)}
            </div>
            <div className="mt-2 flex justify-between text-[14px]">
              {byMember.map((m) => <span key={m.uid}>{m.name} <span className="num text-[17px]">{fmt(m.v, { compact: true })}</span></span>)}
            </div>
          </div>
        )}

        {/* Barras */}
        <div className="mt-7">
          <Segmented id="ctype" value={type} onChange={(v) => { setType(v); setDrill(null); }} options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }]} />
          <div className="mt-5 flex items-end justify-between">
            <div>
              <p className="eyebrow">{shown ? (kind === 'year' ? monthShort(Number(shown.key)) : shown.label + (kind === 'month' ? ` ${monthShort(fromISO(shown.key).getMonth())}` : '')) : type === 'expense' ? 'Gastado' : 'Ingresado'}</p>
              <BigAmount cents={shown ? shown.value : value} className="text-[46px]" />
            </div>
            {diff != null && !shown && (
              <span className={`mb-1 rounded-full px-2.5 py-1 text-[13px] font-semibold ${(diff > 0) === (type === 'expense') ? 'bg-accent/10 text-accent' : 'bg-pos/10 text-pos'}`}>
                {diff > 0 ? '+' : '−'}{Math.abs(Math.round(diff * 100))} %
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-ink3">Media <span className="money">{fmt(avg)}</span> {kind === 'year' ? 'al mes' : 'al día'}{diff != null ? (offset === 0 ? ' · frente a los mismos días del periodo anterior' : ' · frente al periodo anterior') : ''}</p>

          <div key={`${period.start}-${type}`} className="money-chart relative mt-5 flex h-40 items-end gap-[3px]" onPointerLeave={() => setHover(null)}>
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/20" style={{ bottom: `${(avg / maxBar) * 100}%` }} />
            {bars.map((b, i) => (
              <div key={b.key} className="flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <motion.div
                  className={`w-full rounded-[4px] ${hover === i || b.key === today ? (type === 'expense' ? 'bg-accent' : 'bg-pos') : 'bg-ink/80'}`}
                  style={{ height: b.value ? `${Math.max(2, (b.value / maxBar) * 100)}%` : 2, transformOrigin: 'bottom' }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1, opacity: b.value ? 1 : 0.2 }}
                  transition={{ delay: i * 0.012, type: 'spring', stiffness: 220, damping: 24 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[3px]">
            {bars.map((b, i) => (
              <span key={b.key} className="flex-1 text-center text-[10px] text-ink3">{kind === 'month' ? (i % 5 === 0 ? b.label : '') : b.label}</span>
            ))}
          </div>
        </div>

        {/* Categorías */}
        <div className="flex items-baseline justify-between px-1 pb-3 pt-9">
          <AnimatePresence mode="wait">
            {drillCat ? (
              <motion.button key="d" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 font-serif text-[24px]" onClick={() => setDrill(null)}>
                <ChevronLeft size={20} /> {drillCat.name}
              </motion.button>
            ) : (
              <motion.h2 key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-serif text-[24px]">Por categoría</motion.h2>
            )}
          </AnimatePresence>
        </div>
        {slices.items.length === 0 ? (
          <div className="rounded-[22px] bg-surface"><Empty icon="chart" title="Sin datos" text="Aún no hay movimientos en este periodo." /></div>
        ) : (
          <motion.div key={`${drill}-${type}-${period.start}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-surface p-5">
            <Donut items={slices.items} total={slices.total} />
            <div className="mt-5 space-y-1">
              {slices.items.map((s, i) => {
                const hasSubs = drill == null && s.id != null && categories.some((c) => c.parentId === s.id);
                return (
                  <motion.div key={String(s.id)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
                    <Press
                      scale={0.98}
                      className="flex w-full items-center gap-3 rounded-2xl py-2 text-left"
                      onClick={() => (hasSubs ? setDrill(s.id!) : s.id != null && nav.push({ name: 'filtered', title: s.name.replace(' (general)', ''), categoryId: s.id, start: period.start, end: period.end }))}
                    >
                      <Tile icon={s.icon} color={s.color} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-medium">{s.name}</span>
                          <span className="num shrink-0 text-[18px]">{fmt(s.value)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                            <motion.div className="h-full rounded-full" style={{ background: s.color, width: `${s.pct * 100}%`, transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2 + i * 0.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
                          </div>
                          <span className="w-9 text-right text-[12px] tabular-nums text-ink3">{Math.round(s.pct * 100)}%</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-ink3" />
                    </Press>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Donut({ items, total }: { items: { value: number; color: string }[]; total: number }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        {items.map((it, i) => {
          const len = total ? (it.value / total) * C : 0;
          const gap = items.length > 1 ? 3 : 0;
          const el = (
            <motion.circle
              key={i}
              cx="80" cy="80" r={R} fill="none" stroke={it.color} strokeWidth="14" strokeLinecap="round"
              strokeDashoffset={-acc - gap / 2}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${Math.max(0.1, len - gap)} ${C}` }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[12px] text-ink3">Total</span>
        <span className="num text-[28px] leading-tight">{fmt(total, { compact: true })}</span>
      </div>
    </div>
  );
}

function shade(hex: string, i: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = [0, 0.3, -0.25, 0.5, -0.4, 0.65][i % 6];
  const ch = (v: number) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Add, ArrowUpRight, ChevronRight } from '@carbon/icons-react';
import { addDays, debtSummary, fmt, fromISO, getPeriod, todayISO, totals, walletBalances } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { TxRow } from '../components/TxList';
import { BigAmount, Empty, LinkButton, PrivacyToggle, Press, Progress, SectionTitle, Tile } from '../components/ui';
import { budgetSpent, budgetPeriod } from './Budgets';

const fade = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 + i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] } });

export function Home() {
  const { wallets, txs, settings, budgets, catMap } = useData();
  const nav = useNav();
  const today = todayISO();
  const period = getPeriod('month', 0, settings.monthStartDay);

  const balances = useMemo(() => walletBalances(wallets, txs), [wallets, txs]);
  const total = wallets.reduce((s, w) => s + (balances.get(w.id!) ?? 0), 0);
  const debts = useMemo(() => debtSummary(txs), [txs]);
  const m = useMemo(() => totals(txs.filter((t) => t.date >= period.start && t.date <= period.end && t.date <= today)), [txs, period.start, period.end, today]);
  const recent = useMemo(() => txs.filter((t) => t.date <= today).slice(0, 6), [txs, today]);
  const upcoming = txs.filter((t) => t.date > today).length;
  const spentRatio = m.income + m.expense > 0 ? m.expense / Math.max(m.income, m.expense) : 0;

  // Semana: el lunes enseñamos la que acaba de terminar
  const isMonday = fromISO(today).getDay() === 1;
  const weekOffset = isMonday ? -1 : 0;
  const week = getPeriod('week', weekOffset);
  const weekDays = useMemo(() => {
    const out = Array.from({ length: 7 }, (_, i) => ({ date: addDays(week.start, i), v: 0 }));
    for (const t of txs) {
      if (t.type !== 'expense' || t.date < week.start || t.date > week.end || t.date > today) continue;
      out[Math.round((fromISO(t.date).getTime() - fromISO(week.start).getTime()) / 864e5)].v += t.amount;
    }
    return out;
  }, [txs, week.start, week.end, today]);
  const weekTotal = weekDays.reduce((s, d) => s + d.v, 0);
  const weekMax = Math.max(1, ...weekDays.map((d) => d.v));

  const longDate = fromISO(today).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="px-5">
      <header className="pt-safe flex items-center justify-between pb-2">
        <span className="text-[14px] font-medium text-ink2 first-letter:uppercase">{longDate}</span>
        <PrivacyToggle />
      </header>

      {/* Saldo */}
      <motion.section {...fade(0)} className="pt-6">
        <p className="eyebrow">Saldo total</p>
        <BigAmount cents={total} className={`mt-1 block text-[64px] tracking-[-0.02em] ${total < 0 ? 'text-accent' : ''}`} />
        {(debts.owedToMe > 0 || debts.iOwe > 0) && (
          <Press scale={0.97} onClick={() => nav.push({ name: 'people' })} className="mt-3 flex items-center gap-1.5 text-[14px] text-ink2">
            {debts.owedToMe > 0 && <>Te deben <span className="num text-[18px] text-pos">{fmt(debts.owedToMe)}</span></>}
            {debts.owedToMe > 0 && debts.iOwe > 0 && <span className="text-ink3">·</span>}
            {debts.iOwe > 0 && <>debes <span className="num text-[18px] text-accent">{fmt(debts.iOwe)}</span></>}
            <ChevronRight size={14} className="text-ink3" />
          </Press>
        )}
        <div className="mt-6 flex items-center gap-5 text-[14px]">
          <span className="text-ink2">{period.label}</span>
          <span>Entra <span className="num text-[18px] text-pos">{fmt(m.income, { compact: true })}</span></span>
          <span>Sale <span className="num text-[18px] text-accent">{fmt(m.expense, { compact: true })}</span></span>
        </div>
        <div className="mt-3 flex h-[5px] gap-[3px] overflow-hidden rounded-full">
          <motion.div className="rounded-full bg-ink" initial={{ flexGrow: 1 }} animate={{ flexGrow: Math.max(0.0001, 1 - spentRatio) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
          <motion.div className="rounded-full bg-accent" initial={{ flexGrow: 0 }} animate={{ flexGrow: Math.max(0.0001, spentRatio) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </motion.section>

      {/* Tu semana */}
      <motion.div {...fade(1)}>
        <Press scale={0.98} onClick={() => nav.push({ name: 'summary', kind: 'week', offset: weekOffset })} className="mt-8 w-full overflow-hidden rounded-[26px] bg-ink p-5 text-left text-paper">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] font-medium opacity-60">{isMonday ? 'Resumen de la semana pasada' : 'Tu semana hasta hoy'}</p>
              <p className="mt-1 font-serif text-[30px] leading-none">
                Has gastado <span className="num">{fmt(weekTotal, { compact: true })}</span>
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper/10"><ArrowUpRight size={18} /></span>
          </div>
          <div className="money-chart mt-5 flex h-20 items-end gap-2">
            {weekDays.map((d, i) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <motion.div
                    className={`w-full rounded-[5px] ${d.date === today ? 'bg-accent' : 'bg-paper/30'}`}
                    initial={{ height: 0 }}
                    animate={{ height: d.v ? `${Math.max(8, (d.v / weekMax) * 100)}%` : 3 }}
                    transition={{ delay: 0.3 + i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
                  />
                </div>
                <span className="text-[10px] opacity-50">{'LMXJVSD'[i]}</span>
              </div>
            ))}
          </div>
        </Press>
      </motion.div>

      {/* Carteras */}
      <motion.div {...fade(2)}>
        <SectionTitle action={<LinkButton onClick={() => nav.push({ name: 'wallets' })}>Gestionar</LinkButton>}>Carteras</SectionTitle>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {wallets.map((w) => {
            const b = balances.get(w.id!) ?? 0;
            return (
              <Press key={w.id} scale={0.96} className="flex w-[150px] shrink-0 flex-col gap-4 rounded-[22px] bg-surface p-4 text-left" onClick={() => nav.push({ name: 'filtered', title: w.name, walletId: w.id })}>
                <Tile icon={w.icon} color={w.color} size={36} />
                <div>
                  <p className="truncate text-[13px] text-ink2">{w.name}</p>
                  <p className={`num text-[22px] leading-tight ${b < 0 ? 'text-accent' : ''}`}>{fmt(b)}</p>
                </div>
              </Press>
            );
          })}
          <Press scale={0.92} className="flex w-[64px] shrink-0 items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-ink/15 text-ink3" onClick={() => nav.push({ name: 'walletEdit' })} aria-label="Nueva cartera">
            <Add size={24} />
          </Press>
        </div>
      </motion.div>

      {/* Presupuestos */}
      <motion.div {...fade(3)}>
        <SectionTitle action={<LinkButton onClick={() => nav.push({ name: budgets.length ? 'budgets' : 'budgetEdit' })}>{budgets.length ? 'Ver todos' : 'Crear'}</LinkButton>}>Presupuestos</SectionTitle>
        {budgets.length === 0 ? (
          <Press scale={0.98} className="flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left" onClick={() => nav.push({ name: 'budgetEdit' })}>
            <span className="flex-1 text-[14px] text-ink2">Ponle un límite al mes, o a una categoría, y te avisamos al llegar al 80 %.</span>
            <ChevronRight size={18} className="text-ink3" />
          </Press>
        ) : (
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {budgets.slice(0, 3).map((b) => {
              const p = budgetPeriod(b, settings.monthStartDay);
              const spent = budgetSpent(b, txs, catMap, p);
              return (
                <Press key={b.id} scale={0.98} className="block w-full px-4 py-4 text-left" onClick={() => nav.push({ name: 'budgets' })}>
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <span className="text-[15px] font-medium">{b.name}</span>
                    <span className="text-[13px] text-ink3"><span className="num text-[17px] text-ink">{fmt(spent, { compact: true })}</span> de <span className="money">{fmt(b.amount, { compact: true })}</span></span>
                  </div>
                  <Progress value={spent / b.amount} />
                </Press>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Recientes */}
      <motion.div {...fade(4)}>
        <SectionTitle action={upcoming > 0 ? <span className="text-[13px] text-ink3">{upcoming} programado{upcoming > 1 ? 's' : ''}</span> : undefined}>Recientes</SectionTitle>
        {recent.length === 0 ? (
          <div className="rounded-[22px] bg-surface">
            <Empty icon="sprout" title="Empieza por un gasto" text="Toca el botón + y apunta el primero. Tarda tres segundos." />
          </div>
        ) : (
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {recent.map((t) => <TxRow key={t.id} t={t} showDate />)}
          </div>
        )}
      </motion.div>
    </div>
  );
}

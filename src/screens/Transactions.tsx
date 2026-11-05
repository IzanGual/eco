import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Repeat, Search } from '@carbon/icons-react';
import type { Transaction } from '../db';
import { fmt, FREQ_LABEL, getPeriod, shortDate, todayISO, totals } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { TxList } from '../components/TxList';
import { Empty, LargeTitle, LinkButton, Page, PrivacyToggle, Press, Segmented, Tile } from '../components/ui';

type Filter = 'all' | 'expense' | 'income' | 'upcoming';

function useSearch(txs: Transaction[], q: string) {
  const { catMap, walletMap } = useData();
  return useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return txs;
    const num = s.replace(',', '.');
    return txs.filter((t) => {
      const c = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
      const p = c?.parentId != null ? catMap.get(c.parentId) : undefined;
      const hay = [t.note, c?.name, p?.name, walletMap.get(t.walletId)?.name].join(' ').toLowerCase();
      return hay.includes(s) || (t.amount / 100).toFixed(2).startsWith(num);
    });
  }, [txs, q, catMap, walletMap]);
}

export function Transactions() {
  const { txs, settings, recurring, catMap } = useData();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [offset, setOffset] = useState(0);
  const [allTime, setAllTime] = useState(false);
  const [q, setQ] = useState('');
  const today = todayISO();
  const period = getPeriod('month', offset, settings.monthStartDay);
  const searching = q.trim() !== '';

  const base = useMemo(() => {
    if (filter === 'upcoming') return [...txs.filter((t) => t.date > today)].reverse();
    return txs.filter((t) => t.date <= today && (filter === 'all' || t.type === filter) && (allTime || searching || (t.date >= period.start && t.date <= period.end)));
  }, [txs, filter, today, allTime, searching, period.start, period.end]);
  const list = useSearch(base, q);
  const sum = totals(list);
  const activeRec = recurring.filter((r) => r.active).sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  return (
    <div>
      <LargeTitle title="Historial" right={<PrivacyToggle />} />
      <div className="px-5">
        <div className="relative mb-3">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3" />
          <input className="field rounded-full pl-11" placeholder="Busca por nota, categoría o importe" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        </div>

        <Segmented id="txfilter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todo' }, { value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }, { value: 'upcoming', label: 'Próximos' }]} />

        {filter !== 'upcoming' && !searching && (
          <div className="mt-5 flex items-center justify-between">
            <Press scale={0.85} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] disabled:opacity-30" disabled={allTime} onClick={() => setOffset((o) => o - 1)} aria-label="Mes anterior"><ChevronLeft size={20} /></Press>
            <Press scale={0.95} className="text-center" onClick={() => setAllTime((v) => !v)}>
              <motion.p key={allTime ? 'all' : period.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-serif text-[24px] leading-none">{allTime ? 'Todo el historial' : period.label}</motion.p>
              <p className="mt-1 text-[12px] text-ink3">{allTime ? 'Ver por meses' : 'Ver todo'}</p>
            </Press>
            <Press scale={0.85} className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] disabled:opacity-30" disabled={allTime || offset >= 0} onClick={() => setOffset((o) => o + 1)} aria-label="Mes siguiente"><ChevronRight size={20} /></Press>
          </div>
        )}

        {filter !== 'upcoming' && list.length > 0 && (
          <div className="mt-4 flex justify-center gap-6 text-[13px] text-ink3">
            {filter !== 'expense' && <span>Entra <span className="num text-[18px] text-pos">{fmt(sum.income)}</span></span>}
            {filter !== 'income' && <span>Sale <span className="num text-[18px] text-accent">{fmt(sum.expense)}</span></span>}
          </div>
        )}

        {filter === 'upcoming' && activeRec.length > 0 && (
          <>
            <div className="flex items-baseline justify-between px-1 pb-2 pt-6">
              <span className="text-[13px] font-semibold text-ink2">Se repiten</span>
              <LinkButton onClick={() => nav.push({ name: 'recurring' })}>Gestionar</LinkButton>
            </div>
            <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
              {activeRec.slice(0, 5).map((r) => {
                const c = r.categoryId != null ? catMap.get(r.categoryId) : undefined;
                return (
                  <Press key={r.id} scale={0.98} className="flex w-full items-center gap-3.5 px-4 py-3 text-left" onClick={() => nav.push({ name: 'recurring' })}>
                    <Tile icon={c?.icon ?? 'repeat'} color={c?.color ?? '#6B6760'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{r.note || c?.name || 'Transferencia'}</div>
                      <div className="flex items-center gap-1 text-[13px] text-ink3"><Repeat size={12} /> {FREQ_LABEL[r.frequency]} · {shortDate(r.nextDate)}</div>
                    </div>
                    <div className={`num text-[19px] ${r.type === 'income' ? 'text-pos' : ''}`}>{r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}{fmt(r.amount)}</div>
                  </Press>
                );
              })}
            </div>
          </>
        )}

        <TxList
          txs={list}
          empty={
            <Empty
              icon={filter === 'upcoming' ? 'calendar' : searching ? 'receipt' : 'sprout'}
              title={filter === 'upcoming' ? 'Nada programado' : searching ? 'Sin resultados' : 'Un mes tranquilo'}
              text={filter === 'upcoming' ? 'Lo que apuntes con fecha futura aparecerá aquí.' : searching ? 'Prueba con otra palabra o importe.' : 'No hay movimientos en este periodo.'}
            />
          }
        />
      </div>
    </div>
  );
}

/** Lista filtrada por categoría / cartera / fechas. */
export function Filtered({ title, categoryId, walletId, start, end }: { title: string; categoryId?: number; walletId?: number; start?: string; end?: string }) {
  const { txs, catMap } = useData();
  const nav = useNav();
  const today = todayISO();
  const list = useMemo(
    () =>
      txs.filter((t) => {
        if (t.date > today) return false;
        if (start && t.date < start) return false;
        if (end && t.date > end) return false;
        if (walletId != null && t.walletId !== walletId && t.toWalletId !== walletId) return false;
        if (categoryId != null) {
          const c = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
          if (t.categoryId !== categoryId && c?.parentId !== categoryId) return false;
        }
        return true;
      }),
    [txs, catMap, today, start, end, walletId, categoryId]
  );
  const sum = totals(list);
  return (
    <Page title={title} onBack={nav.pop} right={<PrivacyToggle />}>
      <div className="flex gap-6 text-[13px] text-ink3">
        {sum.income > 0 && <span>Entra <span className="num text-[20px] text-pos">{fmt(sum.income)}</span></span>}
        {sum.expense > 0 && <span>Sale <span className="num text-[20px] text-accent">{fmt(sum.expense)}</span></span>}
      </div>
      <TxList txs={list} empty={<Empty icon="receipt" title="Sin movimientos" />} />
    </Page>
  );
}

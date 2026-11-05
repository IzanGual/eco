import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Add, Checkmark, TrashCan } from '@carbon/icons-react';
import { db, type Budget, type BudgetPeriod, type Category, type Transaction } from '../db';
import { centsToInput, daysBetween, fmt, getPeriod, parseAmount, todayISO, type Period } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { Empty, GlassIconButton, Group, Page, Press, Progress, Segmented, Tile, confirmDialog, spring, toast } from '../components/ui';

const PERIOD_LABEL: Record<BudgetPeriod, string> = { daily: 'Día', weekly: 'Semana', monthly: 'Mes', yearly: 'Año' };

export function budgetPeriod(b: Budget, monthStartDay: number): Period {
  const kind = b.period === 'daily' ? 'day' : b.period === 'weekly' ? 'week' : b.period === 'monthly' ? 'month' : 'year';
  return getPeriod(kind, 0, monthStartDay);
}

export function budgetSpent(b: Budget, txs: Transaction[], catMap: Map<number, Category>, p: Period) {
  const today = todayISO();
  const cats = new Set(b.categoryIds);
  let spent = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || t.date < p.start || t.date > p.end || t.date > today) continue;
    if (cats.size) {
      const c = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
      if (!cats.has(t.categoryId!) && !(c?.parentId != null && cats.has(c.parentId))) continue;
    }
    spent += t.amount;
  }
  return spent;
}

export function Budgets() {
  const { budgets, txs, catMap, settings } = useData();
  const nav = useNav();
  const today = todayISO();
  return (
    <Page title="Presupuestos" onBack={nav.pop} right={<GlassIconButton onClick={() => nav.push({ name: 'budgetEdit' })} label="Nuevo presupuesto"><Add size={22} /></GlassIconButton>}>
      {budgets.length === 0 && (
        <Empty icon="piggy" title="Pon límites" text="Uno general para el mes, o uno por categoría: 200 € en restaurantes, 80 € en ropa…" action={<Press className="btn-ink" onClick={() => nav.push({ name: 'budgetEdit' })}>Crear presupuesto</Press>} />
      )}
      <div className="space-y-3">
        {budgets.map((b, i) => {
          const p = budgetPeriod(b, settings.monthStartDay);
          const spent = budgetSpent(b, txs, catMap, p);
          const left = b.amount - spent;
          const ratio = spent / b.amount;
          const daysLeft = daysBetween(today, p.end) + 1;
          const cats = b.categoryIds.map((id) => catMap.get(id)).filter(Boolean) as Category[];
          return (
            <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Press scale={0.98} className="block w-full rounded-[24px] bg-surface p-5 text-left" onClick={() => nav.push({ name: 'budgetEdit', id: b.id })}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[24px] leading-tight">{b.name}</p>
                    <p className="truncate text-[13px] text-ink3">{p.label} · {cats.length ? cats.map((c) => c.name).join(', ') : 'Todos los gastos'}</p>
                  </div>
                  {cats.length > 0 && (
                    <div className="flex -space-x-2">
                      {cats.slice(0, 3).map((c) => <span key={c.id} className="rounded-[14px] ring-2 ring-surface"><Tile icon={c.icon} color={c.color} size={32} /></span>)}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="num text-[30px] leading-none">{fmt(spent)}</span>
                  <span className="text-[13px] text-ink3">de <span className="money">{fmt(b.amount, { compact: true })}</span></span>
                </div>
                <div className="mt-3"><Progress value={ratio} /></div>
                <p className={`mt-2.5 text-[13px] ${left < 0 ? 'font-semibold text-accent' : ratio >= 0.8 ? 'font-semibold text-warn' : 'text-ink2'}`}>
                  {left < 0 ? (
                    <>Te has pasado <span className="money">{fmt(-left)}</span></>
                  ) : (
                    <>
                      Quedan <span className="money">{fmt(left)}</span>
                      {b.period !== 'daily' && daysLeft > 1 && <> · unos <span className="money">{fmt(Math.floor(left / daysLeft))}</span> al día</>}
                      {ratio >= 0.8 && ' · cuidado, ya vas por el ' + Math.round(ratio * 100) + ' %'}
                    </>
                  )}
                </p>
              </Press>
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

export function BudgetEdit({ id }: { id?: number }) {
  const { categories, budgets } = useData();
  const nav = useNav();
  const existing = id != null ? budgets.find((b) => b.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing ? centsToInput(existing.amount) : '');
  const [period, setPeriod] = useState<BudgetPeriod>(existing?.period ?? 'monthly');
  const [cats, setCats] = useState<number[]>(existing?.categoryIds ?? []);
  const parents = categories.filter((c) => c.type === 'expense' && c.parentId == null);

  useEffect(() => {
    if (!existing && cats.length === 1) setName(parents.find((p) => p.id === cats[0])?.name ?? '');
  }, [cats]); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = parseAmount(amount);
  async function save() {
    const data: Budget = { name: name.trim() || (cats.length ? 'Presupuesto' : 'Gasto total'), amount: cents, period, categoryIds: cats, order: existing?.order ?? budgets.length };
    if (existing) await db.budgets.put({ ...data, id: existing.id });
    else await db.budgets.add(data);
    toast('Presupuesto guardado');
    nav.pop();
  }
  async function remove() {
    if (!(await confirmDialog('¿Eliminar este presupuesto?'))) return;
    await db.budgets.delete(id!);
    nav.pop();
  }

  return (
    <Page
      title={existing ? existing.name : 'Nuevo presupuesto'}
      onBack={nav.pop}
      right={existing && <GlassIconButton onClick={remove} label="Eliminar" className="text-accent"><TrashCan size={20} /></GlassIconButton>}
      footer={<Press className="btn-ink w-full disabled:opacity-30" disabled={cents <= 0} onClick={save}>Guardar</Press>}
    >
      <p className="eyebrow px-1 pb-2">Límite</p>
      <div className="flex items-baseline gap-2 rounded-[22px] bg-surface px-5 py-4">
        <input className="w-full bg-transparent font-serif text-[44px] leading-none outline-none placeholder:text-ink3" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
        <span className="font-serif text-[28px] text-ink3">€</span>
      </div>
      <p className="eyebrow px-1 pb-2 pt-6">Cada</p>
      <Segmented id="bperiod" value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as BudgetPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
      <p className="eyebrow px-1 pb-2 pt-6">Nombre</p>
      <input className="field" placeholder="Comer fuera" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="eyebrow px-1 pb-2 pt-6">Categorías {cats.length === 0 && '· ninguna = todos los gastos'}</p>
      <Group>
        {parents.map((c) => {
          const on = cats.includes(c.id!);
          return (
            <Press key={c.id} scale={0.98} className="flex w-full items-center gap-3.5 px-4 py-3 text-left" onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id!])}>
              <Tile icon={c.icon} color={c.color} size={34} />
              <span className="flex-1 text-[16px]">{c.name}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-ink/20'}`}>
                {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}><Checkmark size={14} /></motion.span>}
              </span>
            </Press>
          );
        })}
      </Group>
    </Page>
  );
}

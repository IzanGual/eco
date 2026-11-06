import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Add, ChevronDown, ChevronRight, ChevronUp, TrashCan } from '@carbon/icons-react';
import { db, type CatType } from '../db';
import { centsToInput, fmt, FREQ_LABEL, nextOccurrence, parseAmount, shortDate, todayISO, walletBalances } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { CatIcon } from '../icons';
import { ColorPicker, Empty, GlassIconButton, Group, IconPicker, Page, Press, Segmented, Tile, confirmDialog, toast } from '../components/ui';

// ================= Carteras =================
export function Wallets() {
  const { allWallets, txs } = useData();
  const nav = useNav();
  const balances = useMemo(() => walletBalances(allWallets, txs), [allWallets, txs]);
  const active = allWallets.filter((w) => !w.archived);
  const archived = allWallets.filter((w) => w.archived);
  const total = active.reduce((s, w) => s + (balances.get(w.id!) ?? 0), 0);

  const move = async (idx: number, dir: -1 | 1) => {
    const a = active[idx];
    const b = active[idx + dir];
    if (!a || !b) return;
    await db.transaction('rw', db.wallets, async () => {
      await db.wallets.update(a.id!, { order: b.order });
      await db.wallets.update(b.id!, { order: a.order });
    });
  };

  return (
    <Page title="Carteras" onBack={nav.pop} right={<GlassIconButton onClick={() => nav.push({ name: 'walletEdit' })} label="Nueva cartera"><Add size={22} /></GlassIconButton>}>
      <p className="eyebrow px-1">Entre todas</p>
      <p className="num px-1 pb-5 text-[40px] leading-tight">{fmt(total)}</p>
      <Group>
        {active.map((w, i) => (
          <motion.div layout key={w.id} className="flex items-center">
            <Press scale={0.98} className="flex flex-1 items-center gap-3.5 px-4 py-3.5 text-left" onClick={() => nav.push({ name: 'walletEdit', id: w.id })}>
              <Tile icon={w.icon} color={w.color} />
              <span className="flex-1 text-[16px] font-medium">{w.name}</span>
              <span className="num text-[20px]">{fmt(balances.get(w.id!) ?? 0)}</span>
            </Press>
            <div className="flex flex-col pr-2 text-ink3">
              <button className="p-1 disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ChevronUp size={16} /></button>
              <button className="p-1 disabled:opacity-20" disabled={i === active.length - 1} onClick={() => move(i, 1)} aria-label="Bajar"><ChevronDown size={16} /></button>
            </div>
          </motion.div>
        ))}
      </Group>
      {archived.length > 0 && (
        <>
          <p className="eyebrow px-1 pb-2 pt-6">Archivadas</p>
          <Group className="opacity-70">
            {archived.map((w) => (
              <Press key={w.id} scale={0.98} className="flex w-full items-center gap-3.5 px-4 py-3 text-left" onClick={() => nav.push({ name: 'walletEdit', id: w.id })}>
                <Tile icon={w.icon} color={w.color} />
                <span className="flex-1">{w.name}</span>
                <span className="num text-[18px]">{fmt(balances.get(w.id!) ?? 0)}</span>
              </Press>
            ))}
          </Group>
        </>
      )}
    </Page>
  );
}

export function WalletEdit({ id }: { id?: number }) {
  const { allWallets, txs } = useData();
  const nav = useNav();
  const w = id != null ? allWallets.find((x) => x.id === id) : undefined;
  const [name, setName] = useState(w?.name ?? '');
  const [icon, setIcon] = useState(w?.icon ?? 'card');
  const [color, setColor] = useState(w?.color ?? '#4F6D8F');
  const [initial, setInitial] = useState(w ? centsToInput(Math.abs(w.initialBalance)) : '');
  const [negative, setNegative] = useState((w?.initialBalance ?? 0) < 0);
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const others = allWallets.filter((x) => x.id !== id && !x.archived);
  const used = id != null && txs.some((t) => t.walletId === id || t.toWalletId === id);

  async function save() {
    const data = { name: name.trim(), icon, color, initialBalance: parseAmount(initial) * (negative ? -1 : 1) };
    if (w) await db.wallets.update(w.id!, data);
    else await db.wallets.add({ ...data, order: Math.max(-1, ...allWallets.map((x) => x.order)) + 1 });
    toast('Cartera guardada');
    nav.pop();
  }

  async function remove() {
    if (used && moveTo === '') return alert('Elige primero a qué cartera pasar sus movimientos, o archívala.');
    if (!(await confirmDialog('¿Eliminar esta cartera?', { message: used ? 'Sus movimientos pasarán a la cartera elegida.' : undefined }))) return;
    await db.transaction('rw', db.wallets, db.transactions, db.recurring, async () => {
      if (used) {
        const target = Number(moveTo);
        await db.transactions.where('walletId').equals(id!).modify({ walletId: target });
        await db.transactions.where('toWalletId').equals(id!).modify({ toWalletId: target });
        await db.transactions.filter((t) => t.type === 'transfer' && t.walletId === t.toWalletId).delete();
        await db.recurring.filter((r) => r.walletId === id).modify({ walletId: target });
        await db.recurring.filter((r) => r.toWalletId === id).modify({ toWalletId: target });
      }
      await db.wallets.delete(id!);
    });
    nav.pop();
  }

  return (
    <Page title={w ? w.name : 'Nueva cartera'} onBack={nav.pop} footer={<Press className="btn-ink w-full disabled:opacity-30" disabled={!name.trim()} onClick={save}>Guardar</Press>}>
      <div className="flex justify-center pb-4">
        <motion.span key={icon + color} initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
          <Tile icon={icon} color={color} size={76} />
        </motion.span>
      </div>
      <p className="eyebrow px-1 pb-2">Nombre</p>
      <input className="field" placeholder="Cuenta ahorro" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="eyebrow px-1 pb-2 pt-6">Saldo antes de empezar a apuntar</p>
      <div className="flex gap-2">
        <Press scale={0.9} className="btn-soft w-14 px-0 text-[20px]" onClick={() => setNegative((v) => !v)}>{negative ? '−' : '+'}</Press>
        <input className="field font-serif text-[22px]" inputMode="decimal" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value.replace(/[^\d.,]/g, ''))} />
      </div>
      <p className="eyebrow px-1 pb-3 pt-6">Color</p>
      <ColorPicker value={color} onChange={setColor} />
      <p className="eyebrow px-1 pb-2 pt-6">Icono</p>
      <IconPicker value={icon} onChange={setIcon} color={color} />

      {w && (
        <div className="mt-10 space-y-3">
          <Press scale={0.98} className="btn-soft w-full" onClick={async () => { await db.wallets.update(w.id!, { archived: !w.archived }); nav.pop(); }}>
            {w.archived ? 'Volver a mostrar' : 'Archivar (ocultar sin borrar)'}
          </Press>
          {used && (
            <select className="field" value={moveTo} onChange={(e) => setMoveTo(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Al eliminar, pasar sus movimientos a…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <Press scale={0.98} className="btn-danger w-full" onClick={remove}>Eliminar cartera</Press>
        </div>
      )}
    </Page>
  );
}

// ================= Categorías =================
export function Categories() {
  const { categories } = useData();
  const nav = useNav();
  const [type, setType] = useState<CatType>('expense');
  const parents = categories.filter((c) => c.type === type && c.parentId == null);
  return (
    <Page title="Categorías" onBack={nav.pop} right={<GlassIconButton onClick={() => nav.push({ name: 'categoryEdit', type, parentId: null })} label="Nueva categoría"><Add size={22} /></GlassIconButton>}>
      <Segmented id="cattype" value={type} onChange={setType} options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }]} />
      <div className="space-y-3 pt-5">
        {parents.map((p, i) => {
          const subs = categories.filter((c) => c.parentId === p.id);
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="overflow-hidden rounded-[22px] bg-surface">
              <Press scale={0.98} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left" onClick={() => nav.push({ name: 'categoryEdit', id: p.id })}>
                <Tile icon={p.icon} color={p.color} />
                <span className="flex-1 text-[16px] font-semibold">{p.name}</span>
                <ChevronRight size={16} className="text-ink3" />
              </Press>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {subs.map((s) => (
                  <Press key={s.id} scale={0.92} className="flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[14px] text-ink2" onClick={() => nav.push({ name: 'categoryEdit', id: s.id })}>
                    <span style={{ color: s.color }}><CatIcon name={s.icon} size={15} /></span>
                    {s.name}
                  </Press>
                ))}
                <Press scale={0.92} className="flex items-center gap-1 rounded-full border border-dashed border-ink/20 px-3 py-1.5 text-[14px] text-ink3" onClick={() => nav.push({ name: 'categoryEdit', parentId: p.id, type })}>
                  <Add size={14} /> Subcategoría
                </Press>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

export function CategoryEdit({ id, parentId, type }: { id?: number; parentId?: number | null; type?: CatType }) {
  const { categories, catMap, txs } = useData();
  const nav = useNav();
  const c = id != null ? catMap.get(id) : undefined;
  const parent = (c?.parentId ?? parentId) != null ? catMap.get((c?.parentId ?? parentId)!) : undefined;
  const catType: CatType = c?.type ?? parent?.type ?? type ?? 'expense';
  const [name, setName] = useState(c?.name ?? '');
  const [icon, setIcon] = useState(c?.icon ?? parent?.icon ?? 'tag');
  const [color, setColor] = useState(c?.color ?? parent?.color ?? '#5E8C6A');
  const subs = c ? categories.filter((x) => x.parentId === c.id) : [];

  async function save() {
    const data = { name: name.trim(), icon, color };
    if (c) {
      await db.transaction('rw', db.categories, async () => {
        await db.categories.update(c.id!, data);
        if (c.parentId == null && color !== c.color) await db.categories.where('parentId').equals(c.id!).modify({ color });
      });
    } else {
      const siblings = categories.filter((x) => x.type === catType && x.parentId === (parent?.id ?? null));
      await db.categories.add({ ...data, type: catType, parentId: parent?.id ?? null, order: siblings.length });
    }
    toast('Categoría guardada');
    nav.pop();
  }

  async function remove() {
    const ids = [c!.id!, ...subs.map((s) => s.id!)];
    const n = txs.filter((t) => t.categoryId != null && ids.includes(t.categoryId)).length;
    const msg = n ? `Tiene ${n} movimiento${n > 1 ? 's' : ''}. ${parent ? `Pasarán a «${parent.name}».` : 'Quedarán sin categoría.'}` : subs.length ? 'También se borrarán sus subcategorías.' : undefined;
    if (!(await confirmDialog(`¿Eliminar «${c!.name}»?`, { message: msg }))) return;
    await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
      await db.transactions.where('categoryId').anyOf(ids).modify({ categoryId: parent?.id });
      await db.categories.bulkDelete(ids);
      await db.budgets.toCollection().modify((b) => { b.categoryIds = b.categoryIds.filter((x) => !ids.includes(x)); });
    });
    nav.pop();
  }

  return (
    <Page
      title={c ? c.name : parent ? 'Nueva subcategoría' : 'Nueva categoría'}
      eyebrow={parent ? `Dentro de ${parent.name}` : catType === 'expense' ? 'Gasto' : 'Ingreso'}
      onBack={nav.pop}
      right={c && <GlassIconButton onClick={remove} label="Eliminar" className="text-accent"><TrashCan size={20} /></GlassIconButton>}
      footer={<Press className="btn-ink w-full disabled:opacity-30" disabled={!name.trim()} onClick={save}>Guardar</Press>}
    >
      <div className="flex justify-center pb-4">
        <motion.span key={icon + color} initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
          <Tile icon={icon} color={color} size={76} />
        </motion.span>
      </div>
      <p className="eyebrow px-1 pb-2">Nombre</p>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gimnasio" />
      {!parent && (
        <>
          <p className="eyebrow px-1 pb-3 pt-6">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </>
      )}
      <p className="eyebrow px-1 pb-2 pt-6">Icono</p>
      <IconPicker value={icon} onChange={setIcon} color={color} />
    </Page>
  );
}

// ================= Repeticiones =================
export function RecurringList() {
  const { recurring, catMap, walletMap } = useData();
  const nav = useNav();
  const sorted = [...recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.localeCompare(b.nextDate));
  const monthly = recurring.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + r.amount * ({ daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 }[r.frequency]), 0);

  async function toggle(id: number, active: boolean) {
    const r = recurring.find((x) => x.id === id);
    if (!r) return;
    let next = r.nextDate;
    const today = todayISO();
    while (active && next < today) next = nextOccurrence(next, r.frequency);
    await db.recurring.update(id, { active, nextDate: next });
  }
  async function remove(id: number) {
    if (!(await confirmDialog('¿Eliminar esta repetición?', { message: 'Los movimientos que ya se crearon se mantienen.' }))) return;
    await db.transaction('rw', db.recurring, db.transactions, async () => {
      await db.transactions.where('recurringId').equals(id).modify({ recurringId: undefined });
      await db.recurring.delete(id);
    });
  }
  async function editAmount(id: number, current: number) {
    const v = prompt('Nuevo importe para los próximos', centsToInput(current));
    if (v == null) return;
    const cents = parseAmount(v);
    if (cents > 0) await db.recurring.update(id, { amount: cents });
  }

  return (
    <Page title="Repeticiones" onBack={nav.pop} right={<GlassIconButton onClick={() => nav.push({ name: 'editor', repeat: 'monthly' })} label="Nueva repetición"><Add size={22} /></GlassIconButton>}>
      {sorted.length === 0 ? (
        <Empty icon="repeat" title="Nada se repite aún" text="Alquiler, nómina, Netflix… Apúntalos una vez y se crearán solos cada mes." action={<Press className="btn-ink" onClick={() => nav.push({ name: 'editor', repeat: 'monthly' })}>Crear repetición</Press>} />
      ) : (
        <>
          <p className="eyebrow px-1">Gastos fijos al mes, aprox.</p>
          <p className="num px-1 pb-5 text-[40px] leading-tight">{fmt(Math.round(monthly))}</p>
        </>
      )}
      <div className="space-y-3">
        {sorted.map((r) => {
          const c = r.categoryId != null ? catMap.get(r.categoryId) : undefined;
          return (
            <motion.div layout key={r.id} className={`rounded-[22px] bg-surface p-4 transition-opacity ${r.active ? '' : 'opacity-55'}`}>
              <div className="flex items-center gap-3.5">
                <Tile icon={c?.icon ?? 'repeat'} color={c?.color ?? '#6B6760'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium">{r.note || c?.name || `${walletMap.get(r.walletId)?.name} → ${walletMap.get(r.toWalletId!)?.name}`}</p>
                  <p className="text-[13px] text-ink3">{FREQ_LABEL[r.frequency]} · {r.active ? `próximo ${shortDate(r.nextDate)}` : 'en pausa'}</p>
                </div>
                <Press scale={0.9} className={`num text-[20px] ${r.type === 'income' ? 'text-pos' : ''}`} onClick={() => editAmount(r.id!, r.amount)}>
                  {r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}{fmt(r.amount)}
                </Press>
              </div>
              <div className="mt-3.5 flex gap-2">
                <Press scale={0.96} className="btn-soft flex-1 py-2.5 text-[14px]" onClick={() => toggle(r.id!, !r.active)}>{r.active ? 'Pausar' : 'Reanudar'}</Press>
                <Press scale={0.96} className="btn-danger flex-1 py-2.5 text-[14px]" onClick={() => remove(r.id!)}>Eliminar</Press>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

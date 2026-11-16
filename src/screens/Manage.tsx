import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Add, ChevronDown, ChevronRight, ChevronUp, TrashCan, UserMultiple } from '@carbon/icons-react';
import { db, type CatType, type Frequency } from '../db';
import { centsToInput, fmt, FREQ_LABEL, nextOccurrence, parseAmount, processRecurring, shortDate, todayISO, walletBalances } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { useHousehold } from '../useHousehold';
import { memberName, partnerName, setWalletShared } from '../sync';
import { currentUser } from '../cloud';
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
              <span className="flex flex-1 items-center gap-1.5 text-[16px] font-medium">{w.name}{w.shared && <UserMultiple size={14} className="text-accent" />}</span>
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
  // Lo que mueven sus movimientos (hasta hoy): el saldo actual es saldo inicial + esto
  const movements = useMemo(() => (w ? (walletBalances([w], txs).get(w.id!) ?? 0) - w.initialBalance : 0), [w, txs]);
  const current = (w?.initialBalance ?? 0) + movements;
  const [initial, setInitial] = useState(w ? centsToInput(Math.abs(current)) : '');
  const [negative, setNegative] = useState(current < 0);
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const house = useHousehold();
  const me = currentUser()?.uid;
  const connected = !!house && house.members.length > 1;
  const partner = partnerName() ?? 'tu pareja';
  // Compartida por tu pareja: los dos apuntáis en ella, pero solo quien la creó puede dejar de compartirla
  const theirs = !!w?.shared && !!w.owner && w.owner !== me;
  const [share, setShare] = useState(!!w?.shared);
  const [busy, setBusy] = useState(false);
  const others = allWallets.filter((x) => x.id !== id && !x.archived);
  const used = id != null && txs.some((t) => t.walletId === id || t.toWalletId === id);

  async function save() {
    // Escribes lo que tienes ahora; el saldo inicial se calcula restando los movimientos
    const data = { name: name.trim(), icon, color, initialBalance: parseAmount(initial) * (negative ? -1 : 1) - movements };
    const changeShare = connected && !theirs && share !== !!w?.shared;
    if (changeShare && !share) {
      const ok = await confirmDialog(`¿Dejar de compartir «${data.name}»?`, {
        message: `${partner} dejará de verla y desaparecerá de su móvil. En el tuyo se queda todo.`,
        confirm: 'Dejar de compartir'
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      let wid = w?.id;
      if (w) await db.wallets.update(w.id!, data);
      else wid = await db.wallets.add({ ...data, order: Math.max(-1, ...allWallets.map((x) => x.order)) + 1 });
      if (changeShare) await setWalletShared(wid!, share);
      toast(changeShare ? (share ? `Cartera compartida con ${partner}` : 'Cartera guardada · ya no se comparte') : 'Cartera guardada');
      nav.pop();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (used && moveTo === '') return alert('Elige primero qué hacer con sus movimientos, o archívala.');
    const wipe = moveTo === -1;
    const msg = [
      used ? (wipe ? 'Se borrarán también todos sus movimientos.' : 'Sus movimientos pasarán a la cartera elegida.') : '',
      w?.shared ? `Está compartida: también desaparecerá del móvil de ${partner}.` : ''
    ].filter(Boolean).join(' ');
    if (!(await confirmDialog('¿Eliminar esta cartera?', { message: msg || undefined }))) return;
    await db.transaction('rw', db.wallets, db.transactions, db.recurring, async () => {
      if (used && wipe) {
        await db.transactions.filter((t) => t.walletId === id || t.toWalletId === id).delete();
        await db.recurring.filter((r) => r.walletId === id || r.toWalletId === id).delete();
      } else if (used) {
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
    <Page title={w ? w.name : 'Nueva cartera'} onBack={nav.pop} footer={<Press className="btn-ink w-full disabled:opacity-30" disabled={!name.trim() || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</Press>}>
      <div className="flex justify-center pb-4">
        <motion.span key={icon + color} initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
          <Tile icon={icon} color={color} size={76} />
        </motion.span>
      </div>
      <p className="eyebrow px-1 pb-2">Nombre</p>
      <input className="field" placeholder="Cuenta ahorro" value={name} onChange={(e) => setName(e.target.value)} />
      {connected ? (
        theirs ? (
          <div className="mt-3 flex w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5">
            <span className="text-accent"><UserMultiple size={18} /></span>
            <span className="flex-1">
              <span className="block text-[15px] font-medium">Compartida por {memberName(w!.owner) ?? partner}</span>
              <span className="block text-[12px] text-ink3">Los dos la veis y apuntáis en ella</span>
            </span>
          </div>
        ) : (
          <Press scale={0.99} disabled={busy} onClick={() => setShare((v) => !v)} className="mt-3 flex w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5 text-left">
            <span className={share ? 'text-accent' : 'text-ink3'}><UserMultiple size={18} /></span>
            <span className="flex-1">
              <span className="block text-[15px] font-medium">Compartida con {partner}</span>
              <span className="block text-[12px] text-ink3">{share ? `${partner} la verá con todos sus movimientos y podrá apuntar en ella` : 'Solo la ves tú'}</span>
            </span>
            <span className={`flex h-[28px] w-[46px] items-center rounded-full p-[3px] transition-colors ${share ? 'bg-accent' : 'bg-ink/15'}`}>
              <motion.span layout className={`h-[22px] w-[22px] rounded-full bg-white shadow ${share ? 'ml-auto' : ''}`} />
            </span>
          </Press>
        )
      ) : (
        <Press scale={0.99} onClick={() => nav.push({ name: 'couple' })} className="mt-3 flex w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5 text-left">
          <span className="text-ink3"><UserMultiple size={18} /></span>
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Compartir con tu pareja</span>
            <span className="block text-[12px] text-ink3">Primero conectad vuestros Eco en Ajustes → En pareja</span>
          </span>
          <ChevronRight size={16} className="text-ink3" />
        </Press>
      )}

      <p className="eyebrow px-1 pb-2 pt-6">¿Cuánto hay ahora en esta cartera?</p>
      <div className="flex gap-2">
        <Press scale={0.9} className="btn-soft w-14 px-0 text-[20px]" onClick={() => setNegative((v) => !v)}>{negative ? '−' : '+'}</Press>
        <input className="field font-serif text-[22px]" inputMode="decimal" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value.replace(/[^\d.,]/g, ''))} />
      </div>
      <p className="px-1 pt-2 text-[13px] text-ink3">Mira tu banco (o cuenta el efectivo) y escribe lo que hay hoy. Eco ajusta el resto para que cuadre con tus movimientos.</p>
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
              <option value="">Al eliminar, sus movimientos…</option>
              {others.map((o) => <option key={o.id} value={o.id}>Pasarlos a {o.name}</option>)}
              <option value={-1}>Borrarlos también</option>
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
              <Press scale={0.98} className="flex w-full items-center gap-3.5 text-left" onClick={() => nav.push({ name: 'recurringEdit', id: r.id! })} aria-label="Editar repetición">
                <Tile icon={c?.icon ?? 'repeat'} color={c?.color ?? '#6B6760'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium">{r.note || c?.name || `${walletMap.get(r.walletId)?.name} → ${walletMap.get(r.toWalletId!)?.name}`}</p>
                  <p className="truncate text-[13px] text-ink3">{FREQ_LABEL[r.frequency]} · {r.active ? `próximo ${shortDate(r.nextDate)}` : 'en pausa'}</p>
                </div>
                <span className={`num text-[20px] ${r.type === 'income' ? 'text-pos' : ''}`}>
                  {r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}{fmt(r.amount)}
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink3" />
              </Press>
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

// ================= Editar una repetición =================
const FREQ_ORDER: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const FREQ_SHORT: Record<Frequency, string> = { daily: 'Día', weekly: 'Semana', monthly: 'Mes', yearly: 'Año' };

export function RecurringEdit({ id }: { id: number }) {
  const { recurring, categories, allWallets, txs } = useData();
  const nav = useNav();
  const r = recurring.find((x) => x.id === id);
  const [note, setNote] = useState(r?.note ?? '');
  const [amount, setAmount] = useState(r ? centsToInput(r.amount) : '');
  const [categoryId, setCategoryId] = useState<number | undefined>(r?.categoryId);
  const [walletId, setWalletId] = useState<number | undefined>(r?.walletId);
  const [toWalletId, setToWalletId] = useState<number | undefined>(r?.toWalletId);
  const [frequency, setFrequency] = useState<Frequency>(r?.frequency ?? 'monthly');
  const [nextDate, setNextDate] = useState(r?.nextDate ?? todayISO());
  const [past, setPast] = useState(false);
  const created = useMemo(() => txs.filter((t) => t.recurringId === id).length, [txs, id]);

  if (!r) {
    return (
      <Page title="Repetición" onBack={nav.pop}>
        <Empty icon="repeat" title="Esta repetición ya no existe" />
      </Page>
    );
  }
  const isTransfer = r.type === 'transfer';
  const catType = r.type === 'income' ? 'income' : 'expense';
  const cats = categories.filter((c) => c.type === catType);
  const parents = cats.filter((c) => c.parentId == null);
  const wallets = allWallets.filter((w) => !w.archived || w.id === r.walletId || w.id === r.toWalletId);
  const cents = parseAmount(amount);
  const valid = cents > 0 && walletId != null && (!isTransfer || (toWalletId != null && toWalletId !== walletId)) && !!nextDate;

  async function save() {
    if (!valid || !r) return;
    const data = {
      note: note.trim(),
      amount: cents,
      categoryId: isTransfer ? undefined : categoryId,
      walletId: walletId!,
      toWalletId: isTransfer ? toWalletId : undefined,
      frequency,
      nextDate
    };
    await db.transaction('rw', db.recurring, db.transactions, async () => {
      await db.recurring.update(id, data);
      // Opcional: corregir también los movimientos ya creados (concepto, categoría y cartera; el importe de los pasados no se toca)
      if (past) {
        await db.transactions.where('recurringId').equals(id).modify({ note: data.note, categoryId: data.categoryId, walletId: data.walletId, toWalletId: data.toWalletId });
      }
    });
    // Si la próxima fecha ya ha pasado, se crean ahora los que tocaban
    if (r.active && nextDate <= todayISO()) await processRecurring();
    toast('Repetición guardada');
    nav.pop();
  }

  return (
    <Page title="Editar repetición" onBack={nav.pop} footer={<Press className="btn-ink w-full disabled:opacity-30" disabled={!valid} onClick={save}>Guardar cambios</Press>}>
      <p className="eyebrow px-1 pb-2">Concepto</p>
      <input className="field" placeholder="Alquiler, Netflix, nómina…" value={note} onChange={(e) => setNote(e.target.value)} />

      <p className="eyebrow px-1 pb-2 pt-6">Importe</p>
      <input className="field font-serif text-[22px]" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />

      {!isTransfer && (
        <>
          <p className="eyebrow px-1 pb-2 pt-6">Categoría</p>
          <select className="field" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Sin categoría</option>
            {parents.map((p) => [
              <option key={p.id} value={p.id}>{p.name}</option>,
              ...cats.filter((c) => c.parentId === p.id).map((c) => <option key={c.id} value={c.id}>{`${p.name} › ${c.name}`}</option>)
            ])}
          </select>
        </>
      )}

      <p className="eyebrow px-1 pb-2 pt-6">{isTransfer ? 'Desde' : 'Cartera'}</p>
      <select className="field" value={walletId ?? ''} onChange={(e) => setWalletId(Number(e.target.value))}>
        {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {isTransfer && (
        <>
          <p className="eyebrow px-1 pb-2 pt-6">Hacia</p>
          <select className="field" value={toWalletId ?? ''} onChange={(e) => setToWalletId(Number(e.target.value))}>
            {wallets.filter((w) => w.id !== walletId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </>
      )}

      <p className="eyebrow px-1 pb-2 pt-6">Se repite cada</p>
      <Segmented id="freq" value={frequency} onChange={setFrequency} options={FREQ_ORDER.map((f) => ({ value: f, label: FREQ_SHORT[f] }))} />

      <p className="eyebrow px-1 pb-2 pt-6">Próxima vez</p>
      <input className="field" type="date" value={nextDate} onChange={(e) => e.target.value && setNextDate(e.target.value)} />
      <p className="px-1 pt-2 text-[13px] text-ink3">Desde esa fecha se crea uno {FREQ_LABEL[frequency].toLowerCase()}. Los cambios valen para los próximos.</p>

      {created > 0 && (
        <Press scale={0.99} onClick={() => setPast((v) => !v)} className="mt-6 flex w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5 text-left">
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Cambiar también {created === 1 ? 'el ya creado' : `los ${created} ya creados`}</span>
            <span className="block text-[12px] text-ink3">Concepto, categoría y cartera. El importe de los pasados no se toca.</span>
          </span>
          <span className={`flex h-[28px] w-[46px] items-center rounded-full p-[3px] transition-colors ${past ? 'bg-accent' : 'bg-ink/15'}`}>
            <motion.span layout className={`h-[22px] w-[22px] rounded-full bg-white shadow ${past ? 'ml-auto' : ''}`} />
          </span>
        </Press>
      )}
    </Page>
  );
}

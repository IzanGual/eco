import { useEffect, useMemo, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { ArrowsHorizontal, Image as ImageIcon, Repeat, TrashCan } from '@carbon/icons-react';
import { db, type Transaction } from '../db';
import { dayLabel, fmt } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { Press, Tile, confirmDialog, toast } from './ui';

const REVEAL = 84;

/** Fila de movimiento. Desliza a la izquierda para eliminar. */
export function TxRow({ t, showDate }: { t: Transaction; showDate?: boolean }) {
  const { catMap, walletMap, personMap } = useData();
  const nav = useNav();
  const x = useMotionValue(0);
  const trashScale = useTransform(x, [-REVEAL, -20, 0], [1, 0.6, 0.4]);
  const trashOpacity = useTransform(x, [-REVEAL, -20], [1, 0]);
  const [dragging, setDragging] = useState(false);

  const cat = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
  const parent = cat?.parentId != null ? catMap.get(cat.parentId) : undefined;
  const wallet = walletMap.get(t.walletId);
  const to = t.toWalletId != null ? walletMap.get(t.toWalletId) : undefined;

  const person = t.personId != null ? personMap.get(t.personId) : undefined;
  const debtLabel = t.type === 'debt' ? (t.dir === 'in' ? `${person?.name ?? '?'} te da` : `Prestado a ${person?.name ?? '?'}`) : '';
  const title = t.type === 'debt' ? debtLabel : t.note || (t.type === 'transfer' ? `${wallet?.name ?? '?'} → ${to?.name ?? '?'}` : cat?.name ?? 'Sin categoría');
  const subtitle = t.type === 'debt' ? [t.note, showDate ? dayLabel(t.date) : null, wallet?.name, 'no cuenta como gasto'].filter(Boolean).join(' · ') : [
    t.type === 'transfer' ? (t.note ? `${wallet?.name} → ${to?.name}` : 'Transferencia') : t.note ? (parent ? `${parent.name} · ${cat?.name}` : cat?.name) : parent?.name,
    showDate ? dayLabel(t.date) : null,
    t.type !== 'transfer' ? wallet?.name : null
  ].filter(Boolean).join(' · ');

  async function remove() {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 });
    if (await confirmDialog('¿Eliminar este movimiento?', { message: `${title} · ${fmt(t.amount)}` })) {
      await db.transactions.delete(t.id!);
      toast('Movimiento eliminado');
    }
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    setTimeout(() => setDragging(false), 0);
    const open = info.offset.x < -REVEAL / 2 || info.velocity.x < -400;
    animate(x, open ? -REVEAL : 0, { type: 'spring', stiffness: 500, damping: 40 });
  }

  return (
    <div className="relative overflow-hidden">
      <motion.button style={{ opacity: trashOpacity }} onClick={remove} className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center bg-accent text-white" aria-label="Eliminar">
        <motion.span style={{ scale: trashScale }}><TrashCan size={22} /></motion.span>
      </motion.button>
      <motion.button
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.25, right: 0 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (dragging) return;
          if (x.get() < -4) return animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 });
          nav.push({ name: 'editor', id: t.id });
        }}
        whileTap={{ backgroundColor: 'rgb(var(--ink) / 0.04)' }}
        className="relative flex w-full items-center gap-3.5 bg-surface px-4 py-3 text-left"
      >
        {t.type === 'debt' ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white" style={{ background: person?.color ?? '#6B6760' }}>{person?.name[0]?.toUpperCase() ?? '?'}</span>
        ) : t.type === 'transfer' ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-ink/[0.06] text-ink2"><ArrowsHorizontal size={20} /></span>
        ) : (
          <Tile icon={cat?.icon ?? 'tag'} color={cat?.color ?? '#6B6760'} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{title}</span>
            {t.recurringId != null && <Repeat size={14} className="shrink-0 text-ink3" />}
            {t.photo && <ImageIcon size={14} className="shrink-0 text-ink3" />}
          </div>
          {subtitle && <div className="truncate text-[13px] text-ink3">{subtitle}</div>}
        </div>
        <div className={`num shrink-0 text-[19px] ${t.type === 'income' ? 'text-pos' : t.type === 'transfer' || t.type === 'debt' ? 'text-ink3' : ''}`}>
          {t.type === 'income' || (t.type === 'debt' && t.dir === 'in') ? '+' : t.type === 'expense' || (t.type === 'debt' && t.dir === 'out') ? '−' : ''}
          {fmt(t.amount)}
        </div>
      </motion.button>
    </div>
  );
}

/** Lista agrupada por día, con carga progresiva y entrada escalonada. */
export function TxList({ txs, empty }: { txs: Transaction[]; empty?: React.ReactNode }) {
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [txs.length]);

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of txs.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) out.push((g = { date: t.date, items: [], net: 0 }));
      g.items.push(t);
      g.net += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0; // préstamos y transferencias no cuentan
    }
    return out;
  }, [txs, limit]);

  if (txs.length === 0) return <>{empty}</>;

  return (
    <div>
      {groups.map((g, gi) => (
        <motion.section key={g.date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(gi, 6) * 0.04, duration: 0.3 }}>
          <div className="flex items-baseline justify-between px-1 pb-2 pt-6">
            <span className="text-[13px] font-semibold text-ink2">{dayLabel(g.date)}</span>
            {g.net !== 0 && <span className="num text-[15px] text-ink3">{fmt(g.net, { sign: true })}</span>}
          </div>
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {g.items.map((t) => <TxRow key={t.id} t={t} />)}
          </div>
        </motion.section>
      ))}
      {txs.length > limit && (
        <Press className="btn-soft mt-5 w-full" onClick={() => setLimit((l) => l + 100)}>Cargar más</Press>
      )}
    </div>
  );
}

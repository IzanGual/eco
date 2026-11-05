import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Add, ArrowDownLeft, ArrowUpRight, ChevronRight, TrashCan } from '@carbon/icons-react';
import { db } from '../db';
import { debtSummary, fmt, personBalances, todayISO } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { TxList } from '../components/TxList';
import { Empty, GlassIconButton, Page, Press, confirmDialog, toast } from '../components/ui';
import { Avatar } from './TxEditor';
import { PALETTE } from '../icons';

/** Personas: quién te debe y a quién debes. Nada de esto cuenta como gasto o ingreso. */
export function People() {
  const { people, txs } = useData();
  const nav = useNav();
  const bal = useMemo(() => personBalances(txs), [txs]);
  const { owedToMe, iOwe } = debtSummary(txs);
  const [name, setName] = useState('');
  const sorted = [...people].filter((p) => !p.archived).sort((a, b) => Math.abs(bal.get(b.id!) ?? 0) - Math.abs(bal.get(a.id!) ?? 0));

  async function add() {
    const n = name.trim();
    if (!n) return;
    await db.people.add({ name: n, color: PALETTE[people.length % PALETTE.length] });
    setName('');
  }

  return (
    <Page title="Préstamos" eyebrow="Personas" onBack={nav.pop}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[22px] bg-surface p-4">
          <p className="text-[13px] text-ink3">Te deben</p>
          <p className="num text-[30px] leading-tight text-pos">{fmt(owedToMe)}</p>
        </div>
        <div className="rounded-[22px] bg-surface p-4">
          <p className="text-[13px] text-ink3">Debes</p>
          <p className="num text-[30px] leading-tight text-accent">{fmt(iOwe)}</p>
        </div>
      </div>
      <p className="px-1 pt-3 text-[13px] text-ink3">
        Lo que prestas o te prestan no cuenta como gasto ni ingreso: solo mueve dinero de tus carteras mientras esté pendiente.
      </p>

      <div className="mt-5 flex gap-2">
        <input className="field" placeholder="Añadir persona: Mamá, Laura…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Press scale={0.9} onClick={add} className="flex w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-paper" aria-label="Añadir persona"><Add size={22} /></Press>
      </div>

      {sorted.length === 0 ? (
        <Empty icon="people" title="Sin préstamos" text="Cuando le pases un Bizum a alguien que te lo devolverá, apúntalo como «Préstamo»." />
      ) : (
        <div className="divide-hair mt-4 overflow-hidden rounded-[22px] bg-surface">
          {sorted.map((p, i) => {
            const b = bal.get(p.id!) ?? 0;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Press scale={0.98} onClick={() => nav.push({ name: 'person', id: p.id! })} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
                  <Avatar name={p.name} color={p.color} />
                  <div className="flex-1">
                    <p className="text-[16px] font-medium">{p.name}</p>
                    <p className="text-[13px] text-ink3">{b > 0 ? 'Te debe' : b < 0 ? 'Le debes' : 'En paz'}</p>
                  </div>
                  {b !== 0 && <span className={`num text-[20px] ${b > 0 ? 'text-pos' : 'text-accent'}`}>{fmt(Math.abs(b))}</span>}
                  <ChevronRight size={16} className="text-ink3" />
                </Press>
              </motion.div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

export function PersonDetail({ id }: { id: number }) {
  const { personMap, txs, wallets } = useData();
  const nav = useNav();
  const p = personMap.get(id);
  const list = useMemo(() => txs.filter((t) => t.personId === id), [txs, id]);
  const b = personBalances(txs).get(id) ?? 0;
  if (!p) return null;

  async function forgive() {
    if (!(await confirmDialog(`¿Dar por perdidos ${fmt(b)}?`, { message: 'Se apuntarán como un gasto (regalo) de hoy y quedaréis en paz.', confirm: 'Dar por perdido', destructive: false }))) return;
    const cats = await db.categories.toArray();
    const gift = cats.find((c) => c.type === 'expense' && c.name === 'Regalos') ?? cats.find((c) => c.type === 'expense' && c.name === 'Otros');
    const w = wallets[0]?.id!;
    await db.transaction('rw', db.transactions, async () => {
      // El dinero ya salió: cerramos la deuda con una devolución "virtual" y la convertimos en gasto
      await db.transactions.add({ type: 'debt', dir: 'in', personId: id, amount: b, walletId: w, date: todayISO(), note: 'Perdonado', createdAt: Date.now() });
      await db.transactions.add({ type: 'expense', amount: b, walletId: w, categoryId: gift?.id, date: todayISO(), note: `Perdonado a ${p!.name}`, createdAt: Date.now() });
    });
    toast('Deuda saldada');
  }

  async function remove() {
    if (list.length) return alert('Esta persona tiene movimientos. Elimínalos antes, o déjala en paz a cero.');
    if (!(await confirmDialog(`¿Eliminar a ${p!.name}?`))) return;
    await db.people.delete(id);
    nav.pop();
  }

  return (
    <Page title={p.name} eyebrow="Préstamos" onBack={nav.pop} right={<GlassIconButton onClick={remove} label="Eliminar" className="text-accent"><TrashCan size={20} /></GlassIconButton>}>
      <div className="rounded-[24px] bg-surface p-5">
        <p className="text-[13px] text-ink3">{b > 0 ? `${p.name} te debe` : b < 0 ? `Le debes a ${p.name}` : 'Estáis en paz'}</p>
        <p className={`num text-[48px] leading-tight ${b > 0 ? 'text-pos' : b < 0 ? 'text-accent' : ''}`}>{fmt(Math.abs(b))}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Press scale={0.96} onClick={() => nav.push({ name: 'editor', type: 'debt', defaults: { type: 'debt', personId: id, dir: 'in', amount: b > 0 ? b : undefined } })} className="btn-ink px-3 text-[14px]">
            <ArrowDownLeft size={18} /> Me devuelve
          </Press>
          <Press scale={0.96} onClick={() => nav.push({ name: 'editor', type: 'debt', defaults: { type: 'debt', personId: id, dir: 'out', amount: b < 0 ? -b : undefined } })} className="btn-soft px-3 text-[14px]">
            <ArrowUpRight size={18} /> Le dejo / pago
          </Press>
        </div>
        {b > 0 && <Press scale={0.97} onClick={forgive} className="mt-3 w-full text-center text-[13px] font-semibold text-ink3">No me lo va a devolver · dar por perdido</Press>}
      </div>
      <TxList txs={list} empty={<Empty icon="receipt" title="Sin movimientos" />} />
    </Page>
  );
}

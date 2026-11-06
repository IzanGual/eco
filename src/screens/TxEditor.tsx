import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Add, ArrowRight, Calendar, Grid, Camera, Checkmark, ChevronLeft, ChevronRight, Close, Edit, Erase, Repeat, Search, Subtract, TrashCan, UserMultiple, Wallet as WalletIcon
} from '@carbon/icons-react';
import { db, type Category, type DebtDir, type Frequency, type Transaction, type TxType } from '../db';
import { addDays, centsToInput, compressImage, dayLabel, FREQ_LABEL, fmt, nextOccurrence, parseAmount, personBalances, processRecurring, todayISO } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { CatIcon, PALETTE } from '../icons';
import { GlassIconButton, Press, Segmented, Sheet, Tile, confirmDialog, spring, toast } from '../components/ui';

const LAST_WALLET = 'eco:lastWallet';

// ---------- Calculadora: "12,5+3−1" ----------
function evaluate(expr: string): number {
  const parts = expr.match(/[+−]?[^+−]+/g) ?? [];
  let total = 0;
  for (const p of parts) {
    const sign = p.startsWith('−') ? -1 : 1;
    const n = Number(p.replace(/^[+−]/, '').replace(',', '.'));
    if (Number.isFinite(n)) total += sign * Math.round(n * 100);
  }
  return total;
}
const hasOp = (e: string) => /[+−]/.test(e.slice(1));

const TITLES: Record<TxType, string> = { expense: 'Nuevo gasto', income: 'Nuevo ingreso', transfer: 'Mover dinero', debt: 'Préstamo' };
const SAVE: Record<TxType, string> = { expense: 'Guardar gasto', income: 'Guardar ingreso', transfer: 'Guardar', debt: 'Guardar' };

export function TxEditor({ id, type: initialType, defaults, repeat: initialRepeat }: { id?: number; type?: TxType; defaults?: Partial<Transaction>; repeat?: Frequency }) {
  const { categories, wallets, catMap, walletMap, recurring, txs, people, personMap } = useData();
  const nav = useNav();
  const isNew = id == null;

  const lastWallet = Number(localStorage.getItem(LAST_WALLET)) || undefined;
  const firstWallet = wallets.find((w) => w.id === lastWallet)?.id ?? wallets[0]?.id;

  const [loaded, setLoaded] = useState(isNew);
  const [type, setType] = useState<TxType>(initialType ?? defaults?.type ?? 'expense');
  const [expr, setExpr] = useState(defaults?.amount ? centsToInput(defaults.amount) : '');
  const [categoryId, setCategoryId] = useState<number | undefined>(defaults?.categoryId);
  const [walletId, setWalletId] = useState<number | undefined>(defaults?.walletId ?? firstWallet);
  const [toWalletId, setToWalletId] = useState<number | undefined>(wallets.find((w) => w.id !== firstWallet)?.id);
  const [date, setDate] = useState(defaults?.date ?? todayISO());
  const [note, setNote] = useState(defaults?.note ?? '');
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [repeat, setRepeat] = useState<Frequency | ''>(initialRepeat ?? '');
  const [recurringId, setRecurringId] = useState<number | undefined>();
  const [personId, setPersonId] = useState<number | undefined>(defaults?.personId);
  const [dir, setDir] = useState<DebtDir>(defaults?.dir ?? 'out');
  const [shareOn, setShareOn] = useState(false);
  const [sharePerson, setSharePerson] = useState<number | undefined>();
  const [shareExpr, setShareExpr] = useState('');
  const [sheet, setSheet] = useState<null | 'category' | 'wallet' | 'to' | 'repeat' | 'person' | 'sharePerson'>(null);
  const [typing, setTyping] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [shake, setShake] = useState(0);
  const noteTouched = useRef(false);

  useEffect(() => {
    if (isNew) return;
    db.transactions.get(id).then((t) => {
      if (!t) return nav.pop();
      setType(t.type);
      setExpr(centsToInput(t.amount));
      setCategoryId(t.categoryId);
      setWalletId(t.walletId);
      setToWalletId(t.toWalletId);
      setDate(t.date);
      setNote(t.note);
      setPhoto(t.photo);
      setRecurringId(t.recurringId);
      setPersonId(t.personId);
      setDir(t.dir ?? 'out');
      setLoaded(true);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : undefined), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const catType = type === 'income' ? 'income' : 'expense';
  const selected = categoryId != null ? catMap.get(categoryId) : undefined;
  const selectedParent = selected?.parentId != null ? catMap.get(selected.parentId) : undefined;
  const rec = recurringId != null ? recurring.find((r) => r.id === recurringId) : undefined;
  const subParent = selected ? (selectedParent ?? (categories.some((c) => c.parentId === selected.id) ? selected : undefined)) : undefined;
  const subs = subParent ? categories.filter((c) => c.parentId === subParent.id) : [];

  useEffect(() => {
    if (selected && selected.type !== catType) setCategoryId(undefined);
  }, [catType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorías más usadas en los últimos 90 días (incluye subcategorías)
  const frequent = useMemo(() => {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const count = new Map<number, number>();
    for (const t of txs) {
      if (t.date < since) break;
      if (t.type === catType && t.categoryId != null) count.set(t.categoryId, (count.get(t.categoryId) ?? 0) + 1);
    }
    const ids = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const fallback = categories.filter((c) => c.type === catType && c.parentId == null).map((c) => c.id!);
    return [...new Set([...ids, ...fallback])].slice(0, 7).map((k) => catMap.get(k)).filter(Boolean) as Category[];
  }, [txs, catType, categories, catMap]);

  // Notas anteriores → sugerencias (y su última categoría)
  const noteIndex = useMemo(() => {
    const m = new Map<string, { note: string; categoryId?: number; n: number }>();
    for (const t of txs) {
      if (!t.note || t.type !== type) continue;
      const k = t.note.toLowerCase();
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { note: t.note, categoryId: t.categoryId, n: 1 });
    }
    return m;
  }, [txs, type]);
  const suggestions = useMemo(() => {
    const q = note.trim().toLowerCase();
    if (!q || !typing) return [];
    return [...noteIndex.values()].filter((e) => e.note.toLowerCase().startsWith(q) && e.note.toLowerCase() !== q).sort((a, b) => b.n - a.n).slice(0, 4);
  }, [note, noteIndex, typing]);

  // Si la nota coincide con una anterior y no hay categoría, la ponemos sola
  useEffect(() => {
    if (categoryId != null || type === 'transfer' || type === 'debt') return;
    const hit = noteIndex.get(note.trim().toLowerCase());
    if (hit?.categoryId != null) setCategoryId(hit.categoryId);
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  // La elegida siempre se ve en la cuadrícula, aunque no sea de las frecuentes
  const gridCats = useMemo(() => {
    const list = [...frequent];
    const shown = selectedParent ?? selected;
    if (shown && !list.some((c) => c.id === shown.id || c.id === selected?.id)) list.splice(list.length - 1, 1, shown);
    return list.slice(0, 7);
  }, [frequent, selected, selectedParent]);

  const cents = evaluate(expr);
  const pending = hasOp(expr);
  const share = shareOn ? (shareExpr === 'half' ? Math.round(cents / 2) : parseAmount(shareExpr)) : 0;

  function key(k: string) {
    setExpr((e) => {
      const last = e.split(/[+−]/).pop() ?? '';
      if (k === 'back') return e.slice(0, -1);
      if (k === '+' || k === '−') {
        if (!e) return e;
        if (/[+−]$/.test(e)) return e.slice(0, -1) + k;
        return e + k;
      }
      if (k === ',') {
        if (last.includes(',')) return e;
        return e + (last === '' ? '0,' : ',');
      }
      if (last.includes(',') && last.split(',')[1].length >= 2) return e;
      if (last.replace(',', '').length >= 8) return e;
      if (last === '0') return e.slice(0, -1) + k;
      return e + k;
    });
  }

  const missing =
    cents <= 0 ? 'Escribe el importe con el teclado'
    : type === 'transfer' ? (toWalletId == null || toWalletId === walletId ? 'Elige a qué cartera va' : '')
    : type === 'debt' ? (personId == null ? 'Elige con quién' : '')
    : categoryId == null ? 'Elige una categoría'
    : shareOn && (sharePerson == null || share <= 0 || share >= cents) ? 'Revisa la parte compartida'
    : '';
  const valid = !missing && walletId != null;

  async function save() {
    if (pending) return setExpr(cents > 0 ? centsToInput(cents) : '');
    if (!valid) {
      setShake((s) => s + 1);
      if (cents > 0 && type !== 'transfer' && type !== 'debt' && categoryId == null) setSheet('category');
      if (cents > 0 && type === 'debt' && personId == null) setSheet('person');
      return;
    }
    const tx: Transaction = {
      type,
      amount: shareOn ? cents - share : cents,
      walletId: walletId!,
      toWalletId: type === 'transfer' ? toWalletId : undefined,
      categoryId: type === 'transfer' || type === 'debt' ? undefined : categoryId,
      personId: type === 'debt' ? personId : undefined,
      dir: type === 'debt' ? dir : undefined,
      date,
      note: note.trim(),
      photo,
      recurringId,
      createdAt: Date.now()
    };
    localStorage.setItem(LAST_WALLET, String(walletId));
    if (isNew) {
      if (repeat) {
        const { photo: _p, createdAt: _c, recurringId: _r, date: _d, ...tpl } = tx;
        tx.recurringId = await db.recurring.add({ ...tpl, frequency: repeat, nextDate: nextOccurrence(date, repeat), active: true });
      }
      await db.transactions.add(tx);
      if (shareOn && sharePerson != null) {
        await db.transactions.add({
          type: 'debt', dir: 'out', personId: sharePerson, amount: share, walletId: walletId!, date,
          note: `Su parte${note.trim() ? ` · ${note.trim()}` : selected ? ` · ${selected.name}` : ''}`, createdAt: Date.now()
        });
      }
      await processRecurring();
      toast(type === 'expense' ? 'Gasto guardado' : type === 'income' ? 'Ingreso guardado' : type === 'debt' ? 'Préstamo guardado' : 'Transferencia guardada');
    } else {
      if (repeat && recurringId == null) {
        const { photo: _p, createdAt: _c, recurringId: _r, date: _d, ...tpl } = tx;
        tx.recurringId = await db.recurring.add({ ...tpl, frequency: repeat, nextDate: nextOccurrence(date, repeat), active: true });
      }
      const { createdAt: _c, ...changes } = tx;
      await db.transactions.update(id, { ...changes, photo });
      await processRecurring();
      toast('Cambios guardados');
    }
    nav.pop();
  }

  async function remove() {
    if (!(await confirmDialog('¿Eliminar este movimiento?'))) return;
    await db.transactions.delete(id!);
    toast('Movimiento eliminado');
    nav.pop();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setPhoto(await compressImage(f)); } catch { setPhoto(f); }
  }

  if (!loaded) return null;

  const wallet = walletId != null ? walletMap.get(walletId) : undefined;
  const toWallet = toWalletId != null ? walletMap.get(toWalletId) : undefined;
  const person = personId != null ? personMap.get(personId) : undefined;
  const display = expr || '0';
  const debtAfter = (() => {
    if (type !== 'debt' || personId == null) return null;
    const cur = personBalances(txs).get(personId) ?? 0;
    const editing = !isNew ? 0 : 1;
    const after = cur + editing * (dir === 'out' ? cents : -cents);
    return { cur, after };
  })();

  return (
    <Sheet onClose={nav.pop} full>
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <GlassIconButton onClick={nav.pop} label="Cerrar"><Close size={20} /></GlassIconButton>
        <span className="flex-1 text-center text-[17px] font-semibold">{isNew ? TITLES[type] : 'Editar'}</span>
        {isNew ? <span className="w-10" /> : <GlassIconButton onClick={remove} label="Eliminar" className="text-accent"><TrashCan size={20} /></GlassIconButton>}
      </div>
      <div className="px-4">
        <Segmented
          id="txtype"
          value={type}
          onChange={(t) => { setType(t); setShareOn(false); }}
          options={[{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }, { value: 'transfer', label: 'Mover' }, { value: 'debt', label: 'Préstamo' }]}
        />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
        onFocus={(e) => (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text' && setTyping(true)}
        onBlur={() => setTimeout(() => setTyping(false), 120)}
      >
        {/* Importe */}
        <motion.div key={shake} animate={shake ? { x: [0, -10, 9, -6, 4, 0] } : {}} transition={{ duration: 0.4 }} className="flex flex-col items-center pb-2 pt-5">
          <div className={`flex items-baseline font-serif tabular-nums leading-none ${type === 'income' ? 'text-pos' : expr ? '' : 'text-ink3'}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {display.split('').map((ch, i) => (
                <motion.span key={i + ch} initial={{ y: 18, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -14, opacity: 0 }} transition={spring} className={`${display.length > 9 ? 'text-[44px]' : 'text-[64px]'} ${/[+−]/.test(ch) ? 'px-1 text-ink3' : ''}`}>
                  {ch}
                </motion.span>
              ))}
            </AnimatePresence>
            <span className="ml-1.5 text-[32px] text-ink3">€</span>
          </div>
          <div className="mt-1 h-5 text-[14px] text-ink3">{pending ? `= ${fmt(cents)}` : ''}</div>
        </motion.div>

        {/* Categoría: las 7 más usadas a un toque, y «Todas» para el resto */}
        {(type === 'expense' || type === 'income') && (
          <>
            <div className="grid grid-cols-4 gap-x-1 gap-y-2">
              {gridCats.map((c) => {
                const on = categoryId === c.id || (c.parentId == null && selected?.parentId === c.id);
                return (
                  <Press key={c.id} scale={0.88} onClick={() => setCategoryId(c.id)} className="flex min-w-0 flex-col items-center gap-1 py-0.5">
                    <motion.span animate={on ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ duration: 0.3 }}>
                      <Tile icon={c.icon} color={c.color} size={48} active={on} />
                    </motion.span>
                    <span className={`w-full truncate text-center text-[11.5px] ${on ? 'font-semibold text-ink' : 'text-ink2'}`}>{c.name}</span>
                  </Press>
                );
              })}
              <Press scale={0.88} onClick={() => setSheet('category')} className="flex flex-col items-center gap-1 py-0.5">
                <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-ink/[0.06] text-ink2"><Grid size={22} /></span>
                <span className="text-[11.5px] text-ink2">Todas</span>
              </Press>
            </div>
            <AnimatePresence initial={false}>
              {subParent && subs.length > 0 && (
                <motion.div key={subParent.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-2.5">
                  {[subParent, ...subs].map((c, i) => {
                    const on = categoryId === c.id;
                    return (
                      <Press key={c.id} scale={0.92} onClick={() => setCategoryId(c.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${on ? 'text-white' : 'bg-surface text-ink2'}`} style={on ? { background: c.color } : undefined}>
                        <CatIcon name={c.icon} size={15} />
                        {i === 0 ? 'General' : c.name}
                      </Press>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {type === 'transfer' && (
          <div className="flex items-center gap-2">
            <WalletCard label="Desde" w={wallet} onClick={() => setSheet('wallet')} />
            <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-ink3"><ArrowRight size={22} /></motion.span>
            <WalletCard label="Hacia" w={toWallet} onClick={() => setSheet('to')} />
          </div>
        )}

        {type === 'debt' && (
          <>
            <Press scale={0.98} onClick={() => setSheet('person')} className={`flex w-full items-center gap-3 rounded-[22px] p-3 text-left ${person ? 'bg-surface' : 'border-[1.5px] border-dashed border-ink/20'}`}>
              <Avatar name={person?.name} color={person?.color} size={44} />
              <div className="flex-1">
                <p className="text-[12px] font-medium text-ink3">Con quién</p>
                <p className="text-[17px] font-semibold">{person?.name ?? 'Elige una persona'}</p>
              </div>
              <ChevronRight size={18} className="text-ink3" />
            </Press>
            <Segmented
              id="debtdir"
              className="mt-2.5"
              value={dir}
              onChange={setDir}
              options={[{ value: 'out', label: 'Le dejo / pago yo' }, { value: 'in', label: 'Me devuelve / me deja' }]}
            />
            {debtAfter && (
              <p className="px-1 pt-2.5 text-[13px] text-ink2">
                {debtAfter.after === 0 ? 'Quedaréis en paz.' : debtAfter.after > 0 ? <>Después, {person?.name} te deberá <span className="money font-semibold">{fmt(debtAfter.after)}</span>.</> : <>Después, le deberás <span className="money font-semibold">{fmt(-debtAfter.after)}</span> a {person?.name}.</>}
                {' '}No cuenta como gasto ni ingreso.
              </p>
            )}
          </>
        )}

        {/* Detalles: nota primero (es lo que más se usa), luego cuenta, fecha y repetir */}
        <div className="divide-hair mt-4 overflow-hidden rounded-[22px] bg-surface">
          <div className="flex items-center gap-3 px-4">
            <span className="text-ink3"><Edit size={18} /></span>
            <input
              type="text"
              className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-ink3"
              placeholder="Nota: Mercadona, cena con Laura…"
              value={note}
              onChange={(e) => { noteTouched.current = true; setNote(e.target.value); }}
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {note && <button onClick={() => setNote('')} className="p-1 text-ink3" aria-label="Borrar nota"><Close size={16} /></button>}
          </div>
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
                {suggestions.map((s) => {
                  const c = s.categoryId != null ? catMap.get(s.categoryId) : undefined;
                  return (
                    <Press key={s.note} scale={0.92} onPointerDown={(e) => e.preventDefault()} onClick={() => { setNote(s.note); if (c) setCategoryId(c.id); }} className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1.5 text-[14px]">
                      {c && <span style={{ color: c.color }}><CatIcon name={c.icon} size={14} /></span>}
                      {s.note}
                    </Press>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          {type !== 'transfer' && (
            <Row icon={<WalletIcon size={18} />} label={type === 'debt' ? (dir === 'out' ? 'Sale de' : 'Entra en') : type === 'income' ? 'Entra en' : 'Pagado con'} onClick={() => setSheet('wallet')}>
              {wallet?.name ?? 'Elegir'}
            </Row>
          )}
          <div className="flex items-center gap-3 px-4 py-2">
            <span className="text-ink3"><Calendar size={18} /></span>
            <span className="flex-1 text-[15px] text-ink2">Fecha</span>
            {[todayISO(), addDays(todayISO(), -1)].map((d, i) => (
              <Press key={d} scale={0.9} onClick={() => setDate(d)} className={`rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors ${date === d ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink2'}`}>
                {i === 0 ? 'Hoy' : 'Ayer'}
              </Press>
            ))}
            <label className={`relative rounded-full px-3 py-1.5 text-[14px] font-semibold ${date !== todayISO() && date !== addDays(todayISO(), -1) ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink2'}`}>
              {date !== todayISO() && date !== addDays(todayISO(), -1) ? dayLabel(date).replace(/^[^,]+, /, '') : 'Otra'}
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="date-overlay absolute inset-0 opacity-0" aria-label="Elegir fecha" />
            </label>
          </div>
          {type !== 'debt' && (rec ? (
            <Row icon={<Repeat size={18} />} label="Se repite" onClick={() => nav.push({ name: 'recurring' })}>{rec.active ? FREQ_LABEL[rec.frequency] : 'En pausa'}</Row>
          ) : (
            <Row icon={<Repeat size={18} />} label="Repetir" onClick={() => setSheet('repeat')}>
              <span className={repeat ? 'text-accent' : 'text-ink3'}>{repeat ? FREQ_LABEL[repeat] : 'No se repite'}</span>
            </Row>
          ))}
          {photoUrl ? (
            <Row icon={<Camera size={18} />} label="Foto" onClick={() => setViewPhoto(true)}>
              <img src={photoUrl} className="h-8 w-8 rounded-lg object-cover" alt="Foto adjunta" />
            </Row>
          ) : (
            <label className="block">
              <Row icon={<Camera size={18} />} label="Foto del ticket"><span className="text-ink3">Añadir</span></Row>
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
          )}
        </div>
        {date > todayISO() && <p className="px-1 pt-2 text-[13px] text-ink3">Fecha futura: aparecerá en «Próximos» y no contará hasta ese día.</p>}

        {/* Gasto compartido: alguien te debe una parte */}
        {type === 'expense' && isNew && (
          <div className="mt-3 overflow-hidden rounded-[22px] bg-surface">
            <Press scale={0.99} onClick={() => setShareOn((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="text-ink3"><UserMultiple size={18} /></span>
              <span className="flex-1">
                <span className="block text-[15px]">Alguien te debe una parte</span>
                <span className="block text-[12px] text-ink3">Pagaste tú, pero no todo es gasto tuyo</span>
              </span>
              <span className={`flex h-[28px] w-[46px] items-center rounded-full p-[3px] transition-colors ${shareOn ? 'bg-pos' : 'bg-ink/15'}`}>
                <motion.span layout transition={spring} className={`h-[22px] w-[22px] rounded-full bg-white shadow ${shareOn ? 'ml-auto' : ''}`} />
              </span>
            </Press>
            <AnimatePresence>
              {shareOn && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t hair">
                  <Row icon={<Avatar name={personMap.get(sharePerson!)?.name} color={personMap.get(sharePerson!)?.color} size={22} />} label="Quién" onClick={() => setSheet('sharePerson')}>
                    {sharePerson != null ? personMap.get(sharePerson)?.name : 'Elegir'}
                  </Row>
                  <div className="flex items-center gap-2 px-4 pb-3.5">
                    <Press scale={0.94} onClick={() => setShareExpr('half')} className={`rounded-full px-3.5 py-2 text-[14px] font-medium ${shareExpr === 'half' ? 'bg-ink text-paper' : 'bg-ink/[0.06]'}`}>La mitad</Press>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="min-w-0 flex-1 rounded-full bg-ink/[0.06] px-4 py-2 text-[15px] outline-none placeholder:text-ink3"
                      placeholder="Otra cantidad"
                      value={shareExpr === 'half' ? '' : shareExpr}
                      onChange={(e) => setShareExpr(e.target.value.replace(/[^\d.,]/g, ''))}
                    />
                  </div>
                  {share > 0 && share < cents && (
                    <p className="px-4 pb-3.5 text-[13px] text-ink2">
                      Tu gasto: <span className="money font-semibold">{fmt(cents - share)}</span> · Te debe: <span className="money font-semibold">{fmt(share)}</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Teclado propio (se esconde mientras escribes la nota) */}
      <AnimatePresence initial={false}>
        {!typing && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.2 }} className="pb-safe border-t px-3 pt-2 hair">
            <div className="mb-1.5 h-4 text-center text-[12px] font-medium text-ink3">{missing}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', '−', ',', '0'].map((k) => (
                <Key key={k} k={k} onPress={key} />
              ))}
              <Press
                scale={0.95}
                onClick={save}
                className={`col-span-2 flex h-[50px] items-center justify-center gap-2 rounded-[16px] text-[16px] font-semibold transition-colors ${valid || pending ? 'bg-accent text-white' : 'bg-ink/[0.08] text-ink3'}`}
              >
                {pending ? '= Calcular' : (<><Checkmark size={20} /> {isNew ? SAVE[type] : 'Guardar'}</>)}
              </Press>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hojas de selección */}
      <AnimatePresence>
        {sheet === 'category' && (
          <CategorySheet key="cat" type={catType} value={categoryId} onPick={(c) => { setCategoryId(c); setSheet(null); }} onClose={() => setSheet(null)} />
        )}
        {(sheet === 'person' || sheet === 'sharePerson') && (
          <PersonSheet key="person" value={sheet === 'person' ? personId : sharePerson} onPick={(p) => { if (sheet === 'person') setPersonId(p); else setSharePerson(p); setSheet(null); }} onClose={() => setSheet(null)} people={people} />
        )}
        {(sheet === 'wallet' || sheet === 'to' || sheet === 'repeat') && (
          <Sheet key="opts" onClose={() => setSheet(null)} title={sheet === 'repeat' ? 'Repetir' : sheet === 'to' ? 'Hacia' : 'Cartera'}>
            <div className="pb-safe overflow-y-auto px-4 pt-2">
              <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
                {sheet === 'repeat'
                  ? (['', ...Object.keys(FREQ_LABEL)] as (Frequency | '')[]).map((f) => (
                      <OptionRow key={f} selected={repeat === f} onClick={() => { setRepeat(f); setSheet(null); }} icon={<Repeat size={18} />}>{f ? FREQ_LABEL[f] : 'No se repite'}</OptionRow>
                    ))
                  : wallets
                      .filter((w) => (sheet === 'to' ? w.id !== walletId : true))
                      .map((w) => (
                        <OptionRow
                          key={w.id}
                          selected={(sheet === 'to' ? toWalletId : walletId) === w.id}
                          onClick={() => {
                            if (sheet === 'to') setToWalletId(w.id);
                            else {
                              setWalletId(w.id);
                              if (toWalletId === w.id) setToWalletId(wallets.find((x) => x.id !== w.id)?.id);
                            }
                            setSheet(null);
                          }}
                          icon={<Tile icon={w.icon} color={w.color} size={34} />}
                        >
                          {w.name}
                        </OptionRow>
                      ))}
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>

      {viewPhoto && photoUrl && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" onClick={() => setViewPhoto(false)}>
          <img src={photoUrl} className="max-h-[75dvh] max-w-full rounded-2xl" alt="Foto adjunta" />
          <button className="btn bg-white/10 text-white" onClick={(e) => { e.stopPropagation(); setPhoto(undefined); setViewPhoto(false); }}>Quitar foto</button>
        </motion.div>
      )}
    </Sheet>
  );
}

// ---------- Selector de categoría: búsqueda + cuadrícula + subcategorías ----------
function CategorySheet({ type, value, onPick, onClose }: { type: 'expense' | 'income'; value?: number; onPick: (id: number) => void; onClose: () => void }) {
  const { categories } = useData();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Category | null>(null);
  const parents = categories.filter((c) => c.type === type && c.parentId == null);
  const subsOf = (id: number) => categories.filter((c) => c.parentId === id);
  const results = q.trim() ? categories.filter((c) => c.type === type && c.name.toLowerCase().includes(q.trim().toLowerCase())) : null;

  return (
    <Sheet onClose={onClose} title={open ? open.name : 'Categoría'} full>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8">
        {!open && (
          <div className="relative mb-4 mt-1">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3" />
            <input className="field rounded-full pl-11" placeholder="Buscar categoría" value={q} onChange={(e) => setQ(e.target.value)} type="text" />
          </div>
        )}
        <AnimatePresence mode="wait">
          {results ? (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="divide-hair overflow-hidden rounded-[22px] bg-surface">
              {results.map((c) => (
                <OptionRow key={c.id} selected={value === c.id} onClick={() => onPick(c.id!)} icon={<Tile icon={c.icon} color={c.color} size={34} />}>{c.name}</OptionRow>
              ))}
              {results.length === 0 && <p className="p-4 text-[14px] text-ink3">Ninguna coincide.</p>}
            </motion.div>
          ) : open ? (
            <motion.div key="sub" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <Press scale={0.96} onClick={() => setOpen(null)} className="mb-3 flex items-center gap-1 text-[14px] font-semibold text-ink2"><ChevronLeft size={16} /> Todas las categorías</Press>
              <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
                <OptionRow selected={value === open.id} onClick={() => onPick(open.id!)} icon={<Tile icon={open.icon} color={open.color} size={34} />}>
                  {open.name} <span className="text-ink3">· en general</span>
                </OptionRow>
                {subsOf(open.id!).map((s) => (
                  <OptionRow key={s.id} selected={value === s.id} onClick={() => onPick(s.id!)} icon={<Tile icon={s.icon} color={s.color} size={34} />}>{s.name}</OptionRow>
                ))}
              </div>
              <Press scale={0.97} onClick={() => nav.push({ name: 'categoryEdit', parentId: open.id, type })} className="mt-3 flex items-center gap-2 px-1 text-[14px] font-semibold text-accent"><Add size={16} /> Nueva subcategoría</Press>
            </motion.div>
          ) : (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} className="grid grid-cols-4 gap-x-2 gap-y-4">
              {parents.map((c) => {
                const subs = subsOf(c.id!);
                const active = value === c.id || subs.some((s) => s.id === value);
                return (
                  <Press key={c.id} scale={0.88} onClick={() => (subs.length ? setOpen(c) : onPick(c.id!))} className="flex flex-col items-center gap-1.5">
                    <span className="relative">
                      <Tile icon={c.icon} color={c.color} size={56} active={active} />
                      {subs.length > 0 && <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-paper px-1 text-[11px] font-semibold text-ink2 shadow">{subs.length}</span>}
                    </span>
                    <span className={`line-clamp-2 text-center text-[12px] leading-tight ${active ? 'font-semibold' : 'text-ink2'}`}>{c.name}</span>
                  </Press>
                );
              })}
              <Press scale={0.88} onClick={() => nav.push({ name: 'categoryEdit', type, parentId: null })} className="flex flex-col items-center gap-1.5">
                <span className="flex h-14 w-14 items-center justify-center rounded-[19px] border-[1.5px] border-dashed border-ink/20 text-ink3"><Add size={22} /></span>
                <span className="text-[12px] text-ink3">Nueva</span>
              </Press>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

// ---------- Selector de persona (con alta rápida) ----------
function PersonSheet({ value, onPick, onClose, people }: { value?: number; onPick: (id: number) => void; onClose: () => void; people: { id?: number; name: string; color: string; archived?: boolean }[] }) {
  const { txs } = useData();
  const [name, setName] = useState('');
  const bal = useMemo(() => personBalances(txs), [txs]);
  async function add() {
    const n = name.trim();
    if (!n) return;
    const id = await db.people.add({ name: n, color: PALETTE[people.length % PALETTE.length] });
    onPick(id);
  }
  return (
    <Sheet onClose={onClose} title="¿Con quién?">
      <div className="pb-safe overflow-y-auto px-4 pt-2">
        <div className="mb-3 flex gap-2">
          <input className="field" placeholder="Nombre: Mamá, Laura…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} type="text" />
          <Press scale={0.9} onClick={add} className="flex w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-paper" aria-label="Añadir persona"><Add size={22} /></Press>
        </div>
        {people.filter((p) => !p.archived).length > 0 && (
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {people.filter((p) => !p.archived).map((p) => {
              const b = bal.get(p.id!) ?? 0;
              return (
                <OptionRow key={p.id} selected={value === p.id} onClick={() => onPick(p.id!)} icon={<Avatar name={p.name} color={p.color} size={34} />}>
                  {p.name}
                  {b !== 0 && <span className="money ml-2 text-[13px] text-ink3">{b > 0 ? `te debe ${fmt(b)}` : `le debes ${fmt(-b)}`}</span>}
                </OptionRow>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function Avatar({ name, color = '#6B6760', size = 40 }: { name?: string; color?: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: name ? color : 'rgb(var(--ink) / 0.12)', fontSize: size * 0.42 }}>
      {name ? name.trim()[0]?.toUpperCase() : <UserMultiple size={size * 0.5} />}
    </span>
  );
}

function Row({ icon, label, children, onClick }: { icon: ReactNode; label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <Press scale={0.99} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className="text-ink3">{icon}</span>
      <span className="flex-1 text-[15px] text-ink2">{label}</span>
      <span className="flex items-center gap-1 text-[15px] font-semibold">{children}</span>
      {onClick && <ChevronRight size={16} className="text-ink3" />}
    </Press>
  );
}

function Key({ k, onPress }: { k: string; onPress: (k: string) => void }) {
  const label = k === 'back' ? <Erase size={22} /> : k === '+' ? <Add size={22} /> : k === '−' ? <Subtract size={22} /> : k;
  const op = k === 'back' || k === '+' || k === '−';
  return (
    <Press
      scale={0.9}
      onClick={() => onPress(k)}
      className={`flex h-[50px] items-center justify-center rounded-[16px] ${op ? 'bg-ink/[0.06] text-ink2' : 'bg-surface font-serif text-[28px]'}`}
      aria-label={k === 'back' ? 'Borrar' : k === '+' ? 'Sumar' : k === '−' ? 'Restar' : k}
    >
      {label}
    </Press>
  );
}

function WalletCard({ label, w, onClick }: { label: string; w?: { name: string; icon: string; color: string }; onClick: () => void }) {
  return (
    <Press scale={0.95} onClick={onClick} className="flex flex-1 flex-col items-start gap-3 rounded-[22px] bg-surface p-4 text-left">
      <span className="text-[12px] font-semibold text-ink3">{label}</span>
      {w ? <Tile icon={w.icon} color={w.color} size={40} /> : <WalletIcon size={24} />}
      <span className="text-[15px] font-semibold">{w?.name ?? 'Elegir'}</span>
    </Press>
  );
}

function OptionRow({ children, icon, selected, onClick }: { children: ReactNode; icon: ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <Press scale={0.98} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="text-ink2">{icon}</span>
      <span className="flex-1 text-[16px]">{children}</span>
      {selected && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="text-accent"><Checkmark size={20} /></motion.span>}
    </Press>
  );
}

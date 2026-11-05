import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Add, ArrowRight, Calendar, Camera, Checkmark, Close, Edit, Erase, Repeat, Subtract, TrashCan, Wallet as WalletIcon } from '@carbon/icons-react';
import { db, type Frequency, type Transaction, type TxType } from '../db';
import { centsToInput, compressImage, dayLabel, FREQ_LABEL, fmt, nextOccurrence, processRecurring, todayISO } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { CatIcon } from '../icons';
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

export function TxEditor({ id, type: initialType, defaults }: { id?: number; type?: TxType; defaults?: Partial<Transaction> }) {
  const { categories, wallets, catMap, walletMap, recurring } = useData();
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [repeat, setRepeat] = useState<Frequency | ''>('');
  const [recurringId, setRecurringId] = useState<number | undefined>();
  const [picker, setPicker] = useState<null | 'wallet' | 'to' | 'repeat'>(null);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [shake, setShake] = useState(0);
  const noteRef = useRef<HTMLInputElement>(null);

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
      setLoaded(true);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : undefined), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const catType = type === 'income' ? 'income' : 'expense';
  const parents = categories.filter((c) => c.type === catType && c.parentId == null);
  const selected = categoryId != null ? catMap.get(categoryId) : undefined;
  const selectedParentId = selected?.parentId ?? selected?.id;
  const subs = categories.filter((c) => c.parentId != null && c.parentId === selectedParentId);
  const rec = recurringId != null ? recurring.find((r) => r.id === recurringId) : undefined;

  useEffect(() => {
    if (selected && selected.type !== catType) setCategoryId(undefined);
  }, [catType]); // eslint-disable-line react-hooks/exhaustive-deps

  const cents = evaluate(expr);
  const pending = hasOp(expr);

  // ---------- Teclado ----------
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
      // dígito
      if (last.includes(',') && last.split(',')[1].length >= 2) return e;
      if (last.replace(',', '').length >= 8) return e;
      if (last === '0') return e.slice(0, -1) + k;
      return e + k;
    });
  }

  const valid = cents > 0 && walletId != null && (type === 'transfer' ? toWalletId != null && toWalletId !== walletId : categoryId != null);

  async function save() {
    if (pending) return setExpr(cents > 0 ? centsToInput(cents) : '');
    if (!valid) return setShake((s) => s + 1);
    const tx: Transaction = {
      type,
      amount: cents,
      walletId: walletId!,
      toWalletId: type === 'transfer' ? toWalletId : undefined,
      categoryId: type === 'transfer' ? undefined : categoryId,
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
      await processRecurring();
      toast(type === 'expense' ? 'Gasto guardado' : type === 'income' ? 'Ingreso guardado' : 'Transferencia guardada');
    } else {
      const { createdAt: _c, ...changes } = tx;
      await db.transactions.update(id, { ...changes, photo });
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
  const today = todayISO();
  const display = expr || '0';
  const missing = cents <= 0 ? 'Escribe un importe' : type === 'transfer' ? (toWalletId === walletId ? 'Elige carteras distintas' : '') : categoryId == null ? 'Elige una categoría' : '';

  return (
    <Sheet onClose={nav.pop} full>
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <GlassIconButton onClick={nav.pop} label="Cerrar"><Close size={20} /></GlassIconButton>
        <Segmented
          id="txtype"
          className="flex-1"
          value={type}
          onChange={setType}
          options={[{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }, { value: 'transfer', label: 'Mover' }]}
        />
        {isNew ? <span className="w-10" /> : <GlassIconButton onClick={remove} label="Eliminar" className="text-accent"><TrashCan size={20} /></GlassIconButton>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* Importe */}
        <motion.div key={shake} animate={shake ? { x: [0, -10, 9, -6, 4, 0] } : {}} transition={{ duration: 0.4 }} className="flex flex-col items-center px-5 pb-1 pt-3">
          <div className="h-5 text-[14px] text-ink3">{pending ? `= ${fmt(cents)}` : ''}</div>
          <div className={`flex items-baseline gap-1.5 font-serif tabular-nums leading-none ${type === 'income' ? 'text-pos' : expr ? '' : 'text-ink3'}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {display.split('').map((ch, i) => (
                <motion.span key={i + ch} initial={{ y: 18, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -14, opacity: 0 }} transition={spring} className={`${display.length > 9 ? 'text-[46px]' : 'text-[66px]'} ${/[+−]/.test(ch) ? 'px-1 text-ink3' : ''}`}>
                  {ch}
                </motion.span>
              ))}
            </AnimatePresence>
            <span className="ml-1 text-[34px] text-ink3">€</span>
          </div>
        </motion.div>

        {/* Chips: cartera, fecha, nota, foto, repetir */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {type !== 'transfer' && (
            <Chip onClick={() => setPicker('wallet')} icon={<CatIcon name={wallet?.icon ?? 'wallet'} size={16} />}>{wallet?.name ?? 'Cartera'}</Chip>
          )}
          <label className="relative">
            <Chip icon={<Calendar size={16} />} active={date !== today}>{dayLabel(date)}</Chip>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="date-overlay absolute inset-0 opacity-0" aria-label="Fecha" />
          </label>
          <Chip onClick={() => { setNoteOpen(true); setTimeout(() => noteRef.current?.focus(), 50); }} icon={<Edit size={16} />} active={!!note}>{note || 'Nota'}</Chip>
          {photoUrl ? (
            <Press scale={0.92} onClick={() => setViewPhoto(true)} className="relative h-[38px] w-[38px] shrink-0 overflow-hidden rounded-full">
              <img src={photoUrl} className="h-full w-full object-cover" alt="Foto adjunta" />
            </Press>
          ) : (
            <label className="shrink-0">
              <Chip icon={<Camera size={16} />}>Foto</Chip>
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
          )}
          {rec ? (
            <Chip icon={<Repeat size={16} />} active>{rec.active ? FREQ_LABEL[rec.frequency] : 'Detenida'}</Chip>
          ) : isNew ? (
            <Chip onClick={() => setPicker('repeat')} icon={<Repeat size={16} />} active={!!repeat}>{repeat ? FREQ_LABEL[repeat] : 'Repetir'}</Chip>
          ) : null}
        </div>
        {date > today && <p className="-mt-1 px-5 pb-2 text-[13px] text-ink3">Fecha futura: irá a «Próximos» y no contará hasta ese día.</p>}

        <AnimatePresence>
          {noteOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4">
              <div className="flex gap-2 pb-3">
                <input ref={noteRef} className="field" placeholder="Mercadona, cena con Laura…" value={note} onChange={(e) => setNote(e.target.value)} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && setNoteOpen(false)} />
                <Press scale={0.9} onClick={() => setNoteOpen(false)} className="flex w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-paper" aria-label="Listo"><Checkmark size={20} /></Press>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Categorías o carteras de la transferencia */}
        {type === 'transfer' ? (
          <div className="flex items-center gap-3 px-4 pt-2">
            <WalletCard label="Desde" w={wallet} onClick={() => setPicker('wallet')} />
            <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-ink3"><ArrowRight size={22} /></motion.span>
            <WalletCard label="Hacia" w={toWallet} onClick={() => setPicker('to')} />
          </div>
        ) : (
          <>
            <div className="no-scrollbar grid auto-cols-[76px] grid-flow-col grid-rows-2 gap-x-1 gap-y-2 overflow-x-auto px-3 pt-1">
              {parents.map((c) => {
                const active = selectedParentId === c.id;
                return (
                  <Press key={c.id} scale={0.88} onClick={() => setCategoryId(c.id)} className="flex flex-col items-center gap-1.5 py-1">
                    <motion.span animate={active ? { scale: [1, 1.15, 1], rotate: [0, -6, 0] } : { scale: 1 }} transition={{ duration: 0.35 }}>
                      <Tile icon={c.icon} color={c.color} size={50} active={active} />
                    </motion.span>
                    <span className={`line-clamp-1 text-[12px] ${active ? 'font-semibold text-ink' : 'text-ink2'}`}>{c.name}</span>
                  </Press>
                );
              })}
              <Press scale={0.88} onClick={() => nav.push({ name: 'categoryEdit', type: catType, parentId: null })} className="flex flex-col items-center gap-1.5 py-1">
                <span className="flex h-[50px] w-[50px] items-center justify-center rounded-[17px] border-[1.5px] border-dashed border-ink/20 text-ink3"><Add size={22} /></span>
                <span className="text-[12px] text-ink3">Nueva</span>
              </Press>
            </div>
            <AnimatePresence>
              {subs.length > 0 && (
                <motion.div key={selectedParentId} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2">
                  {subs.map((s) => {
                    const on = categoryId === s.id;
                    return (
                      <Press key={s.id} scale={0.92} onClick={() => setCategoryId(on ? selectedParentId : s.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] transition-colors ${on ? 'text-white' : 'bg-ink/[0.05] text-ink2'}`} style={on ? { background: s.color } : undefined}>
                        <CatIcon name={s.icon} size={16} />
                        {s.name}
                      </Press>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        <div className="flex-1" />
      </div>

      {/* Teclado */}
      <div className="pb-safe px-3 pt-2">
        <div className="mb-2 h-4 text-center text-[12px] text-ink3">{missing}</div>
        <div className="grid grid-cols-4 gap-2">
          {['1', '2', '3', 'back', '4', '5', '6', '+', '7', '8', '9', '−', ',', '0'].map((k) => (
            <Key key={k} k={k} onPress={key} />
          ))}
          <Press
            scale={0.94}
            onClick={save}
            className={`col-span-2 flex h-[54px] items-center justify-center gap-2 rounded-[18px] text-[17px] font-semibold transition-colors ${valid || pending ? 'bg-accent text-white' : 'bg-ink/[0.08] text-ink3'}`}
          >
            {pending ? '=' : (<><Checkmark size={22} /> Guardar</>)}
          </Press>
        </div>
      </div>

      {/* Selectores */}
      <AnimatePresence>
        {picker && (
          <Sheet key="picker" onClose={() => setPicker(null)} title={picker === 'repeat' ? 'Repetir' : picker === 'to' ? 'Hacia' : 'Cartera'}>
            <div className="pb-safe overflow-y-auto px-4 pt-2">
              <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
                {picker === 'repeat'
                  ? (['', ...Object.keys(FREQ_LABEL)] as (Frequency | '')[]).map((f) => (
                      <OptionRow key={f} selected={repeat === f} onClick={() => { setRepeat(f); setPicker(null); }} icon={<Repeat size={18} />}>{f ? FREQ_LABEL[f] : 'No se repite'}</OptionRow>
                    ))
                  : wallets
                      .filter((w) => (picker === 'to' ? w.id !== walletId : true))
                      .map((w) => (
                        <OptionRow
                          key={w.id}
                          selected={(picker === 'to' ? toWalletId : walletId) === w.id}
                          onClick={() => {
                            if (picker === 'to') setToWalletId(w.id);
                            else {
                              setWalletId(w.id);
                              if (toWalletId === w.id) setToWalletId(wallets.find((x) => x.id !== w.id)?.id);
                            }
                            setPicker(null);
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

function Key({ k, onPress }: { k: string; onPress: (k: string) => void }) {
  const label = k === 'back' ? <Erase size={24} /> : k === '+' ? <Add size={24} /> : k === '−' ? <Subtract size={24} /> : k;
  const op = k === 'back' || k === '+' || k === '−';
  return (
    <Press
      scale={0.9}
      onClick={() => onPress(k)}
      className={`flex h-[54px] items-center justify-center rounded-[18px] ${op ? 'bg-ink/[0.06] text-ink2' : 'bg-surface font-serif text-[30px]'}`}
      aria-label={k === 'back' ? 'Borrar' : k}
    >
      {label}
    </Press>
  );
}

function Chip({ children, icon, onClick, active }: { children: React.ReactNode; icon: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <Press scale={0.93} onClick={onClick} className={`flex h-[38px] max-w-[200px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors ${active ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink2'}`}>
      {icon}
      <span className="truncate">{children}</span>
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

function OptionRow({ children, icon, selected, onClick }: { children: React.ReactNode; icon: React.ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <Press scale={0.98} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className="text-ink2">{icon}</span>
      <span className="flex-1 text-[16px]">{children}</span>
      {selected && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="text-accent"><Checkmark size={20} /></motion.span>}
    </Press>
  );
}


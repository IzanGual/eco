import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { DocumentImport } from '@carbon/icons-react';
import { db, type Frequency, type Transaction, type TxType } from '../db';
import { fmt, nextOccurrence, processRecurring, toISO } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { PALETTE } from '../icons';
import { Page, Press, Segmented, toast } from '../components/ui';

// ---------- CSV ----------
export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] ?? '';
  const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export function parseMoney(s: string): number | null {
  let v = s.replace(/[€$£\s]|EUR|USD/gi, '');
  if (!v) return null;
  const neg = /^-|^\(.*\)$|-$/.test(v);
  v = v.replace(/[()\-+]/g, '');
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

export function parseDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [d, mo] = [Number(m[1]), Number(m[2])];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // formato americano
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toISO(new Date(y, mo - 1, d));
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : toISO(new Date(t));
}

type Field = 'date' | 'amount' | 'type' | 'category' | 'subcategory' | 'wallet' | 'note' | 'repeat';
const FIELDS: { key: Field; label: string; re: RegExp; required?: boolean }[] = [
  { key: 'date', label: 'Fecha', re: /fecha|date|d[ií]a/i, required: true },
  { key: 'amount', label: 'Importe', re: /importe|amount|cantidad|valor|monto|precio|value|sum/i, required: true },
  { key: 'type', label: 'Tipo (gasto/ingreso)', re: /^tipo|type|kind/i },
  { key: 'category', label: 'Categoría', re: /^categor|^category/i },
  { key: 'subcategory', label: 'Subcategoría', re: /sub/i },
  { key: 'wallet', label: 'Cartera / cuenta', re: /cartera|cuenta|wallet|account|monedero/i },
  { key: 'note', label: 'Nota', re: /nota|note|descrip|concepto|comment|memo|t[ií]tulo|title|nombre|name/i },
  { key: 'repeat', label: 'Repetir (mensual, semanal…)', re: /repet|recurr|frecuen|repeat/i }
];

/** «mensual», «cada semana», «monthly»… → frecuencia de Eco */
function guessFreq(v: string): Frequency | null {
  const s = v.toLowerCase();
  if (/diari|daily|cada d[ií]a/.test(s)) return 'daily';
  if (/seman|week/.test(s)) return 'weekly';
  if (/mens|month|cada mes/.test(s)) return 'monthly';
  if (/anual|year|cada a[ñn]o/.test(s)) return 'yearly';
  return null;
}

/** Icono razonable para una categoría nueva según su nombre */
const ICON_HINTS: [RegExp, string][] = [
  [/deport|gym|gimnas/i, 'running'], [/invers|bolsa|cripto/i, 'chart'], [/viaj/i, 'plane'], [/regal/i, 'gift'],
  [/sueldo|n[oó]mina|trabajo|salario/i, 'briefcase'], [/paga|deuda|pr[eé]stamo/i, 'money'], [/moda|ropa/i, 'bag'],
  [/aliment|comida|super/i, 'cart'], [/hogar|casa|alquiler/i, 'home'], [/suministr|luz|agua/i, 'idea'],
  [/ocio|fiesta/i, 'events'], [/salud|m[eé]dic|dentist/i, 'health'], [/transport|gasolin|coche/i, 'car'],
  [/suscrip/i, 'repeat'], [/invitaci/i, 'people'], [/educa|curso|estudi/i, 'education'], [/peluq|cuidado/i, 'cut']
];
const guessIcon = (name: string) => ICON_HINTS.find(([re]) => re.test(name))?.[1] ?? 'tag';

function guessType(v: string): TxType | null {
  const s = v.toLowerCase();
  if (/gasto|expense|spend|debit|cargo|salida/.test(s)) return 'expense';
  if (/ingreso|income|earn|credit|abono|entrada/.test(s)) return 'income';
  if (/transfer/.test(s)) return 'transfer';
  return null;
}

/** Importa movimientos desde un CSV (Soldi, Excel o el banco). */
export function ImportCSV() {
  const nav = useNav();
  const { wallets, txs } = useData();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [positiveIs, setPositiveIs] = useState<'expense' | 'income'>('expense');
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = parseCSV(await f.text());
    if (r.length < 2) return alert('El archivo no parece un CSV con movimientos.');
    const header = r[0];
    const m: Partial<Record<Field, number>> = {};
    for (const fd of FIELDS) {
      const idx = header.findIndex((h, i) => fd.re.test(h) && !Object.values(m).includes(i) && !(fd.key === 'category' && /sub/i.test(h)));
      if (idx >= 0) m[fd.key] = idx;
    }
    setFileName(f.name);
    setMap(m);
    setRows(r);
  }

  const parsed = useMemo(() => {
    if (!rows || map.date == null || map.amount == null) return [];
    const out: { date: string; amount: number; type: TxType; category: string; sub: string; wallet: string; note: string; repeat: Frequency | null }[] = [];
    const anyNegative = rows.slice(1).some((r) => (parseMoney(r[map.amount!] ?? '') ?? 0) < 0);
    for (const r of rows.slice(1)) {
      const date = parseDate(r[map.date] ?? '');
      const raw = parseMoney(r[map.amount] ?? '');
      if (!date || raw == null || raw === 0) continue;
      const typed = map.type != null ? guessType(r[map.type] ?? '') : null;
      const type: TxType = typed ?? (anyNegative ? (raw < 0 ? 'expense' : 'income') : positiveIs);
      out.push({
        date,
        amount: Math.abs(raw),
        type: type === 'transfer' ? (raw < 0 ? 'expense' : 'income') : type,
        category: map.category != null ? r[map.category] ?? '' : '',
        sub: map.subcategory != null ? r[map.subcategory] ?? '' : '',
        wallet: map.wallet != null ? r[map.wallet] ?? '' : '',
        note: map.note != null ? r[map.note] ?? '' : '',
        repeat: map.repeat != null ? guessFreq(r[map.repeat] ?? '') : null
      });
    }
    return out;
  }, [rows, map, positiveIs]);

  const needsSign = rows && map.type == null && map.amount != null && !rows.slice(1).some((r) => (parseMoney(r[map.amount!] ?? '') ?? 0) < 0);
  const counts = { expense: parsed.filter((p) => p.type === 'expense').length, income: parsed.filter((p) => p.type === 'income').length };

  async function doImport() {
    setBusy(true);
    try {
      const byKey = new Map(txs.map((t) => [`${t.date}|${t.amount}|${t.type}|${t.note.toLowerCase()}`, t]));
      const existing = new Set(byKey.keys());
      let linked = 0;
      let added = 0;
      await db.transaction('rw', db.categories, db.wallets, db.transactions, db.recurring, async () => {
        const cats = await db.categories.toArray();
        const ws = await db.wallets.toArray();
        const findCat = (name: string, type: 'expense' | 'income', parentId: number | null) =>
          cats.find((c) => c.type === type && c.parentId === parentId && c.name.toLowerCase() === name.toLowerCase());
        const findCatAny = (name: string, type: 'expense' | 'income') => cats.find((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase());
        const fallbackW = ws.find((w) => !w.archived)?.id ?? (await db.wallets.add({ name: 'Importado', icon: 'wallet', color: '#6B6760', initialBalance: 0, order: 0 }));
        const newTx: Transaction[] = [];
        for (const p of parsed) {
          const key = `${p.date}|${p.amount}|${p.type}|${p.note.toLowerCase()}`;
          if (existing.has(key)) {
            // Ya estaba importado: si ahora viene marcado como repetición, se la añadimos
            const old = byKey.get(key);
            if (p.repeat && old && old.recurringId == null) {
              const rid = await db.recurring.add({ type: old.type, amount: old.amount, walletId: old.walletId, categoryId: old.categoryId, note: old.note, frequency: p.repeat, nextDate: nextOccurrence(old.date, p.repeat), active: true });
              await db.transactions.update(old.id!, { recurringId: rid });
              linked++;
            }
            continue;
          }
          existing.add(key);
          const type = p.type as 'expense' | 'income';
          // Cartera
          let walletId = fallbackW;
          if (p.wallet) {
            let w = ws.find((x) => x.name.toLowerCase() === p.wallet.toLowerCase());
            if (!w) {
              const id = await db.wallets.add({ name: p.wallet, icon: 'wallet', color: PALETTE[ws.length % PALETTE.length], initialBalance: 0, order: ws.length });
              w = { id, name: p.wallet, icon: 'wallet', color: PALETTE[ws.length % PALETTE.length], initialBalance: 0, order: ws.length };
              ws.push(w);
            }
            walletId = w.id!;
          }
          // Categoría (y subcategoría)
          let categoryId: number | undefined;
          if (p.category) {
            let parent = findCat(p.category, type, null) ?? (p.sub ? undefined : findCatAny(p.category, type));
            if (!parent) {
              const color = PALETTE[cats.length % PALETTE.length];
              const icon = guessIcon(p.category);
              const id = await db.categories.add({ name: p.category, icon, color, type, parentId: null, order: cats.length });
              parent = { id, name: p.category, icon, color, type, parentId: null, order: cats.length };
              cats.push(parent);
            }
            categoryId = parent.id;
            if (p.sub) {
              let sub = findCat(p.sub, type, parent.id!);
              if (!sub) {
                const id = await db.categories.add({ name: p.sub, icon: parent.icon, color: parent.color, type, parentId: parent.id!, order: 99 });
                sub = { id, name: p.sub, icon: parent.icon, color: parent.color, type, parentId: parent.id!, order: 99 };
                cats.push(sub);
              }
              categoryId = sub.id;
            }
          } else {
            categoryId = (findCatAny(type === 'expense' ? 'Otros' : 'Otros ingresos', type) ?? cats.find((c) => c.type === type))?.id;
          }
          // Si se repite, creamos la repetición a partir de este movimiento (la siguiente fecha la genera Eco)
          let recurringId: number | undefined;
          if (p.repeat) {
            recurringId = await db.recurring.add({ type, amount: p.amount, walletId, categoryId, note: p.note, frequency: p.repeat, nextDate: nextOccurrence(p.date, p.repeat), active: true });
          }
          newTx.push({ type, amount: p.amount, walletId, categoryId, date: p.date, note: p.note, recurringId, createdAt: Date.now() });
        }
        await db.transactions.bulkAdd(newTx);
        added = newTx.length;
      });
      await processRecurring(); // genera las repeticiones que ya hayan vencido hasta hoy
      toast(linked && !added ? `${linked} repeticiones añadidas` : `${added} movimientos importados${linked ? ` y ${linked} repeticiones` : ''}`);
      nav.pop();
    } catch (e) {
      alert('No se pudo importar: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Importar"
      eyebrow="Desde Soldi, Excel o tu banco"
      onBack={nav.pop}
      footer={rows && <Press className="btn-ink w-full disabled:opacity-30" disabled={!parsed.length || busy} onClick={doImport}>{busy ? 'Importando…' : `Importar ${parsed.length} movimientos`}</Press>}
    >
      {!rows ? (
        <>
          <div className="space-y-3 rounded-[22px] bg-surface p-5 text-[15px] leading-relaxed text-ink2">
            <p className="font-serif text-[22px] leading-tight text-ink">Cómo traer tus datos de Soldi</p>
            <p>1. En Soldi, ve a Ajustes y exporta tus movimientos en CSV.</p>
            <p>2. Guarda el archivo en Archivos (o compártelo a este iPhone).</p>
            <p>3. Elígelo aquí abajo. Detectamos las columnas solas y podrás revisarlas antes de importar.</p>
            <p className="text-[13px] text-ink3">Las categorías y carteras que no existan se crearán. Los movimientos repetidos se saltan, así que puedes importar el mismo archivo dos veces sin miedo.</p>
          </div>
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-ink/20 px-5 py-10 text-center">
            <DocumentImport size={32} className="text-ink2" />
            <span className="text-[16px] font-semibold">Elegir archivo CSV</span>
            <span className="text-[13px] text-ink3">También sirve el extracto de tu banco</span>
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
          </label>
        </>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="px-1 text-[14px] text-ink2">{fileName} · {rows.length - 1} filas</p>
          <p className="eyebrow px-1 pb-2 pt-5">Columnas</p>
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-[15px]">{f.label}{f.required && <span className="text-accent"> *</span>}</span>
                <select
                  className="max-w-[55%] rounded-xl bg-ink/[0.06] px-3 py-2 text-[15px] outline-none"
                  value={map[f.key] ?? ''}
                  onChange={(e) => setMap({ ...map, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">—</option>
                  {rows[0].map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {needsSign && (
            <>
              <p className="eyebrow px-1 pb-2 pt-5">Todos los importes son positivos. ¿Qué son?</p>
              <Segmented id="sign" value={positiveIs} onChange={setPositiveIs} options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }]} />
            </>
          )}
          <p className="eyebrow px-1 pb-2 pt-5">Vista previa · {counts.expense} gastos, {counts.income} ingresos</p>
          <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
            {parsed.slice(0, 6).map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{p.note || p.sub || p.category || 'Sin nota'}</p>
                  <p className="truncate text-[12px] text-ink3">{p.date} · {[p.category, p.sub].filter(Boolean).join(' › ') || 'Sin categoría'}{p.wallet ? ` · ${p.wallet}` : ''}</p>
                </div>
                <span className={`num text-[18px] ${p.type === 'income' ? 'text-pos' : ''}`}>{p.type === 'income' ? '+' : '−'}{fmt(p.amount)}</span>
              </div>
            ))}
            {parsed.length === 0 && <p className="p-4 text-[14px] text-ink3">Elige al menos las columnas de fecha e importe.</p>}
          </div>
          {wallets.length > 0 && map.wallet == null && <p className="px-1 pt-2 text-[13px] text-ink3">Sin columna de cartera: todo irá a «{wallets[0].name}».</p>}
          <Press scale={0.97} onClick={() => setRows(null)} className="mt-4 w-full text-center text-[14px] font-semibold text-ink3">Elegir otro archivo</Press>
        </motion.div>
      )}
    </Page>
  );
}

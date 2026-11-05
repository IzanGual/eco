import { db, type Frequency, type Transaction, type Category, type Wallet } from './db';

// ---------- Dinero ----------
let currency = 'EUR';
export function setCurrency(c: string) {
  currency = c;
}

export function fmt(cents: number, opts: { sign?: boolean; compact?: boolean } = {}) {
  const value = cents / 100;
  const s = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: opts.compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: 'always' as unknown as boolean // 1.800 € (por defecto es-ES no agrupa los miles)
  }).format(Math.abs(value));
  if (opts.sign) return (cents < 0 ? '−' : '+') + s;
  return cents < 0 ? '−' + s : s;
}

/** "12,50" | "12.5" | "1.234,56" -> céntimos */
export function parseAmount(input: string): number {
  let s = input.trim().replace(/\s/g, '').replace('€', '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number) {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
}

// ---------- Fechas (siempre en hora local) ----------
export function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayISO = () => toISO(new Date());

export function addDays(iso: string, n: number) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export function addMonths(iso: string, n: number, anchorDay?: number) {
  const d = fromISO(iso);
  const day = anchorDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toISO(target);
}

export function nextOccurrence(iso: string, freq: Frequency) {
  switch (freq) {
    case 'daily': return addDays(iso, 1);
    case 'weekly': return addDays(iso, 7);
    case 'monthly': return addMonths(iso, 1);
    case 'yearly': return addMonths(iso, 12);
  }
}

export const FREQ_LABEL: Record<Frequency, string> = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año'
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const monthName = (m: number) => MONTHS[m];
export const monthShort = (m: number) => MONTHS_SHORT[m];

export function shortDate(iso: string) {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function dayLabel(iso: string) {
  const t = todayISO();
  if (iso === t) return 'Hoy';
  if (iso === addDays(t, -1)) return 'Ayer';
  if (iso === addDays(t, 1)) return 'Mañana';
  const d = fromISO(iso);
  const wd = d.toLocaleDateString('es-ES', { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

// ---------- Periodos ----------
export type PeriodKind = 'day' | 'week' | 'month' | 'year';
export interface Period {
  kind: PeriodKind;
  start: string; // incluido
  end: string; // incluido
  label: string;
}

/** offset 0 = periodo actual, -1 = anterior… monthStartDay permite ciclos de cobro a cobro. */
export function getPeriod(kind: PeriodKind, offset: number, monthStartDay = 1, ref = todayISO()): Period {
  const r = fromISO(ref);
  if (kind === 'day') {
    const d = addDays(ref, offset);
    return { kind, start: d, end: d, label: dayLabel(d) };
  }
  if (kind === 'week') {
    const dow = (r.getDay() + 6) % 7; // lunes = 0
    const start = addDays(ref, -dow + offset * 7);
    const end = addDays(start, 6);
    const label = offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana pasada' : `${shortDate(start)} – ${shortDate(end)}`;
    return { kind, start, end, label };
  }
  if (kind === 'month') {
    let y = r.getFullYear();
    let m = r.getMonth();
    if (r.getDate() < monthStartDay) m -= 1;
    const base = new Date(y, m, 1);
    y = base.getFullYear();
    m = base.getMonth();
    const startBase = toISO(new Date(y, m, Math.min(monthStartDay, daysInMonth(y, m))));
    const start = addMonths(startBase, offset, monthStartDay);
    const end = addDays(addMonths(start, 1, monthStartDay), -1);
    const s = fromISO(start);
    const label = monthStartDay === 1
      ? `${MONTHS[s.getMonth()][0].toUpperCase()}${MONTHS[s.getMonth()].slice(1)} ${s.getFullYear()}`
      : `${shortDate(start)} – ${shortDate(end)}`;
    return { kind, start, end, label };
  }
  const y = r.getFullYear() + offset;
  return { kind, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
}

export function daysBetween(a: string, b: string) {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

// ---------- Recurrentes ----------
let processing = false;
/** Genera los movimientos de las recurrencias que ya han vencido (hasta hoy incluido). */
export async function processRecurring() {
  if (processing) return;
  processing = true;
  try {
    const today = todayISO();
    const due = await db.recurring.where('nextDate').belowOrEqual(today).filter((r) => r.active).toArray();
    for (const r of due) {
      await db.transaction('rw', db.recurring, db.transactions, async () => {
        let next = r.nextDate;
        let guard = 0;
        while (next <= today && guard++ < 1000) {
          await db.transactions.add({
            type: r.type,
            amount: r.amount,
            walletId: r.walletId,
            toWalletId: r.toWalletId,
            categoryId: r.categoryId,
            date: next,
            note: r.note,
            recurringId: r.id,
            createdAt: Date.now()
          });
          next = nextOccurrence(next, r.frequency);
        }
        await db.recurring.update(r.id!, { nextDate: next });
      });
    }
  } finally {
    processing = false;
  }
}

// ---------- Cálculos ----------
export function walletBalances(wallets: Wallet[], txs: Transaction[], upTo = todayISO()) {
  const map = new Map<number, number>();
  for (const w of wallets) map.set(w.id!, w.initialBalance);
  for (const t of txs) {
    if (t.date > upTo) continue;
    if (t.type === 'income') map.set(t.walletId, (map.get(t.walletId) ?? 0) + t.amount);
    else if (t.type === 'expense') map.set(t.walletId, (map.get(t.walletId) ?? 0) - t.amount);
    else {
      map.set(t.walletId, (map.get(t.walletId) ?? 0) - t.amount);
      if (t.toWalletId != null) map.set(t.toWalletId, (map.get(t.toWalletId) ?? 0) + t.amount);
    }
  }
  return map;
}

export function totals(txs: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Id de la categoría principal (si es subcategoría, devuelve la madre). */
export function rootCategoryId(catId: number | undefined, cats: Map<number, Category>) {
  if (catId == null) return undefined;
  const c = cats.get(catId);
  return c?.parentId ?? catId;
}

// ---------- Fotos ----------
export async function compressImage(file: File, max = 1280, quality = 0.72): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Guardar ficheros (en iPhone abre el menú Compartir) ----------
export async function saveFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Exportar CSV ----------
export async function exportCSV() {
  const [txs, cats, wallets] = await Promise.all([
    db.transactions.orderBy('date').toArray(),
    db.categories.toArray(),
    db.wallets.toArray()
  ]);
  const catMap = new Map(cats.map((c) => [c.id!, c]));
  const wMap = new Map(wallets.map((w) => [w.id!, w]));
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const TYPE = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' };
  const rows = [['Fecha', 'Tipo', 'Importe', 'Categoría', 'Subcategoría', 'Cartera', 'Cartera destino', 'Nota']];
  for (const t of txs) {
    const c = t.categoryId != null ? catMap.get(t.categoryId) : undefined;
    const parent = c?.parentId != null ? catMap.get(c.parentId) : undefined;
    const signed = t.type === 'expense' ? -t.amount : t.amount;
    rows.push([
      t.date,
      TYPE[t.type],
      (signed / 100).toFixed(2).replace('.', ','),
      parent ? parent.name : c?.name ?? '',
      parent ? c!.name : '',
      wMap.get(t.walletId)?.name ?? '',
      t.toWalletId != null ? wMap.get(t.toWalletId)?.name ?? '' : '',
      t.note
    ]);
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `eco-movimientos-${todayISO()}.csv`);
}

// ---------- Copia de seguridad ----------
const blobToDataURL = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

export async function exportBackup() {
  const txs = await db.transactions.toArray();
  const data = {
    app: 'eco',
    version: 1,
    exportedAt: new Date().toISOString(),
    wallets: await db.wallets.toArray(),
    categories: await db.categories.toArray(),
    recurring: await db.recurring.toArray(),
    budgets: await db.budgets.toArray(),
    settings: await db.settings.toArray(),
    transactions: await Promise.all(
      txs.map(async (t) => (t.photo ? { ...t, photo: await blobToDataURL(t.photo) } : t))
    )
  };
  await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `eco-copia-${todayISO()}.json`);
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'eco') throw new Error('Este archivo no es una copia de seguridad de Eco.');
  const txs = await Promise.all(
    (data.transactions as (Transaction & { photo?: string | Blob })[]).map(async (t) =>
      typeof t.photo === 'string' ? { ...t, photo: await (await fetch(t.photo)).blob() } : t
    )
  );
  await db.transaction('rw', [db.wallets, db.categories, db.recurring, db.budgets, db.settings, db.transactions], async () => {
    await Promise.all([db.wallets.clear(), db.categories.clear(), db.recurring.clear(), db.budgets.clear(), db.settings.clear(), db.transactions.clear()]);
    await db.wallets.bulkAdd(data.wallets);
    await db.categories.bulkAdd(data.categories);
    await db.recurring.bulkAdd(data.recurring);
    await db.budgets.bulkAdd(data.budgets);
    await db.settings.bulkAdd(data.settings);
    await db.transactions.bulkAdd(txs as Transaction[]);
  });
}

export async function wipeAll() {
  await db.delete();
  location.reload();
}

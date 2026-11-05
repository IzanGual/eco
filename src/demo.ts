// Datos de ejemplo para probar el diseño (solo en desarrollo: abre la app con ?demo)
import { db, seedIfEmpty } from './db';
import { addDays, addMonths, todayISO } from './lib';

export async function loadDemo() {
  await db.delete();
  await db.open();
  await seedIfEmpty();
  const cats = await db.categories.toArray();
  const id = (n: string) => cats.find((c) => c.name === n)!.id!;
  const today = todayISO();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const between = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 100);

  await db.wallets.update(1, { initialBalance: 284000 });
  await db.wallets.update(2, { initialBalance: 12000 });
  await db.wallets.add({ name: 'Ahorro', icon: 'piggy', color: '#C0627A', initialBalance: 650000, order: 2 });

  const start = addMonths(today, -2);
  await db.recurring.bulkAdd([
    { type: 'income', amount: 184500, walletId: 1, categoryId: id('Nómina'), note: 'Nómina', frequency: 'monthly', nextDate: start.slice(0, 8) + '01', active: true },
    { type: 'expense', amount: 72000, walletId: 1, categoryId: id('Alquiler / hipoteca'), note: 'Alquiler piso', frequency: 'monthly', nextDate: start.slice(0, 8) + '02', active: true },
    { type: 'expense', amount: 1399, walletId: 1, categoryId: id('Streaming'), note: 'Netflix', frequency: 'monthly', nextDate: start.slice(0, 8) + '12', active: true },
    { type: 'expense', amount: 1099, walletId: 1, categoryId: id('Streaming'), note: 'Spotify', frequency: 'monthly', nextDate: start.slice(0, 8) + '15', active: true },
    { type: 'expense', amount: 3990, walletId: 1, categoryId: id('Gimnasio'), note: 'Gimnasio', frequency: 'monthly', nextDate: start.slice(0, 8) + '05', active: true }
  ]);

  const txs = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const r = rnd();
    if (r < 0.35) txs.push({ type: 'expense' as const, amount: between(18, 85), walletId: 1, categoryId: id('Supermercado'), date: d, note: rnd() < 0.6 ? 'Mercadona' : 'Lidl', createdAt: 0 });
    if (rnd() < 0.3) txs.push({ type: 'expense' as const, amount: between(1.6, 4.5), walletId: 2, categoryId: id('Cafeterías'), date: d, note: '', createdAt: 0 });
    if (rnd() < 0.14) txs.push({ type: 'expense' as const, amount: between(22, 68), walletId: 1, categoryId: id('Restaurantes'), date: d, note: rnd() < 0.5 ? 'Cena con Laura' : '', createdAt: 0 });
    if (rnd() < 0.08) txs.push({ type: 'expense' as const, amount: between(35, 60), walletId: 1, categoryId: id('Gasolina'), date: d, note: 'Repsol', createdAt: 0 });
    if (rnd() < 0.05) txs.push({ type: 'expense' as const, amount: between(25, 120), walletId: 1, categoryId: id('Ropa'), date: d, note: rnd() < 0.5 ? 'Zara' : '', createdAt: 0 });
    if (rnd() < 0.06) txs.push({ type: 'expense' as const, amount: between(12, 40), walletId: 1, categoryId: id('Salir'), date: d, note: '', createdAt: 0 });
    if (rnd() < 0.04) txs.push({ type: 'expense' as const, amount: between(4, 22), walletId: 2, categoryId: id('Farmacia'), date: d, note: '', createdAt: 0 });
  }
  txs.push({ type: 'expense' as const, amount: 18900, walletId: 1, categoryId: id('Viajes'), date: addDays(today, -9), note: 'Vuelos Lisboa', createdAt: 0 });
  txs.push({ type: 'transfer' as const, amount: 20000, walletId: 1, toWalletId: 3, date: addDays(today, -3), note: 'Al ahorro', createdAt: 0 });
  txs.push({ type: 'expense' as const, amount: 6400, walletId: 1, categoryId: id('Luz'), date: addDays(today, 6), note: 'Factura luz', createdAt: 0 });
  await db.transactions.bulkAdd(txs.map((t, i) => ({ ...t, createdAt: i })));

  // Préstamos: Bizum de 300 € a mamá, que devuelve 150 € en efectivo; 10 € a la hermana
  const mama = await db.people.add({ name: 'Mamá', color: '#C0627A' });
  const ana = await db.people.add({ name: 'Ana', color: '#2F7A78' });
  await db.transactions.bulkAdd([
    { type: 'debt', dir: 'out', personId: mama, amount: 30000, walletId: 1, date: addDays(today, -12), note: 'Bizum', createdAt: 1 },
    { type: 'debt', dir: 'in', personId: mama, amount: 15000, walletId: 2, date: addDays(today, -4), note: 'En efectivo', createdAt: 2 },
    { type: 'debt', dir: 'out', personId: ana, amount: 1000, walletId: 2, date: addDays(today, -1), note: 'Cine', createdAt: 3 }
  ]);

  await db.settings.put({ key: 'onboarded', value: true });
  await db.budgets.bulkAdd([
    { name: 'Comida', amount: 40000, period: 'monthly', categoryIds: [id('Comida')], order: 0 },
    { name: 'Ocio', amount: 15000, period: 'monthly', categoryIds: [id('Ocio')], order: 1 },
    { name: 'Gasto total', amount: 150000, period: 'monthly', categoryIds: [], order: 2 }
  ]);
}

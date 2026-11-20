import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DataProvider } from './store';
import { db, seedIfEmpty } from './db';
import { cloudNeededAtStart, initCloud } from './cloud';
import { dropPreload, takePreload } from './preload';
import { initSync } from './sync';
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/instrument-sans';
import './index.css';
import './install';
import { initUpdates } from './update';

// Las versiones nuevas se descargan en segundo plano y la app avisa con un botón «Actualizar»
initUpdates();
initSync();

// Pide al navegador que no borre los datos aunque falte espacio
navigator.storage?.persist?.().catch(() => {});

// La base de datos se abre ya, en paralelo con la precarga y el primer render
db.open().catch(() => {});

async function boot() {
  if ((import.meta.env.DEV || import.meta.env.VITE_DEMO) && new URLSearchParams(location.search).has('demo')) {
    const { loadDemo } = await import('./demo');
    await loadDemo();
    history.replaceState(null, '', location.pathname);
  }
  // Lo normal: index.html ya ha leído los datos y la app se pinta con ellos sin esperar a nada más.
  // Primera vez (o algo raro): se preparan las carteras y categorías iniciales como siempre.
  const pre = await takePreload();
  const ready = pre && pre.wallets.length > 0 && (pre.transactions.length === 0 || pre.settings.some((s) => s.key === 'onboarded'));
  if (!ready) {
    dropPreload();
    await seedIfEmpty();
  }
}

boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataProvider>
        <App />
      </DataProvider>
    </StrictMode>
  );
  // Firebase pesa (~650 KB): solo si había sesión, y cuando la app ya está en pantalla y quieta (nunca antes).
  // Sin sesión no se carga hasta que se abre algo que la usa (Ajustes, pareja…).
  if (cloudNeededAtStart()) {
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 0));
    setTimeout(() => idle(() => initCloud().catch(() => {})), 1500);
  }
  // Y las pantallas secundarias se dejan precargadas para que abran al instante
  setTimeout(() => {
    import('./screens/Stats');
    import('./screens/Manage');
    import('./screens/Summary');
    import('./screens/People');
  }, 2500);
});

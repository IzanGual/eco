import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DataProvider } from './store';
import { seedIfEmpty } from './db';
import { initCloud } from './cloud';
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

async function boot() {
  if ((import.meta.env.DEV || import.meta.env.VITE_DEMO) && new URLSearchParams(location.search).has('demo')) {
    const { loadDemo } = await import('./demo');
    await loadDemo();
    history.replaceState(null, '', location.pathname);
  }
  await seedIfEmpty();
}

boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataProvider>
        <App />
      </DataProvider>
    </StrictMode>
  );
  // Firebase pesa (~400 KB): se carga cuando la app ya está en pantalla, nunca antes
  requestAnimationFrame(() => setTimeout(() => initCloud().catch(() => {}), 1200));
  // Y las pantallas secundarias se dejan precargadas para que abran al instante
  setTimeout(() => {
    import('./screens/Stats');
    import('./screens/Manage');
    import('./screens/Summary');
  }, 2500);
});

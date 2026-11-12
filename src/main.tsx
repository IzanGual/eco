import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DataProvider } from './store';
import { seedIfEmpty } from './db';
import { initCloud } from './cloud';
import { initSync } from './sync';
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/instrument-sans';
import './index.css';
import './install';

// Las versiones nuevas se instalan en segundo plano y se usan la próxima vez que abras la app,
// en vez de recargar la pantalla nada más abrirla (eso era un segundo arranque completo)
registerSW({ immediate: true });
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

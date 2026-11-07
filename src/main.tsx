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

registerSW({ immediate: true });
initSync();
// Firebase pesa: lo cargamos cuando la app ya se ve
const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 600));
idle(() => initCloud().catch(() => {}), { timeout: 1500 });
import './install';

// Pide al navegador que no borre los datos aunque falte espacio
navigator.storage?.persist?.().catch(() => {});

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
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
});

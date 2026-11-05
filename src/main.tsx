import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { DataProvider } from './store';
import { seedIfEmpty } from './db';
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/instrument-sans';
import './index.css';

registerSW({ immediate: true });

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

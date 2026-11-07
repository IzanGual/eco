// Detección de instalación. Va aparte (y se carga al arrancar) para no perder el evento de Android
// y para que la landing pueda cargarse solo cuando hace falta.
export type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export const installState: { deferred: BIPEvent | null } = { deferred: null };
export const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installState.deferred = e as BIPEvent;
    installListeners.forEach((l) => l());
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  // Navegadores dentro de otras apps (Instagram, WhatsApp, Gmail…) no dejan instalar
  const inApp = /Instagram|FBAN|FBAV|Line\/|WhatsApp|GSA\/|Snapchat|TikTok|wv\)/.test(ua);
  // Safari 26+ esconde «Compartir» dentro del botón «···» de la barra
  const safariVersion = Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0);
  const crios = /CriOS|FxiOS|EdgiOS/.test(ua);
  return { ios, android, inApp, mobile: ios || android, safariVersion, crios };
}

// «Usar en el navegador» solo vale para esta visita: la próxima vez vuelve a salir la landing
export const SKIP = 'eco:skipLanding';
export const shouldShowLanding = () => {
  if (isStandalone()) return false;
  try { return sessionStorage.getItem(SKIP) !== '1'; } catch { return true; }
};

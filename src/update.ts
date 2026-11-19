// Versiones nuevas de la app.
//
// La versión nueva se descarga sola en segundo plano. En cuanto está lista, la app enseña un aviso
// «Hay una versión nueva · Actualizar»: al pulsarlo se activa y la app se recarga ya actualizada (los datos
// no se tocan: viven en el móvil, no en la versión). Además se busca versión nueva cada vez que vuelves a la app.
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** Fecha y hora de publicación de esta versión (UTC, «2026-11-19T14:30»). */
export const APP_VERSION: string = __APP_VERSION__;

/** «19 nov, 15:30» en la hora del móvil. */
export function versionLabel(v = APP_VERSION) {
  const d = new Date(`${v}:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let ready = false;
let apply: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function initUpdates() {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      emit();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      registration = reg;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 30 * 60_000);
    }
  });
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (l) => { subs.add(l); return () => { subs.delete(l); }; },
    () => ready
  );
}

/** Busca versión nueva a mano. Devuelve true si hay una (lista o descargándose: el aviso saldrá solo). */
export async function checkForUpdate() {
  if (ready) return true;
  if (!registration) return false;
  try { await registration.update(); } catch { return false; }
  if (registration.waiting) { ready = true; emit(); }
  const found = !!(registration.waiting || registration.installing);
  if (found && !ready) {
    const { toast } = await import('./components/ui');
    toast('Descargando la versión nueva…');
  }
  return found;
}

/** Activa la versión nueva y recarga. */
export async function applyUpdate() {
  // Por si el navegador no recarga solo al cambiar de versión
  setTimeout(() => location.reload(), 2500);
  await apply?.(true);
}

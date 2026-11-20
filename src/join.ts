// Enlace de invitación de pareja: ?unirse=CODIGO (se guarda hasta que haya sesión y bienvenida)
// En iPhone la app instalada no ve el almacenamiento de Safari, pero sí hereda sus cookies al instalarse: el código
// va también en una cookie, y así quien instala desde el enlace de invitación entra ya con el código puesto.
const JOIN_COOKIE = 'eco_join';
const joinParam = new URLSearchParams(location.search).get('unirse');
if (joinParam) {
  const code = joinParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  localStorage.setItem('eco:pendingJoin', code);
  document.cookie = `${JOIN_COOKIE}=${code}; max-age=${7 * 86400}; path=${import.meta.env.BASE_URL}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  history.replaceState(null, '', location.pathname);
} else if (!localStorage.getItem('eco:pendingJoin')) {
  const fromCookie = document.cookie.match(new RegExp(`(?:^|; )${JOIN_COOKIE}=([A-Z0-9]{6})`))?.[1];
  if (fromCookie) localStorage.setItem('eco:pendingJoin', fromCookie);
}
/** Olvida la invitación pendiente (ya usada). */
export function clearPendingJoin() {
  localStorage.removeItem('eco:pendingJoin');
  document.cookie = `${JOIN_COOKIE}=; max-age=0; path=${import.meta.env.BASE_URL}`;
}

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Share, UserMultiple } from '@carbon/icons-react';
import { onUser, signInWithGoogle, type CloudUser } from '../cloud';
import { createHousehold, joinHousehold, leaveHousehold, lookupInvite } from '../sync';
import { useHousehold } from '../useHousehold';
import { useNav } from '../nav';
import { Page, Press, confirmDialog, toast } from '../components/ui';


export const inviteLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?unirse=${code}`;

/** Compartir gastos en pareja: los dos veis y apuntáis en los mismos datos, en tiempo real. */
export function Couple({ code: initialCode }: { code?: string }) {
  const nav = useNav();
  const h = useHousehold();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => onUser(setUser), []);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      const msg = (e as { code?: string; message: string });
      alert(msg.code === 'permission-denied' ? 'Firebase ha rechazado la operación. Revisa que las reglas de Firestore estén actualizadas (README).' : msg.message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return alert('El código tiene 6 caracteres.');
    await run(async () => {
      await lookupInvite(c);
      const ok = await confirmDialog('¿Unirte al espacio compartido?', {
        message: 'Verás y apuntarás los mismos gastos que tu pareja. Lo que tengas ahora en este móvil se guarda antes en tu copia de la nube.',
        confirm: 'Unirme',
        destructive: false
      });
      if (!ok) return;
      await joinHousehold(c);
      localStorage.removeItem('eco:pendingJoin');
      toast('Ya compartís gastos');
    });
  }

  async function share(c: string) {
    const url = inviteLink(c);
    const text = `Únete a nuestro Eco para compartir gastos: ${url}\nCódigo: ${c}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Eco en pareja', text }); return; } catch { /* cancelado */ }
    }
    await navigator.clipboard?.writeText(text);
    toast('Enlace copiado');
  }

  return (
    <Page title="En pareja" eyebrow="Compartir gastos" onBack={nav.pop}>
      {!user ? (
        <div className="rounded-[24px] bg-surface p-5">
          <p className="font-serif text-[24px] leading-tight">Primero, entra con Google</p>
          <p className="mt-1.5 text-[14px] text-ink2">Para compartir datos entre dos móviles hace falta que cada uno tenga su cuenta.</p>
          <Press scale={0.97} disabled={busy} onClick={() => run(signInWithGoogle)} className="btn-ink mt-4 w-full">Continuar con Google</Press>
        </div>
      ) : h ? (
        <>
          <div className="rounded-[24px] bg-surface p-5">
            <p className="text-[13px] text-ink3">Espacio compartido</p>
            <p className="font-serif text-[30px] leading-tight">{h.name}</p>
            <div className="mt-4 flex -space-x-2">
              {h.members.map((m) => (
                h.photos?.[m]
                  ? <img key={m} src={h.photos[m]} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full ring-[3px] ring-surface" />
                  : <span key={m} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-paper ring-[3px] ring-surface">{(h.names[m] || '?')[0]}</span>
              ))}
            </div>
            <p className="mt-2 text-[14px] text-ink2">{h.members.map((m) => (h.names[m] || '').split(' ')[0]).join(' y ')}</p>
          </div>

          {h.members.length < 2 && (
            <div className="mt-3 rounded-[24px] bg-ink p-5 text-paper">
              <p className="text-[13px] opacity-60">Invita a tu pareja</p>
              <p className="mt-1 font-serif text-[44px] tracking-[0.12em]">{h.code}</p>
              <p className="text-[13px] opacity-70">Que abra el enlace o escriba este código en Ajustes → En pareja.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Press scale={0.96} onClick={() => share(h.code)} className="btn bg-paper px-3 text-[14px] text-ink"><Share size={18} /> Enviar</Press>
                <Press scale={0.96} onClick={async () => { await navigator.clipboard?.writeText(h.code); toast('Código copiado'); }} className="btn bg-paper/10 px-3 text-[14px]"><Copy size={18} /> Copiar código</Press>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 px-1 text-[14px] leading-relaxed text-ink2">
            <p>Todo se sincroniza solo: lo que apunta uno aparece en el móvil del otro en segundos.</p>
            <p>Cada movimiento lleva la inicial de quien lo apuntó. Las fotos de los tickets se quedan en el móvil de quien las hizo.</p>
          </div>

          <Press
            scale={0.98}
            className="btn-danger mt-8 w-full"
            onClick={async () => {
              if (await confirmDialog('¿Salir del espacio compartido?', { message: 'Los datos se quedarán en este móvil como tuyos, pero dejarán de sincronizarse.', confirm: 'Salir' })) run(leaveHousehold, 'Has salido del espacio');
            }}
          >
            Salir del espacio compartido
          </Press>
        </>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] bg-surface p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><UserMultiple size={24} /></span>
            <p className="mt-3 font-serif text-[26px] leading-tight">Gastos en común, en tiempo real</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink2">Creas un espacio con tus datos e invitas a tu pareja. Los dos veis y apuntáis lo mismo: carteras, categorías, presupuestos y préstamos.</p>
            <Press scale={0.97} disabled={busy} onClick={() => run(async () => { await createHousehold(); }, 'Espacio creado')} className="btn-ink mt-4 w-full">
              {busy ? 'Creando…' : 'Crear espacio e invitar'}
            </Press>
          </motion.div>

          <p className="eyebrow px-1 pb-2 pt-7">¿Te han invitado?</p>
          <div className="flex gap-2">
            <input className="field text-center font-serif text-[24px] uppercase tracking-[0.2em]" placeholder="CÓDIGO" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <Press scale={0.94} disabled={busy || code.length < 6} onClick={join} className="btn-accent shrink-0 disabled:opacity-40">Unirme</Press>
          </div>
          <p className="px-1 pt-2 text-[13px] text-ink3">Al unirte, tus datos actuales se guardan en tu copia de la nube y pasas a ver los del espacio.</p>
        </>
      )}
    </Page>
  );
}

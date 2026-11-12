import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Share, UserMultiple } from '@carbon/icons-react';
import { currentUser, onUser, signInWithGoogle, type CloudUser } from '../cloud';
import { createHousehold, joinHousehold, leaveHousehold, lookupInvite, memberName, partnerName, setWalletShared } from '../sync';
import { useHousehold } from '../useHousehold';
import { useData } from '../store';
import { useNav } from '../nav';
import { fmt, walletBalances } from '../lib';
import { Page, Press, Tile, confirmDialog, spring, toast } from '../components/ui';

export const inviteLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?unirse=${code}`;

/** En pareja: conectáis vuestros Eco y cada uno elige qué carteras comparte. */
export function Couple({ code: initialCode }: { code?: string }) {
  const nav = useNav();
  const h = useHousehold();
  const { wallets, txs } = useData();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => onUser(setUser), []);

  const connected = !!h && h.members.length > 1;
  const partner = partnerName() ?? 'tu pareja';
  const me = currentUser()?.uid;
  const balances = walletBalances(wallets, txs);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      const msg = e as { code?: string; message: string };
      alert(msg.code === 'permission-denied' ? 'Firebase ha rechazado la operación. Revisa que las reglas de Firestore estén publicadas.' : msg.message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return alert('El código tiene 6 caracteres.');
    await run(async () => {
      await lookupInvite(c);
      const ok = await confirmDialog('¿Conectar con tu pareja?', {
        message: 'Tus datos no cambian. Solo empezarás a ver las carteras que tu pareja decida compartir contigo, y tú podrás compartir las tuyas.',
        confirm: 'Conectar',
        destructive: false
      });
      if (!ok) return;
      await joinHousehold(c);
      localStorage.removeItem('eco:pendingJoin');
      toast('Conectados');
    });
  }

  async function toggle(id: number, name: string, on: boolean) {
    const ok = await confirmDialog(on ? `¿Compartir «${name}» con ${partner}?` : `¿Dejar de compartir «${name}»?`, {
      message: on
        ? `${partner} verá esta cartera y todos sus movimientos (también los de antes), y podrá apuntar en ella.`
        : `${partner} dejará de verla. En tu móvil se queda todo.`,
      confirm: on ? 'Compartir' : 'Dejar de compartir',
      destructive: !on
    });
    if (ok) run(() => setWalletShared(id, on), on ? `«${name}» compartida` : 'Ya no se comparte');
  }

  async function share(c: string) {
    const text = `Conecta tu Eco con el mío para compartir gastos: ${inviteLink(c)}\nCódigo: ${c}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Eco en pareja', text }); return; } catch { /* cancelado */ }
    }
    await navigator.clipboard?.writeText(text);
    toast('Enlace copiado');
  }

  const mine = wallets.filter((w) => !w.shared || !w.owner || w.owner === me);
  const theirs = wallets.filter((w) => w.shared && w.owner && w.owner !== me);

  return (
    <Page title="En pareja" eyebrow="Carteras compartidas" onBack={nav.pop}>
      {!user ? (
        <div className="rounded-[24px] bg-surface p-5">
          <p className="font-serif text-[24px] leading-tight">Primero, entra con Google</p>
          <p className="mt-1.5 text-[14px] text-ink2">Para compartir entre dos móviles, cada uno necesita su cuenta.</p>
          <Press scale={0.97} disabled={busy} onClick={() => run(signInWithGoogle)} className="btn-ink mt-4 w-full">Continuar con Google</Press>
        </div>
      ) : !h ? (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] bg-surface p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><UserMultiple size={24} /></span>
            <p className="mt-3 font-serif text-[26px] leading-tight">Comparte solo lo común</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink2">
              Conecta tu Eco con el de tu pareja y elige qué carteras compartís (por ejemplo, «Cuenta común»). Lo que apuntéis en ellas os sale a los dos al momento. El resto sigue siendo solo tuyo.
            </p>
            <Press scale={0.97} disabled={busy} onClick={() => run(createHousehold, 'Invitación creada')} className="btn-ink mt-4 w-full">
              {busy ? 'Creando…' : 'Invitar a mi pareja'}
            </Press>
          </motion.div>

          <p className="eyebrow px-1 pb-2 pt-7">¿Tu pareja ya te ha invitado?</p>
          <div className="flex gap-2">
            <input className="field text-center font-serif text-[24px] uppercase tracking-[0.2em]" placeholder="CÓDIGO" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <Press scale={0.94} disabled={busy || code.length < 6} onClick={join} className="btn-accent shrink-0 disabled:opacity-40">Conectar</Press>
          </div>
        </>
      ) : (
        <>
          {/* Con quién */}
          <div className="flex items-center gap-3 rounded-[24px] bg-surface p-4">
            <div className="flex -space-x-2">
              {h.members.map((m) => (
                h.photos?.[m]
                  ? <img key={m} src={h.photos[m]} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full ring-[3px] ring-surface" />
                  : <span key={m} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-paper ring-[3px] ring-surface">{(h.names[m] || '?')[0]}</span>
              ))}
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-semibold">{connected ? `Conectado con ${partner}` : 'Esperando a tu pareja'}</p>
              <p className="text-[13px] text-ink3">{connected ? 'Las carteras compartidas se sincronizan solas' : 'Envíale el código para conectar'}</p>
            </div>
          </div>

          {!connected && (
            <div className="mt-3 rounded-[24px] bg-ink p-5 text-paper">
              <p className="text-[13px] opacity-60">Código para tu pareja</p>
              <p className="mt-1 font-serif text-[44px] tracking-[0.12em]">{h.code}</p>
              <p className="text-[13px] opacity-70">Que abra el enlace, o en su Eco: Ajustes → En pareja → escribe el código.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Press scale={0.96} onClick={() => share(h.code)} className="btn bg-paper px-3 text-[14px] text-ink"><Share size={18} /> Enviar</Press>
                <Press scale={0.96} onClick={async () => { await navigator.clipboard?.writeText(h.code); toast('Código copiado'); }} className="btn bg-paper/10 px-3 text-[14px]"><Copy size={18} /> Copiar</Press>
              </div>
            </div>
          )}

          {connected && (
            <>
              <p className="eyebrow px-1 pb-2 pt-6">Tus carteras · toca para compartir</p>
              <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
                {mine.map((w) => (
                  <Press key={w.id} scale={0.99} disabled={busy} onClick={() => toggle(w.id!, w.name, !w.shared)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <Tile icon={w.icon} color={w.color} size={36} />
                    <span className="flex-1">
                      <span className="block text-[15px] font-medium">{w.name}</span>
                      <span className="block text-[12px] text-ink3">{w.shared ? `Compartida con ${partner}` : 'Solo tú'}</span>
                    </span>
                    <span className={`flex h-[28px] w-[46px] items-center rounded-full p-[3px] transition-colors ${w.shared ? 'bg-accent' : 'bg-ink/15'}`}>
                      <motion.span layout transition={spring} className={`h-[22px] w-[22px] rounded-full bg-white shadow ${w.shared ? 'ml-auto' : ''}`} />
                    </span>
                  </Press>
                ))}
              </div>

              <p className="eyebrow px-1 pb-2 pt-6">Te comparte {partner}</p>
              {theirs.length ? (
                <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
                  {theirs.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                      <Tile icon={w.icon} color={w.color} size={36} />
                      <span className="flex-1">
                        <span className="block text-[15px] font-medium">{w.name}</span>
                        <span className="block text-[12px] text-ink3">Compartida por {memberName(w.owner)}</span>
                      </span>
                      <span className="num text-[18px]">{fmt(balances.get(w.id!) ?? 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[22px] bg-surface px-4 py-4 text-[14px] text-ink3">{partner} aún no ha compartido ninguna cartera contigo.</p>
              )}
            </>
          )}

          <Press
            scale={0.98}
            className="btn-danger mt-8 w-full"
            onClick={async () => {
              if (await confirmDialog('¿Desconectar?', { message: 'Las carteras compartidas se quedan en tu móvil como tuyas, pero dejan de sincronizarse.', confirm: 'Desconectar' })) run(leaveHousehold, 'Desconectado');
            }}
          >
            Desconectar
          </Press>
        </>
      )}

      <HowItWorks />
    </Page>
  );
}

const FAQ: [string, string][] = [
  ['¿Cómo funciona?', 'Cada uno tiene su Eco con sus carteras. Al conectaros, cada uno elige qué carteras comparte. Esas carteras (y todo lo que se apunte en ellas) aparecen en los dos móviles. Las demás siguen siendo privadas.'],
  ['Un ejemplo', 'Creas «Cuenta común» y la compartes. Tú apuntas ahí el Mercadona; tu pareja apunta la luz. Los dos veis ambos gastos y el mismo saldo. Tu «Banco» personal no lo ve nadie más.'],
  ['¿Cómo se conecta?', 'Uno pulsa «Invitar a mi pareja» y le envía el enlace o el código. La otra persona lo abre, entra con su Google y pulsa «Conectar». Nadie pierde ni mezcla sus datos.'],
  ['¿Cómo comparto una cartera?', 'Aquí mismo, tocando el interruptor de la cartera, o en la propia cartera (Inicio → Carteras → Gestionar).'],
  ['¿Y las categorías?', 'Cada uno conserva las suyas. Si tu pareja apunta un gasto en «Restaurantes», en tu móvil va a tu «Restaurantes» (si no la tienes, se crea).'],
  ['¿Puedo apuntar algo privado en una cartera común?', 'Sí: al apuntar, activa «Solo para mí». Ojo: tu pareja no lo verá, pero su saldo de esa cartera no le cuadrará con el tuyo.'],
  ['¿Se actualiza solo?', 'Sí, en unos segundos. Sin conexión se guarda y se envía cuando vuelva la cobertura.'],
  ['¿Y si dejo de compartir o me desconecto?', 'Tu pareja deja de ver esa cartera. En tu móvil se queda todo como estaba.']
];

function HowItWorks() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mt-8">
      <p className="eyebrow px-1 pb-2">Cómo funciona</p>
      <div className="divide-hair overflow-hidden rounded-[22px] bg-surface">
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <Press scale={0.99} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
              <span className="text-[15px] font-medium">{q}</span>
              <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="text-[20px] leading-none text-ink3">+</motion.span>
            </Press>
            {open === i && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="px-4 pb-4 text-[14px] leading-relaxed text-ink2">{a}</motion.p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

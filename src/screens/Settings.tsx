import { useEffect, useRef, useState, type ReactNode } from 'react';
import { backupNow, cloudEnabled, cloudInfo, onUser, restoreFromCloud, signInWithGoogle, signOut, type CloudUser } from '../cloud';
import { motion } from 'framer-motion';
import { ChevronRight } from '@carbon/icons-react';
import { setSetting, type AppSettings } from '../db';
import { exportBackup, exportCSV, importBackup, wipeAll } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { Group, LargeTitle, Logo, Press, Segmented, Tile, confirmDialog, spring, toast } from '../components/ui';

function Row({ icon, color, label, detail, onClick, right }: { icon: string; color: string; label: string; detail?: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <Press scale={0.98} onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3 text-left">
      <Tile icon={icon} color={color} size={34} />
      <span className="flex-1 text-[16px]">{label}</span>
      {detail && <span className="text-[14px] text-ink3">{detail}</span>}
      {right ?? <ChevronRight size={16} className="text-ink3" />}
    </Press>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={`flex h-[30px] w-[50px] items-center rounded-full p-[3px] transition-colors ${on ? 'bg-pos' : 'bg-ink/15'}`}>
      <motion.span layout transition={spring} className={`h-6 w-6 rounded-full bg-white shadow ${on ? 'ml-auto' : ''}`} />
    </span>
  );
}

export function Settings() {
  const { settings, txs } = useData();
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <LargeTitle title="Ajustes" />
      <div className="px-5">
        {!standalone && (
          <div className="mb-2 rounded-[22px] bg-ink p-5 text-paper">
            <p className="font-serif text-[24px] leading-tight">Instálala en el iPhone</p>
            <p className="mt-1.5 text-[14px] opacity-70">En Safari, toca Compartir y luego «Añadir a pantalla de inicio». Se abrirá a pantalla completa, como cualquier app.</p>
          </div>
        )}

        <Account />

        <p className="eyebrow px-1 pb-2 pt-6">Organizar</p>
        <Group>
          <Row icon="wallet" color="#4F6D8F" label="Carteras" onClick={() => nav.push({ name: 'wallets' })} />
          <Row icon="tag" color="#C99A2E" label="Categorías" onClick={() => nav.push({ name: 'categories' })} />
          <Row icon="piggy" color="#C0627A" label="Presupuestos" onClick={() => nav.push({ name: 'budgets' })} />
          <Row icon="repeat" color="#2F7A78" label="Repeticiones" onClick={() => nav.push({ name: 'recurring' })} />
          <Row icon="people" color="#5A5A9E" label="Préstamos y personas" onClick={() => nav.push({ name: 'people' })} />
          <Row icon="book" color="#A86F4C" label="Ver la bienvenida y el tutorial" onClick={() => setSetting('onboarded', false)} />
        </Group>

        <p className="eyebrow px-1 pb-2 pt-6">Preferencias</p>
        <Group>
          <Row icon="star" color="#8A4F7D" label="Ocultar cifras" onClick={() => setSetting('privacy', !settings.privacy)} right={<Switch on={!!settings.privacy} />} />
          <div className="px-4 py-4">
            <p className="mb-2.5 text-[15px]">Tema</p>
            <Segmented<AppSettings['theme']> id="theme" value={settings.theme} onChange={(v) => setSetting('theme', v)} options={[{ value: 'system', label: 'Automático' }, { value: 'light', label: 'Papel' }, { value: 'dark', label: 'Tinta' }]} />
          </div>
          <label className="flex items-center gap-3.5 px-4 py-3">
            <Tile icon="calendar" color="#5A5A9E" size={34} />
            <span className="flex-1">
              <span className="block text-[16px]">El mes empieza el día</span>
              <span className="block text-[13px] text-ink3">Pon el día que cobras para ver de nómina a nómina</span>
            </span>
            <select className="rounded-xl bg-ink/[0.06] px-3 py-2 text-[16px] font-semibold outline-none" value={settings.monthStartDay} onChange={(e) => setSetting('monthStartDay', Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3.5 px-4 py-3">
            <Tile icon="currency" color="#7C8B3A" size={34} />
            <span className="flex-1 text-[16px]">Moneda</span>
            <select className="rounded-xl bg-ink/[0.06] px-3 py-2 text-[16px] font-semibold outline-none" value={settings.currency} onChange={(e) => setSetting('currency', e.target.value)}>
              {['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'COP', 'CLP'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </Group>

        <p className="eyebrow px-1 pb-2 pt-6">Tus datos</p>
        <Group>
          <Row icon="app" color="#C4572E" label="Importar desde Soldi u otra app" onClick={() => nav.push({ name: 'import' })} />
          <Row icon="receipt" color="#5E8C6A" label="Exportar a Excel (CSV)" detail={`${txs.length} mov.`} onClick={() => run(exportCSV, 'CSV exportado')} />
          <Row icon="package" color="#A86F4C" label="Hacer copia de seguridad" onClick={() => run(exportBackup, 'Copia guardada')} />
          <Row icon="undo" color="#6B6760" label="Restaurar una copia" onClick={() => fileRef.current?.click()} />
        </Group>
        <p className="px-1 pt-2 text-[13px] text-ink3">Todo se guarda solo en este iPhone. Haz una copia de vez en cuando y guárdala en Archivos o iCloud Drive.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!(await confirmDialog('¿Restaurar esta copia?', { message: 'Se reemplazarán todos los datos actuales.', confirm: 'Restaurar' }))) return;
            run(() => importBackup(f), 'Copia restaurada');
          }}
        />

        <Press
          scale={0.98}
          className="btn-danger mt-8 w-full"
          onClick={async () => {
            if (await confirmDialog('¿Borrar todos los datos?', { message: 'No se puede deshacer. Haz antes una copia de seguridad.', confirm: 'Borrar todo' })) wipeAll();
          }}
        >
          Borrar todos los datos
        </Press>
        <div className="mt-10 flex justify-center"><Logo size={44} /></div>
        <p className="mt-2 text-center font-serif text-[18px] text-ink3">Eco</p>
        <p className="text-center text-[12px] text-ink3">versión 0.3</p>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Cuenta de Google: copia automática en la nube y restaurar en otro móvil. */
function Account() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => onUser(setUser), []);
  useEffect(() => {
    if (user) cloudInfo().then((i) => setSaved(i?.savedAt ?? null)).catch(() => {});
  }, [user]);

  if (!cloudEnabled) {
    return import.meta.env.DEV ? (
      <div className="rounded-[22px] border-[1.5px] border-dashed border-ink/20 p-4 text-[13px] text-ink3">
        Para activar «Entrar con Google», crea <code>.env.local</code> con la configuración de Firebase (mira <code>.env.example</code>).
      </div>
    ) : null;
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="rounded-[24px] bg-surface p-5">
        <p className="font-serif text-[24px] leading-tight">Tus datos, a salvo</p>
        <p className="mt-1.5 text-[14px] text-ink2">Entra con tu cuenta de Google y guardaremos una copia en la nube cada vez que cambies algo. Si cambias de móvil, lo recuperas todo.</p>
        <Press scale={0.97} disabled={busy} onClick={() => act(signInWithGoogle)} className="mt-4 flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-raised text-[16px] font-semibold shadow-[0_1px_3px_rgb(var(--shadow)/0.15),inset_0_0_0_1px_rgb(var(--line)/0.08)]">
          <GoogleG /> Continuar con Google
        </Press>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] bg-surface">
      <div className="flex items-center gap-3.5 p-4">
        {user.photo ? <img src={user.photo} alt="" className="h-12 w-12 rounded-full" referrerPolicy="no-referrer" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-[20px] font-semibold text-paper">{user.name[0]}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{user.name}</p>
          <p className="truncate text-[13px] text-ink3">{user.email}</p>
        </div>
      </div>
      <div className="divide-hair border-t hair">
        <Row icon="package" color="#5E8C6A" label="Copia en la nube" detail={saved ? ago(saved) : 'nunca'} onClick={() => act(async () => setSaved(await backupNow()), 'Copia guardada en la nube')} right={<span className="text-[14px] font-semibold text-accent">{busy ? '…' : 'Guardar'}</span>} />
        <Row
          icon="undo"
          color="#4F6D8F"
          label="Recuperar desde la nube"
          onClick={async () => {
            if (await confirmDialog('¿Recuperar la copia de la nube?', { message: 'Se reemplazarán los datos de este móvil por los de la copia.', confirm: 'Recuperar' })) act(restoreFromCloud, 'Datos recuperados');
          }}
        />
        <Row icon="people" color="#6B6760" label="Cerrar sesión" onClick={() => act(signOut)} right={<span />} />
      </div>
    </div>
  );
}

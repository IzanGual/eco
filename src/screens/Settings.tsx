import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from '@carbon/icons-react';
import { setSetting, type AppSettings } from '../db';
import { exportBackup, exportCSV, importBackup, wipeAll } from '../lib';
import { useData } from '../store';
import { useNav } from '../nav';
import { Group, LargeTitle, Press, Segmented, Tile, confirmDialog, spring, toast } from '../components/ui';

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

        <p className="eyebrow px-1 pb-2 pt-6">Organizar</p>
        <Group>
          <Row icon="wallet" color="#4F6D8F" label="Carteras" onClick={() => nav.push({ name: 'wallets' })} />
          <Row icon="tag" color="#C99A2E" label="Categorías" onClick={() => nav.push({ name: 'categories' })} />
          <Row icon="piggy" color="#C0627A" label="Presupuestos" onClick={() => nav.push({ name: 'budgets' })} />
          <Row icon="repeat" color="#2F7A78" label="Repeticiones" onClick={() => nav.push({ name: 'recurring' })} />
          <Row icon="people" color="#5A5A9E" label="Préstamos y personas" onClick={() => nav.push({ name: 'people' })} />
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
        <p className="mt-8 text-center font-serif text-[18px] text-ink3">Eco</p>
        <p className="text-center text-[12px] text-ink3">versión 0.2</p>
      </div>
    </div>
  );
}

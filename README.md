# Eco: control de gastos

App propia de gastos para iPhone, sin App Store, sin límites y sin pagos. Es una **PWA**: una web que se instala en la pantalla de inicio y funciona sin conexión.

Funciones planificadas: [FUNCIONES.md](FUNCIONES.md).

## Qué tiene la v0.1

- Gastos, ingresos y transferencias, con categorías y subcategorías, nota y foto del ticket
- Movimientos futuros («Próximos») y repeticiones (diaria, semanal, mensual o anual) que se crean solas
- Carteras ilimitadas, con saldo inicial; se pueden archivar u ordenar
- Presupuestos diarios, semanales, mensuales o anuales, generales o por categoría, con aviso al 80 % y gasto diario recomendado
- Estadísticas por semana, mes o año: barras, tarta por categoría con detalle de subcategorías y comparación con el periodo anterior
- Buscador de movimientos
- Mes de nómina a nómina (el mes puede empezar cualquier día)
- Exportar a CSV (Excel), copia de seguridad y restaurarla
- Modo claro y oscuro

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173 (también accesible desde el móvil en la misma wifi)
npm run build    # genera dist/ para publicar
```

## Instalar en el iPhone

1. Publicar la carpeta `dist/` en un hosting con HTTPS (Cloudflare Pages, Vercel o Netlify; todos gratis).
2. En el iPhone, abrir la URL en **Safari** → **Compartir** → **Añadir a pantalla de inicio**.

> Los datos se guardan **en cada iPhone** (IndexedDB). La sincronización entre los dos llega en la fase 2 (Supabase).
> Mientras tanto, conviene hacer copias desde Ajustes.

### Atajo para apuntar rápido

La app abre directamente el formulario con:
- `https://TU-URL/?nuevo=gasto`
- `https://TU-URL/?nuevo=ingreso`
- `https://TU-URL/?nuevo=transferencia`

Puedes crear un Atajo de iOS «Abrir URL» y ponerlo en la pantalla de bloqueo o en el botón de Acción.

## Tecnología

React 18, TypeScript, Vite, Tailwind, Dexie (IndexedDB) y vite-plugin-pwa.

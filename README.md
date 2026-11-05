# Eco: control de gastos

App propia de gastos para iPhone, sin App Store, sin límites y sin pagos. Es una **PWA**: una web que se instala en la pantalla de inicio y funciona sin conexión.

Funciones planificadas: [FUNCIONES.md](FUNCIONES.md).

## Qué tiene

- Gastos, ingresos y transferencias, con categorías y subcategorías, nota y foto del ticket
- Movimientos futuros («Próximos») y repeticiones (diaria, semanal, mensual o anual) que se crean solas
- Carteras ilimitadas, con saldo inicial; se pueden archivar u ordenar
- Presupuestos diarios, semanales, mensuales o anuales, generales o por categoría, con aviso al 80 % y gasto diario recomendado
- Estadísticas por semana, mes o año: barras, tarta por categoría con detalle de subcategorías y comparación con el periodo anterior
- Buscador de movimientos
- Mes de nómina a nómina (el mes puede empezar cualquier día)
- Exportar a CSV (Excel), copia de seguridad y restaurarla
- Modo claro («Papel») y oscuro («Tinta»), y modo privacidad que difumina las cifras
- Préstamos con personas («Mamá te debe 150 €»), sin contar como gasto ni ingreso, y gastos compartidos («alguien te debe una parte»)
- Resúmenes semanales y mensuales en formato historia
- Importar CSV desde Soldi, Excel o el banco (detecta columnas, crea categorías y salta duplicados)

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

### Desde Apple Pay (en preparación)

Los Atajos de iOS tienen una automatización **«Transacción»** que se dispara al pagar con Apple Pay.
La app ya acepta `?nuevo=gasto&importe=12,50&nota=Mercadona` y rellena el formulario (y adivina la categoría por la nota).
Pero iOS abre esos enlaces en Safari, no en la app instalada, y cada una guarda sus datos aparte. Para que el apunte
llegue solo hace falta la sincronización en la nube (fase 2).

## Probar con datos de ejemplo

Solo en desarrollo: abre `http://localhost:5173/?demo`. **Borra los datos locales** y carga dos meses de ejemplo.

## Tecnología

React 18, TypeScript, Vite, Tailwind, Dexie (IndexedDB) y vite-plugin-pwa.

# Nuestra app de gastos: lista de funciones

Referencia: **Soldi** (App Store id 6739777905, versión 1.3.0, oct 2026), una app de un solo desarrollador.
Fuentes: su ficha de la App Store (España), las notas de versión y las reseñas públicas.
Objetivo: que tenga **todo lo que tu novia usa de Soldi**, con flujos parecidos y **sin límites ni pagos**, y con mejoras nuestras.

> Leyenda: ✅ Soldi lo tiene (confirmado en su ficha) · 💰 de pago en Soldi · ❓ por confirmar en la grabación · ⭐ mejora nuestra

---

## 1. Lo básico (MVP: la primera versión)

### Movimientos
- ✅ Añadir **gasto** o **ingreso** a mano, rápido (el teclado se abre directamente en el importe)
- ✅ Categoría + **subcategoría**
- ✅ **Nota** en cada movimiento
- ✅ **Foto adjunta** (un ticket, una factura)
- ✅ **Movimientos futuros** en un filtro "Próximos" que no cuentan en las estadísticas hasta que llega su fecha
- ✅ **Recurrentes** (alquiler, Netflix, nómina…)
- ⭐ Buscar y filtrar por texto, importe, fecha, categoría o cartera
- ⭐ Duplicar un movimiento con un toque

### Categorías
- ✅ Categorías y subcategorías personalizables
- ✅ Icono o emoji, con buscador
- ✅ Selector de categoría en cuadrícula
- ⭐ Colores por categoría y reordenar arrastrando

### Carteras / cuentas
- ✅ **Varias carteras** (efectivo, banco, viajes, ahorro…)
- ✅ **Transferencias** entre carteras
- ✅ Al borrar una cartera, mover sus movimientos a otra
- 💰❓ Parece que la versión gratis limita el número de carteras → ⭐ **ilimitadas**

### Presupuestos
- ✅ Presupuestos **diarios, semanales, mensuales o anuales**, con barra de progreso
- ✅ Límites de gasto
- ⭐ Presupuesto **por categoría** y aviso al llegar al 80 % o al 100 %
- ⭐ **Ciclo personalizado** (p. ej. del día de cobro al siguiente). Lo piden en las reseñas de Soldi.

### Estadísticas
- ✅ Gráfico de **barras** por semana, mes o año
- ✅ **Tarta** por categoría y subcategoría, que se abre al tocarla
- ✅ **Ingreso neto** y flujo de caja
- ✅ **Informe mensual**: flujo de caja, top categorías, días registrados, estado de las carteras
- ⭐ Comparar este mes con el anterior y con la media

### General
- ✅ Modo claro y oscuro
- ✅ Varias **divisas**, con tipo de cambio
- ✅ Exportar a **CSV** (en las reseñas dicen que en Soldi no funciona) → ⭐ CSV y **Excel**, siempre disponible
- ✅ Borrar movimientos o todos los datos desde Ajustes
- ⭐ **Copia de seguridad** (exportar e importar todos los datos)
- ⭐ Bloqueo con código o Face ID (en la PWA, con passkey)

---

## 2. Para usarla los dos (fase 2)

- ✅ **Gastos compartidos** invitando a otra persona (en Soldi no queda claro cómo funciona; ❓ ver en la grabación)
- ✅ **Deudores**: quién te debe dinero
- ⭐ **Cuenta de pareja de verdad**: los dos veis las mismas carteras en tiempo real (Supabase)
- ⭐ Elegir quién pagó y repartir 50/50 o en %, con "**quién debe a quién**" calculado solo (tipo Splitwise)
- ⭐ Carteras privadas y carteras compartidas

---

## 3. Extras (fase 3)

- ✅ Widgets en la pantalla de inicio y acceso rápido desde la pantalla de bloqueo
  → En una PWA no se pueden hacer widgets. Alternativa: un **Atajo de iOS** en la pantalla de bloqueo o en el botón de Acción que abra "nuevo gasto".
- 💰 "Enviar a ChatGPT" los últimos 30 días (de pago en Soldi) → ⭐ **Análisis con IA** integrado y gratis
- ⭐ **Apunte automático con Apple Pay**: una automatización de Atajos ("Transacción") manda el importe y el comercio a la app
- ⭐ **Importar el extracto del banco** (CSV o Excel) con detección de duplicados y categorización automática
- ⭐ Objetivos de ahorro (p. ej. "Viaje a Japón: 1.200 / 3.000 €")
- ✅ Notificaciones → ⭐ recordatorio diario "¿has apuntado tus gastos?" y avisos de presupuesto

---

## 4. Qué mirar en la grabación de pantalla ❓

Al grabar, que tu novia **cuente en voz alta** lo que hace y por qué. Hay que fijarse sobre todo en:

1. [ ] Cómo añade un gasto paso a paso (es **lo más importante**: debe ser igual de rápido o más)
2. [ ] La pantalla de inicio: qué ve nada más abrir la app
3. [ ] Las categorías y subcategorías que tiene creadas (capturas de la lista completa)
4. [ ] Cuántas carteras usa y cuáles
5. [ ] Si usa presupuestos y cómo los ve
6. [ ] Las estadísticas y el informe mensual que mira
7. [ ] Gastos compartidos o deudores: ¿los usa? ¿cómo funciona el invitar?
8. [ ] Qué toca y le sale el **muro de pago** (esto es lo que nos interesa mejorar)
9. [ ] Si usa los widgets
10. [ ] Qué echa de menos o le molesta

**Muy importante:** antes de cambiar, exportar sus datos de Soldi (CSV) para importarlos en nuestra app y no perder el historial. Si la exportación no funciona, buscaremos otra forma.

---

## 5. Decisiones técnicas (propuesta)

- **Tipo de app:** PWA (web instalable en el iPhone desde Safari → "Añadir a pantalla de inicio")
- **Tecnología:** React + TypeScript + Vite + Tailwind
- **Datos:** primero locales (IndexedDB, funciona sin conexión); en la fase 2, sincronización entre los dos con Supabase (gratis)
- **Hosting:** Cloudflare Pages o Vercel (gratis, con HTTPS)
- **Diseño:** flujos parecidos a Soldi para que se sienta como en casa, pero con **estilo visual propio** (sin su logo, iconos ni diseño exacto)

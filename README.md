# Control de Gastos — Frontend

App en React + Vite + Tailwind, conectada a tu proyecto Supabase (`PersonalFinance`).

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar la conexión a Supabase

```bash
cp .env.example .env
```

Editá `.env` y completá `VITE_SUPABASE_ANON_KEY` con la clave pública de tu proyecto
(Panel de Supabase → Project Settings → API → `anon` `public`). La URL ya viene
completa (`https://ksdxazgbaqulhnrjzbeb.supabase.co`).

Esta clave es pública y segura de exponer en el frontend: el acceso real está
protegido por Row Level Security en la base (solo usuarios logueados pueden
leer o escribir).

## 3. Correr en desarrollo

```bash
npm run dev
```

Abrí la URL que muestra la terminal (por defecto `http://localhost:5173`).
Iniciá sesión con el usuario que creaste en Supabase Authentication → Users.

## 4. Compilar para producción

```bash
npm run build
```

Genera la carpeta `dist/` lista para subir a Vercel, Netlify, Cloudflare Pages,
o cualquier hosting de archivos estáticos.

## Estructura

```
src/
  lib/
    supabaseClient.js   - cliente de Supabase (usa las env vars)
    AuthContext.jsx     - sesion y login/logout
    api.js              - todas las consultas a la base (tablas y vistas)
    format.js           - formato de moneda y utilidades de mes (AAAAMM)
  components/
    MonthSwitcher.jsx   - selector de mes reutilizable
    StatCard.jsx        - tarjeta de metrica del dashboard
  pages/
    Login.jsx
    Dashboard.jsx       - semaforo, totales del mes, grafico por categoria
    Movimientos.jsx     - alta y listado de movimientos (pagos unicos)
    Cuotas.jsx          - alta y listado de compras en cuotas
    Presupuesto.jsx     - objetivo vs real por categoria
```

## Cómo se relaciona con la base

- **Movimientos** y **Compras en Cuotas** son las únicas tablas donde la app
  escribe directamente.
- El **Dashboard** y **Presupuesto** solo leen de las vistas `vw_resumen_categoria`
  y `vw_deuda_futura` — todo el cálculo de cuotas mes a mes ya está resuelto
  en la base, la app no reimplementa esa lógica.
- Agregar una tarjeta o categoría nueva se hace en el panel de Supabase
  (tablas `medios_pago` / `categorias`) o directamente por SQL — no requiere
  tocar el código de la app, porque los `<select>` del formulario se
  completan solos desde esas tablas.

## Pendiente / ideas para seguir

- El **tipo de cambio** se carga mes a mes desde el Dashboard; si un mes no
  tiene TC cargado, los importes en USD (como Ahorro) no se convierten a ARS
  en los resúmenes.
- No hay pantalla para agregar categorías/medios de pago nuevos desde la UI
  todavía — por ahora se agregan desde el panel de Supabase (Table Editor).
- Se podría sumar edición de movimientos (hoy solo se puede borrar y volver
  a cargar).

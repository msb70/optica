# Optilux — Sistema SaaS de gestión de ópticas (MVP)

Multi-compañía · multi-sucursal · POS + Caja · Cliente 360 · Examen/RX · Cotización → Venta · Órdenes de laboratorio · Stock · RMA · Intercompany · Dashboards · Cola de sincronización Zoho.

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query · PWA |
| Backend | **Nhost** (Postgres 16 + Hasura GraphQL + Auth) · proyecto `uisspsyswrtvnkgneuwl` · región `eu-central-1` |
| Lógica de negocio | Funciones y triggers PL/pgSQL (`create_sale`, `convert_quote`, `close_cash_session`, `transfer_send/receive`, cola Zoho, auditoría) |
| Analítica | Vistas SQL (`v_kpi_branch_month`, `v_funnel_month`, `v_sales_by_seller`, `v_alerts`, …) |
| Despliegue | Render (static site) → https://optica-ocui.onrender.com · Nhost se despliega desde `nhost/` al hacer push |

## Estructura

```
nhost/
  nhost.toml                       # configuración del proyecto Nhost (Hasura, Auth, Postgres)
  migrations/default/
    1758000000000_init/            # esquema completo (31 tablas, 9 vistas, funciones, triggers)
    1758000001000_seed/            # datos de demostración (6 meses de operación, 3 compañías, 5 sucursales)
  metadata/                        # metadata Hasura: tracking, relaciones, permisos rol `user`, funciones expuestas
src/
  lib/        nhost.ts (cliente), auth.tsx, app.tsx (compañía/sucursal/caja), format.ts, types.ts
  components/ Layout, ui, charts, RxTable
  pages/      Dashboard, POS, Caja, Clientes, ClienteDetalle, Agenda, Examenes, Cotizaciones, Ordenes, Stock, RMA, Intercompany, Reportes, Zoho, Configuracion, Login
scripts/
  gen_seed.py         genera la migración de datos semilla (determinista)
  gen_metadata.py     genera la metadata Hasura desde el esquema Postgres
  check_queries.mjs   valida todas las queries GraphQL del frontend contra Hasura
  screenshots.py      smoke test + capturas de todas las pantallas (Playwright)
  e2e.py              flujo completo: venta → orden lab → cotización → caja → examen → traspaso
```

## Puesta en marcha

```bash
npm ci
cp .env.example .env.local        # producción: solo VITE_NHOST_SUBDOMAIN / VITE_NHOST_REGION
npm run dev                       # http://localhost:5173
npm run build && npm start        # build + servidor estático con fallback SPA (Render)
```

Primer acceso: en la pantalla de login pulsa **Regístrate** (email + contraseña ≥ 8). Un usuario sin ficha de personal opera como administrador. Para vincular un login con una ficha de personal, pon su email en *Configuración → Personal*.

### Desarrollo local sin Nhost Auth
Con un Hasura local (ver `scripts/`), define en `.env.local`:
```
VITE_DEV_GRAPHQL_URL=http://localhost:8080/v1/graphql
VITE_DEV_ADMIN_SECRET=localsecret
```
El frontend salta el login y usa `x-hasura-role: user`. **Nunca** definas estas variables en producción.

## Base de datos (Nhost)

El proyecto Nhost está conectado a este repositorio: cada push a la rama de despliegue aplica `nhost/migrations` y `nhost/metadata`. Para regenerar:

```bash
python3 scripts/gen_seed.py       # → nhost/migrations/default/1758000001000_seed/up.sql
python3 scripts/gen_metadata.py   # → nhost/metadata (requiere Postgres local con el esquema aplicado)
```

Modelo: `companies → branches → staff`; `customers` (360: `exams`, `appointments`, `quotes`, `sales`, `lab_orders`, `rmas`, `customer_notes`); `products` / `stock` / `stock_movements` / `transfers` / `stock_counts`; `cash_sessions` / `cash_movements` / `payments`; `intercompany_rules` / `intercompany_docs`; `zoho_sync_queue`; `audit_log`.

Separación por compañía: numeración fiscal (`next_number`), impuestos (`companies.tax_rate`), caja, stock por sucursal, reportes y `zoho_org_id` propios.

## Integración Zoho (siguiente fase)

Todo evento relevante ya queda encolado en `zoho_sync_queue` con clave idempotente (`sale:<id>:books`, `customer:<id>:crm`, `quote:<id>:crm`, `ic:<id>:invoice|bill`). Falta el **worker** (Nhost Function o escenario Make) que:
1. toma jobs `pendiente` / `error` con `next_retry_at <= now()`,
2. llama a Books / Inventory / CRM con OAuth 2.0 usando el `zoho_org_id` de la compañía,
3. escribe `zoho_id` y marca `ok`, o `error` con backoff exponencial (`attempts`, `last_error`).

La operación diaria nunca depende de Zoho: si falla, la cola reintenta.

## Limitaciones conocidas del MVP
- Permisos Hasura: el rol `user` tiene acceso completo; el filtrado por compañía/sucursal (X-Hasura-Company-Id / Branch-Id vía claims) queda para la siguiente iteración.
- Notificación de entrega (WhatsApp/SMS) simulada: se registra `notified_at`, no se envía mensaje.
- Impresión de RX/etiquetas/reporte de caja usa el diálogo de impresión del navegador.
- Código de barras: la búsqueda del POS acepta lectura por escáner (Enter), sin generación de EAN.

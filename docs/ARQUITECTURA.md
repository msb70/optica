# Documento de arquitectura — Optilux MVP

## 1. Resumen ejecutivo
Plataforma SaaS para Grupo Optilux que sustituye al sistema legacy tipo Gesvision. Arquitectura *serverless* sobre Nhost (Postgres + Hasura + Auth) con frontend React PWA. Toda la lógica transaccional crítica (venta, caja, stock, intercompany, cola Zoho, auditoría) vive en la base de datos como funciones y triggers, lo que garantiza consistencia aunque el cliente o la integración fallen. El MVP cubre el alcance de 8–12 semanas del RFP salvo el worker de Zoho, cuya cola de eventos ya está operativa.

## 2. Modelo organizacional
```
Grupo (tenant único)
└── companies (razón social · impuestos · numeración fiscal · zoho_org_id)
    └── branches (sucursal · caja · stock · metas)
        └── staff (rol · comisión · descuento máximo)
```
Aislamiento estricto por compañía en: numeración (`next_number(company, kind)` con bloqueo de fila), impuestos (`companies.tax_rate`), sesiones de caja (`cash_sessions.company_id/branch_id`), stock (`stock(product, branch)`), reportes (vistas agrupadas por `company_id/branch_id`) y sincronización Zoho (`zoho_sync_queue.company_id` + `companies.zoho_org_id`).

## 3. Componentes
| Componente | Responsabilidad |
|---|---|
| **Postgres 16** | Esquema, integridad, funciones de negocio, triggers de stock/pagos/cola/auditoría, vistas analíticas |
| **Hasura** | API GraphQL (queries, mutaciones, agregaciones), permisos por rol, exposición de funciones como mutaciones |
| **Nhost Auth** | Email/contraseña, JWT RS256, roles `user`/`me`; vinculación a `staff.user_id` o por email |
| **Frontend React** | POS, caja, clínica, stock, intercompany, reportes; TanStack Query para caché e invalidación; PWA instalable |
| **Cola Zoho** | Tabla `zoho_sync_queue` alimentada por triggers; worker externo (fase 2) |

## 4. Flujos clave
**Venta rápida** — `create_sale(company, branch, customer, seller, items jsonb, payments jsonb, discount, quote, cash_session)`: numera, calcula impuesto por compañía, descuenta stock, registra pagos múltiples/parciales (efectivo, tarjeta, transferencia, Yappy, vale, saldo cliente), carga deuda al saldo del cliente, calcula comisión, convierte la cotización y abre orden de laboratorio si hay lentes. Encola `sale.completed` → Books (Invoice + Payment) e Inventory.

**Caja** — apertura con fondo; `close_cash_session(session, counted)` calcula efectivo esperado (fondo + efectivo cobrado + ingresos − egresos), diferencia y genera alerta de descuadre (`v_alerts`).

**Examen** — RX en JSONB (`od/oi: sph, cyl, axis, add, va`, `pd`). Trigger `exams_transpose_trg` calcula la transposición y la próxima revisión (6 meses niño / 12 adulto).

**Intercompany** — `intercompany_rules` por relación (margen, plazo, automático en traspaso/orden). `transfer_send` entre sucursales de distinta compañía emite `intercompany_docs` con CxC (emisora) / CxP (receptora) y encola Invoice + Bill en Books de cada organización. Auditoría completa en `audit_log`.

## 5. Event-driven e idempotencia
Cada trigger inserta en `zoho_sync_queue` con `idempotency_key` única (`ON CONFLICT DO NOTHING`). El worker procesa por `status`/`next_retry_at`, con `attempts` y `last_error` para backoff. Los reintentos y descartes manuales están en la pantalla *Sync Zoho*.

## 6. Seguridad y permisos
- Auth por Nhost; JWT con `x-hasura-user-id` y rol `user`.
- MVP: permisos de tabla completos para `user`. Fase 2: claims `x-hasura-company-id` / `x-hasura-branch-id` desde `staff` y filtros por fila en Hasura; roles Hasura `admin/gerente/vendedor/optometrista/cajero/almacen`.
- Auditoría clínica y financiera por trigger genérico (`audit_trg`) en ventas, exámenes, cajas, pagos e intercompany.

## 7. Despliegue
- **Nhost**: repo conectado; `nhost/migrations` + `nhost/metadata` se aplican en cada push. `nhost.toml` fija Hasura `v2.48.10-ce` y desactiva la verificación de email para el MVP.
- **Render**: sitio estático (`npm ci && npm run build`, publica `dist`, rewrite `/* → /index.html`). URL: https://optica-ocui.onrender.com.

## 8. Riesgos y limitaciones
| Riesgo | Mitigación |
|---|---|
| Permisos amplios del rol `user` en MVP | Fase 2: filtros por fila con claims de compañía/sucursal |
| Worker Zoho pendiente | La cola ya es idempotente; el worker es un consumidor sin estado (Nhost Function o Make) |
| OAuth Zoho por compañía (3 org_id) | Tabla `companies` ya modela un `org_id` por razón social; los refresh tokens irán en secrets de Nhost |
| Concurrencia en numeración fiscal | `next_number` bloquea la fila de `companies` (`FOR UPDATE`) |
| Stock negativo por ventas simultáneas | MVP permite; fase 2: check constraint + reserva en cotización |
| Datos de demostración en producción | Migración `seed` separada; se puede revertir con su `down.sql` |

## 9. Próximos pasos
1. Worker Zoho (Books/Inventory/CRM) con OAuth 2.0 por compañía y webhooks de vuelta (pagos registrados en Books).
2. Permisos por fila y roles Hasura; vinculación obligatoria login ↔ personal.
3. Impresión térmica de tickets y etiquetas EAN; notificación WhatsApp real (Meta Cloud API).
4. Reservas de stock desde cotización y stock mínimo por sucursal/categoría.
5. Cierre de caja automático nocturno con envío del reporte diario por email.

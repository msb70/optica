# Optilux en Supabase

Proyecto: `dyjhhnplmzhptomwkrxq` · región **eu-west-1 (Irlanda)** · Postgres 17.

## Base de datos
- `migrations/` en orden: esquema base → requerimientos → clientes del grupo → permisos y funciones → **RLS** (generada con `scripts/gen_rls.py`) → integración (updated_at, lápidas, CRM, facturación, reservas, Optilab, credenciales de API) → ajustes.
- Datos de demostración: `nhost/migrations/default/1758000001000_seed/up.sql` (generado por `scripts/gen_seed.py`) y después `seed/99_ajustes.sql` (rellenos + mueve las fechas para que terminen ayer). `scripts/split_seed.py` lo parte en trozos de <1 MB si hace falta.
- Seguridad: todas las tablas con RLS. Lectura según ópticas del usuario; escritura según permiso de módulo (`editar`). Las funciones de negocio (`create_sale`, `deliver_quote`…) son SECURITY DEFINER y validan con `require_access`. `insert_nested` (cabecera + líneas) es SECURITY INVOKER y respeta las RLS.
- Pruebas: `scripts/test_local_supabase.sh` crea una BD local que imita Supabase y `scripts/test_rls.py` ejecuta 21 casos de permisos.

## Edge Functions
| Función | JWT | Uso |
|---|---|---|
| `invitar` | sí | Invitación por correo de una ficha de Personal (requiere Configuración · editar) |
| `api` | no (clave propia `opx_…`) | API /v1 para CRM, Zoho y canales. OpenAPI en `/functions/v1/api/v1/openapi.json` |
| `optilab-enviar` | sí | Envío de pedidos a Optilab. **Sin conectar**: necesita los secretos `OPTILAB_API_URL` y `OPTILAB_API_KEY` y una salida con IP fija |

## Configuración pendiente en el panel de Supabase
- Authentication → URL Configuration: Site URL `https://optica-ocui.onrender.com` y añadir `https://optica-ocui.onrender.com/**` a Redirect URLs.
- Authentication → Sign In / Providers: desactivar "Allow new users to sign up" (las cuentas se crean por invitación).
- Authentication → SMTP: SMTP propio (el correo integrado de Supabase tiene un límite muy bajo por hora).
- Authentication → Password security: activar la protección de contraseñas filtradas.

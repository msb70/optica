# Acceso bloqueado al cargar organización — 8 de octubre de 2026

Proyecto: `uisspsyswrtvnkgneuwl`, región `eu-central-1`.

La pestaña autenticada recibe `Could not verify JWT: JWTExpired` de GraphQL.
La renovación en `/v1/token` devuelve HTTP 500. Los logs de Nhost Auth muestran:

```
could not get user by refresh token
ERROR: column "otp_attempts" does not exist (SQLSTATE 42703)
```

Auth está configurado en `0.52.0`, pero `auth.users` carece de las columnas
`otp_attempts`, `new_phone_number` y `pending_sms_deanonymize_options`.
Son parte de las migraciones oficiales 23–25 de esa versión:

- https://github.com/nhost/nhost/tree/130fea5ea3345ba923172637de7b3134479b3836/services/auth/go/migrations/postgres

El editor SQL usa `nhost_hasura`, sin pertenencia a `nhost_auth_admin`.
El intento de añadir las columnas falla con `must be owner of table users`;
la sentencia es atómica y no modificó el esquema.

## Reparación necesaria en Nhost

Solicitar que Nhost ejecute las migraciones internas oficiales de Auth que faltan,
con el rol propietario del esquema, y compruebe su compatibilidad con Auth 0.52.0.
No basta con reaplicar las migraciones de negocio de este repositorio.

Texto preparado para soporte (pendiente de enviar):

> El proyecto uisspsyswrtvnkgneuwl, eu-central-1, usa Auth 0.52.0. POST /v1/token
> devuelve 500 y los logs indican `column "otp_attempts" does not exist`.
> auth.users tampoco tiene new_phone_number ni pending_sms_deanonymize_options.
> El editor SQL opera como nhost_hasura y rechaza ALTER TABLE con `must be owner
> of table users`. Necesitamos aplicar las migraciones internas pendientes de
> Auth con el propietario del esquema y verificar la renovación de sesión.

Verificar después en la pestaña autenticada: `/v1/token` responde correctamente,
la consulta `Org` devuelve compañías y la pantalla principal aparece.

## Corrección del frontend

La pantalla distingue carga, error y ausencia de compañías. Permite reintentar
o volver al login incluso si el cierre de sesión remoto falla.
Regresión: `node scripts/org_loading_test.mjs`.

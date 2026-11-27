#!/bin/bash
# Recrea una BD local que imita a Supabase (roles anon/authenticated, auth.uid) y carga migraciones + datos de demo.
set -e
P="psql -h /tmp -p ${PGPORT:-5433} -U postgres -v ON_ERROR_STOP=1 -q"
DB=${1:-sb}
cd "$(dirname "$0")/.."
$P -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
$P -d $DB <<'SQL'
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, encrypted_password text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $f$;
create function auth.role() returns text language sql stable as $f$ select current_setting('request.jwt.claims', true)::jsonb->>'role' $f$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL
for f in supabase/migrations/*.sql; do $P -d $DB -f $f 2>&1 | grep -v NOTICE || true; done
for f in supabase/seed/[0-9]*_datos.sql supabase/seed/99_ajustes.sql; do $P -d $DB -f $f 2>&1 | grep -v NOTICE || true; done
echo "BD $DB lista"

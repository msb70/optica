-- 24-11-2026 · Permisos aplicados en la base de datos (Hasura) + invitaciones por correo
-- Vistas de acceso del usuario autenticado; Hasura las usa en los filtros por fila con X-Hasura-User-Id.

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS invited_at timestamptz;

CREATE OR REPLACE VIEW public.user_branch_access AS
SELECT s.user_id, b.id AS branch_id, b.company_id
FROM public.staff s
JOIN public.branches b ON (
  s.role = 'admin' OR s.all_branches OR b.id = s.branch_id
  OR EXISTS (SELECT 1 FROM public.staff_branches sb WHERE sb.staff_id = s.id AND sb.branch_id = b.id))
WHERE s.active AND s.user_id IS NOT NULL;

CREATE OR REPLACE VIEW public.user_company_access AS
SELECT DISTINCT user_id, company_id FROM public.user_branch_access;

CREATE OR REPLACE VIEW public.user_module_access AS
SELECT s.user_id, m.module,
  CASE WHEN s.role = 'admin' THEN 'editar'
       ELSE COALESCE(s.permissions ->> m.module, rp.access, 'ninguno') END AS access
FROM public.staff s
CROSS JOIN (SELECT DISTINCT module FROM public.role_permissions) m
LEFT JOIN public.role_permissions rp ON rp.role = s.role AND rp.module = m.module
WHERE s.active AND s.user_id IS NOT NULL;

-- Vincular las cuentas existentes con su ficha de Personal por email
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email') THEN
    UPDATE public.staff s SET user_id = u.id
    FROM auth.users u
    WHERE s.user_id IS NULL AND s.email IS NOT NULL AND lower(u.email::text) = lower(s.email)
      AND NOT EXISTS (SELECT 1 FROM public.staff x WHERE x.user_id = u.id);
    -- usuario de demostración → ficha del administrador
    UPDATE public.staff s SET user_id = u.id
    FROM auth.users u
    WHERE lower(u.email::text) = 'demo@optilux.test' AND s.id = (SELECT id FROM public.staff WHERE role = 'admin' AND user_id IS NULL ORDER BY created_at LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM public.staff x WHERE x.user_id = u.id);
  END IF;
END $$;

-- ===== Las funciones del servidor también respetan ópticas y permisos =====
-- Con Supabase la sesión llega en el JWT (auth.uid / auth.role).
CREATE OR REPLACE FUNCTION public.require_access(p_branch_id uuid, p_modules text[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  -- Solo se comprueba para usuarios de la app (rol authenticated). Service role y procesos internos no.
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN; END IF;
  v_uid := auth.uid();
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = v_uid AND branch_id = p_branch_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta óptica' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = v_uid AND module = ANY(p_modules) AND access = 'editar') THEN
    RAISE EXCEPTION 'Tu usuario no tiene permiso de edición en este módulo' USING ERRCODE = '22023';
  END IF;
END; $$;

DO $$
DECLARE r record; def text; chk text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('create_sale',        'p_branch_id', 'ARRAY[''pos'',''cajon'',''cotizaciones'',''caja'']'),
    ('convert_quote',      '(SELECT branch_id FROM public.quotes WHERE id = p_quote_id)', 'ARRAY[''pos'',''cotizaciones'']'),
    ('close_cash_session', '(SELECT branch_id FROM public.cash_sessions WHERE id = p_session_id)', 'ARRAY[''caja'']'),
    ('transfer_send',      '(SELECT from_branch_id FROM public.transfers WHERE id = p_transfer_id)', 'ARRAY[''stock'',''intercompany'']'),
    ('transfer_receive',   '(SELECT to_branch_id FROM public.transfers WHERE id = p_transfer_id)', 'ARRAY[''stock'',''intercompany'']'),
    ('add_quote_deposit',  '(SELECT branch_id FROM public.quotes WHERE id = p_quote_id)', 'ARRAY[''cotizaciones'',''cajon'']'),
    ('deliver_quote',      '(SELECT branch_id FROM public.quotes WHERE id = p_quote_id)', 'ARRAY[''cotizaciones'',''cajon'']'),
    ('rma_replace',        '(SELECT branch_id FROM public.rmas WHERE id = p_rma_id)', 'ARRAY[''rma'']')
  ) AS t(fn, branch_expr, mods) LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF def IS NULL OR position('require_access' IN def) > 0 THEN CONTINUE; END IF;
    chk := format(E'\n  PERFORM public.require_access(%s, %s);', r.branch_expr, r.mods);
    def := regexp_replace(def, '(\mBEGIN\M)', '\1' || chk);   -- primera aparición: inicio del cuerpo
    EXECUTE def;
  END LOOP;
END $$;

-- ===== Mensajes de error legibles: Hasura oculta los RAISE con código por defecto (P0001) =====
DO $$
DECLARE r record; def text; nd text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
           WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND p.prosrc ~ 'RAISE EXCEPTION' LOOP
    def := pg_get_functiondef(r.oid);
    -- añade USING ERRCODE a los RAISE EXCEPTION que no lo tienen
    nd := regexp_replace(def, '(RAISE EXCEPTION\s+''(?:[^'']|'''')*''(?:\s*,[^;]*?)?)\s*;', '\1 USING ERRCODE = ''22023'';', 'g');
    nd := replace(nd, 'USING ERRCODE = ''22023'' USING ERRCODE = ''22023''', 'USING ERRCODE = ''22023''');
    IF nd <> def THEN EXECUTE nd; END IF;
  END LOOP;
END $$;

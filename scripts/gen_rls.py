"""Genera la migración de seguridad por filas (RLS) de Supabase a partir de las mismas reglas que tenía Hasura.
Uso: python3 scripts/gen_rls.py  (escribe supabase/migrations/20261127000006_rls.sql)"""
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'supabase/migrations/20261127000006_rls.sql')

ANY = 'private.has_any_access()'
B = 'private.has_branch(branch_id)'
C = 'private.has_company(company_id)'
IC = '(private.has_company(issuer_company_id) OR private.has_company(receiver_company_id))'
TR = '(private.has_branch(from_branch_id) OR private.has_branch(to_branch_id))'
def P(parent, fk, cond):  # condición heredada de la tabla padre
    import re
    c = re.sub(r'\b(branch_id|issuer_company_id|receiver_company_id|from_branch_id|to_branch_id|company_id)\b', r'p.\1', cond)
    return f'EXISTS (SELECT 1 FROM public.{parent} p WHERE p.id = {fk} AND {c})'
CLI = ('clientes', 'pos', 'examenes', 'agenda', 'cotizaciones', 'cajon', 'rma')
# tabla: (lectura, alcance de escritura, módulos con edición, se puede borrar)
R = {
 'companies': (ANY, None, ('configuracion',), False),
 'branches': (ANY, None, ('configuracion',), False),
 'staff': (ANY, None, ('configuracion',), False),
 'staff_branches': (ANY, None, ('configuracion',), True),
 'role_permissions': (ANY, None, ('configuracion',), False),
 'consult_reasons': (ANY, None, ('configuracion',), True),
 'suppliers': (ANY, None, ('configuracion', 'stock'), False),
 'products': (ANY, None, ('configuracion', 'stock'), False),
 'customers': (ANY, None, CLI, False),
 'customer_notes': (ANY, None, CLI, True),
 'exams': (ANY, B, ('examenes',), False),
 'appointments': (B, B, ('agenda', 'clientes', 'examenes'), False),
 'quotes': (B, B, ('cotizaciones', 'cajon', 'examenes', 'pos'), False),
 'quote_items': (P('quotes', 'quote_id', B),) * 2 + (('cotizaciones', 'examenes'), True),
 'quote_deposits': (P('quotes', 'quote_id', B),) * 2 + (('cotizaciones', 'cajon'), False),
 'sales': (B, B, ('pos', 'cajon', 'cotizaciones', 'caja', 'ordenes'), False),
 'sale_items': (P('sales', 'sale_id', B),) * 2 + (('pos',), False),
 'payments': (P('sales', 'sale_id', B),) * 2 + (('pos', 'caja', 'cajon'), False),
 'cash_sessions': (B, B, ('caja', 'pos'), False),
 'cash_movements': (P('cash_sessions', 'cash_session_id', B),) * 2 + (('caja',), False),
 'vouchers': (C, C, ('pos', 'caja', 'rma'), False),
 'lab_orders': (B, B, ('ordenes', 'cajon', 'rma'), False),
 'lab_order_events': (P('lab_orders', 'lab_order_id', B),) * 2 + (('ordenes', 'cajon', 'rma'), False),
 'stock': (ANY, B, ('stock',), False),
 'stock_movements': (B, B, ('stock',), False),
 'stock_counts': (B, B, ('stock',), False),
 'stock_count_items': (P('stock_counts', 'count_id', B),) * 2 + (('stock',), True),
 'transfers': (TR, TR, ('stock', 'intercompany'), False),
 'transfer_items': (P('transfers', 'transfer_id', TR),) * 2 + (('stock', 'intercompany'), True),
 'rmas': (B, B, ('rma',), False),
 'rma_events': (P('rmas', 'rma_id', B),) * 2 + (('rma',), False),
 'intercompany_docs': (IC, IC, ('intercompany',), False),
 'intercompany_items': (P('intercompany_docs', 'doc_id', IC),) * 2 + (('intercompany',), True),
 'intercompany_rules': (IC, IC, ('intercompany',), False),
 'audit_log': (C, None, (), False),
 'zoho_sync_queue': (C, C, ('zoho',), False),
}
VIEWS = ['v_sales_daily', 'v_kpi_branch_month', 'v_sales_by_seller', 'v_sales_by_source', 'v_funnel_month',
         'v_stock_alerts', 'v_alerts', 'v_customer_timeline', 'v_intercompany_balance']

o = ["""-- 27-11-2026 · Seguridad por filas (RLS) en Supabase. Generado por scripts/gen_rls.py — no editar a mano.
-- Mismas reglas que tenían los permisos de Hasura: ópticas del usuario + permiso por módulo (ninguno/ver/editar).

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_any_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid()) $$;
CREATE OR REPLACE FUNCTION private.has_branch(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = auth.uid() AND branch_id = p) $$;
CREATE OR REPLACE FUNCTION private.has_company(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_company_access WHERE user_id = auth.uid() AND company_id = p) $$;
CREATE OR REPLACE FUNCTION private.can_edit(p text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid() AND module = ANY(p) AND access = 'editar') $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

-- Las vistas de acceso solo se usan dentro de las funciones anteriores
REVOKE ALL ON public.user_branch_access, public.user_company_access, public.user_module_access FROM anon, authenticated;

-- Nadie sin sesión lee ni escribe nada
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;
"""]
for t, (read, scope, mods, can_delete) in R.items():
    o.append(f'\n-- {t}\nALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;')
    o.append(f'DROP POLICY IF EXISTS leer ON public.{t};\nCREATE POLICY leer ON public.{t} FOR SELECT TO authenticated USING ({read});')
    for k in ('crear', 'editar', 'borrar'): o.append(f'DROP POLICY IF EXISTS {k} ON public.{t};')
    if mods:
        arr = "ARRAY[" + ",".join(f"'{m}'" for m in mods) + "]"
        w = f'(SELECT private.can_edit({arr}))' + (f' AND {scope}' if scope else '')
        o.append(f'CREATE POLICY crear ON public.{t} FOR INSERT TO authenticated WITH CHECK ({w});')
        o.append(f'CREATE POLICY editar ON public.{t} FOR UPDATE TO authenticated USING ({w}) WITH CHECK ({w});')
        if can_delete: o.append(f'CREATE POLICY borrar ON public.{t} FOR DELETE TO authenticated USING ({w});')
    priv = 'SELECT' + (', INSERT, UPDATE' if mods else '') + (', DELETE' if can_delete else '')
    o.append(f'REVOKE ALL ON public.{t} FROM authenticated;\nGRANT {priv} ON public.{t} TO authenticated;')

o.append('\n-- Vistas de informes: se evalúan con los permisos de quien consulta (aplican las RLS de las tablas)')
for v in VIEWS:
    o.append(f'ALTER VIEW public.{v} SET (security_invoker = true);\nREVOKE ALL ON public.{v} FROM authenticated;\nGRANT SELECT ON public.{v} TO authenticated;')

o.append("""
-- Funciones del servidor: se ejecutan como propietario (saltan RLS) pero validan óptica y módulo con require_access.
-- Las de disparador también, para poder escribir auditoría, existencias y cola de Zoho.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
           WHERE p.pronamespace = 'public'::regnamespace AND l.lanname IN ('plpgsql', 'sql')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, extensions', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, numeric, uuid, uuid, text),
  public.convert_quote(uuid, jsonb, uuid), public.transfer_send(uuid, uuid), public.transfer_receive(uuid, uuid),
  public.close_cash_session(uuid, numeric, uuid, text), public.add_quote_deposit(uuid, jsonb, uuid, uuid),
  public.deliver_quote(uuid, jsonb, uuid, uuid), public.rma_replace(uuid, uuid, boolean, uuid) TO authenticated;
""")
open(OUT, 'w').write('\n'.join(o) + '\n')
print('ok', OUT)

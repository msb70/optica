-- 27-11-2026 · Seguridad por filas (RLS) en Supabase. Generado por scripts/gen_rls.py — no editar a mano.
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


-- companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.companies;
CREATE POLICY leer ON public.companies FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.companies;
DROP POLICY IF EXISTS editar ON public.companies;
DROP POLICY IF EXISTS borrar ON public.companies;
CREATE POLICY crear ON public.companies FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.companies FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.companies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;

-- branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.branches;
CREATE POLICY leer ON public.branches FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.branches;
DROP POLICY IF EXISTS editar ON public.branches;
DROP POLICY IF EXISTS borrar ON public.branches;
CREATE POLICY crear ON public.branches FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.branches FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.branches FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.branches TO authenticated;

-- staff
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.staff;
CREATE POLICY leer ON public.staff FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.staff;
DROP POLICY IF EXISTS editar ON public.staff;
DROP POLICY IF EXISTS borrar ON public.staff;
CREATE POLICY crear ON public.staff FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.staff FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.staff FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff TO authenticated;

-- staff_branches
ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.staff_branches;
CREATE POLICY leer ON public.staff_branches FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.staff_branches;
DROP POLICY IF EXISTS editar ON public.staff_branches;
DROP POLICY IF EXISTS borrar ON public.staff_branches;
CREATE POLICY crear ON public.staff_branches FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.staff_branches FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY borrar ON public.staff_branches FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.staff_branches FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_branches TO authenticated;

-- role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.role_permissions;
CREATE POLICY leer ON public.role_permissions FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.role_permissions;
DROP POLICY IF EXISTS editar ON public.role_permissions;
DROP POLICY IF EXISTS borrar ON public.role_permissions;
CREATE POLICY crear ON public.role_permissions FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.role_permissions FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.role_permissions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.role_permissions TO authenticated;

-- consult_reasons
ALTER TABLE public.consult_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.consult_reasons;
CREATE POLICY leer ON public.consult_reasons FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.consult_reasons;
DROP POLICY IF EXISTS editar ON public.consult_reasons;
DROP POLICY IF EXISTS borrar ON public.consult_reasons;
CREATE POLICY crear ON public.consult_reasons FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY editar ON public.consult_reasons FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
CREATE POLICY borrar ON public.consult_reasons FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion'])));
REVOKE ALL ON public.consult_reasons FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consult_reasons TO authenticated;

-- suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.suppliers;
CREATE POLICY leer ON public.suppliers FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.suppliers;
DROP POLICY IF EXISTS editar ON public.suppliers;
DROP POLICY IF EXISTS borrar ON public.suppliers;
CREATE POLICY crear ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','stock'])));
CREATE POLICY editar ON public.suppliers FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion','stock']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','stock'])));
REVOKE ALL ON public.suppliers FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.suppliers TO authenticated;

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.products;
CREATE POLICY leer ON public.products FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.products;
DROP POLICY IF EXISTS editar ON public.products;
DROP POLICY IF EXISTS borrar ON public.products;
CREATE POLICY crear ON public.products FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','stock'])));
CREATE POLICY editar ON public.products FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion','stock']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','stock'])));
REVOKE ALL ON public.products FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;

-- customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.customers;
CREATE POLICY leer ON public.customers FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.customers;
DROP POLICY IF EXISTS editar ON public.customers;
DROP POLICY IF EXISTS borrar ON public.customers;
CREATE POLICY crear ON public.customers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma'])));
CREATE POLICY editar ON public.customers FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma']))) WITH CHECK ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma'])));
REVOKE ALL ON public.customers FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;

-- customer_notes
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.customer_notes;
CREATE POLICY leer ON public.customer_notes FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.customer_notes;
DROP POLICY IF EXISTS editar ON public.customer_notes;
DROP POLICY IF EXISTS borrar ON public.customer_notes;
CREATE POLICY crear ON public.customer_notes FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma'])));
CREATE POLICY editar ON public.customer_notes FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma']))) WITH CHECK ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma'])));
CREATE POLICY borrar ON public.customer_notes FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['clientes','pos','examenes','agenda','cotizaciones','cajon','rma'])));
REVOKE ALL ON public.customer_notes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;

-- exams
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.exams;
CREATE POLICY leer ON public.exams FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.exams;
DROP POLICY IF EXISTS editar ON public.exams;
DROP POLICY IF EXISTS borrar ON public.exams;
CREATE POLICY crear ON public.exams FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['examenes'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.exams FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['examenes'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['examenes'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.exams FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.exams TO authenticated;

-- appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.appointments;
CREATE POLICY leer ON public.appointments FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.appointments;
DROP POLICY IF EXISTS editar ON public.appointments;
DROP POLICY IF EXISTS borrar ON public.appointments;
CREATE POLICY crear ON public.appointments FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['agenda','clientes','examenes'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.appointments FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['agenda','clientes','examenes'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['agenda','clientes','examenes'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.appointments FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;

-- quotes
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.quotes;
CREATE POLICY leer ON public.quotes FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.quotes;
DROP POLICY IF EXISTS editar ON public.quotes;
DROP POLICY IF EXISTS borrar ON public.quotes;
CREATE POLICY crear ON public.quotes FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','cajon','examenes','pos'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.quotes FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['cotizaciones','cajon','examenes','pos'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','cajon','examenes','pos'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.quotes FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotes TO authenticated;

-- quote_items
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.quote_items;
CREATE POLICY leer ON public.quote_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.quote_items;
DROP POLICY IF EXISTS editar ON public.quote_items;
DROP POLICY IF EXISTS borrar ON public.quote_items;
CREATE POLICY crear ON public.quote_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','examenes'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.quote_items FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['cotizaciones','examenes'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','examenes'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
CREATE POLICY borrar ON public.quote_items FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['cotizaciones','examenes'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.quote_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;

-- quote_deposits
ALTER TABLE public.quote_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.quote_deposits;
CREATE POLICY leer ON public.quote_deposits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.quote_deposits;
DROP POLICY IF EXISTS editar ON public.quote_deposits;
DROP POLICY IF EXISTS borrar ON public.quote_deposits;
CREATE POLICY crear ON public.quote_deposits FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','cajon'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.quote_deposits FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['cotizaciones','cajon'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['cotizaciones','cajon'])) AND EXISTS (SELECT 1 FROM public.quotes p WHERE p.id = quote_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.quote_deposits FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_deposits TO authenticated;

-- sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.sales;
CREATE POLICY leer ON public.sales FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.sales;
DROP POLICY IF EXISTS editar ON public.sales;
DROP POLICY IF EXISTS borrar ON public.sales;
CREATE POLICY crear ON public.sales FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['pos','cajon','cotizaciones','caja','ordenes'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.sales FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['pos','cajon','cotizaciones','caja','ordenes'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['pos','cajon','cotizaciones','caja','ordenes'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.sales FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;

-- sale_items
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.sale_items;
CREATE POLICY leer ON public.sale_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.sale_items;
DROP POLICY IF EXISTS editar ON public.sale_items;
DROP POLICY IF EXISTS borrar ON public.sale_items;
CREATE POLICY crear ON public.sale_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['pos'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.sale_items FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['pos'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['pos'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.sale_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sale_items TO authenticated;

-- payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.payments;
CREATE POLICY leer ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.payments;
DROP POLICY IF EXISTS editar ON public.payments;
DROP POLICY IF EXISTS borrar ON public.payments;
CREATE POLICY crear ON public.payments FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja','cajon'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.payments FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['pos','caja','cajon'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja','cajon'])) AND EXISTS (SELECT 1 FROM public.sales p WHERE p.id = sale_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.payments FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;

-- cash_sessions
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.cash_sessions;
CREATE POLICY leer ON public.cash_sessions FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.cash_sessions;
DROP POLICY IF EXISTS editar ON public.cash_sessions;
DROP POLICY IF EXISTS borrar ON public.cash_sessions;
CREATE POLICY crear ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['caja','pos'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.cash_sessions FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['caja','pos'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['caja','pos'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.cash_sessions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;

-- cash_movements
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.cash_movements;
CREATE POLICY leer ON public.cash_movements FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.cash_sessions p WHERE p.id = cash_session_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.cash_movements;
DROP POLICY IF EXISTS editar ON public.cash_movements;
DROP POLICY IF EXISTS borrar ON public.cash_movements;
CREATE POLICY crear ON public.cash_movements FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['caja'])) AND EXISTS (SELECT 1 FROM public.cash_sessions p WHERE p.id = cash_session_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.cash_movements FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['caja'])) AND EXISTS (SELECT 1 FROM public.cash_sessions p WHERE p.id = cash_session_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['caja'])) AND EXISTS (SELECT 1 FROM public.cash_sessions p WHERE p.id = cash_session_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.cash_movements FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_movements TO authenticated;

-- vouchers
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.vouchers;
CREATE POLICY leer ON public.vouchers FOR SELECT TO authenticated USING (private.has_company(company_id));
DROP POLICY IF EXISTS crear ON public.vouchers;
DROP POLICY IF EXISTS editar ON public.vouchers;
DROP POLICY IF EXISTS borrar ON public.vouchers;
CREATE POLICY crear ON public.vouchers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja','rma'])) AND private.has_company(company_id));
CREATE POLICY editar ON public.vouchers FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['pos','caja','rma'])) AND private.has_company(company_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja','rma'])) AND private.has_company(company_id));
REVOKE ALL ON public.vouchers FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vouchers TO authenticated;

-- lab_orders
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.lab_orders;
CREATE POLICY leer ON public.lab_orders FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.lab_orders;
DROP POLICY IF EXISTS editar ON public.lab_orders;
DROP POLICY IF EXISTS borrar ON public.lab_orders;
CREATE POLICY crear ON public.lab_orders FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.lab_orders FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.lab_orders FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lab_orders TO authenticated;

-- lab_order_events
ALTER TABLE public.lab_order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.lab_order_events;
CREATE POLICY leer ON public.lab_order_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lab_orders p WHERE p.id = lab_order_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.lab_order_events;
DROP POLICY IF EXISTS editar ON public.lab_order_events;
DROP POLICY IF EXISTS borrar ON public.lab_order_events;
CREATE POLICY crear ON public.lab_order_events FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND EXISTS (SELECT 1 FROM public.lab_orders p WHERE p.id = lab_order_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.lab_order_events FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND EXISTS (SELECT 1 FROM public.lab_orders p WHERE p.id = lab_order_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['ordenes','cajon','rma'])) AND EXISTS (SELECT 1 FROM public.lab_orders p WHERE p.id = lab_order_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.lab_order_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lab_order_events TO authenticated;

-- stock
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.stock;
CREATE POLICY leer ON public.stock FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.stock;
DROP POLICY IF EXISTS editar ON public.stock;
DROP POLICY IF EXISTS borrar ON public.stock;
CREATE POLICY crear ON public.stock FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.stock FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.stock FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock TO authenticated;

-- stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.stock_movements;
CREATE POLICY leer ON public.stock_movements FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.stock_movements;
DROP POLICY IF EXISTS editar ON public.stock_movements;
DROP POLICY IF EXISTS borrar ON public.stock_movements;
CREATE POLICY crear ON public.stock_movements FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.stock_movements FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.stock_movements FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_movements TO authenticated;

-- stock_counts
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.stock_counts;
CREATE POLICY leer ON public.stock_counts FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.stock_counts;
DROP POLICY IF EXISTS editar ON public.stock_counts;
DROP POLICY IF EXISTS borrar ON public.stock_counts;
CREATE POLICY crear ON public.stock_counts FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.stock_counts FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.stock_counts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_counts TO authenticated;

-- stock_count_items
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.stock_count_items;
CREATE POLICY leer ON public.stock_count_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.stock_counts p WHERE p.id = count_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.stock_count_items;
DROP POLICY IF EXISTS editar ON public.stock_count_items;
DROP POLICY IF EXISTS borrar ON public.stock_count_items;
CREATE POLICY crear ON public.stock_count_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND EXISTS (SELECT 1 FROM public.stock_counts p WHERE p.id = count_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.stock_count_items FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock'])) AND EXISTS (SELECT 1 FROM public.stock_counts p WHERE p.id = count_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['stock'])) AND EXISTS (SELECT 1 FROM public.stock_counts p WHERE p.id = count_id AND private.has_branch(p.branch_id)));
CREATE POLICY borrar ON public.stock_count_items FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock'])) AND EXISTS (SELECT 1 FROM public.stock_counts p WHERE p.id = count_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.stock_count_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_items TO authenticated;

-- transfers
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.transfers;
CREATE POLICY leer ON public.transfers FOR SELECT TO authenticated USING ((private.has_branch(from_branch_id) OR private.has_branch(to_branch_id)));
DROP POLICY IF EXISTS crear ON public.transfers;
DROP POLICY IF EXISTS editar ON public.transfers;
DROP POLICY IF EXISTS borrar ON public.transfers;
CREATE POLICY crear ON public.transfers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND (private.has_branch(from_branch_id) OR private.has_branch(to_branch_id)));
CREATE POLICY editar ON public.transfers FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND (private.has_branch(from_branch_id) OR private.has_branch(to_branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND (private.has_branch(from_branch_id) OR private.has_branch(to_branch_id)));
REVOKE ALL ON public.transfers FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transfers TO authenticated;

-- transfer_items
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.transfer_items;
CREATE POLICY leer ON public.transfer_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transfers p WHERE p.id = transfer_id AND (private.has_branch(p.from_branch_id) OR private.has_branch(p.to_branch_id))));
DROP POLICY IF EXISTS crear ON public.transfer_items;
DROP POLICY IF EXISTS editar ON public.transfer_items;
DROP POLICY IF EXISTS borrar ON public.transfer_items;
CREATE POLICY crear ON public.transfer_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND EXISTS (SELECT 1 FROM public.transfers p WHERE p.id = transfer_id AND (private.has_branch(p.from_branch_id) OR private.has_branch(p.to_branch_id))));
CREATE POLICY editar ON public.transfer_items FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND EXISTS (SELECT 1 FROM public.transfers p WHERE p.id = transfer_id AND (private.has_branch(p.from_branch_id) OR private.has_branch(p.to_branch_id)))) WITH CHECK ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND EXISTS (SELECT 1 FROM public.transfers p WHERE p.id = transfer_id AND (private.has_branch(p.from_branch_id) OR private.has_branch(p.to_branch_id))));
CREATE POLICY borrar ON public.transfer_items FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['stock','intercompany'])) AND EXISTS (SELECT 1 FROM public.transfers p WHERE p.id = transfer_id AND (private.has_branch(p.from_branch_id) OR private.has_branch(p.to_branch_id))));
REVOKE ALL ON public.transfer_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_items TO authenticated;

-- rmas
ALTER TABLE public.rmas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.rmas;
CREATE POLICY leer ON public.rmas FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.rmas;
DROP POLICY IF EXISTS editar ON public.rmas;
DROP POLICY IF EXISTS borrar ON public.rmas;
CREATE POLICY crear ON public.rmas FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['rma'])) AND private.has_branch(branch_id));
CREATE POLICY editar ON public.rmas FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['rma'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['rma'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.rmas FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rmas TO authenticated;

-- rma_events
ALTER TABLE public.rma_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.rma_events;
CREATE POLICY leer ON public.rma_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.rmas p WHERE p.id = rma_id AND private.has_branch(p.branch_id)));
DROP POLICY IF EXISTS crear ON public.rma_events;
DROP POLICY IF EXISTS editar ON public.rma_events;
DROP POLICY IF EXISTS borrar ON public.rma_events;
CREATE POLICY crear ON public.rma_events FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['rma'])) AND EXISTS (SELECT 1 FROM public.rmas p WHERE p.id = rma_id AND private.has_branch(p.branch_id)));
CREATE POLICY editar ON public.rma_events FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['rma'])) AND EXISTS (SELECT 1 FROM public.rmas p WHERE p.id = rma_id AND private.has_branch(p.branch_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['rma'])) AND EXISTS (SELECT 1 FROM public.rmas p WHERE p.id = rma_id AND private.has_branch(p.branch_id)));
REVOKE ALL ON public.rma_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rma_events TO authenticated;

-- intercompany_docs
ALTER TABLE public.intercompany_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.intercompany_docs;
CREATE POLICY leer ON public.intercompany_docs FOR SELECT TO authenticated USING ((private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
DROP POLICY IF EXISTS crear ON public.intercompany_docs;
DROP POLICY IF EXISTS editar ON public.intercompany_docs;
DROP POLICY IF EXISTS borrar ON public.intercompany_docs;
CREATE POLICY crear ON public.intercompany_docs FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
CREATE POLICY editar ON public.intercompany_docs FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
REVOKE ALL ON public.intercompany_docs FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.intercompany_docs TO authenticated;

-- intercompany_items
ALTER TABLE public.intercompany_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.intercompany_items;
CREATE POLICY leer ON public.intercompany_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.intercompany_docs p WHERE p.id = doc_id AND (private.has_company(p.issuer_company_id) OR private.has_company(p.receiver_company_id))));
DROP POLICY IF EXISTS crear ON public.intercompany_items;
DROP POLICY IF EXISTS editar ON public.intercompany_items;
DROP POLICY IF EXISTS borrar ON public.intercompany_items;
CREATE POLICY crear ON public.intercompany_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND EXISTS (SELECT 1 FROM public.intercompany_docs p WHERE p.id = doc_id AND (private.has_company(p.issuer_company_id) OR private.has_company(p.receiver_company_id))));
CREATE POLICY editar ON public.intercompany_items FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['intercompany'])) AND EXISTS (SELECT 1 FROM public.intercompany_docs p WHERE p.id = doc_id AND (private.has_company(p.issuer_company_id) OR private.has_company(p.receiver_company_id)))) WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND EXISTS (SELECT 1 FROM public.intercompany_docs p WHERE p.id = doc_id AND (private.has_company(p.issuer_company_id) OR private.has_company(p.receiver_company_id))));
CREATE POLICY borrar ON public.intercompany_items FOR DELETE TO authenticated USING ((SELECT private.can_edit(ARRAY['intercompany'])) AND EXISTS (SELECT 1 FROM public.intercompany_docs p WHERE p.id = doc_id AND (private.has_company(p.issuer_company_id) OR private.has_company(p.receiver_company_id))));
REVOKE ALL ON public.intercompany_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intercompany_items TO authenticated;

-- intercompany_rules
ALTER TABLE public.intercompany_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.intercompany_rules;
CREATE POLICY leer ON public.intercompany_rules FOR SELECT TO authenticated USING ((private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
DROP POLICY IF EXISTS crear ON public.intercompany_rules;
DROP POLICY IF EXISTS editar ON public.intercompany_rules;
DROP POLICY IF EXISTS borrar ON public.intercompany_rules;
CREATE POLICY crear ON public.intercompany_rules FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
CREATE POLICY editar ON public.intercompany_rules FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id))) WITH CHECK ((SELECT private.can_edit(ARRAY['intercompany'])) AND (private.has_company(issuer_company_id) OR private.has_company(receiver_company_id)));
REVOKE ALL ON public.intercompany_rules FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.intercompany_rules TO authenticated;

-- audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.audit_log;
CREATE POLICY leer ON public.audit_log FOR SELECT TO authenticated USING (private.has_company(company_id));
DROP POLICY IF EXISTS crear ON public.audit_log;
DROP POLICY IF EXISTS editar ON public.audit_log;
DROP POLICY IF EXISTS borrar ON public.audit_log;
REVOKE ALL ON public.audit_log FROM authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- zoho_sync_queue
ALTER TABLE public.zoho_sync_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.zoho_sync_queue;
CREATE POLICY leer ON public.zoho_sync_queue FOR SELECT TO authenticated USING (private.has_company(company_id));
DROP POLICY IF EXISTS crear ON public.zoho_sync_queue;
DROP POLICY IF EXISTS editar ON public.zoho_sync_queue;
DROP POLICY IF EXISTS borrar ON public.zoho_sync_queue;
CREATE POLICY crear ON public.zoho_sync_queue FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['zoho'])) AND private.has_company(company_id));
CREATE POLICY editar ON public.zoho_sync_queue FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['zoho'])) AND private.has_company(company_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['zoho'])) AND private.has_company(company_id));
REVOKE ALL ON public.zoho_sync_queue FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zoho_sync_queue TO authenticated;

-- Vistas de informes: se evalúan con los permisos de quien consulta (aplican las RLS de las tablas)
ALTER VIEW public.v_sales_daily SET (security_invoker = true);
REVOKE ALL ON public.v_sales_daily FROM authenticated;
GRANT SELECT ON public.v_sales_daily TO authenticated;
ALTER VIEW public.v_kpi_branch_month SET (security_invoker = true);
REVOKE ALL ON public.v_kpi_branch_month FROM authenticated;
GRANT SELECT ON public.v_kpi_branch_month TO authenticated;
ALTER VIEW public.v_sales_by_seller SET (security_invoker = true);
REVOKE ALL ON public.v_sales_by_seller FROM authenticated;
GRANT SELECT ON public.v_sales_by_seller TO authenticated;
ALTER VIEW public.v_sales_by_source SET (security_invoker = true);
REVOKE ALL ON public.v_sales_by_source FROM authenticated;
GRANT SELECT ON public.v_sales_by_source TO authenticated;
ALTER VIEW public.v_funnel_month SET (security_invoker = true);
REVOKE ALL ON public.v_funnel_month FROM authenticated;
GRANT SELECT ON public.v_funnel_month TO authenticated;
ALTER VIEW public.v_stock_alerts SET (security_invoker = true);
REVOKE ALL ON public.v_stock_alerts FROM authenticated;
GRANT SELECT ON public.v_stock_alerts TO authenticated;
ALTER VIEW public.v_alerts SET (security_invoker = true);
REVOKE ALL ON public.v_alerts FROM authenticated;
GRANT SELECT ON public.v_alerts TO authenticated;
ALTER VIEW public.v_customer_timeline SET (security_invoker = true);
REVOKE ALL ON public.v_customer_timeline FROM authenticated;
GRANT SELECT ON public.v_customer_timeline TO authenticated;
ALTER VIEW public.v_intercompany_balance SET (security_invoker = true);
REVOKE ALL ON public.v_intercompany_balance FROM authenticated;
GRANT SELECT ON public.v_intercompany_balance TO authenticated;

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


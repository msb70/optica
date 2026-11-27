-- Ajustes tras cargar los datos de demostración:
-- 1) los mismos rellenos que hacen las migraciones (se cargan los datos después del esquema)
-- 2) las fechas de la demo se mueven para que terminen ayer
UPDATE public.products SET track_stock = false WHERE category IN ('lente','servicio') AND track_stock;
UPDATE public.branches SET zoho_tag = name WHERE zoho_tag IS NULL;
INSERT INTO public.staff_branches (staff_id, branch_id)
SELECT id, branch_id FROM public.staff WHERE branch_id IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE public.staff SET all_branches = true WHERE role = 'admin' AND NOT all_branches;

SET session_replication_role = replica;   -- sin disparadores mientras se mueven fechas
-- marca de última modificación coherente con los datos históricos
UPDATE public.appointments SET updated_at = created_at; UPDATE public.sales SET updated_at = sale_date;
UPDATE public.payments SET updated_at = created_at; UPDATE public.products SET updated_at = created_at;
UPDATE public.quote_deposits SET updated_at = created_at; UPDATE public.vouchers SET updated_at = created_at;
UPDATE public.staff SET updated_at = created_at; UPDATE public.branches SET updated_at = created_at;
UPDATE public.stock SET updated_at = COALESCE(last_count_at, now() - interval '1 day');
UPDATE public.lab_orders SET reference = number WHERE reference IS NULL;
DO $$
DECLARE r record; d int := current_date - date '2026-09-17';
BEGIN
  IF d = 0 THEN RETURN; END IF;
  FOR r IN SELECT c.table_name, string_agg(format('%I = %I + make_interval(days => %s)', c.column_name, c.column_name, d), ', ') AS sets
           FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.data_type IN ('date', 'timestamp with time zone', 'timestamp without time zone')
             AND NOT (c.table_name = 'customers' AND c.column_name = 'birth_date')
           GROUP BY c.table_name LOOP
    EXECUTE format('UPDATE public.%I SET %s', r.table_name, r.sets);
  END LOOP;
END $$;
SET session_replication_role = origin;

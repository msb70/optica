-- Requerimientos de la reunión con Grupo Optilux (23-11-2026)
-- Migración aditiva: no borra datos.

-- ===== R3 · Motivos de consulta configurables =====
CREATE TABLE IF NOT EXISTS public.consult_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,  -- null = todo el grupo
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.consult_reasons (name, sort)
SELECT x.name, x.ord FROM (VALUES ('Revisión anual',1),('Visión borrosa de lejos',2),('Visión borrosa de cerca',3),('Dolor de cabeza',4),('Fatiga visual por pantallas',5),('Renovación de lentes',6),('Control pediátrico',7),('Adaptación de lentes de contacto',8)) AS x(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.consult_reasons);

-- ===== R1 · Cliente identificado por teléfono =====
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_norm text GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), '')) STORED;
CREATE INDEX IF NOT EXISTS customers_phone_norm_idx ON public.customers(company_id, phone_norm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE phone_norm IS NOT NULL GROUP BY company_id, phone_norm HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON public.customers(company_id, phone_norm) WHERE phone_norm IS NOT NULL;
  END IF;
END $$;

-- ===== Parámetros por compañía: venta en cero (R6), anticipo mínimo (R4), garantías (R13) =====
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_deposit_pct numeric(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS warranty_frame_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS warranty_lens_months integer NOT NULL DEFAULT 12;

-- ===== R7 · Cristales y servicios sin stock =====
UPDATE public.products SET track_stock = false WHERE category IN ('lente','servicio') AND track_stock;

-- ===== R8 · Proveedores y referencia de proveedor =====
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  origin text NOT NULL DEFAULT 'local' CHECK (origin IN ('china','zona_libre','eeuu','local','otro')),
  contact text, phone text, email text, notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_ref text,
  ADD COLUMN IF NOT EXISTS warranty_months integer;   -- null = usa la de la compañía

-- ===== R11 · Zoho por sucursal =====
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS zoho_scope text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS zoho_org_id text,
  ADD COLUMN IF NOT EXISTS zoho_tag text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_zoho_scope_check') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_zoho_scope_check CHECK (zoho_scope IN ('global','propia'));
  END IF;
END $$;
UPDATE public.branches SET zoho_tag = name WHERE zoho_tag IS NULL;

-- ===== R12 · Sucursales asignadas por usuario =====
CREATE TABLE IF NOT EXISTS public.staff_branches (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, branch_id)
);
INSERT INTO public.staff_branches (staff_id, branch_id)
SELECT id, branch_id FROM public.staff WHERE branch_id IS NOT NULL ON CONFLICT DO NOTHING;

-- ===== R4 · Orden de trabajo con anticipo; la factura se emite al entregar =====
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.quotes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.quotes DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('abierta','seguimiento','abonada','aprobada','lista','convertida','perdida','vencida','anulada'));
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.payments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%method%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('efectivo','tarjeta','transferencia','yappy','vale','saldo_cliente','credito','anticipo'));
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.stock_movements'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%type%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (type IN ('compra','venta','traspaso_salida','traspaso_entrada','ajuste','conteo','devolucion','merma','garantia','carga_inicial'));
END $$;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS deposit_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE TABLE IF NOT EXISTS public.quote_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  cash_session_id uuid REFERENCES public.cash_sessions(id),
  method text NOT NULL CHECK (method IN ('efectivo','tarjeta','transferencia','yappy','vale','saldo_cliente')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reference text,
  voucher_id uuid REFERENCES public.vouchers(id),
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_deposits_quote_idx ON public.quote_deposits(quote_id);
CREATE INDEX IF NOT EXISTS quote_deposits_session_idx ON public.quote_deposits(cash_session_id);

ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.quote_deposits_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.quotes SET deposit_total = COALESCE((SELECT SUM(amount) FROM public.quote_deposits WHERE quote_id = COALESCE(NEW.quote_id, OLD.quote_id)),0)
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS quote_deposits_apply ON public.quote_deposits;
CREATE TRIGGER quote_deposits_apply AFTER INSERT OR UPDATE OR DELETE ON public.quote_deposits
  FOR EACH ROW EXECUTE FUNCTION public.quote_deposits_apply();

-- Registra un abono. Con el anticipo mínimo la cotización pasa a orden de trabajo (aprobada)
-- y, si lleva cristales, se genera la orden de laboratorio. Por debajo queda "abonada" (cajón: poco abono).
CREATE OR REPLACE FUNCTION public.add_quote_deposit(p_quote_id uuid, p_payments jsonb, p_cash_session_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL)
RETURNS SETOF public.quotes LANGUAGE plpgsql VOLATILE AS $$
DECLARE q record; pm jsonb; v_min numeric; v_dep numeric; v_exam uuid; v_lens boolean;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF q.status IN ('convertida','perdida','vencida','anulada') THEN RAISE EXCEPTION 'La cotización % está %', q.number, q.status; END IF;
  FOR pm IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments,'[]'::jsonb)) LOOP
    INSERT INTO public.quote_deposits (quote_id, cash_session_id, method, amount, reference, voucher_id, staff_id)
    VALUES (p_quote_id, p_cash_session_id, pm->>'method', (pm->>'amount')::numeric, pm->>'reference', (pm->>'voucher_id')::uuid, p_staff_id);
    IF pm->>'method' = 'vale' AND (pm->>'voucher_id') IS NOT NULL THEN
      UPDATE public.vouchers SET balance = balance - (pm->>'amount')::numeric,
        status = CASE WHEN balance - (pm->>'amount')::numeric <= 0 THEN 'usado' ELSE status END WHERE id = (pm->>'voucher_id')::uuid;
    END IF;
    IF pm->>'method' = 'saldo_cliente' THEN
      UPDATE public.customers SET balance = balance - (pm->>'amount')::numeric WHERE id = q.customer_id;
    END IF;
  END LOOP;
  SELECT deposit_total INTO v_dep FROM public.quotes WHERE id = p_quote_id;
  SELECT min_deposit_pct INTO v_min FROM public.companies WHERE id = q.company_id;
  IF v_dep >= round(q.total * COALESCE(v_min,50) / 100, 2) - 0.01 THEN
    UPDATE public.quotes SET status = CASE WHEN status IN ('aprobada','lista') THEN status ELSE 'aprobada' END,
      approved_at = COALESCE(approved_at, now()) WHERE id = p_quote_id;
    SELECT EXISTS(SELECT 1 FROM public.quote_items qi JOIN public.products p ON p.id = qi.product_id WHERE qi.quote_id = p_quote_id AND p.category = 'lente') INTO v_lens;
    IF v_lens AND NOT EXISTS (SELECT 1 FROM public.lab_orders WHERE quote_id = p_quote_id) THEN
      v_exam := COALESCE(q.exam_id, (SELECT id FROM public.exams WHERE customer_id = q.customer_id ORDER BY exam_date DESC LIMIT 1));
      INSERT INTO public.lab_orders (company_id, branch_id, quote_id, customer_id, exam_id, number, status, promised_at, lens_type)
      VALUES (q.company_id, q.branch_id, p_quote_id, q.customer_id, v_exam, public.next_number(q.company_id,'OL'), 'pendiente', CURRENT_DATE + 7,
              (SELECT string_agg(qi.description, ' + ') FROM public.quote_items qi JOIN public.products p ON p.id = qi.product_id WHERE qi.quote_id = p_quote_id AND p.category = 'lente'));
    END IF;
  ELSE
    UPDATE public.quotes SET status = 'abonada' WHERE id = p_quote_id AND status IN ('abierta','seguimiento');
  END IF;
  RETURN QUERY SELECT * FROM public.quotes WHERE id = p_quote_id;
END; $$;

-- Entrega: emite la factura con los artículos de la orden, aplica los anticipos y cobra el saldo.
CREATE OR REPLACE FUNCTION public.deliver_quote(p_quote_id uuid, p_payments jsonb, p_cash_session_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL)
RETURNS SETOF public.sales LANGUAGE plpgsql VOLATILE AS $$
DECLARE q record; v_items jsonb; v_pays jsonb; v_sale public.sales;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF q.status NOT IN ('aprobada','lista','abonada') THEN RAISE EXCEPTION 'La orden % no está en curso (%).', q.number, q.status; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty, 'unit_price', unit_price, 'discount_pct', discount_pct, 'description', description)), '[]'::jsonb)
    INTO v_items FROM public.quote_items WHERE quote_id = p_quote_id;
  v_pays := COALESCE(p_payments, '[]'::jsonb);
  IF q.deposit_total > 0 THEN
    v_pays := v_pays || jsonb_build_array(jsonb_build_object('method','anticipo','amount', q.deposit_total, 'reference', 'Anticipos ' || q.number));
  END IF;
  SELECT * INTO v_sale FROM public.create_sale(q.company_id, q.branch_id, q.customer_id, COALESCE(q.seller_id, p_staff_id), v_items, v_pays, q.discount, p_quote_id, p_cash_session_id, 'Entrega de orden ' || q.number);
  -- el anticipo ya se cobró en su día: no vuelve a contar en la caja de hoy
  UPDATE public.payments SET cash_session_id = NULL WHERE sale_id = v_sale.id AND method = 'anticipo';
  RETURN QUERY SELECT * FROM public.sales WHERE id = v_sale.id;
END; $$;

-- ===== R13 · Garantías y cambio de unidad en RMA =====
ALTER TABLE public.rmas
  ADD COLUMN IF NOT EXISTS warranty_part text,
  ADD COLUMN IF NOT EXISTS warranty_until date,
  ADD COLUMN IF NOT EXISTS in_warranty boolean,
  ADD COLUMN IF NOT EXISTS replacement_product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public.lab_orders(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rmas_warranty_part_check') THEN
    ALTER TABLE public.rmas ADD CONSTRAINT rmas_warranty_part_check CHECK (warranty_part IN ('armazon','lente','otro'));
  END IF;
END $$;

-- Cambio por otra unidad (sale de stock) y, opcionalmente, nueva orden de laboratorio para fabricar cristales
CREATE OR REPLACE FUNCTION public.rma_replace(p_rma_id uuid, p_product_id uuid, p_create_lab boolean DEFAULT false, p_staff_id uuid DEFAULT NULL)
RETURNS SETOF public.rmas LANGUAGE plpgsql VOLATILE AS $$
DECLARE r record; v_lab uuid; v_prod record;
BEGIN
  SELECT * INTO r FROM public.rmas WHERE id = p_rma_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Reclamo no encontrado'; END IF;
  IF p_product_id IS NOT NULL THEN
    SELECT * INTO v_prod FROM public.products WHERE id = p_product_id;
    IF v_prod.track_stock THEN
      INSERT INTO public.stock_movements (product_id, branch_id, qty, type, ref_type, ref_id, note, staff_id)
      VALUES (p_product_id, r.branch_id, -1, 'garantia', 'rma', r.id, 'Cambio por garantía ' || r.number, p_staff_id);
    END IF;
    UPDATE public.rmas SET replacement_product_id = p_product_id WHERE id = r.id;
  END IF;
  IF p_create_lab AND r.lab_order_id IS NULL THEN
    INSERT INTO public.lab_orders (company_id, branch_id, sale_id, customer_id, exam_id, number, status, promised_at, notes)
    VALUES (r.company_id, r.branch_id, r.sale_id, r.customer_id, (SELECT id FROM public.exams WHERE customer_id = r.customer_id ORDER BY exam_date DESC LIMIT 1),
            public.next_number(r.company_id,'OL'), 'pendiente', CURRENT_DATE + 7, 'Garantía ' || r.number || ': fabricar cristales para el armazón de reemplazo')
    RETURNING id INTO v_lab;
    UPDATE public.rmas SET lab_order_id = v_lab WHERE id = r.id;
  END IF;
  RETURN QUERY SELECT * FROM public.rmas WHERE id = r.id;
END; $$;

-- ===== Venta (R6 bloqueo opcional sin stock · R4 factura en la entrega) =====
CREATE OR REPLACE FUNCTION public.create_sale(
  p_company_id uuid, p_branch_id uuid, p_customer_id uuid, p_seller_id uuid,
  p_items jsonb, p_payments jsonb, p_discount numeric DEFAULT 0, p_quote_id uuid DEFAULT NULL,
  p_cash_session_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS SETOF public.sales LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_sale_id uuid; v_sub numeric := 0; v_cost numeric := 0; v_tax numeric; v_total numeric;
        v_rate numeric; it jsonb; pm jsonb; v_price numeric; v_pcost numeric; v_line numeric;
        v_comm numeric := 0; v_needs_lab boolean := false; v_src text; v_exam uuid; v_prod record; v_allow_neg boolean := true; v_has_lab boolean := false;
BEGIN
  SELECT tax_rate, allow_negative_stock INTO v_rate, v_allow_neg FROM public.companies WHERE id = p_company_id;
  IF p_quote_id IS NOT NULL THEN SELECT EXISTS(SELECT 1 FROM public.lab_orders WHERE quote_id = p_quote_id) INTO v_has_lab; END IF;
  SELECT source INTO v_src FROM public.customers WHERE id = p_customer_id;
  SELECT commission_pct INTO v_comm FROM public.staff WHERE id = p_seller_id;
  SELECT id INTO v_exam FROM public.exams WHERE customer_id = p_customer_id ORDER BY exam_date DESC LIMIT 1;

  INSERT INTO public.sales (company_id, branch_id, customer_id, seller_id, quote_id, exam_id, cash_session_id, number, source, discount, notes, status, delivery_status)
  VALUES (p_company_id, p_branch_id, p_customer_id, p_seller_id, p_quote_id, v_exam, p_cash_session_id,
          public.next_number(p_company_id, 'F'), COALESCE(v_src,'walk-in'), COALESCE(p_discount,0), p_notes, 'parcial', 'entregado')
  RETURNING id INTO v_sale_id;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = (it->>'product_id')::uuid;
    v_price := COALESCE((it->>'unit_price')::numeric, v_prod.price);
    v_pcost := COALESCE(v_prod.cost, 0);
    v_line  := round(v_price * COALESCE((it->>'qty')::int,1) * (1 - COALESCE((it->>'discount_pct')::numeric,0)/100), 2);
    v_sub := v_sub + v_line; v_cost := v_cost + v_pcost * COALESCE((it->>'qty')::int,1);
    INSERT INTO public.sale_items (sale_id, product_id, description, category, qty, unit_price, unit_cost, discount_pct, line_total)
    VALUES (v_sale_id, v_prod.id, COALESCE(it->>'description', v_prod.name), v_prod.category, COALESCE((it->>'qty')::int,1), v_price, v_pcost, COALESCE((it->>'discount_pct')::numeric,0), v_line);
    IF v_prod.track_stock AND NOT v_allow_neg AND COALESCE((SELECT qty FROM public.stock WHERE product_id = v_prod.id AND branch_id = p_branch_id),0) < COALESCE((it->>'qty')::int,1) THEN
      RAISE EXCEPTION 'Sin stock suficiente de % en esta sucursal', v_prod.name;
    END IF;
    IF v_prod.track_stock THEN
      INSERT INTO public.stock_movements (product_id, branch_id, qty, type, ref_type, ref_id, staff_id)
      VALUES (v_prod.id, p_branch_id, -COALESCE((it->>'qty')::int,1), 'venta', 'sale', v_sale_id, p_seller_id);
    END IF;
    IF v_prod.category = 'lente' THEN v_needs_lab := true; END IF;
  END LOOP;

  v_sub := v_sub - COALESCE(p_discount,0);
  v_tax := round(v_sub * v_rate / 100, 2);
  v_total := v_sub + v_tax;
  UPDATE public.sales SET subtotal = v_sub + COALESCE(p_discount,0), tax = v_tax, total = v_total, cost_total = v_cost,
    commission_amount = round(v_sub * COALESCE(v_comm,0)/100, 2),
    delivery_status = CASE WHEN v_needs_lab THEN 'pendiente' ELSE 'entregado' END,
    delivered_at = CASE WHEN v_needs_lab THEN NULL ELSE now() END
  WHERE id = v_sale_id;

  FOR pm IN SELECT * FROM jsonb_array_elements(COALESCE(p_payments,'[]'::jsonb)) LOOP
    INSERT INTO public.payments (sale_id, cash_session_id, method, amount, reference, voucher_id)
    VALUES (v_sale_id, p_cash_session_id, pm->>'method', (pm->>'amount')::numeric, pm->>'reference', (pm->>'voucher_id')::uuid);
    IF pm->>'method' = 'vale' AND (pm->>'voucher_id') IS NOT NULL THEN
      UPDATE public.vouchers SET balance = balance - (pm->>'amount')::numeric,
        status = CASE WHEN balance - (pm->>'amount')::numeric <= 0 THEN 'usado' ELSE status END
      WHERE id = (pm->>'voucher_id')::uuid;
    END IF;
    IF pm->>'method' = 'saldo_cliente' THEN
      UPDATE public.customers SET balance = balance - (pm->>'amount')::numeric WHERE id = p_customer_id;
    END IF;
  END LOOP;

  -- Deuda pendiente se refleja en el saldo del cliente
  UPDATE public.customers c SET balance = c.balance - GREATEST(s.total - s.paid, 0)
  FROM public.sales s WHERE s.id = v_sale_id AND c.id = p_customer_id AND s.total - s.paid > 0.01;

  IF p_quote_id IS NOT NULL THEN UPDATE public.quotes SET status = 'convertida' WHERE id = p_quote_id; END IF;

  IF v_has_lab THEN
    -- Orden de trabajo previa: la factura se emite en la entrega
    UPDATE public.lab_orders SET sale_id = v_sale_id, status = 'entregado', delivered_at = now() WHERE quote_id = p_quote_id AND status <> 'cancelado';
    UPDATE public.sales SET delivery_status = 'entregado', delivered_at = now() WHERE id = v_sale_id;
  ELSIF v_needs_lab THEN
    INSERT INTO public.lab_orders (company_id, branch_id, sale_id, customer_id, exam_id, number, status, promised_at)
    VALUES (p_company_id, p_branch_id, v_sale_id, p_customer_id, v_exam, public.next_number(p_company_id,'OL'), 'pendiente', CURRENT_DATE + 7);
  END IF;

  RETURN QUERY SELECT * FROM public.sales WHERE id = v_sale_id;
END; $$;

-- Cierre de caja: incluye anticipos en efectivo
CREATE OR REPLACE FUNCTION public.close_cash_session(p_session_id uuid, p_counted numeric, p_staff_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS SETOF public.cash_sessions LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_exp numeric;
BEGIN
  SELECT s.opening_amount
       + COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.cash_session_id = s.id AND p.method = 'efectivo'),0)
       + COALESCE((SELECT SUM(amount) FROM public.quote_deposits d WHERE d.cash_session_id = s.id AND d.method = 'efectivo'),0)
       + COALESCE((SELECT SUM(CASE WHEN type='ingreso' THEN amount ELSE -amount END) FROM public.cash_movements m WHERE m.cash_session_id = s.id),0)
  INTO v_exp FROM public.cash_sessions s WHERE s.id = p_session_id;
  UPDATE public.cash_sessions SET status='cerrada', closed_at=now(), closed_by=p_staff_id, expected_cash=v_exp,
    counted_cash=p_counted, difference=p_counted - v_exp, notes=p_notes WHERE id = p_session_id;
  RETURN QUERY SELECT * FROM public.cash_sessions WHERE id = p_session_id;
END; $$;

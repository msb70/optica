-- =====================================================================
-- OPTILUX — Esquema MVP (multi-compañía, multi-sucursal)
-- Convenciones: snake_case, uuid PK, timestamps con TZ, importes numeric(12,2)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------
-- 1. Modelo organizacional
-- ---------------------------------------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trade_name text,
  tax_id text,
  country text NOT NULL DEFAULT 'PA',
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(5,2) NOT NULL DEFAULT 7.00,
  invoice_prefix text NOT NULL,
  next_invoice_no integer NOT NULL DEFAULT 1,
  zoho_org_id text,
  zoho_books_org_id text,
  zoho_inventory_org_id text,
  zoho_crm_org_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  phone text,
  monthly_goal numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                                  -- auth.users.id (opcional)
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  name text NOT NULL,
  email text,
  role text NOT NULL CHECK (role IN ('admin','gerente','vendedor','optometrista','cajero','almacen')),
  commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  max_discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  monthly_goal numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Clientes / Pacientes 360
-- ---------------------------------------------------------------------
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  code text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  tax_id text,
  birth_date date,
  gender text CHECK (gender IN ('M','F','X')),
  address text,
  source text NOT NULL DEFAULT 'walk-in'
    CHECK (source IN ('walk-in','referido','instagram','google_ads','campania','empresa','doctor','facebook','web')),
  referred_by text,
  balance numeric(12,2) NOT NULL DEFAULT 0,   -- saldo a favor (+) / deuda (-)
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  zoho_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_company_idx ON public.customers(company_id);
CREATE INDEX customers_name_idx ON public.customers(lower(last_name), lower(first_name));

CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id),
  kind text NOT NULL DEFAULT 'nota' CHECK (kind IN ('nota','llamada','whatsapp','email','sms')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  optometrist_id uuid REFERENCES public.staff(id),
  scheduled_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'programada'
    CHECK (status IN ('programada','confirmada','atendida','no_show','cancelada')),
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_branch_date_idx ON public.appointments(branch_id, scheduled_at);

-- ---------------------------------------------------------------------
-- 3. Examen optométrico / RX
-- ---------------------------------------------------------------------
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  optometrist_id uuid REFERENCES public.staff(id),
  appointment_id uuid REFERENCES public.appointments(id),
  template text NOT NULL DEFAULT 'adulto' CHECK (template IN ('adulto','nino')),
  exam_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  -- Cada bloque: {od:{sph,cyl,axis,add,pd,va}, oi:{...}, notes}
  autorefraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  rx_initial jsonb NOT NULL DEFAULT '{}'::jsonb,
  rx_final jsonb NOT NULL DEFAULT '{}'::jsonb,
  rx_final_transposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnosis text,
  recommendation text,
  next_review_date date,
  status text NOT NULL DEFAULT 'completado' CHECK (status IN ('borrador','completado','anulado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exams_customer_idx ON public.exams(customer_id, exam_date DESC);

-- Transposición automática de RX (cilindro +/-): sph' = sph + cyl; cyl' = -cyl; axis' = (axis+90) mod 180
CREATE OR REPLACE FUNCTION public.transpose_eye(e jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE sph numeric; cyl numeric; ax integer;
BEGIN
  IF e IS NULL OR e = '{}'::jsonb THEN RETURN e; END IF;
  sph := COALESCE((e->>'sph')::numeric, 0);
  cyl := COALESCE((e->>'cyl')::numeric, 0);
  ax  := COALESCE((e->>'axis')::integer, 0);
  IF cyl = 0 THEN RETURN e; END IF;
  RETURN e || jsonb_build_object('sph', sph + cyl, 'cyl', -cyl, 'axis', ((ax + 90) % 180));
END; $$;

CREATE OR REPLACE FUNCTION public.exams_transpose_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rx_final IS NOT NULL AND NEW.rx_final <> '{}'::jsonb THEN
    NEW.rx_final_transposed := jsonb_build_object(
      'od', public.transpose_eye(NEW.rx_final->'od'),
      'oi', public.transpose_eye(NEW.rx_final->'oi'));
  END IF;
  IF NEW.next_review_date IS NULL THEN
    NEW.next_review_date := NEW.exam_date + CASE WHEN NEW.template = 'nino' THEN INTERVAL '6 months' ELSE INTERVAL '12 months' END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER exams_transpose BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.exams_transpose_trg();
CREATE TRIGGER exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Catálogo y stock
-- ---------------------------------------------------------------------
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  barcode text,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('armazon','lente','lente_contacto','solar','accesorio','servicio')),
  brand text,
  model text,
  color text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2),                -- null = usa la tasa de la compañía
  min_stock integer NOT NULL DEFAULT 2,
  track_stock boolean NOT NULL DEFAULT true,
  zoho_item_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 0,
  last_count_at timestamptz,
  UNIQUE (product_id, branch_id)
);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  qty integer NOT NULL,                                  -- +entrada / -salida
  type text NOT NULL CHECK (type IN ('compra','venta','traspaso_salida','traspaso_entrada','ajuste','conteo','devolucion','merma')),
  ref_type text, ref_id uuid,
  note text,
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_prod_idx ON public.stock_movements(product_id, branch_id, created_at DESC);

-- Mantiene stock.qty a partir de los movimientos
CREATE OR REPLACE FUNCTION public.stock_apply_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.stock (product_id, branch_id, qty) VALUES (NEW.product_id, NEW.branch_id, NEW.qty)
  ON CONFLICT (product_id, branch_id) DO UPDATE SET qty = public.stock.qty + EXCLUDED.qty,
    last_count_at = CASE WHEN NEW.type = 'conteo' THEN now() ELSE public.stock.last_count_at END;
  RETURN NEW;
END; $$;
CREATE TRIGGER stock_movements_apply AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_apply_movement();

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','recibido','cancelado')),
  requested_by uuid REFERENCES public.staff(id),
  intercompany boolean NOT NULL DEFAULT false,
  intercompany_doc_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz, received_at timestamptz
);
CREATE TABLE public.transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  staff_id uuid REFERENCES public.staff(id),
  status text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','cerrado')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE TABLE public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  expected_qty integer NOT NULL DEFAULT 0,
  counted_qty integer
);

-- ---------------------------------------------------------------------
-- 5. Vales / pines
-- ---------------------------------------------------------------------
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'vale' CHECK (kind IN ('vale','pin_descuento','nota_credito')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2),
  customer_id uuid REFERENCES public.customers(id),
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','usado','vencido','anulado')),
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. Caja
-- ---------------------------------------------------------------------
CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  opened_by uuid REFERENCES public.staff(id),
  closed_by uuid REFERENCES public.staff(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2),      -- calculado al cierre
  counted_cash numeric(12,2),       -- arqueo
  difference numeric(12,2),
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada')),
  notes text
);
CREATE INDEX cash_sessions_branch_idx ON public.cash_sessions(branch_id, opened_at DESC);

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ingreso','egreso')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  concept text NOT NULL,
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7. Cotizaciones
-- ---------------------------------------------------------------------
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  exam_id uuid REFERENCES public.exams(id),
  seller_id uuid REFERENCES public.staff(id),
  number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','seguimiento','convertida','perdida','vencida')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  valid_until date,
  next_followup_at timestamptz,
  last_contact_at timestamptz,
  lost_reason text,
  zoho_deal_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_status_idx ON public.quotes(company_id, status, created_at DESC);
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  description text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- 8. Ventas / POS
-- ---------------------------------------------------------------------
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid REFERENCES public.customers(id),
  seller_id uuid REFERENCES public.staff(id),
  optometrist_id uuid REFERENCES public.staff(id),
  quote_id uuid REFERENCES public.quotes(id),
  exam_id uuid REFERENCES public.exams(id),
  cash_session_id uuid REFERENCES public.cash_sessions(id),
  number text NOT NULL UNIQUE,          -- numeración fiscal por compañía
  sale_date timestamptz NOT NULL DEFAULT now(),
  source text,                          -- origen (copiado del cliente al vender)
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  paid numeric(12,2) NOT NULL DEFAULT 0,
  cost_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completada' CHECK (status IN ('completada','parcial','anulada','devuelta')),
  delivery_status text NOT NULL DEFAULT 'entregado' CHECK (delivery_status IN ('pendiente','en_laboratorio','listo','entregado')),
  delivered_at timestamptz,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  zoho_invoice_id text,
  zoho_sync_status text NOT NULL DEFAULT 'pendiente' CHECK (zoho_sync_status IN ('pendiente','sincronizado','error','omitido')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_company_date_idx ON public.sales(company_id, sale_date DESC);
CREATE INDEX sales_branch_date_idx ON public.sales(branch_id, sale_date DESC);
CREATE INDEX sales_seller_idx ON public.sales(seller_id, sale_date DESC);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  description text NOT NULL,
  category text,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL
);
CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  cash_session_id uuid REFERENCES public.cash_sessions(id),
  method text NOT NULL CHECK (method IN ('efectivo','tarjeta','transferencia','yappy','vale','saldo_cliente','credito')),
  amount numeric(12,2) NOT NULL,
  reference text,
  voucher_id uuid REFERENCES public.vouchers(id),
  zoho_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_sale_idx ON public.payments(sale_id);
CREATE INDEX payments_session_idx ON public.payments(cash_session_id);

-- Mantiene sales.paid y status
CREATE OR REPLACE FUNCTION public.payments_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  SELECT id, total INTO s FROM public.sales WHERE id = COALESCE(NEW.sale_id, OLD.sale_id);
  UPDATE public.sales SET paid = COALESCE((SELECT SUM(amount) FROM public.payments WHERE sale_id = s.id),0),
    status = CASE WHEN status IN ('anulada','devuelta') THEN status
                  WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE sale_id = s.id),0) >= s.total - 0.01 THEN 'completada'
                  ELSE 'parcial' END
  WHERE id = s.id;
  RETURN NEW;
END; $$;
CREATE TRIGGER payments_apply AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_apply();

-- ---------------------------------------------------------------------
-- 9. Órdenes / encargos a laboratorio
-- ---------------------------------------------------------------------
CREATE TABLE public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  exam_id uuid REFERENCES public.exams(id),
  number text NOT NULL UNIQUE,
  lab_name text NOT NULL DEFAULT 'Laboratorio Central',
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','enviado','en_proceso','recibido','control_calidad','listo','entregado','cancelado')),
  lens_type text, treatment text, frame text,
  promised_at date,
  sent_at timestamptz, received_at timestamptz, delivered_at timestamptz,
  notify_customer boolean NOT NULL DEFAULT true,
  notified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lab_orders_status_idx ON public.lab_orders(branch_id, status);
CREATE TRIGGER lab_orders_updated_at BEFORE UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.lab_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 10. RMA / reclamos
-- ---------------------------------------------------------------------
CREATE TABLE public.rmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  sale_id uuid REFERENCES public.sales(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  product_id uuid REFERENCES public.products(id),
  number text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('devolucion','reparacion','garantia','cambio')),
  status text NOT NULL DEFAULT 'abierto'
    CHECK (status IN ('abierto','en_revision','aprobado','rechazado','en_reparacion','resuelto','cerrado')),
  reason text NOT NULL,
  resolution text,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  refund_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE public.rma_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id uuid NOT NULL REFERENCES public.rmas(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 11. Intercompany
-- ---------------------------------------------------------------------
CREATE TABLE public.intercompany_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_company_id uuid NOT NULL REFERENCES public.companies(id),
  receiver_company_id uuid NOT NULL REFERENCES public.companies(id),
  markup_pct numeric(5,2) NOT NULL DEFAULT 0,
  auto_on_transfer boolean NOT NULL DEFAULT true,
  auto_on_lab_order boolean NOT NULL DEFAULT false,
  payment_terms_days integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (issuer_company_id, receiver_company_id)
);

CREATE TABLE public.intercompany_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  issuer_company_id uuid NOT NULL REFERENCES public.companies(id),
  receiver_company_id uuid NOT NULL REFERENCES public.companies(id),
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  concept text NOT NULL,
  origin_type text CHECK (origin_type IN ('traspaso','orden_lab','servicio','manual')),
  origin_id uuid,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'emitido' CHECK (status IN ('borrador','emitido','aceptado','pagado','anulado')),
  ar_status text NOT NULL DEFAULT 'pendiente' CHECK (ar_status IN ('pendiente','cobrado')),   -- cuenta por cobrar (emisora)
  ap_status text NOT NULL DEFAULT 'pendiente' CHECK (ap_status IN ('pendiente','pagado')),    -- cuenta por pagar (receptora)
  zoho_invoice_id text,   -- Books emisora
  zoho_bill_id text,      -- Books receptora
  zoho_sync_status text NOT NULL DEFAULT 'pendiente' CHECK (zoho_sync_status IN ('pendiente','sincronizado','error','omitido')),
  created_by uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intercompany_docs_issuer_idx ON public.intercompany_docs(issuer_company_id, doc_date DESC);
CREATE INDEX intercompany_docs_receiver_idx ON public.intercompany_docs(receiver_company_id, doc_date DESC);

CREATE TABLE public.intercompany_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.intercompany_docs(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  description text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  line_total numeric(12,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- 12. Auditoría y cola de sincronización Zoho
-- ---------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  company_id uuid,
  entity text NOT NULL,
  entity_id text,
  action text NOT NULL,
  actor text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON public.audit_log(entity, entity_id);

CREATE TABLE public.zoho_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  event_type text NOT NULL,     -- sale.completed | quote.created | customer.created | intercompany.issued
  target text NOT NULL,         -- books | inventory | crm
  entity_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','procesando','ok','error','descartado')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  zoho_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX zoho_sync_queue_status_idx ON public.zoho_sync_queue(status, next_retry_at);

-- Encolado automático (event-driven) — el worker (Nhost Function / Make) consume la cola
CREATE OR REPLACE FUNCTION public.enqueue_zoho_sale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completada') THEN
    INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
    VALUES (NEW.company_id, 'sale.completed', 'books', NEW.id, 'sale:'||NEW.id||':books', jsonb_build_object('sale_id', NEW.id, 'number', NEW.number, 'total', NEW.total))
    ON CONFLICT (idempotency_key) DO NOTHING;
    INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
    VALUES (NEW.company_id, 'sale.completed', 'inventory', NEW.id, 'sale:'||NEW.id||':inventory', jsonb_build_object('sale_id', NEW.id))
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER sales_enqueue_zoho AFTER INSERT OR UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_zoho_sale();

CREATE OR REPLACE FUNCTION public.enqueue_zoho_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
  VALUES (NEW.company_id, 'customer.created', 'crm', NEW.id, 'customer:'||NEW.id||':crm', jsonb_build_object('customer_id', NEW.id))
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER customers_enqueue_zoho AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_zoho_customer();

CREATE OR REPLACE FUNCTION public.enqueue_zoho_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
  VALUES (NEW.company_id, 'quote.created', 'crm', NEW.id, 'quote:'||NEW.id||':crm', jsonb_build_object('quote_id', NEW.id, 'total', NEW.total))
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER quotes_enqueue_zoho AFTER INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_zoho_quote();

CREATE OR REPLACE FUNCTION public.enqueue_zoho_intercompany() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('emitido','aceptado') THEN
    INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
    VALUES (NEW.issuer_company_id, 'intercompany.invoice', 'books', NEW.id, 'ic:'||NEW.id||':invoice', jsonb_build_object('doc_id', NEW.id, 'total', NEW.total))
    ON CONFLICT (idempotency_key) DO NOTHING;
    INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload)
    VALUES (NEW.receiver_company_id, 'intercompany.bill', 'books', NEW.id, 'ic:'||NEW.id||':bill', jsonb_build_object('doc_id', NEW.id, 'total', NEW.total))
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER intercompany_enqueue_zoho AFTER INSERT OR UPDATE OF status ON public.intercompany_docs
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_zoho_intercompany();

-- Auditoría genérica
CREATE OR REPLACE FUNCTION public.audit_trg() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; rid text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rid := OLD.id::text;
    BEGIN cid := (to_jsonb(OLD)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN cid := NULL; END;
    INSERT INTO public.audit_log(company_id, entity, entity_id, action, actor, data)
    VALUES (cid, TG_TABLE_NAME, rid, 'delete', current_setting('hasura.user', true), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  rid := NEW.id::text;
  BEGIN cid := (to_jsonb(NEW)->>'company_id')::uuid; EXCEPTION WHEN OTHERS THEN cid := NULL; END;
  INSERT INTO public.audit_log(company_id, entity, entity_id, action, actor, data)
  VALUES (cid, TG_TABLE_NAME, rid, lower(TG_OP), current_setting('hasura.user', true), to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.audit_trg();
CREATE TRIGGER audit_exams AFTER INSERT OR UPDATE OR DELETE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.audit_trg();
CREATE TRIGGER audit_cash AFTER INSERT OR UPDATE OR DELETE ON public.cash_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_trg();
CREATE TRIGGER audit_ic AFTER INSERT OR UPDATE OR DELETE ON public.intercompany_docs FOR EACH ROW EXECUTE FUNCTION public.audit_trg();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_trg();

-- ---------------------------------------------------------------------
-- 13. Funciones de negocio
-- ---------------------------------------------------------------------
-- Numeración fiscal por compañía (atómica)
CREATE OR REPLACE FUNCTION public.next_number(p_company_id uuid, p_kind text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c record; n integer;
BEGIN
  SELECT * INTO c FROM public.companies WHERE id = p_company_id FOR UPDATE;
  n := c.next_invoice_no;
  UPDATE public.companies SET next_invoice_no = n + 1 WHERE id = p_company_id;
  RETURN c.invoice_prefix || '-' || p_kind || '-' || lpad(n::text, 6, '0');
END; $$;

-- Venta rápida: crea venta + items + pagos + stock + comisión en una transacción.
-- Devuelve la fila de sales (Hasura la expone como mutación create_sale).
CREATE OR REPLACE FUNCTION public.create_sale(
  p_company_id uuid, p_branch_id uuid, p_customer_id uuid, p_seller_id uuid,
  p_items jsonb, p_payments jsonb, p_discount numeric DEFAULT 0, p_quote_id uuid DEFAULT NULL,
  p_cash_session_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS SETOF public.sales LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_sale_id uuid; v_sub numeric := 0; v_cost numeric := 0; v_tax numeric; v_total numeric;
        v_rate numeric; it jsonb; pm jsonb; v_price numeric; v_pcost numeric; v_line numeric;
        v_comm numeric := 0; v_needs_lab boolean := false; v_src text; v_exam uuid; v_prod record;
BEGIN
  SELECT tax_rate INTO v_rate FROM public.companies WHERE id = p_company_id;
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

  IF v_needs_lab THEN
    INSERT INTO public.lab_orders (company_id, branch_id, sale_id, customer_id, exam_id, number, status, promised_at)
    VALUES (p_company_id, p_branch_id, v_sale_id, p_customer_id, v_exam, public.next_number(p_company_id,'OL'), 'pendiente', CURRENT_DATE + 7);
  END IF;

  RETURN QUERY SELECT * FROM public.sales WHERE id = v_sale_id;
END; $$;

-- Cierre de caja con arqueo
CREATE OR REPLACE FUNCTION public.close_cash_session(p_session_id uuid, p_counted numeric, p_staff_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS SETOF public.cash_sessions LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_exp numeric;
BEGIN
  SELECT s.opening_amount
       + COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.cash_session_id = s.id AND p.method = 'efectivo'),0)
       + COALESCE((SELECT SUM(CASE WHEN type='ingreso' THEN amount ELSE -amount END) FROM public.cash_movements m WHERE m.cash_session_id = s.id),0)
  INTO v_exp FROM public.cash_sessions s WHERE s.id = p_session_id;
  UPDATE public.cash_sessions SET status='cerrada', closed_at=now(), closed_by=p_staff_id, expected_cash=v_exp,
    counted_cash=p_counted, difference=p_counted - v_exp, notes=p_notes WHERE id = p_session_id;
  RETURN QUERY SELECT * FROM public.cash_sessions WHERE id = p_session_id;
END; $$;

-- Traspaso: enviar (descuenta origen) / recibir (suma destino) + intercompany automático
CREATE OR REPLACE FUNCTION public.transfer_send(p_transfer_id uuid, p_staff_id uuid DEFAULT NULL)
RETURNS SETOF public.transfers LANGUAGE plpgsql VOLATILE AS $$
DECLARE t record; ti record; v_from_co uuid; v_to_co uuid; rule record; v_doc uuid; v_sub numeric := 0; v_rate numeric;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = p_transfer_id AND status = 'borrador';
  IF t.id IS NULL THEN RAISE EXCEPTION 'Traspaso no está en borrador'; END IF;
  SELECT company_id INTO v_from_co FROM public.branches WHERE id = t.from_branch_id;
  SELECT company_id INTO v_to_co FROM public.branches WHERE id = t.to_branch_id;
  FOR ti IN SELECT * FROM public.transfer_items WHERE transfer_id = t.id LOOP
    INSERT INTO public.stock_movements (product_id, branch_id, qty, type, ref_type, ref_id, staff_id)
    VALUES (ti.product_id, t.from_branch_id, -ti.qty, 'traspaso_salida', 'transfer', t.id, p_staff_id);
  END LOOP;
  IF v_from_co <> v_to_co THEN
    SELECT * INTO rule FROM public.intercompany_rules WHERE issuer_company_id = v_from_co AND receiver_company_id = v_to_co AND active;
    IF rule.id IS NOT NULL AND rule.auto_on_transfer THEN
      SELECT tax_rate INTO v_rate FROM public.companies WHERE id = v_from_co;
      INSERT INTO public.intercompany_docs (number, issuer_company_id, receiver_company_id, due_date, concept, origin_type, origin_id, status, created_by)
      VALUES (public.next_number(v_from_co,'IC'), v_from_co, v_to_co, CURRENT_DATE + rule.payment_terms_days, 'Traspaso de mercancía '||t.number, 'traspaso', t.id, 'emitido', p_staff_id)
      RETURNING id INTO v_doc;
      FOR ti IN SELECT ti2.*, p.name, p.cost FROM public.transfer_items ti2 JOIN public.products p ON p.id = ti2.product_id WHERE ti2.transfer_id = t.id LOOP
        INSERT INTO public.intercompany_items (doc_id, product_id, description, qty, unit_price, line_total)
        VALUES (v_doc, ti.product_id, ti.name, ti.qty, round(ti.cost*(1+rule.markup_pct/100),2), round(ti.cost*(1+rule.markup_pct/100)*ti.qty,2));
        v_sub := v_sub + round(ti.cost*(1+rule.markup_pct/100)*ti.qty,2);
      END LOOP;
      UPDATE public.intercompany_docs SET subtotal = v_sub, tax = round(v_sub*v_rate/100,2), total = v_sub + round(v_sub*v_rate/100,2) WHERE id = v_doc;
      UPDATE public.transfers SET intercompany = true, intercompany_doc_id = v_doc WHERE id = t.id;
    END IF;
  END IF;
  UPDATE public.transfers SET status = 'enviado', sent_at = now() WHERE id = t.id;
  RETURN QUERY SELECT * FROM public.transfers WHERE id = t.id;
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_receive(p_transfer_id uuid, p_staff_id uuid DEFAULT NULL)
RETURNS SETOF public.transfers LANGUAGE plpgsql VOLATILE AS $$
DECLARE t record; ti record;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id = p_transfer_id AND status = 'enviado';
  IF t.id IS NULL THEN RAISE EXCEPTION 'Traspaso no está enviado'; END IF;
  FOR ti IN SELECT * FROM public.transfer_items WHERE transfer_id = t.id LOOP
    INSERT INTO public.stock_movements (product_id, branch_id, qty, type, ref_type, ref_id, staff_id)
    VALUES (ti.product_id, t.to_branch_id, ti.qty, 'traspaso_entrada', 'transfer', t.id, p_staff_id);
  END LOOP;
  UPDATE public.transfers SET status = 'recibido', received_at = now() WHERE id = t.id;
  RETURN QUERY SELECT * FROM public.transfers WHERE id = t.id;
END; $$;

-- Convertir cotización en venta (1 clic)
CREATE OR REPLACE FUNCTION public.convert_quote(p_quote_id uuid, p_payments jsonb, p_cash_session_id uuid DEFAULT NULL)
RETURNS SETOF public.sales LANGUAGE plpgsql VOLATILE AS $$
DECLARE q record; v_items jsonb;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty, 'unit_price', unit_price, 'discount_pct', discount_pct, 'description', description)), '[]'::jsonb)
  INTO v_items FROM public.quote_items WHERE quote_id = p_quote_id AND product_id IS NOT NULL;
  RETURN QUERY SELECT * FROM public.create_sale(q.company_id, q.branch_id, q.customer_id, q.seller_id, v_items, p_payments, q.discount, p_quote_id, p_cash_session_id, q.notes);
END; $$;

-- ---------------------------------------------------------------------
-- 14. Vistas analíticas (KPIs ventas-first)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_sales_daily AS
SELECT s.company_id, s.branch_id, s.sale_date::date AS day,
       COUNT(*) AS tickets, SUM(s.total) AS revenue, SUM(s.discount) AS discounts,
       SUM(s.total - s.tax - s.cost_total) AS gross_margin,
       SUM((SELECT COALESCE(SUM(qty),0) FROM public.sale_items i WHERE i.sale_id = s.id)) AS units
FROM public.sales s WHERE s.status IN ('completada','parcial')
GROUP BY 1,2,3;

CREATE OR REPLACE VIEW public.v_kpi_branch_month AS
SELECT s.company_id, s.branch_id, date_trunc('month', s.sale_date)::date AS month,
       COUNT(*) AS tickets, SUM(s.total) AS revenue, AVG(s.total) AS avg_ticket,
       SUM(s.discount) AS discounts, SUM(s.total - s.tax - s.cost_total) AS gross_margin,
       CASE WHEN SUM(s.total - s.tax) > 0 THEN SUM(s.total - s.tax - s.cost_total)/SUM(s.total - s.tax) ELSE 0 END AS margin_pct,
       SUM((SELECT COALESCE(SUM(qty),0) FROM public.sale_items i WHERE i.sale_id = s.id)) AS units,
       SUM((SELECT COALESCE(SUM(line_total),0) FROM public.sale_items i WHERE i.sale_id = s.id AND i.category = 'lente')) AS lens_revenue,
       SUM((SELECT COALESCE(SUM(line_total),0) FROM public.sale_items i WHERE i.sale_id = s.id AND i.category IN ('armazon','solar'))) AS frame_revenue,
       AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.sale_date))/86400.0) FILTER (WHERE s.delivered_at IS NOT NULL) AS avg_delivery_days
FROM public.sales s WHERE s.status IN ('completada','parcial')
GROUP BY 1,2,3;

CREATE OR REPLACE VIEW public.v_sales_by_seller AS
SELECT s.company_id, s.branch_id, s.seller_id, st.name AS seller_name, date_trunc('month', s.sale_date)::date AS month,
       COUNT(*) AS tickets, SUM(s.total) AS revenue, AVG(s.total) AS avg_ticket, SUM(s.commission_amount) AS commissions,
       SUM(s.discount) AS discounts
FROM public.sales s JOIN public.staff st ON st.id = s.seller_id
WHERE s.status IN ('completada','parcial') GROUP BY 1,2,3,4,5;

CREATE OR REPLACE VIEW public.v_sales_by_source AS
SELECT s.company_id, s.branch_id, COALESCE(s.source,'walk-in') AS source, date_trunc('month', s.sale_date)::date AS month,
       COUNT(*) AS tickets, SUM(s.total) AS revenue
FROM public.sales s WHERE s.status IN ('completada','parcial') GROUP BY 1,2,3,4;

CREATE OR REPLACE VIEW public.v_funnel_month AS
SELECT c.id AS company_id, b.id AS branch_id, m.month,
  (SELECT COUNT(*) FROM public.appointments a WHERE a.branch_id = b.id AND date_trunc('month', a.scheduled_at)::date = m.month) AS citas,
  (SELECT COUNT(*) FROM public.exams e WHERE e.branch_id = b.id AND date_trunc('month', e.exam_date)::date = m.month) AS examenes,
  (SELECT COUNT(*) FROM public.quotes q WHERE q.branch_id = b.id AND date_trunc('month', q.created_at)::date = m.month) AS cotizaciones,
  (SELECT COUNT(*) FROM public.sales s WHERE s.branch_id = b.id AND s.status IN ('completada','parcial') AND date_trunc('month', s.sale_date)::date = m.month) AS ventas,
  (SELECT COUNT(*) FROM public.sales s WHERE s.branch_id = b.id AND s.status IN ('completada','parcial') AND s.delivered_at IS NOT NULL AND date_trunc('month', s.sale_date)::date = m.month) AS entregas
FROM public.companies c JOIN public.branches b ON b.company_id = c.id
CROSS JOIN (SELECT DISTINCT date_trunc('month', sale_date)::date AS month FROM public.sales) m;

CREATE OR REPLACE VIEW public.v_stock_alerts AS
SELECT st.id, st.product_id, st.branch_id, b.company_id, p.sku, p.name, p.category, st.qty, p.min_stock
FROM public.stock st JOIN public.products p ON p.id = st.product_id JOIN public.branches b ON b.id = st.branch_id
WHERE p.track_stock AND p.active AND st.qty <= p.min_stock;

CREATE OR REPLACE VIEW public.v_alerts AS
SELECT 'caja_descuadrada' AS kind, cs.company_id, cs.branch_id, cs.id AS ref_id,
       'Caja del '||to_char(cs.opened_at,'DD/MM')||' con diferencia de '||to_char(cs.difference,'FM999990.00') AS message,
       cs.closed_at AS at, CASE WHEN abs(cs.difference) >= 20 THEN 'alta' ELSE 'media' END AS severity
FROM public.cash_sessions cs WHERE cs.status='cerrada' AND abs(COALESCE(cs.difference,0)) >= 1
UNION ALL
SELECT 'stock_critico', a.company_id, a.branch_id, a.product_id, a.name||' ('||a.sku||') con '||a.qty||' uds (mín. '||a.min_stock||')', now(),
       CASE WHEN a.qty = 0 THEN 'alta' ELSE 'media' END
FROM public.v_stock_alerts a
UNION ALL
SELECT 'cotizacion_sin_seguimiento', q.company_id, q.branch_id, q.id, 'Cotización '||q.number||' sin contacto desde '||to_char(COALESCE(q.last_contact_at,q.created_at),'DD/MM'), COALESCE(q.last_contact_at,q.created_at),
       CASE WHEN COALESCE(q.last_contact_at,q.created_at) < now() - interval '7 days' THEN 'alta' ELSE 'media' END
FROM public.quotes q WHERE q.status IN ('abierta','seguimiento') AND COALESCE(q.next_followup_at, COALESCE(q.last_contact_at,q.created_at) + interval '3 days') < now()
UNION ALL
SELECT 'rx_vencida', e.company_id, e.branch_id, e.customer_id, c.first_name||' '||c.last_name||': RX vencida el '||to_char(e.next_review_date,'DD/MM/YYYY'), e.next_review_date::timestamptz, 'baja'
FROM public.exams e JOIN public.customers c ON c.id = e.customer_id
WHERE e.next_review_date < CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM public.exams e2 WHERE e2.customer_id = e.customer_id AND e2.exam_date > e.exam_date);

CREATE OR REPLACE VIEW public.v_customer_timeline AS
SELECT customer_id, 'venta' AS kind, id AS ref_id, sale_date AS at, 'Venta '||number||' por '||to_char(total,'FM999,990.00') AS title, status AS detail FROM public.sales
UNION ALL SELECT customer_id, 'examen', id, exam_date::timestamptz, 'Examen '||template||' — RX final', COALESCE(diagnosis,'') FROM public.exams
UNION ALL SELECT customer_id, 'cotizacion', id, created_at, 'Cotización '||number||' por '||to_char(total,'FM999,990.00'), status FROM public.quotes
UNION ALL SELECT customer_id, 'cita', id, scheduled_at, 'Cita', status FROM public.appointments
UNION ALL SELECT customer_id, 'orden_lab', id, created_at, 'Orden laboratorio '||number, status FROM public.lab_orders
UNION ALL SELECT customer_id, 'rma', id, created_at, 'RMA '||number||' ('||type||')', status FROM public.rmas
UNION ALL SELECT customer_id, 'nota', id, created_at, kind, body FROM public.customer_notes;

CREATE OR REPLACE VIEW public.v_intercompany_balance AS
SELECT issuer_company_id, receiver_company_id,
       SUM(total) FILTER (WHERE status IN ('emitido','aceptado')) AS pending_total,
       SUM(total) FILTER (WHERE status = 'pagado') AS paid_total,
       COUNT(*) AS docs
FROM public.intercompany_docs GROUP BY 1,2;

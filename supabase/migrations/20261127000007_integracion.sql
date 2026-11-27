-- 27-11-2026 · Modelo de datos para la integración con Optilab, CRM, Zoho y la API /v1
-- Basado en el documento de propuesta de integración de Grupo Optilux (flujos 1 a 4).

-- ===== 1. Lecturas incrementales: updated_at en todo lo que se expone por la API =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','sales','payments','stock','branches','products','quote_deposits','vouchers','staff'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('UPDATE public.%I SET updated_at = COALESCE(%s, now())', t,
      CASE t WHEN 'stock' THEN 'last_count_at' WHEN 'sales' THEN 'sale_date' ELSE 'created_at' END);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['customers','appointments','sales','payments','stock','products','exams','lab_orders','quotes'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at, id)', t || '_updated_cursor_idx', t);
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS stock_movements_cursor_idx ON public.stock_movements (created_at, id);

-- Borrados: se guardan "lápidas" para que los sistemas externos sepan qué desapareció
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id bigserial PRIMARY KEY,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  company_id uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deleted_records_cursor_idx ON public.deleted_records (entity, deleted_at, id);
CREATE OR REPLACE FUNCTION public.record_tombstone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.deleted_records (entity, entity_id, company_id)
  VALUES (TG_TABLE_NAME, OLD.id, CASE WHEN to_jsonb(OLD) ? 'company_id' THEN (to_jsonb(OLD)->>'company_id')::uuid END);
  RETURN OLD;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','appointments','sales','payments','products','stock'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_tombstone', t);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_tombstone()', t || '_tombstone', t);
  END LOOP;
END $$;

-- ===== 2. CRM (flujo 2): citas y clientes que llegan de fuera =====
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS rescheduled_from uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS cancel_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_external_uq ON public.appointments (external_source, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('programada','confirmada','reagendada','atendida','no_show','cancelada'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text,
  ADD COLUMN IF NOT EXISTS no_comms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS customers_external_uq ON public.customers (external_source, external_id) WHERE external_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.customers_consent_stamp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.marketing_consent IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.marketing_consent END) THEN
    NEW.marketing_consent_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customers_consent_stamp ON public.customers;
CREATE TRIGGER customers_consent_stamp BEFORE INSERT OR UPDATE OF marketing_consent ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_consent_stamp();

-- ===== 3. Facturas y cobros (flujo 3, Zoho) =====
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS bill_to_type text NOT NULL DEFAULT 'cliente' CHECK (bill_to_type IN ('cliente','aseguradora','empresa')),
  ADD COLUMN IF NOT EXISTS bill_to_name text,
  ADD COLUMN IF NOT EXISTS bill_to_tax_id text,
  ADD COLUMN IF NOT EXISTS fiscal_number text,       -- número del documento fiscal electrónico (pendiente de proveedor PAC)
  ADD COLUMN IF NOT EXISTS fiscal_cufe text,
  ADD COLUMN IF NOT EXISTS fiscal_status text NOT NULL DEFAULT 'no_emitida' CHECK (fiscal_status IN ('no_emitida','pendiente','emitida','rechazada','anulada')),
  ADD COLUMN IF NOT EXISTS fiscal_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  number text NOT NULL,
  reason text NOT NULL,
  total numeric(12,2) NOT NULL CHECK (total > 0),
  status text NOT NULL DEFAULT 'emitida' CHECK (status IN ('borrador','emitida','anulada')),
  fiscal_number text, fiscal_cufe text,
  fiscal_status text NOT NULL DEFAULT 'no_emitida' CHECK (fiscal_status IN ('no_emitida','pendiente','emitida','rechazada','anulada')),
  staff_id uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS credit_notes_cursor_idx ON public.credit_notes (updated_at, id);
DROP TRIGGER IF EXISTS credit_notes_updated_at ON public.credit_notes;
CREATE TRIGGER credit_notes_updated_at BEFORE UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS deposit_account text,     -- cuenta bancaria donde se deposita (para conciliación en Zoho)
  ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('efectivo','tarjeta','transferencia','ach','yappy','vale','saldo_cliente','credito','anticipo'));
ALTER TABLE public.quote_deposits DROP CONSTRAINT IF EXISTS quote_deposits_method_check;
ALTER TABLE public.quote_deposits ADD CONSTRAINT quote_deposits_method_check
  CHECK (method IN ('efectivo','tarjeta','transferencia','ach','yappy','vale','saldo_cliente'));

-- ===== 4. Inventario (flujo 4): reservas de montura al aprobar la orden =====
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0);
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, product_id)
);
CREATE OR REPLACE FUNCTION public.quotes_reserve_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- al aprobar: se reservan las monturas/artículos con control de stock
  IF NEW.status = 'aprobada' AND COALESCE(OLD.status, '') NOT IN ('aprobada','lista') THEN
    INSERT INTO public.stock_reservations (quote_id, product_id, branch_id, qty)
    SELECT NEW.id, qi.product_id, NEW.branch_id, SUM(qi.qty)::int
    FROM public.quote_items qi JOIN public.products p ON p.id = qi.product_id
    WHERE qi.quote_id = NEW.id AND p.track_stock
    GROUP BY qi.product_id
    ON CONFLICT DO NOTHING;
    INSERT INTO public.stock (product_id, branch_id, qty, reserved)
    SELECT r.product_id, r.branch_id, 0, r.qty FROM public.stock_reservations r WHERE r.quote_id = NEW.id
    ON CONFLICT (product_id, branch_id) DO UPDATE SET reserved = public.stock.reserved + EXCLUDED.reserved;
  -- al entregar, anular o perder: se libera la reserva (la venta ya descuenta el stock real)
  ELSIF NEW.status IN ('convertida','anulada','perdida','vencida') AND OLD.status IN ('aprobada','lista') THEN
    UPDATE public.stock s SET reserved = GREATEST(s.reserved - r.qty, 0)
    FROM public.stock_reservations r WHERE r.quote_id = NEW.id AND s.product_id = r.product_id AND s.branch_id = r.branch_id;
    DELETE FROM public.stock_reservations WHERE quote_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quotes_reserve_stock ON public.quotes;
CREATE TRIGGER quotes_reserve_stock AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_reserve_stock();

-- ===== 5. Optilab (flujo 1): datos que exige el pedido de laboratorio =====
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS optilab_account text;
CREATE TABLE IF NOT EXISTS public.optilab_products (
  code text PRIMARY KEY,                  -- código del catálogo de Optilab
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lente','tratamiento')),
  design text, material text, refractive_index numeric(4,2),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS reference text,                 -- referencia única que viaja a Optilab (idempotencia)
  ADD COLUMN IF NOT EXISTS optilab_account text,
  ADD COLUMN IF NOT EXISTS lens_code_od text REFERENCES public.optilab_products(code),
  ADD COLUMN IF NOT EXISTS lens_code_oi text REFERENCES public.optilab_products(code),
  ADD COLUMN IF NOT EXISTS treatments_od text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS treatments_oi text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS frame_type text CHECK (frame_type IN ('completo','ranurado','perforado')),
  ADD COLUMN IF NOT EXISTS frame_material text,
  ADD COLUMN IF NOT EXISTS frame_model text,
  ADD COLUMN IF NOT EXISTS frame_h numeric(5,1),
  ADD COLUMN IF NOT EXISTS frame_v numeric(5,1),
  ADD COLUMN IF NOT EXISTS frame_diag numeric(5,1),
  ADD COLUMN IF NOT EXISTS frame_bridge numeric(5,1),
  ADD COLUMN IF NOT EXISTS rx_snapshot jsonb,              -- {od:{esf,cil,eje,add,dnp,altura,diametro,prisma,base}, oi:{...}}
  ADD COLUMN IF NOT EXISTS optilab_order_id text,
  ADD COLUMN IF NOT EXISTS optilab_status text NOT NULL DEFAULT 'no_enviado'
      CHECK (optilab_status IN ('no_enviado','en_cola','enviado','aceptado','rechazado','error')),
  ADD COLUMN IF NOT EXISTS optilab_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optilab_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS optilab_error text,
  ADD COLUMN IF NOT EXISTS optilab_response jsonb;
UPDATE public.lab_orders SET reference = number WHERE reference IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lab_orders_reference_uq ON public.lab_orders (reference) WHERE reference IS NOT NULL;

-- Comprueba que un pedido tiene todo lo que pide Optilab antes de encolarlo
CREATE OR REPLACE FUNCTION public.optilab_missing_fields(p_lab_order_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(l.optilab_account, b.optilab_account) IS NULL THEN 'cuenta Optilab de la óptica' END,
    CASE WHEN l.lens_code_od IS NULL AND l.lens_code_oi IS NULL THEN 'código de lente' END,
    CASE WHEN l.frame_type IS NULL THEN 'tipo de montura' END,
    CASE WHEN l.frame_h IS NULL OR l.frame_v IS NULL OR l.frame_bridge IS NULL THEN 'medidas de montura (H, V, puente)' END,
    CASE WHEN l.rx_snapshot IS NULL THEN 'graduación' END,
    CASE WHEN l.rx_snapshot IS NOT NULL AND (l.rx_snapshot #> '{od,dnp}' IS NULL OR l.rx_snapshot #> '{oi,dnp}' IS NULL) THEN 'DNP por ojo' END,
    CASE WHEN l.rx_snapshot IS NOT NULL AND (l.rx_snapshot #> '{od,altura}' IS NULL OR l.rx_snapshot #> '{oi,altura}' IS NULL) THEN 'altura por ojo' END
  ], NULL)
  FROM public.lab_orders l JOIN public.branches b ON b.id = l.branch_id WHERE l.id = p_lab_order_id $$;

CREATE OR REPLACE FUNCTION public.optilab_enqueue(p_lab_order_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_missing text[]; v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM public.lab_orders WHERE id = p_lab_order_id;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Orden de laboratorio no encontrada' USING ERRCODE = '22023'; END IF;
  PERFORM public.require_access(v_branch, ARRAY['ordenes']);
  v_missing := public.optilab_missing_fields(p_lab_order_id);
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Faltan datos para Optilab: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  UPDATE public.lab_orders SET optilab_status = 'en_cola', optilab_error = NULL,
    optilab_account = COALESCE(optilab_account, (SELECT optilab_account FROM public.branches WHERE id = v_branch))
  WHERE id = p_lab_order_id AND optilab_status IN ('no_enviado','error','rechazado');
  RETURN 'en_cola';
END $$;

-- ===== 6. Credenciales de servicio para la API /v1 =====
CREATE TABLE IF NOT EXISTS public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                     -- p. ej. 'CRM Optilux', 'Zoho Books'
  key_prefix text NOT NULL UNIQUE,        -- primeros caracteres visibles de la clave (opx_live_xxxx)
  key_hash text NOT NULL,                 -- sha256 de la clave completa; la clave no se guarda
  scopes text[] NOT NULL DEFAULT '{}',    -- clientes:leer, clientes:escribir, citas:leer, citas:escribir, facturas:leer, cobros:leer, inventario:leer
  company_ids uuid[],                     -- null = todo el grupo
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','produccion')),
  rate_limit_per_min integer NOT NULL DEFAULT 120,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.api_idempotency (
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key)
);
CREATE TABLE IF NOT EXISTS public.api_requests (
  id bigserial PRIMARY KEY,
  client_id uuid REFERENCES public.api_clients(id) ON DELETE CASCADE,
  method text, path text, status integer, ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_requests_rate_idx ON public.api_requests (client_id, created_at);

-- Límite por minuto (cuenta las peticiones del último minuto y registra la actual)
CREATE OR REPLACE FUNCTION public.api_hit(p_client uuid, p_method text, p_path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim int; v_n int;
BEGIN
  SELECT rate_limit_per_min INTO v_lim FROM public.api_clients WHERE id = p_client;
  SELECT count(*) INTO v_n FROM public.api_requests WHERE client_id = p_client AND created_at > now() - interval '1 minute';
  IF v_n >= v_lim THEN RETURN false; END IF;
  INSERT INTO public.api_requests (client_id, method, path) VALUES (p_client, p_method, p_path);
  UPDATE public.api_clients SET last_used_at = now() WHERE id = p_client;
  RETURN true;
END $$;

-- ===== 7. Seguridad de lo nuevo =====
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_records, public.api_idempotency, public.api_requests FROM anon, authenticated;
REVOKE ALL ON public.api_clients FROM anon, authenticated;
-- las credenciales se ven (sin hash) y se revocan desde Configuración; se crean con la función api_client_create
DROP POLICY IF EXISTS leer ON public.api_clients;
CREATE POLICY leer ON public.api_clients FOR SELECT TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion'])));
DROP POLICY IF EXISTS editar ON public.api_clients;
CREATE POLICY editar ON public.api_clients FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion'])));
GRANT SELECT (id, name, key_prefix, scopes, company_ids, environment, rate_limit_per_min, active, created_at, last_used_at, revoked_at) ON public.api_clients TO authenticated;
GRANT UPDATE (active, revoked_at, scopes, rate_limit_per_min) ON public.api_clients TO authenticated;

CREATE OR REPLACE FUNCTION public.api_client_create(p_name text, p_scopes text[], p_environment text DEFAULT 'sandbox', p_company_ids uuid[] DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_key text; v_prefix text;
BEGIN
  PERFORM public.require_access(NULL, ARRAY['configuracion']);
  v_prefix := CASE WHEN p_environment = 'produccion' THEN 'opx_live_' ELSE 'opx_test_' END || encode(gen_random_bytes(4), 'hex');
  v_key := v_prefix || '_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.api_clients (name, key_prefix, key_hash, scopes, environment, company_ids)
  VALUES (p_name, v_prefix, encode(digest(v_key, 'sha256'), 'hex'), p_scopes, p_environment, p_company_ids);
  RETURN v_key;   -- se muestra una sola vez
END $$;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.credit_notes;
CREATE POLICY leer ON public.credit_notes FOR SELECT TO authenticated USING (private.has_branch(branch_id));
DROP POLICY IF EXISTS crear ON public.credit_notes;
CREATE POLICY crear ON public.credit_notes FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja'])) AND private.has_branch(branch_id));
DROP POLICY IF EXISTS editar ON public.credit_notes;
CREATE POLICY editar ON public.credit_notes FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['pos','caja'])) AND private.has_branch(branch_id)) WITH CHECK ((SELECT private.can_edit(ARRAY['pos','caja'])) AND private.has_branch(branch_id));
REVOKE ALL ON public.credit_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.credit_notes TO authenticated;

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.stock_reservations;
CREATE POLICY leer ON public.stock_reservations FOR SELECT TO authenticated USING (private.has_any_access());
REVOKE ALL ON public.stock_reservations FROM anon, authenticated;
GRANT SELECT ON public.stock_reservations TO authenticated;

ALTER TABLE public.optilab_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer ON public.optilab_products;
CREATE POLICY leer ON public.optilab_products FOR SELECT TO authenticated USING (private.has_any_access());
DROP POLICY IF EXISTS crear ON public.optilab_products;
CREATE POLICY crear ON public.optilab_products FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','ordenes'])));
DROP POLICY IF EXISTS editar ON public.optilab_products;
CREATE POLICY editar ON public.optilab_products FOR UPDATE TO authenticated USING ((SELECT private.can_edit(ARRAY['configuracion','ordenes']))) WITH CHECK ((SELECT private.can_edit(ARRAY['configuracion','ordenes'])));
REVOKE ALL ON public.optilab_products FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.optilab_products TO authenticated;

-- funciones nuevas: no ejecutables por nadie salvo las que usa la app
REVOKE ALL ON FUNCTION public.record_tombstone(), public.customers_consent_stamp(), public.quotes_reserve_stock(),
  public.optilab_missing_fields(uuid), public.api_hit(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.optilab_enqueue(uuid), public.api_client_create(text, text[], text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.optilab_enqueue(uuid), public.api_client_create(text, text[], text, uuid[]), public.optilab_missing_fields(uuid) TO authenticated;

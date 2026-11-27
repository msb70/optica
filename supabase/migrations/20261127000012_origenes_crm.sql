-- 27-11-2026 · Orígenes de cliente que llegan por el CRM de Optilux (bot de WhatsApp, call center, formulario web)
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_source_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_source_check CHECK (source IN
  ('walk-in','referido','instagram','google_ads','campania','empresa','doctor','facebook','web','crm','whatsapp','call_center','formulario_web'));

-- 24-11-2026 · Clientes compartidos en el grupo · usuarios en una, varias o todas las ópticas · permisos por módulo

-- ===== Clientes del grupo: el teléfono identifica al cliente en todas las compañías =====
DROP INDEX IF EXISTS public.customers_phone_unique;
CREATE INDEX IF NOT EXISTS customers_phone_norm_global_idx ON public.customers(phone_norm);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE phone_norm IS NOT NULL GROUP BY phone_norm HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique_group ON public.customers(phone_norm) WHERE phone_norm IS NOT NULL;
  END IF;
END $$;
COMMENT ON COLUMN public.customers.company_id IS 'Compañía donde se dio de alta. El cliente es del grupo y se atiende en cualquier compañía/sucursal.';

-- ===== Usuarios: una, varias o todas las ópticas =====
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS all_branches boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions jsonb;          -- null = permisos de su rol; objeto {modulo: ninguno|ver|editar} = personalizados
UPDATE public.staff SET all_branches = true WHERE role = 'admin' AND NOT all_branches;

-- ===== Permisos por módulo y rol =====
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  module text NOT NULL,
  access text NOT NULL DEFAULT 'ninguno' CHECK (access IN ('ninguno','ver','editar')),
  PRIMARY KEY (role, module)
);
INSERT INTO public.role_permissions (role, module, access)
SELECT r.role, m.module,
  CASE
    WHEN r.role = 'admin' THEN 'editar'
    WHEN r.role = 'gerente' THEN CASE WHEN m.module = 'configuracion' THEN 'ver' ELSE 'editar' END
    WHEN r.role = 'vendedor' THEN CASE WHEN m.module IN ('pos','caja','clientes','agenda','cotizaciones','cajon','rma') THEN 'editar' WHEN m.module IN ('dashboard','examenes','ordenes','stock') THEN 'ver' ELSE 'ninguno' END
    WHEN r.role = 'optometrista' THEN CASE WHEN m.module IN ('clientes','agenda','examenes','cotizaciones') THEN 'editar' WHEN m.module IN ('dashboard','ordenes','cajon','stock','rma') THEN 'ver' ELSE 'ninguno' END
    WHEN r.role = 'cajero' THEN CASE WHEN m.module IN ('pos','caja','clientes','cajon') THEN 'editar' WHEN m.module IN ('dashboard','agenda','examenes','cotizaciones','ordenes','stock','rma') THEN 'ver' ELSE 'ninguno' END
    WHEN r.role = 'almacen' THEN CASE WHEN m.module IN ('stock','ordenes','rma') THEN 'editar' WHEN m.module IN ('dashboard','clientes','intercompany') THEN 'ver' ELSE 'ninguno' END
  END
FROM (VALUES ('admin'),('gerente'),('vendedor'),('optometrista'),('cajero'),('almacen')) AS r(role)
CROSS JOIN (VALUES ('dashboard'),('pos'),('caja'),('clientes'),('agenda'),('examenes'),('cotizaciones'),('ordenes'),('cajon'),('stock'),('rma'),('intercompany'),('reportes'),('zoho'),('configuracion')) AS m(module)
ON CONFLICT DO NOTHING;

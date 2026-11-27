-- 27-11-2026 · Ajustes del pedido a Optilab según la propuesta (borrador 2): tipos de montura y validación de medidas
ALTER TABLE public.lab_orders DROP CONSTRAINT IF EXISTS lab_orders_frame_type_check;
ALTER TABLE public.lab_orders ADD CONSTRAINT lab_orders_frame_type_check CHECK (frame_type IN ('aro_completo','semi_al_aire','al_aire'));
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS patient_record text;    -- expediente del paciente

-- Validación previa al envío: datos que faltan y medidas imposibles (DNP de 72 en vez de 36, puente de 48…)
CREATE OR REPLACE FUNCTION public.optilab_missing_fields(p_lab_order_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(l.optilab_account, b.optilab_account) IS NULL THEN 'cuenta Optilab de la óptica' END,
    CASE WHEN l.lens_code_od IS NULL AND l.lens_code_oi IS NULL THEN 'código de lente' END,
    CASE WHEN l.frame_type IS NULL THEN 'tipo de montura' END,
    CASE WHEN l.frame_h IS NULL OR l.frame_v IS NULL OR l.frame_bridge IS NULL THEN 'medidas de montura (H, V, puente)' END,
    CASE WHEN l.frame_bridge IS NOT NULL AND (l.frame_bridge < 10 OR l.frame_bridge > 30) THEN 'puente fuera de rango (10–30 mm)' END,
    CASE WHEN l.frame_h IS NOT NULL AND (l.frame_h < 30 OR l.frame_h > 80) THEN 'horizontal fuera de rango (30–80 mm)' END,
    CASE WHEN l.frame_v IS NOT NULL AND (l.frame_v < 15 OR l.frame_v > 60) THEN 'vertical fuera de rango (15–60 mm)' END,
    CASE WHEN l.rx_snapshot IS NULL THEN 'graduación' END,
    CASE WHEN l.rx_snapshot IS NOT NULL AND (l.rx_snapshot #> '{od,dnp}' IS NULL OR l.rx_snapshot #> '{oi,dnp}' IS NULL) THEN 'DNP por ojo' END,
    CASE WHEN (l.rx_snapshot #>> '{od,dnp}')::numeric NOT BETWEEN 20 AND 40 OR (l.rx_snapshot #>> '{oi,dnp}')::numeric NOT BETWEEN 20 AND 40 THEN 'DNP fuera de rango (20–40 mm por ojo)' END,
    CASE WHEN l.rx_snapshot IS NOT NULL AND (l.rx_snapshot #> '{od,altura}' IS NULL OR l.rx_snapshot #> '{oi,altura}' IS NULL) THEN 'altura por ojo' END,
    CASE WHEN length(COALESCE(l.reference, '')) > 45 THEN 'referencia de más de 45 caracteres' END
  ], NULL)
  FROM public.lab_orders l JOIN public.branches b ON b.id = l.branch_id WHERE l.id = p_lab_order_id $$;
REVOKE ALL ON FUNCTION public.optilab_missing_fields(uuid) FROM PUBLIC, anon, authenticated;

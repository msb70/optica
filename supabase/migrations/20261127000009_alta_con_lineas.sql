-- 27-11-2026 · Alta de cabecera + líneas en una sola transacción (cotización, traspaso, documento intercompany, RMA).
-- SECURITY INVOKER: se ejecuta con los permisos del usuario, así que aplican las mismas RLS que a una inserción normal.
CREATE OR REPLACE FUNCTION public.insert_nested(p_table text, p_row jsonb, p_child_table text, p_fk text, p_children jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_parent jsonb; v_cols text; v_child jsonb;
BEGIN
  IF (p_table, p_child_table, p_fk) NOT IN (('quotes','quote_items','quote_id'), ('transfers','transfer_items','transfer_id'),
      ('intercompany_docs','intercompany_items','doc_id'), ('rmas','rma_events','rma_id')) THEN
    RAISE EXCEPTION 'Alta no permitida para %', p_table USING ERRCODE = '22023';
  END IF;
  -- solo las columnas que vienen en el JSON (las demás toman su valor por defecto)
  SELECT string_agg(quote_ident(c.column_name), ',') INTO v_cols FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table AND p_row ? c.column_name;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING to_jsonb(%I.*)', p_table, v_cols, v_cols, p_table, p_table)
    INTO v_parent USING p_row;
  FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(p_children, '[]'::jsonb)) LOOP
    v_child := v_child || jsonb_build_object(p_fk, v_parent->'id');
    SELECT string_agg(quote_ident(c.column_name), ',') INTO v_cols FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_child_table AND v_child ? c.column_name;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', p_child_table, v_cols, v_cols, p_child_table) USING v_child;
  END LOOP;
  RETURN v_parent;
END $$;
REVOKE ALL ON FUNCTION public.insert_nested(text, jsonb, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_nested(text, jsonb, text, text, jsonb) TO authenticated;

-- optilab_missing_fields no valida óptica: solo se usa desde optilab_enqueue
REVOKE EXECUTE ON FUNCTION public.optilab_missing_fields(uuid) FROM authenticated;

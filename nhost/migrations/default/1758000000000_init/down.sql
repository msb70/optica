DROP VIEW IF EXISTS public.v_intercompany_balance, public.v_customer_timeline, public.v_alerts, public.v_stock_alerts,
  public.v_funnel_month, public.v_sales_by_source, public.v_sales_by_seller, public.v_kpi_branch_month, public.v_sales_daily CASCADE;
DROP FUNCTION IF EXISTS public.convert_quote, public.transfer_receive, public.transfer_send, public.close_cash_session,
  public.create_sale, public.next_number, public.audit_trg, public.enqueue_zoho_intercompany, public.enqueue_zoho_quote,
  public.enqueue_zoho_customer, public.enqueue_zoho_sale, public.payments_apply, public.stock_apply_movement,
  public.exams_transpose_trg, public.transpose_eye, public.set_updated_at CASCADE;
DROP TABLE IF EXISTS public.zoho_sync_queue, public.audit_log, public.intercompany_items, public.intercompany_docs,
  public.intercompany_rules, public.rma_events, public.rmas, public.lab_order_events, public.lab_orders, public.payments,
  public.sale_items, public.sales, public.quote_items, public.quotes, public.cash_movements, public.cash_sessions,
  public.vouchers, public.stock_count_items, public.stock_counts, public.transfer_items, public.transfers,
  public.stock_movements, public.stock, public.products, public.exams, public.appointments, public.customer_notes,
  public.customers, public.staff, public.branches, public.companies CASCADE;

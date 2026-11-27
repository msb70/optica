// Operaciones del servidor (funciones de Postgres). Validan óptica y permisos en la base de datos.
import { rpc } from './supabase'

export type PayInput = { method: string; amount: number; reference?: string | null; voucher_id?: string | null; card_brand?: string | null }

export const deliverQuote = (quoteId: string, payments: PayInput[], cashSessionId: string | null, staffId: string | null) =>
  rpc<{ id: string; number: string; total: number; paid: number }[]>('deliver_quote', { p_quote_id: quoteId, p_payments: payments, p_cash_session_id: cashSessionId, p_staff_id: staffId })

export const addQuoteDeposit = (quoteId: string, payments: PayInput[], cashSessionId: string | null, staffId: string | null) =>
  rpc<{ id: string; status: string }[]>('add_quote_deposit', { p_quote_id: quoteId, p_payments: payments, p_cash_session_id: cashSessionId, p_staff_id: staffId })

export const closeCashSession = (sessionId: string, counted: number, staffId: string | null, notes: string | null) =>
  rpc<{ id: string; difference: number; expected_cash: number }[]>('close_cash_session', { p_session_id: sessionId, p_counted: counted, p_staff_id: staffId, p_notes: notes })

export const createSale = (a: { company: string; branch: string; customer: string | null; seller: string | null; items: unknown[]; payments: PayInput[]; discount?: number; quote?: string | null; cashSession?: string | null; notes?: string | null }) =>
  rpc<{ id: string; number: string; total: number; paid: number }[]>('create_sale', {
    p_company_id: a.company, p_branch_id: a.branch, p_customer_id: a.customer, p_seller_id: a.seller, p_items: a.items, p_payments: a.payments,
    p_discount: a.discount ?? 0, p_quote_id: a.quote ?? null, p_cash_session_id: a.cashSession ?? null, p_notes: a.notes ?? null,
  })

export const transferSend = (id: string, staffId: string | null) => rpc<{ id: string; status: string }[]>('transfer_send', { p_transfer_id: id, p_staff_id: staffId })
export const transferReceive = (id: string, staffId: string | null) => rpc<{ id: string; status: string }[]>('transfer_receive', { p_transfer_id: id, p_staff_id: staffId })
export const rmaReplace = (id: string, productId: string | null, createLab: boolean, staffId: string | null) =>
  rpc<{ id: string; lab_order_id: string | null }[]>('rma_replace', { p_rma_id: id, p_product_id: productId, p_create_lab: createLab, p_staff_id: staffId })

/** Alta de cabecera + líneas en una transacción (con las RLS del usuario). */
export const insertNested = <T = { id: string; number: string }>(table: string, row: Record<string, unknown>, childTable: string, fk: string, children: Record<string, unknown>[]) =>
  rpc<T>('insert_nested', { p_table: table, p_row: row, p_child_table: childTable, p_fk: fk, p_children: children })

/** Crea un traspaso en borrador con sus líneas. */
export const createTransfer = (t: { number: string; from_branch_id: string; to_branch_id: string; requested_by: string | null; note: string }, items: { product_id: string; qty: number; unit_cost: number }[]) =>
  insertNested('transfers', { ...t, status: 'borrador' }, 'transfer_items', 'transfer_id', items)

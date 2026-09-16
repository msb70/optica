import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Search, Plus, Minus, Trash2, UserPlus, CreditCard, Banknote, Smartphone, ArrowLeftRight, Ticket, Wallet, CheckCircle2, Printer, X, Glasses, Percent } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Modal, Badge, Field, Toast, Avatar } from '../components/ui'
import { money, CATEGORIES, METHODS, SOURCES, fullName } from '../lib/format'
import type { Product, Customer, Quote } from '../lib/types'

const PRODUCTS_Q = `query PosProducts($branch: uuid!) { products(where:{active:{_eq:true}}, order_by:[{name:asc}]) { id sku barcode name category brand model color cost price min_stock track_stock active stock(where:{branch_id:{_eq:$branch}}) { qty } } }`
const CUSTOMERS_Q = `query PosCustomers($company: uuid!, $q: String!) { customers(where:{company_id:{_eq:$company}, _or:[{first_name:{_ilike:$q}},{last_name:{_ilike:$q}},{phone:{_ilike:$q}},{code:{_ilike:$q}},{tax_id:{_ilike:$q}}]}, limit: 8, order_by:{last_name:asc}) { id code first_name last_name phone email balance source tax_id } }`
const QUOTE_Q = `query PosQuote($id: uuid!) { quotes_by_pk(id:$id) { id number customer_id discount status customer { id code first_name last_name phone email balance source tax_id } quote_items { product_id qty unit_price discount_pct description } } }`
const VOUCHER_Q = `query Voucher($code: String!, $company: uuid!) { vouchers(where:{code:{_eq:$code}, company_id:{_eq:$company}, status:{_eq:"activo"}}) { id code kind amount balance discount_pct } }`
const CREATE_SALE = `mutation CreateSale($co: uuid!, $br: uuid!, $cu: uuid!, $se: uuid, $items: jsonb!, $pay: jsonb!, $disc: numeric, $quote: uuid, $cash: uuid, $notes: String) {
  create_sale(args:{p_company_id:$co, p_branch_id:$br, p_customer_id:$cu, p_seller_id:$se, p_items:$items, p_payments:$pay, p_discount:$disc, p_quote_id:$quote, p_cash_session_id:$cash, p_notes:$notes}) { id number total paid status delivery_status } }`
const NEW_CUSTOMER = `mutation NewCustomer($o: customers_insert_input!) { insert_customers_one(object:$o) { id code first_name last_name phone email balance source tax_id } }`

type PosProduct = Product & { stock: { qty: number }[] }
type Line = { product: PosProduct; qty: number; discount_pct: number }
type Pay = { method: string; amount: number; reference?: string; voucher_id?: string }
const METHOD_ICON: Record<string, React.ReactNode> = { efectivo: <Banknote size={15} />, tarjeta: <CreditCard size={15} />, transferencia: <ArrowLeftRight size={15} />, yappy: <Smartphone size={15} />, vale: <Ticket size={15} />, saldo_cliente: <Wallet size={15} /> }

export default function POS() {
  const { company, branch, staff, me, cashSession, currency } = useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<string>('todos')
  const [lines, setLines] = useState<Line[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [custQ, setCustQ] = useState('')
  const [sellerId, setSellerId] = useState<string>('')
  const [discount, setDiscount] = useState(0)
  const [pays, setPays] = useState<Pay[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [newCust, setNewCust] = useState(false)
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [done, setDone] = useState<{ number: string; total: number; paid: number; delivery_status: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const sellers = staff.filter((s) => s.branch_id === branch?.id && ['vendedor', 'gerente', 'admin'].includes(s.role))
  useEffect(() => { if (!sellerId) setSellerId(me && me.role !== 'cajero' ? me.id : sellers[0]?.id ?? '') }, [me, sellers, sellerId])

  const products = useQuery({ queryKey: ['pos-products', branch?.id], queryFn: () => gql<{ products: PosProduct[] }>(PRODUCTS_Q, { branch: branch!.id }), enabled: !!branch, staleTime: 30_000 })
  const custs = useQuery({ queryKey: ['pos-cust', company?.id, custQ], queryFn: () => gql<{ customers: Customer[] }>(CUSTOMERS_Q, { company: company!.id, q: `%${custQ}%` }), enabled: !!company && custQ.length >= 2 })

  // Cliente preseleccionado desde su ficha
  useEffect(() => {
    const cid = params.get('customer')
    if (!cid || customer) return
    gql<{ customers_by_pk: Customer }>(`query PosCustOne($id: uuid!) { customers_by_pk(id:$id) { id code first_name last_name phone email balance source tax_id } }`, { id: cid }).then((r) => r.customers_by_pk && setCustomer(r.customers_by_pk))
  }, [params, customer])

  // Cargar cotización desde URL
  useEffect(() => {
    const id = params.get('quote')
    if (!id || !products.data) return
    gql<{ quotes_by_pk: Quote & { customer: Customer } }>(QUOTE_Q, { id }).then(({ quotes_by_pk: q }) => {
      if (!q) return
      setQuoteId(q.id); setCustomer(q.customer); setDiscount(Number(q.discount))
      setLines(q.quote_items!.filter((i) => i.product_id).map((i) => ({ product: products.data!.products.find((p) => p.id === i.product_id)!, qty: i.qty, discount_pct: Number(i.discount_pct) })).filter((l) => l.product))
      setToast(`Cotización ${q.number} cargada`)
    })
  }, [params, products.data])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() } if (e.key === 'F9' && lines.length && customer) { e.preventDefault(); setPayOpen(true) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [lines, customer])

  const filtered = useMemo(() => {
    const list = products.data?.products ?? []
    const s = search.trim().toLowerCase()
    const order = ['armazon', 'lente', 'solar', 'lente_contacto', 'accesorio', 'servicio']
    return [...list].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)).filter((p) => (cat === 'todos' || p.category === cat) && (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || (p.brand ?? '').toLowerCase().includes(s) || p.barcode === s)).slice(0, 60)
  }, [products.data, search, cat])

  const add = (p: PosProduct) => { setLines((ls) => { const i = ls.findIndex((l) => l.product.id === p.id); if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + 1 }; return c } return [...ls, { product: p, qty: 1, discount_pct: 0 }] }); setSearch(''); searchRef.current?.focus() }
  const setQty = (id: string, qty: number) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, qty) } : l)))
  const setLineDisc = (id: string, d: number) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, discount_pct: Math.min(100, Math.max(0, d)) } : l)))
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.product.id !== id))

  const subtotal = lines.reduce((a, l) => a + l.product.price * l.qty * (1 - l.discount_pct / 100), 0)
  const taxRate = Number(company?.tax_rate ?? 0) / 100
  const base = Math.max(0, subtotal - discount)
  const tax = Math.round(base * taxRate * 100) / 100
  const total = Math.round((base + tax) * 100) / 100
  const paid = pays.reduce((a, p) => a + p.amount, 0)
  const pending = Math.round((total - paid) * 100) / 100
  const maxDisc = Number(sellers.find((s) => s.id === sellerId)?.max_discount_pct ?? me?.max_discount_pct ?? 0)
  const discPct = subtotal ? (discount / subtotal) * 100 : 0
  const discBlocked = discPct > maxDisc + 0.01 && me?.role !== 'admin'

  const onEnterSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const s = search.trim().toLowerCase()
    const exact = (products.data?.products ?? []).find((p) => p.barcode === s || p.sku.toLowerCase() === s)
    if (exact) add(exact); else if (filtered.length === 1) add(filtered[0])
  }

  const checkout = async () => {
    if (!company || !branch || !customer) return
    setBusy(true)
    try {
      const r = await gql<{ create_sale: { id: string; number: string; total: number; paid: number; delivery_status: string }[] }>(CREATE_SALE, {
        co: company.id, br: branch.id, cu: customer.id, se: sellerId || null,
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_price: l.product.price, discount_pct: l.discount_pct })),
        pay: pays, disc: discount, quote: quoteId, cash: cashSession?.id ?? null, notes: null,
      })
      const s = r.create_sale[0]
      setDone(s); setPayOpen(false)
      void qc.invalidateQueries({ queryKey: ['pos-products'] }); void qc.invalidateQueries({ queryKey: ['dash'] }); void qc.invalidateQueries({ queryKey: ['alerts'] })
    } catch (e) { setToast((e as Error).message) } finally { setBusy(false) }
  }
  const reset = () => { setLines([]); setCustomer(null); setPays([]); setDiscount(0); setQuoteId(null); setDone(null); setCustQ(''); searchRef.current?.focus() }

  const cats = ['todos', ...Object.keys(CATEGORIES)]
  const cartRef = useRef<HTMLElement>(null)
  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-4 h-full min-h-[calc(100vh-7.5rem)] pb-20 lg:pb-0">
      {lines.length > 0 && <button className="lg:hidden fixed bottom-4 left-4 right-4 z-30 btn-dark h-12 shadow-xl justify-between px-4" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}><span>{lines.reduce((a, l) => a + l.qty, 0)} artículos</span><span>{currency(total)} · ver carrito</span></button>}
      {/* Catálogo */}
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} autoFocus className="input pl-9 h-11 text-base" placeholder="Buscar producto, SKU o escanear código…  (F2)" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onEnterSearch} />
          </div>
          {cashSession ? <Badge tone="green"><Wallet size={11} />Caja abierta</Badge> : <Badge tone="amber"><Wallet size={11} />Caja cerrada · se registrará sin sesión</Badge>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition border', cat === c ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>{c === 'todos' ? 'Todos' : CATEGORIES[c]}</button>)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 content-start">
          {filtered.map((p) => {
            const qty = p.stock?.[0]?.qty ?? 0
            const out = p.track_stock && qty <= 0
            return (
              <button key={p.id} onClick={() => add(p)} className={clsx('card text-left p-3 hover:border-brand-300 hover:shadow-md transition group', out && 'opacity-60')}>
                <div className="flex items-start justify-between gap-1">
                  <span className={clsx('h-8 w-8 rounded-lg grid place-items-center text-xs font-bold', { armazon: 'bg-brand-50 text-brand-600', lente: 'bg-violet-50 text-violet-600', lente_contacto: 'bg-cyan-50 text-cyan-600', solar: 'bg-amber-50 text-amber-600', accesorio: 'bg-slate-100 text-slate-600', servicio: 'bg-emerald-50 text-emerald-600' }[p.category])}><Glasses size={15} /></span>
                  {p.track_stock && <span className={clsx('text-[10px] font-semibold rounded-full px-1.5 py-0.5', qty <= 0 ? 'bg-rose-50 text-rose-600' : qty <= p.min_stock ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500')}>{qty} uds</span>}
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-800 leading-tight line-clamp-2 min-h-[2.4em]">{p.name}</div>
                <div className="mt-1 flex items-center justify-between"><span className="text-[11px] text-slate-400 font-mono">{p.sku}</span><span className="text-sm font-extrabold text-slate-900">{money(p.price)}</span></div>
              </button>
            )
          })}
          {filtered.length === 0 && <div className="col-span-full py-12 text-center text-sm text-slate-500">Sin productos para “{search}”</div>}
        </div>
      </div>

      {/* Carrito */}
      <aside ref={cartRef} className="card flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          {customer ? (
            <div className="flex items-center gap-3">
              <Avatar name={fullName(customer)} />
              <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{fullName(customer)}</div><div className="text-xs text-slate-500 truncate">{customer.code} · {customer.phone} · {SOURCES[customer.source] ?? customer.source}{Number(customer.balance) !== 0 && <span className={clsx('ml-1 font-semibold', Number(customer.balance) < 0 ? 'text-rose-600' : 'text-emerald-600')}>saldo {money(customer.balance)}</span>}</div></div>
              <button className="btn-ghost h-8 w-8 p-0" onClick={() => setCustomer(null)}><X size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <input className="input h-10" placeholder="Cliente: nombre, teléfono o código…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
              {custQ.length >= 2 && (
                <div className="absolute z-20 mt-1 w-full card p-1 max-h-64 overflow-y-auto">
                  {(custs.data?.customers ?? []).map((c) => <button key={c.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setCustomer(c); setCustQ('') }}><span className="font-semibold">{fullName(c)}</span> <span className="text-slate-500 text-xs">{c.code} · {c.phone}</span></button>)}
                  <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 text-sm text-brand-700 font-semibold inline-flex items-center gap-2" onClick={() => setNewCust(true)}><UserPlus size={14} />Crear cliente “{custQ}”</button>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <select className="input h-9 text-xs" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            {quoteId && <Badge tone="blue" className="shrink-0">Desde cotización</Badge>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {lines.length === 0 && <div className="p-8 text-center text-sm text-slate-400">Agrega productos con clic, búsqueda o escáner.<br /><span className="text-xs">F2 buscar · F9 cobrar</span></div>}
          {lines.map((l) => (
            <div key={l.product.id} className="px-4 py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{l.product.name}</div><div className="text-xs text-slate-500">{money(l.product.price)} · {CATEGORIES[l.product.category]}</div></div>
              <div className="flex items-center rounded-lg border border-slate-200"><button className="h-7 w-7 grid place-items-center text-slate-500 hover:bg-slate-50" onClick={() => setQty(l.product.id, l.qty - 1)}><Minus size={12} /></button><span className="w-7 text-center text-sm font-bold">{l.qty}</span><button className="h-7 w-7 grid place-items-center text-slate-500 hover:bg-slate-50" onClick={() => setQty(l.product.id, l.qty + 1)}><Plus size={12} /></button></div>
              <div className="relative w-14"><input type="number" className="input h-7 px-1.5 text-xs text-right pr-4" value={l.discount_pct} min={0} max={maxDisc} onChange={(e) => setLineDisc(l.product.id, Number(e.target.value))} title="Descuento %" /><Percent size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" /></div>
              <div className="w-16 text-right text-sm font-bold">{money(l.product.price * l.qty * (1 - l.discount_pct / 100))}</div>
              <button className="btn-ghost h-7 w-7 p-0 text-slate-400 hover:text-rose-600" onClick={() => remove(l.product.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 p-4 space-y-1.5 text-sm bg-slate-50/50">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Descuento global {maxDisc ? <span className="text-[10px] text-slate-400">(máx. {maxDisc}%)</span> : null}</span><input type="number" className={clsx('input h-7 w-24 text-right', discBlocked && 'border-rose-400 ring-2 ring-rose-100')} value={discount} min={0} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></div>
          {discBlocked && <div className="text-[11px] text-rose-600 font-semibold">Descuento supera el permiso del vendedor ({maxDisc}%). Requiere gerente/admin.</div>}
          <div className="flex justify-between text-slate-600"><span>ITBMS {company?.tax_rate}%</span><span>{currency(tax)}</span></div>
          <div className="flex justify-between text-xl font-extrabold text-slate-900 pt-1"><span>Total</span><span>{currency(total)}</span></div>
          <button className="btn-primary w-full h-12 text-base mt-2" disabled={!lines.length || !customer || discBlocked} onClick={() => { setPays([]); setPayOpen(true) }}>Cobrar {currency(total)} <span className="kbd ml-1 border-white/30 bg-white/10 text-white">F9</span></button>
          {!customer && lines.length > 0 && <div className="text-[11px] text-amber-600 text-center">Selecciona un cliente para cobrar</div>}
        </div>
      </aside>

      {/* Pago */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Cobro · ${currency(total)}`} size="md"
        footer={<><button className="btn-secondary" onClick={() => setPayOpen(false)}>Cancelar</button><button className="btn-success h-10 px-5" disabled={busy || pays.length === 0} onClick={checkout}><CheckCircle2 size={16} />{pending > 0.009 ? `Registrar con saldo pendiente ${currency(pending)}` : 'Confirmar venta'}</button></>}>
        <PayForm total={total} pays={pays} setPays={setPays} pending={pending} customer={customer} companyId={company?.id ?? ''} currency={currency} />
      </Modal>

      {/* Nuevo cliente */}
      <NewCustomerModal open={newCust} onClose={() => setNewCust(false)} initial={custQ} companyId={company?.id ?? ''} branchId={branch?.id ?? ''} onCreated={(c) => { setCustomer(c); setNewCust(false); setCustQ('') }} />

      {/* Éxito */}
      <Modal open={!!done} onClose={reset} title="Venta registrada" size="sm" footer={<><button className="btn-secondary" onClick={() => window.print()}><Printer size={15} />Imprimir</button><button className="btn-secondary" onClick={() => { const id = done?.number; reset(); nav(`/clientes/${customer?.id ?? ''}`); void id }}>Ver cliente</button><button className="btn-primary" onClick={reset}>Nueva venta</button></>}>
        {done && (
          <div className="text-center py-2">
            <span className="mx-auto h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center"><CheckCircle2 size={30} /></span>
            <div className="mt-3 text-2xl font-extrabold">{done.number}</div>
            <div className="text-slate-500 text-sm">Total {currency(done.total)} · Pagado {currency(done.paid)}</div>
            {done.delivery_status !== 'entregado' && <div className="mt-3 text-xs rounded-xl bg-violet-50 text-violet-700 px-3 py-2">Se creó una orden de laboratorio para los lentes. Entrega estimada en 7 días.</div>}
            <div className="mt-2 text-[11px] text-slate-400">Encolado para Zoho Books (Invoice + Payment) e Inventory.</div>
          </div>
        )}
      </Modal>
      <Toast msg={toast} onClose={() => setToast(null)} tone="green" />
    </div>
  )
}

function PayForm({ total, pays, setPays, pending, customer, companyId, currency }: { total: number; pays: Pay[]; setPays: (p: Pay[]) => void; pending: number; customer: Customer | null; companyId: string; currency: (n: number) => string }) {
  const [method, setMethod] = useState('tarjeta')
  const [amount, setAmount] = useState<number>(total)
  const [ref, setRef] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [voucher, setVoucher] = useState<{ id: string; balance: number; code: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setAmount(Math.max(0, pending)) }, [pending])

  const lookupVoucher = async () => {
    setErr(null)
    const r = await gql<{ vouchers: { id: string; code: string; balance: number; kind: string }[] }>(VOUCHER_Q, { code: voucherCode.trim().toUpperCase(), company: companyId })
    const v = r.vouchers[0]
    if (!v || v.kind !== 'vale') { setErr('Vale no válido o sin saldo'); setVoucher(null); return }
    setVoucher(v); setAmount(Math.min(Number(v.balance), pending))
  }
  const addPay = () => {
    setErr(null)
    if (amount <= 0) return
    if (method === 'vale') { if (!voucher) { setErr('Valida el vale primero'); return } if (amount > Number(voucher.balance)) { setErr('Supera el saldo del vale'); return } }
    if (method === 'saldo_cliente' && amount > Number(customer?.balance ?? 0)) { setErr('El cliente no tiene ese saldo a favor'); return }
    setPays([...pays, { method, amount: Math.round(amount * 100) / 100, reference: ref || undefined, voucher_id: voucher?.id }])
    setRef(''); setVoucher(null); setVoucherCode('')
  }
  const change = pays.filter((p) => p.method === 'efectivo').reduce((a, p) => a + p.amount, 0) - Math.max(0, total - pays.filter((p) => p.method !== 'efectivo').reduce((a, p) => a + p.amount, 0))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(METHODS).filter((m) => m !== 'credito').map((m) => <button key={m} onClick={() => { setMethod(m); setAmount(Math.max(0, pending)) }} className={clsx('rounded-xl border p-2.5 text-xs font-semibold flex flex-col items-center gap-1 transition', method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:border-slate-300 text-slate-600')}>{METHOD_ICON[m]}{METHODS[m]}</button>)}
      </div>
      {method === 'vale' && <div className="flex gap-2"><input className="input" placeholder="Código del vale (VALE-2026-0001)" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} /><button className="btn-secondary shrink-0" onClick={lookupVoucher}>Validar</button></div>}
      {voucher && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Vale {voucher.code} · saldo {currency(Number(voucher.balance))}</div>}
      {method === 'saldo_cliente' && <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">Saldo a favor del cliente: <b>{currency(Math.max(0, Number(customer?.balance ?? 0)))}</b></div>}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Field label="Importe"><input type="number" step="0.01" className="input h-11 text-lg font-bold" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Referencia"><input className="input h-11" placeholder="Voucher / nº op." value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <button className="btn-dark h-11" onClick={addPay}><Plus size={15} />Añadir</button>
      </div>
      <div className="flex flex-wrap gap-1.5">{[0.25, 0.5, 1].map((f) => <button key={f} className="btn-secondary h-7 text-xs" onClick={() => setAmount(Math.round(Math.max(0, pending) * f * 100) / 100)}>{f === 1 ? 'Todo' : `${f * 100}%`}</button>)}</div>
      {err && <div className="text-xs text-rose-600 font-semibold">{err}</div>}
      {pays.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {pays.map((p, i) => <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">{METHOD_ICON[p.method]}<span className="font-semibold">{METHODS[p.method]}</span><span className="text-xs text-slate-400">{p.reference}</span><span className="ml-auto font-bold">{currency(p.amount)}</span><button className="btn-ghost h-7 w-7 p-0" onClick={() => setPays(pays.filter((_, j) => j !== i))}><X size={14} /></button></li>)}
        </ul>
      )}
      <div className="rounded-2xl bg-slate-50 p-3 grid grid-cols-3 text-center">
        <div><div className="text-[10px] uppercase text-slate-500 font-semibold">Total</div><div className="font-bold">{currency(total)}</div></div>
        <div><div className="text-[10px] uppercase text-slate-500 font-semibold">Pagado</div><div className="font-bold text-emerald-600">{currency(total - pending)}</div></div>
        <div><div className="text-[10px] uppercase text-slate-500 font-semibold">{change > 0.009 ? 'Cambio' : 'Pendiente'}</div><div className={clsx('font-bold', change > 0.009 ? 'text-brand-600' : pending > 0.009 ? 'text-amber-600' : 'text-slate-700')}>{currency(change > 0.009 ? change : Math.max(0, pending))}</div></div>
      </div>
      {pending > 0.009 && pays.length > 0 && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Pago parcial: el saldo pendiente se cargará al cliente y la venta quedará en estado “Pago parcial”.</div>}
    </div>
  )
}

export function NewCustomerModal({ open, onClose, initial = '', companyId, branchId, onCreated }: { open: boolean; onClose: () => void; initial?: string; companyId: string; branchId: string; onCreated: (c: Customer) => void }) {
  const [f, setF] = useState({ first_name: '', last_name: '', phone: '', email: '', tax_id: '', source: 'walk-in', birth_date: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (open) { const [a, ...b] = initial.split(' '); setF((x) => ({ ...x, first_name: /\d/.test(initial) ? '' : a, last_name: b.join(' '), phone: /\d/.test(initial) ? initial : '' })) } }, [open, initial])
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const code = 'C' + String(Date.now()).slice(-7)
      const r = await gql<{ insert_customers_one: Customer }>(NEW_CUSTOMER, { o: { ...f, birth_date: f.birth_date || null, email: f.email || null, tax_id: f.tax_id || null, company_id: companyId, branch_id: branchId, code } })
      onCreated(r.insert_customers_one)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente" size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.first_name || !f.last_name} onClick={save}>Guardar</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre"><input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoFocus /></Field>
        <Field label="Apellidos"><input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Cédula / RUC"><input className="input" value={f.tax_id} onChange={(e) => setF({ ...f, tax_id: e.target.value })} /></Field>
        <Field label="Fecha de nacimiento"><input className="input" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
        <Field label="Origen" className="sm:col-span-2"><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      {err && <div className="mt-3 text-xs text-rose-600">{err}</div>}
      <div className="mt-3 text-[11px] text-slate-400">Al guardar se encola la creación del Contact en Zoho CRM.</div>
    </Modal>
  )
}

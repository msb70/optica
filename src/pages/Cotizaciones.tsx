import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, ShoppingCart, PhoneCall, XCircle, Trash2, Clock, Search } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Avatar, Tabs, Modal, Field, Empty, Toast, Badge } from '../components/ui'
import RxTable from '../components/RxTable'
import { money, fdate, fullName, ago, CATEGORIES } from '../lib/format'
import type { Quote, Product, Customer, Rx } from '../lib/types'

const LIST = `query Quotes($branch: uuid!, $status: [String!]) { quotes(where:{branch_id:{_eq:$branch}, status:{_in:$status}}, order_by:{created_at:desc}, limit: 120) { id number status subtotal discount tax total valid_until next_followup_at last_contact_at lost_reason created_at customer_id customer { id first_name last_name phone } seller { name } exam_id quote_items { id description qty unit_price discount_pct line_total } }
  counts: quotes(where:{branch_id:{_eq:$branch}}) { status } }`
const FOLLOW = `mutation Follow($id: uuid!, $set: quotes_set_input!) { update_quotes_by_pk(pk_columns:{id:$id}, _set:$set) { id } }`
const PRODUCTS = `query QProducts { products(where:{active:{_eq:true}}, order_by:[{category:asc},{name:asc}]) { id sku name category brand price cost } }`
const CUST = `query QCust($id: uuid!, $examFilter: exams_bool_exp!) { customers_by_pk(id:$id) { id code first_name last_name phone } exams(where:$examFilter, order_by:{exam_date:desc}, limit:1) { id exam_date rx_final recommendation diagnosis } }`
const INSERT = `mutation NewQuote($o: quotes_insert_input!) { insert_quotes_one(object:$o) { id number } }`

type Tab = 'activas' | 'seguimiento' | 'convertidas' | 'perdidas' | 'todas'
const TAB_STATUS: Record<Tab, string[]> = { activas: ['abierta', 'seguimiento'], seguimiento: ['seguimiento'], convertidas: ['convertida'], perdidas: ['perdida', 'vencida'], todas: ['abierta', 'seguimiento', 'convertida', 'perdida', 'vencida'] }

export default function Cotizaciones() {
  const { branch, currency } = useApp()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('activas')
  const [search, setSearch] = useState('')
  const [follow, setFollow] = useState<Quote | null>(null)
  const [lose, setLose] = useState<Quote | null>(null)
  const [reason, setReason] = useState('Precio')
  const [followDays, setFollowDays] = useState(3)
  const [toast, setToast] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['quotes', branch?.id, tab], queryFn: () => gql<{ quotes: Quote[]; counts: { status: string }[] }>(LIST, { branch: branch!.id, status: TAB_STATUS[tab] }), enabled: !!branch })
  const counts = useMemo(() => (q.data?.counts ?? []).reduce<Record<string, number>>((a, x) => { a[x.status] = (a[x.status] ?? 0) + 1; return a }, {}), [q.data])
  const list = (q.data?.quotes ?? []).filter((x) => !search || fullName(x.customer).toLowerCase().includes(search.toLowerCase()) || x.number.toLowerCase().includes(search.toLowerCase()))
  const now = Date.now()
  const doFollow = async () => { const d = new Date(); d.setDate(d.getDate() + followDays); await gql(FOLLOW, { id: follow!.id, set: { status: 'seguimiento', last_contact_at: new Date().toISOString(), next_followup_at: d.toISOString() } }); setFollow(null); setToast('Seguimiento registrado'); void q.refetch() }
  const doLose = async () => { await gql(FOLLOW, { id: lose!.id, set: { status: 'perdida', lost_reason: reason } }); setLose(null); void q.refetch() }
  const newFor = params.get('new')

  return (
    <div className="space-y-4">
      <PageHeader title="Cotizaciones / Proformas" subtitle={`${branch?.name} · conversión a venta en 1 clic`} actions={<button className="btn-primary" onClick={() => setParams({ new: '' })}><Plus size={15} />Nueva cotización</button>} />
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'activas', label: 'Activas', count: (counts.abierta ?? 0) + (counts.seguimiento ?? 0) }, { value: 'seguimiento', label: 'En seguimiento', count: counts.seguimiento ?? 0 }, { value: 'convertidas', label: 'Convertidas', count: counts.convertida ?? 0 }, { value: 'perdidas', label: 'Perdidas / vencidas', count: (counts.perdida ?? 0) + (counts.vencida ?? 0) }, { value: 'todas', label: 'Todas' }]} />
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-8 h-9 w-64" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : list.length === 0 ? <Empty title="Sin cotizaciones en esta vista" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Nº</th><th>Cliente</th><th>Detalle</th><th>Vendedor</th><th>Creada</th><th>Seguimiento</th><th>Estado</th><th className="text-right">Total</th><th></th></tr></thead>
            <tbody>{list.map((x) => {
              const overdue = ['abierta', 'seguimiento'].includes(x.status) && x.next_followup_at && new Date(x.next_followup_at).getTime() < now
              return <tr key={x.id} className={clsx(overdue && 'bg-amber-50/40')}>
                <td className="font-mono text-xs">{x.number}</td>
                <td><Link to={`/clientes/${x.customer_id}`} className="flex items-center gap-2 hover:text-brand-600"><Avatar name={fullName(x.customer)} className="h-7 w-7 text-[10px]" /><div><div className="font-semibold text-sm">{fullName(x.customer)}</div><div className="text-[11px] text-slate-400">{x.customer?.phone}</div></div></Link></td>
                <td className="text-xs text-slate-600 max-w-xs truncate">{x.quote_items?.map((i) => i.description).join(', ')}</td>
                <td className="text-xs">{x.seller?.name}</td>
                <td className="text-xs text-slate-500">{fdate(x.created_at)}<div className="text-[10px]">vence {fdate(x.valid_until)}</div></td>
                <td className="text-xs">{['abierta', 'seguimiento'].includes(x.status) ? <span className={clsx('inline-flex items-center gap-1', overdue ? 'text-amber-700 font-semibold' : 'text-slate-500')}><Clock size={11} />{x.next_followup_at ? ago(x.next_followup_at) : 'sin programar'}</span> : x.lost_reason ? <Badge tone="rose">{x.lost_reason}</Badge> : '—'}</td>
                <td><StatusBadge status={x.status} /></td>
                <td className="text-right font-semibold">{money(x.total)}</td>
                <td><div className="flex gap-1 justify-end">{['abierta', 'seguimiento'].includes(x.status) && <>
                  <button className="btn-secondary h-8 text-xs" onClick={() => setFollow(x)} title="Registrar contacto"><PhoneCall size={13} /></button>
                  <button className="btn-ghost h-8 text-xs text-rose-600" onClick={() => setLose(x)} title="Marcar perdida"><XCircle size={13} /></button>
                  <button className="btn-primary h-8 text-xs" onClick={() => nav(`/pos?quote=${x.id}`)}><ShoppingCart size={13} />Convertir</button>
                </>}</div></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={!!follow} onClose={() => setFollow(null)} title={`Seguimiento · ${follow?.number}`} size="sm" footer={<><button className="btn-secondary" onClick={() => setFollow(null)}>Cancelar</button><button className="btn-primary" onClick={doFollow}>Registrar contacto</button></>}>
        <p className="text-sm text-slate-600 mb-3">Cliente: <b>{fullName(follow?.customer)}</b> · {follow?.customer?.phone}</p>
        <Field label="Próximo seguimiento en"><select className="input" value={followDays} onChange={(e) => setFollowDays(Number(e.target.value))}>{[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} día{d > 1 && 's'}</option>)}</select></Field>
      </Modal>
      <Modal open={!!lose} onClose={() => setLose(null)} title={`Marcar como perdida · ${lose?.number}`} size="sm" footer={<><button className="btn-secondary" onClick={() => setLose(null)}>Cancelar</button><button className="btn-danger" onClick={doLose}>Marcar perdida</button></>}>
        <Field label="Motivo"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{['Precio', 'Compró en otra óptica', 'Sin respuesta', 'Pospuso la compra', 'Otro'].map((r) => <option key={r}>{r}</option>)}</select></Field>
      </Modal>
      {newFor !== null && <NuevaCotizacion customerId={newFor} examId={params.get('exam')} onClose={() => setParams({})} onCreated={(n) => { setParams({}); setToast(`Cotización ${n} creada`); void q.refetch() }} currency={currency} />}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function NuevaCotizacion({ customerId, examId, onClose, onCreated, currency }: { customerId: string; examId: string | null; onClose: () => void; onCreated: (n: string) => void; currency: (n: number) => string }) {
  const { company, branch, staff, me } = useApp()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [exam, setExam] = useState<{ id: string; exam_date: string; rx_final: Rx; recommendation?: string | null; diagnosis?: string | null } | null>(null)
  const [custQ, setCustQ] = useState('')
  const [lines, setLines] = useState<{ product: Product; qty: number; discount_pct: number }[]>([])
  const [search, setSearch] = useState('')
  const [discount, setDiscount] = useState(0)
  const [sellerId, setSellerId] = useState(me?.id ?? '')
  const [notes, setNotes] = useState('')
  const [validDays, setValidDays] = useState(15)
  const products = useQuery({ queryKey: ['q-products'], queryFn: () => gql<{ products: Product[] }>(PRODUCTS) })
  const custs = useQuery({ queryKey: ['q-cust', company?.id, custQ], queryFn: () => gql<{ customers: Customer[] }>(`query($company: uuid!, $q: String!) { customers(where:{company_id:{_eq:$company}, _or:[{first_name:{_ilike:$q}},{last_name:{_ilike:$q}},{phone:{_ilike:$q}}]}, limit:8) { id code first_name last_name phone } }`, { company: company!.id, q: `%${custQ}%` }), enabled: !!company && custQ.length >= 2 })
  useEffect(() => { if (!customerId) return; gql<{ customers_by_pk: Customer; exams: typeof exam[] }>(CUST, { id: customerId, examFilter: examId ? { id: { _eq: examId } } : { customer_id: { _eq: customerId } } }).then((r) => { setCustomer(r.customers_by_pk); setExam(r.exams[0] ?? null) }) }, [customerId, examId])
  const filtered = useMemo(() => { const s = search.toLowerCase(); return (products.data?.products ?? []).filter((p) => s && (p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))).slice(0, 8) }, [products.data, search])
  const subtotal = lines.reduce((a, l) => a + Number(l.product.price) * l.qty * (1 - l.discount_pct / 100), 0)
  const base = Math.max(0, subtotal - discount), tax = Math.round(base * Number(company?.tax_rate ?? 0)) / 100, total = Math.round((base + tax) * 100) / 100
  const suggest = (cat: string) => { const p = (products.data?.products ?? []).find((x) => x.category === cat && (cat !== 'lente' || (exam?.recommendation ?? '').toLowerCase().includes('progresiv') ? x.name.toLowerCase().includes('progresivo') : true)); if (p) setLines((ls) => [...ls, { product: p, qty: 1, discount_pct: 0 }]) }
  const save = async () => {
    if (!customer || !company || !branch) return
    const valid = new Date(); valid.setDate(valid.getDate() + validDays)
    const number = `${company.invoice_prefix}-COT-${String(Date.now()).slice(-6)}`
    const r = await gql<{ insert_quotes_one: { number: string } }>(INSERT, { o: { company_id: company.id, branch_id: branch.id, customer_id: customer.id, exam_id: exam?.id ?? null, seller_id: sellerId || null, number, status: 'abierta', subtotal, discount, tax, total, valid_until: valid.toISOString().slice(0, 10), next_followup_at: new Date(Date.now() + 3 * 864e5).toISOString(), notes: notes || null,
      quote_items: { data: lines.map((l) => ({ product_id: l.product.id, description: l.product.name, qty: l.qty, unit_price: l.product.price, discount_pct: l.discount_pct, line_total: Math.round(Number(l.product.price) * l.qty * (1 - l.discount_pct / 100) * 100) / 100 })) } } })
    onCreated(r.insert_quotes_one.number)
  }
  return (
    <Modal open onClose={onClose} title="Nueva cotización" size="lg" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!customer || !lines.length} onClick={save}>Crear cotización · {currency(total)}</button></>}>
      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-3">
          <div className="relative"><span className="label">Cliente</span>
            {customer ? <div className="input h-10 flex items-center gap-2"><Avatar name={fullName(customer)} className="h-6 w-6 text-[10px]" /><b className="text-sm">{fullName(customer)}</b><span className="text-xs text-slate-400">{customer.phone}</span><button className="ml-auto text-xs text-slate-400" onClick={() => { setCustomer(null); setExam(null) }}>cambiar</button></div>
              : <><input className="input h-10" placeholder="Buscar cliente…" value={custQ} onChange={(e) => setCustQ(e.target.value)} autoFocus />{custQ.length >= 2 && <div className="absolute z-20 mt-1 w-full card p-1">{(custs.data?.customers ?? []).map((c) => <button key={c.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setCustomer(c); setCustQ(''); gql<{ exams: typeof exam[] }>(`query($id: uuid!){ exams(where:{customer_id:{_eq:$id}}, order_by:{exam_date:desc}, limit:1){ id exam_date rx_final recommendation diagnosis } }`, { id: c.id }).then((r) => setExam(r.exams[0] ?? null)) }}><b>{fullName(c)}</b> <span className="text-xs text-slate-500">{c.phone}</span></button>)}</div>}</>}
          </div>
          <div className="relative"><span className="label">Añadir producto</span><input className="input h-10" placeholder="Buscar armazón, lente, tratamiento…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {filtered.length > 0 && <div className="absolute z-20 mt-1 w-full card p-1 max-h-60 overflow-y-auto">{filtered.map((p) => <button key={p.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm flex justify-between" onClick={() => { setLines((ls) => [...ls, { product: p, qty: 1, discount_pct: 0 }]); setSearch('') }}><span><b>{p.name}</b> <span className="text-xs text-slate-400">{CATEGORIES[p.category]}</span></span><span className="font-semibold">{money(p.price)}</span></button>)}</div>}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs"><span className="text-slate-500 self-center">Rápido:</span>{['armazon', 'lente', 'accesorio', 'servicio'].map((c) => <button key={c} className="btn-secondary h-7 text-xs" onClick={() => suggest(c)}>+ {CATEGORIES[c]}</button>)}</div>
          <table className="table"><thead><tr><th>Producto</th><th>Cant.</th><th>Desc. %</th><th className="text-right">Importe</th><th /></tr></thead><tbody>
            {lines.map((l, i) => <tr key={i}><td className="text-sm font-medium">{l.product.name}<div className="text-[11px] text-slate-400">{money(l.product.price)}</div></td><td><input type="number" className="input h-8 w-16" value={l.qty} min={1} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} /></td><td><input type="number" className="input h-8 w-16" value={l.discount_pct} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, discount_pct: Number(e.target.value) } : x)))} /></td><td className="text-right font-semibold">{money(Number(l.product.price) * l.qty * (1 - l.discount_pct / 100))}</td><td><button className="btn-ghost h-7 w-7 p-0 text-slate-400 hover:text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td></tr>)}
            {lines.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-slate-400 py-6">Añade productos o usa los accesos rápidos</td></tr>}
          </tbody></table>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Vendedor"><select className="input h-9" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>{staff.filter((s) => s.branch_id === branch?.id || s.role === 'admin').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Descuento global"><input type="number" className="input h-9" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
            <Field label="Validez (días)"><input type="number" className="input h-9" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} /></Field>
          </div>
          <Field label="Notas"><input className="input h-9" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm space-y-1">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{currency(subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Descuento</span><span>−{currency(discount)}</span></div>
            <div className="flex justify-between text-slate-600"><span>ITBMS {company?.tax_rate}%</span><span>{currency(tax)}</span></div>
            <div className="flex justify-between text-lg font-extrabold pt-1 border-t border-slate-200"><span>Total</span><span>{currency(total)}</span></div>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="text-xs font-semibold text-violet-700 mb-1">RX de referencia {exam && <span className="font-normal text-slate-500">· {fdate(exam.exam_date)}</span>}</div>
            {exam ? <><RxTable rx={exam.rx_final} compact /><div className="text-[11px] text-slate-600 mt-1"><b>Dx:</b> {exam.diagnosis} · <b>Rec:</b> {exam.recommendation}</div></> : <div className="text-xs text-slate-400">El paciente no tiene examen registrado.</div>}
          </div>
          <div className="text-[11px] text-slate-400">Al crear se encola un Deal/Quote en Zoho CRM y se programa seguimiento a 3 días.</div>
        </div>
      </div>
    </Modal>
  )
}

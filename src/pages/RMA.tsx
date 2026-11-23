import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, ArrowRight } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Modal, Field, Tabs, Badge, Empty, Toast, Avatar } from '../components/ui'
import { money, fdate, fullName, STATUS_LABEL } from '../lib/format'
import type { Rma, Sale } from '../lib/types'

const Q = `query Rmas($branch: uuid!, $open: Boolean!) { rmas(where:{branch_id:{_eq:$branch}, status:{_nin:["resuelto","cerrado","rechazado"]}}, order_by:{created_at:desc}) @skip(if:$open) { ...R }
  closed: rmas(where:{branch_id:{_eq:$branch}, status:{_in:["resuelto","cerrado","rechazado"]}}, order_by:{created_at:desc}, limit:80) @include(if:$open) { ...R } }
  fragment R on rmas { id number type status reason resolution refund_amount refund_method created_at resolved_at warranty_part warranty_until in_warranty replacement_product_id lab_order_id replacement_product { name sku } lab_order { number status } customer_id customer { first_name last_name phone } product { name sku } sale { number total sale_date } rma_events(order_by:{created_at:desc}) { id status note created_at } }`
const SALES_Q = `query RmaSales($q: String!, $branch: uuid!) { sales(where:{branch_id:{_eq:$branch}, _or:[{number:{_ilike:$q}},{customer:{last_name:{_ilike:$q}}},{customer:{first_name:{_ilike:$q}}}]}, order_by:{sale_date:desc}, limit:8) { id number total sale_date delivered_at customer_id customer { first_name last_name } sale_items { product_id description category } } }`
const INSERT = `mutation NewRma($o: rmas_insert_input!) { insert_rmas_one(object:$o) { id number } }`
const ADV = `mutation AdvRma($id: uuid!, $set: rmas_set_input!, $ev: rma_events_insert_input!) { update_rmas_by_pk(pk_columns:{id:$id}, _set:$set) { id } insert_rma_events_one(object:$ev) { id } }`
const RMA_METHODS: [string, string][] = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['vale', 'Vale'], ['saldo_cliente', 'Saldo al cliente']]
const methodLabel = (m?: string | null) => RMA_METHODS.find(([v]) => v === m)?.[1] ?? m ?? ''
const REPLACE = `mutation Rep($id: uuid!, $p: uuid, $lab: Boolean!, $st: uuid) { rma_replace(args:{p_rma_id:$id, p_product_id:$p, p_create_lab:$lab, p_staff_id:$st}) { id } }`
const PRODS = `query RP($q: String!, $branch: uuid!) { products(where:{active:{_eq:true}, category:{_in:["armazon","solar","lente_contacto","accesorio"]}, _or:[{name:{_ilike:$q}},{sku:{_ilike:$q}}]}, limit:8) { id sku name stock(where:{branch_id:{_eq:$branch}}) { qty } } }`
const PART: Record<string, string> = { armazon: 'Armazón', lente: 'Lente', otro: 'Otro' }
const FLOW = ['abierto', 'en_revision', 'aprobado', 'en_reparacion', 'resuelto', 'cerrado']

export default function RMA() {
  const { branch, company, me } = useApp()
  const [view, setView] = useState<'abiertos' | 'cerrados'>('abiertos')
  const [sel, setSel] = useState<Rma | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['rmas', branch?.id, view], queryFn: () => gql<{ rmas?: Rma[]; closed?: Rma[] }>(Q, { branch: branch!.id, open: view === 'cerrados' }), enabled: !!branch })
  const list = (view === 'abiertos' ? q.data?.rmas : q.data?.closed) ?? []
  const [res, setRes] = useState({ resolution: '', refund_amount: 0, refund_method: 'efectivo', next: '' })

  const advance = async (r: Rma, to: string) => {
    const set: Record<string, unknown> = { status: to }
    if (['resuelto', 'cerrado', 'rechazado'].includes(to)) { set.resolved_at = new Date().toISOString(); set.resolution = res.resolution || null; const paid = r.type === 'devolucion' || r.type === 'reparacion'; set.refund_amount = paid ? res.refund_amount : 0; set.refund_method = paid && res.refund_amount > 0 ? res.refund_method : null }
    await gql(ADV, { id: r.id, set, ev: { rma_id: r.id, status: to, staff_id: me?.id ?? null, note: res.resolution || `Estado → ${STATUS_LABEL[to]}` } })
    setSel(null); setToast(`${r.number} → ${STATUS_LABEL[to]}`); void q.refetch()
  }

  return (
    <div className="space-y-4">
      <PageHeader title="RMA · Devoluciones, reparaciones y garantías" subtitle={`${branch?.name} · trazabilidad total por evento`} actions={<><Tabs value={view} onChange={setView} items={[{ value: 'abiertos', label: 'Abiertos', count: q.data?.rmas?.length }, { value: 'cerrados', label: 'Resueltos' }]} /><button className="btn-primary" onClick={() => setNuevo(true)}><Plus size={15} />Nuevo reclamo</button></>} />
      <Card padded={false}>
        {q.isLoading ? <Loading /> : list.length === 0 ? <Empty title="Sin reclamos en esta vista" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Producto</th><th>Motivo</th><th>Venta</th><th>Estado</th><th className="text-right">Importe</th></tr></thead>
            <tbody>{list.map((r) => <tr key={r.id} className="cursor-pointer" onClick={() => { setSel(r); setRes({ resolution: r.resolution ?? '', refund_amount: Number(r.refund_amount), refund_method: r.refund_method ?? 'efectivo', next: '' }) }}>
              <td className="font-mono text-xs">{r.number}</td><td className="text-xs text-slate-500">{fdate(r.created_at)}</td>
              <td><span className="flex items-center gap-2"><Avatar name={fullName(r.customer)} className="h-7 w-7 text-[10px]" /><span className="font-medium">{fullName(r.customer)}</span></span></td>
              <td><StatusBadge status={r.type} /></td><td className="text-xs">{r.product?.name ?? '—'}</td><td className="text-xs text-slate-600">{r.reason}</td><td className="font-mono text-xs">{r.sale?.number}</td><td><StatusBadge status={r.status} /></td><td className="text-right font-semibold">{Number(r.refund_amount) ? money(r.refund_amount) : '—'}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={!!sel} onClose={() => setSel(null)} title={<span className="flex items-center gap-2">{sel?.number} <StatusBadge status={sel?.type ?? ''} /><StatusBadge status={sel?.status ?? ''} /></span>} size="md"
        footer={sel && !['resuelto', 'cerrado', 'rechazado'].includes(sel.status) && <>
          <button className="btn-ghost text-rose-600" onClick={() => advance(sel, 'rechazado')}>Rechazar</button>
          {sel.status !== 'en_reparacion' && sel.status !== 'aprobado' && <button className="btn-secondary" onClick={() => advance(sel, FLOW[FLOW.indexOf(sel.status) + 1])}>Avanzar <ArrowRight size={14} /></button>}
          <button className="btn-success" onClick={() => advance(sel, 'resuelto')}>Resolver</button>
        </>}>
        {sel && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="label">Cliente</div><Link to={`/clientes/${sel.customer_id}`} className="font-semibold hover:text-brand-600">{fullName(sel.customer)}</Link><div className="text-xs text-slate-500">{sel.customer?.phone}</div></div>
            <div><div className="label">Venta original</div><div className="font-mono text-xs">{sel.sale?.number}</div><div className="text-xs text-slate-500">{fdate(sel.sale?.sale_date)} · {money(sel.sale?.total)}</div></div>
            <div><div className="label">Producto</div>{sel.product?.name ?? '—'} <span className="text-xs text-slate-400">{sel.product?.sku}</span></div>
            <div><div className="label">Motivo</div>{sel.reason}</div>
          </div>
          {sel.warranty_part && <div className={`rounded-xl px-3 py-2 text-xs ${sel.in_warranty ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>Garantía de <b>{PART[sel.warranty_part]}</b> · {sel.in_warranty ? 'vigente' : 'vencida'} hasta {fdate(sel.warranty_until)}</div>}
          {(sel.replacement_product || sel.lab_order) && <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800">{sel.replacement_product && <>Unidad de reemplazo entregada: <b>{sel.replacement_product.name}</b> ({sel.replacement_product.sku}). </>}{sel.lab_order && <>Orden de laboratorio <b>{sel.lab_order.number}</b> ({STATUS_LABEL[sel.lab_order.status]}).</>}</div>}
          {!['resuelto', 'cerrado', 'rechazado'].includes(sel.status) && (sel.type === 'garantia' || sel.type === 'cambio') && !sel.replacement_product_id && <Reemplazo rma={sel} branchId={branch!.id} staffId={me?.id ?? null} onDone={(m) => { setToast(m); setSel(null); void q.refetch() }} />}
          {!['resuelto', 'cerrado', 'rechazado'].includes(sel.status) ? <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
            <Field label="Resolución" className="col-span-2"><input className="input" placeholder="Ej. reemplazo sin costo, reparación de bisagra…" value={res.resolution} onChange={(e) => setRes({ ...res, resolution: e.target.value })} /></Field>
            {(sel.type === 'devolucion' || sel.type === 'reparacion') && <><Field label={sel.type === 'devolucion' ? 'Importe a reembolsar' : 'Importe de la reparación'}><input type="number" className="input" value={res.refund_amount} onChange={(e) => setRes({ ...res, refund_amount: Number(e.target.value) })} /></Field><Field label={sel.type === 'devolucion' ? 'Método de reembolso' : 'Método de pago'}><select className="input" value={res.refund_method} onChange={(e) => setRes({ ...res, refund_method: e.target.value })}>{RMA_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></>}
          </div> : <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-800"><b>Resolución:</b> {sel.resolution ?? '—'} {Number(sel.refund_amount) > 0 && <>· {sel.type === 'reparacion' ? 'cobrado' : 'reembolso'} {money(sel.refund_amount)} ({methodLabel(sel.refund_method)})</>}<div className="text-xs mt-1">{fdate(sel.resolved_at)}</div></div>}
          <div><div className="label">Trazabilidad</div><ol className="space-y-1.5">{sel.rma_events?.map((e) => <li key={e.id} className="flex items-center gap-2 text-xs"><StatusBadge status={e.status} /><span className="text-slate-600">{e.note}</span><span className="ml-auto text-slate-400">{fdate(e.created_at, 'dd MMM HH:mm')}</span></li>)}</ol></div>
        </div>}
      </Modal>

      {nuevo && <NuevoRma onClose={() => setNuevo(false)} onCreated={(n) => { setNuevo(false); setToast(`Reclamo ${n} registrado`); void q.refetch() }} branchId={branch!.id} companyId={company!.id} prefix={company!.invoice_prefix} />}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function NuevoRma({ onClose, onCreated, branchId, companyId, prefix }: { onClose: () => void; onCreated: (n: string) => void; branchId: string; companyId: string; prefix: string }) {
  const [q, setQ] = useState('')
  const [sale, setSale] = useState<(Sale & { sale_items: { product_id?: string | null; description: string }[] }) | null>(null)
  const { company } = useApp()
  const [f, setF] = useState({ type: 'reparacion', reason: '', product_id: '', warranty_part: 'armazon' })
  const sales = useQuery({ queryKey: ['rma-sales', branchId, q], queryFn: () => gql<{ sales: (Sale & { sale_items: { product_id?: string | null; description: string }[] })[] }>(SALES_Q, { q: `%${q}%`, branch: branchId }), enabled: q.length >= 2 })
  const isWarranty = f.type === 'garantia' || f.type === 'cambio'
  const months = f.warranty_part === 'lente' ? Number(company?.warranty_lens_months ?? 12) : Number(company?.warranty_frame_months ?? 12)
  const from = sale ? ((sale as Sale & { delivered_at?: string | null }).delivered_at ?? sale.sale_date) : null
  const until = from ? (() => { const d = new Date(from); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10) })() : null
  const inW = until ? until >= new Date().toISOString().slice(0, 10) : null
  const save = async () => {
    const r = await gql<{ insert_rmas_one: { number: string } }>(INSERT, { o: { company_id: companyId, branch_id: branchId, sale_id: sale!.id, customer_id: sale!.customer_id, product_id: f.product_id || null, warranty_part: isWarranty ? f.warranty_part : null, warranty_until: isWarranty ? until : null, in_warranty: isWarranty ? inW : null, number: `${prefix}-RMA-${String(Date.now()).slice(-6)}`, type: f.type, status: 'abierto', reason: f.reason, rma_events: { data: [{ status: 'abierto', note: 'Reclamo registrado en tienda' }] } } })
    onCreated(r.insert_rmas_one.number)
  }
  return (
    <Modal open onClose={onClose} title="Nuevo reclamo / RMA" size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!sale || !f.reason} onClick={save}>Registrar</button></>}>
      <div className="space-y-3">
        <div className="relative"><span className="label">Venta original</span>
          {sale ? <div className="input h-10 flex items-center gap-2"><Badge tone="blue">{sale.number}</Badge><b>{fullName(sale.customer)}</b><span className="text-xs text-slate-500">{fdate(sale.sale_date)} · {money(sale.total)}</span><button className="ml-auto text-xs text-slate-400" onClick={() => setSale(null)}>cambiar</button></div>
            : <><input className="input h-10" placeholder="Nº de venta o apellido del cliente…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />{q.length >= 2 && <div className="absolute z-20 mt-1 w-full card p-1">{(sales.data?.sales ?? []).map((s) => <button key={s.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setSale(s); setQ('') }}><b className="font-mono text-xs">{s.number}</b> {fullName(s.customer)} <span className="text-xs text-slate-400">{fdate(s.sale_date)} · {money(s.total)}</span></button>)}</div>}</>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['devolucion', 'reparacion', 'garantia', 'cambio'].map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}</select></Field>
          <Field label="Producto afectado"><select className="input" value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">—</option>{sale?.sale_items.filter((i) => i.product_id).map((i) => <option key={i.product_id!} value={i.product_id!}>{i.description}</option>)}</select></Field>
        </div>
        {(f.type === 'garantia' || f.type === 'cambio') && <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Garantía de"><select className="input" value={f.warranty_part} onChange={(e) => setF({ ...f, warranty_part: e.target.value })}>{Object.entries(PART).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {sale && <div className={`rounded-xl px-3 py-2 text-xs ${inW ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{inW ? 'En garantía' : 'Fuera de garantía'} · {months} meses desde la entrega ({fdate(from)}) → hasta <b>{fdate(until)}</b></div>}
        </div>}
        <Field label="Motivo"><textarea className="input" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Describe el problema reportado por el cliente" /></Field>
      </div>
    </Modal>
  )
}

function Reemplazo({ rma, branchId, staffId, onDone }: { rma: Rma; branchId: string; staffId: string | null; onDone: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [prod, setProd] = useState<{ id: string; name: string; sku: string } | null>(null)
  const [lab, setLab] = useState(rma.warranty_part === 'armazon')
  const [busy, setBusy] = useState(false)
  const r = useQuery({ queryKey: ['rma-prod', q, branchId], queryFn: () => gql<{ products: { id: string; sku: string; name: string; stock: { qty: number }[] }[] }>(PRODS, { q: `%${q}%`, branch: branchId }), enabled: q.length >= 2 })
  const go = async () => { setBusy(true); try { await gql(REPLACE, { id: rma.id, p: prod?.id ?? null, lab, st: staffId }); onDone(`${rma.number}: ${prod ? `cambio por ${prod.name} (sale de stock)` : ''}${prod && lab ? ' · ' : ''}${lab ? 'orden de laboratorio creada' : ''}`) } finally { setBusy(false) } }
  return <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3 space-y-2">
    <div className="text-xs font-semibold text-violet-800">Cambio por otra unidad</div>
    <div className="relative">{prod ? <div className="input h-9 flex items-center gap-2 text-sm"><b>{prod.name}</b><span className="text-xs text-slate-400">{prod.sku}</span><button className="ml-auto text-xs text-slate-400" onClick={() => setProd(null)}>cambiar</button></div>
      : <><input className="input h-9" placeholder="Buscar la unidad que se entrega (SKU o nombre)…" value={q} onChange={(e) => setQ(e.target.value)} />{q.length >= 2 && <div className="absolute z-20 mt-1 w-full card p-1">{(r.data?.products ?? []).map((p) => <button key={p.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm flex justify-between" onClick={() => { setProd(p); setQ('') }}><span><b>{p.name}</b> <span className="text-xs text-slate-400 font-mono">{p.sku}</span></span><span className="text-xs text-slate-500">{p.stock[0]?.qty ?? 0} disp.</span></button>)}</div>}</>}</div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />Crear orden de laboratorio para fabricar los cristales de nuevo</label>
    <button className="btn-primary h-8 text-xs" disabled={busy || (!prod && !lab)} onClick={go}>Registrar cambio</button>
  </div>
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus, Building2, ArrowRight, CheckCircle2, FileText, Trash2 } from 'lucide-react'
import { useApp } from '../lib/app'
import { sb, run, runAll, write } from '../lib/supabase'
import { createTransfer, insertNested, transferSend } from '../lib/ops'
import { Card, PageHeader, Loading, StatusBadge, Modal, Field, Tabs, Badge, Empty, Toast, KPI } from '../components/ui'
import { money, fdate, STATUS_LABEL } from '../lib/format'
import { Bars } from '../components/charts'
import type { IntercompanyDoc } from '../lib/types'

type ICData = { docs: Doc[]; rules: Rule[]; balances: { issuer_company_id: string; receiver_company_id: string; pending_total: number | null; paid_total: number | null; docs: number; issuer_company: { code: string }; receiver_company: { code: string } }[]; audit: { id: number; action: string; actor?: string; entity_id: string; created_at: string; data: Record<string, unknown> }[] }
async function loadIC(company: string, codes: Map<string, string>): Promise<ICData> {
  const [docs, rules, balances, audit] = await Promise.all([
    run(sb.from('intercompany_docs').select('id,number,issuer_company_id,receiver_company_id,doc_date,due_date,concept,origin_type,subtotal,tax,total,status,ar_status,ap_status,zoho_invoice_id,zoho_bill_id,zoho_sync_status,created_at,issuer_company:companies!issuer_company_id(code,legal_name),receiver_company:companies!receiver_company_id(code,legal_name),creator:staff!created_by(name),intercompany_items(id,description,qty,unit_price,line_total)')
      .or(`issuer_company_id.eq.${company},receiver_company_id.eq.${company}`).order('doc_date', { ascending: false })),
    run(sb.from('intercompany_rules').select('id,issuer_company_id,receiver_company_id,markup_pct,auto_on_transfer,auto_on_lab_order,payment_terms_days,active,issuer_company:companies!issuer_company_id(code),receiver_company:companies!receiver_company_id(code)').order('issuer_company_id')),
    run(sb.from('v_intercompany_balance').select('issuer_company_id,receiver_company_id,pending_total,paid_total,docs')),
    run(sb.from('audit_log').select('id,action,actor,entity_id,created_at,data').eq('entity', 'intercompany_docs').order('created_at', { ascending: false }).limit(20)),
  ])
  const code = (id: string) => ({ code: codes.get(id) ?? '' })
  return {
    docs: docs as unknown as Doc[], rules: rules as unknown as Rule[], audit: audit as unknown as ICData['audit'],
    balances: (balances as { issuer_company_id: string; receiver_company_id: string; pending_total: number | null; paid_total: number | null; docs: number }[]).map((b) => ({ ...b, issuer_company: code(b.issuer_company_id), receiver_company: code(b.receiver_company_id) })),
  }
}









const loadICProducts = (branch: string) => runAll(() => sb.from('products').select('id,sku,name,cost,stock(qty)').eq('active', true).eq('track_stock', true).eq('stock.branch_id', branch).order('name').order('id')).then((products) => ({ products: products as unknown as ICProduct[] }))



type ICProduct = { id: string; sku: string; name: string; cost: number; stock: { qty: number }[] }

type Doc = IntercompanyDoc & { creator?: { name: string } }
type Rule = { id: string; issuer_company_id: string; receiver_company_id: string; markup_pct: number; auto_on_transfer: boolean; auto_on_lab_order: boolean; payment_terms_days: number; active: boolean; issuer_company: { code: string }; receiver_company: { code: string } }

export default function Intercompany() {
  const { company, companies, branches, branch, me } = useApp()
  const [tab, setTab] = useState<'docs' | 'cobrar' | 'pagar' | 'reglas' | 'auditoria'>('docs')
  const [sel, setSel] = useState<Doc | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['ic', company?.id], queryFn: () => loadIC(company!.id, new Map(companies.map((c) => [c.id, c.code]))), enabled: !!company })
  if (q.isLoading) return <Loading />
  const docs = q.data?.docs ?? []
  const ar = docs.filter((d) => d.issuer_company_id === company?.id)
  const ap = docs.filter((d) => d.receiver_company_id === company?.id)
  const arPending = ar.filter((d) => d.ar_status === 'pendiente' && d.status !== 'anulado').reduce((a, d) => a + Number(d.total), 0)
  const apPending = ap.filter((d) => d.ap_status === 'pendiente' && d.status !== 'anulado').reduce((a, d) => a + Number(d.total), 0)
  const list = tab === 'cobrar' ? ar : tab === 'pagar' ? ap : docs
  const monthly = Object.values(docs.reduce<Record<string, { month: string; emitido: number; recibido: number }>>((a, d) => { const m = d.doc_date.slice(0, 7); a[m] ??= { month: fdate(d.doc_date, 'MMM yy'), emitido: 0, recibido: 0 }; if (d.issuer_company_id === company?.id) a[m].emitido += Number(d.total); else a[m].recibido += Number(d.total); return a }, {})).slice(0, 6).reverse()

  const act = async (d: Doc, set: Record<string, unknown>, msg: string) => { await write(() => sb.from('intercompany_docs').update(set).eq('id', d.id)); setSel(null); setToast(msg); void q.refetch() }

  return (
    <div className="space-y-4">
      <PageHeader title="Intercompany" subtitle={`Facturación entre compañías del grupo · ${company?.legal_name}`} actions={<button className="btn-primary" onClick={() => setNuevo(true)}><Plus size={15} />Documento manual</button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Por cobrar (emisora)" value={money(arPending)} hint={`${ar.filter((d) => d.ar_status === 'pendiente').length} documentos`} tone="green" icon={<ArrowRight size={15} />} />
        <KPI label="Por pagar (receptora)" value={money(apPending)} hint={`${ap.filter((d) => d.ap_status === 'pendiente').length} documentos`} tone="rose" icon={<ArrowRight size={15} />} />
        <KPI label="Posición neta" value={money(arPending - apPending)} tone={arPending - apPending >= 0 ? 'green' : 'amber'} />
        <KPI label="Sync Zoho pendiente" value={docs.filter((d) => d.zoho_sync_status !== 'sincronizado' && d.status !== 'anulado').length} hint="Invoice emisora + Bill receptora" tone="violet" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Saldos entre compañías" subtitle="Pendiente por relación" className="lg:col-span-1">
          <ul className="space-y-2">{(q.data?.balances ?? []).map((b, i) => <li key={i} className="flex items-center justify-between text-sm rounded-xl bg-slate-50 px-3 py-2"><span className="flex items-center gap-1 font-semibold"><Building2 size={13} className="text-slate-400" />{b.issuer_company.code} <ArrowRight size={12} className="text-slate-400" /> {b.receiver_company.code}</span><span><b className={clsx(Number(b.pending_total) > 0 && 'text-amber-700')}>{money(b.pending_total)}</b> <span className="text-xs text-slate-400">/ pagado {money(b.paid_total)}</span></span></li>)}</ul>
        </Card>
        <Card title="Flujo mensual" subtitle="Emitido vs. recibido por esta compañía" className="lg:col-span-2"><Bars data={monthly} x="month" series={[{ key: 'emitido', label: 'Emitido (CxC)', color: '#10b981' }, { key: 'recibido', label: 'Recibido (CxP)', color: '#ef4444' }]} height={180} /></Card>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'docs', label: 'Todos', count: docs.length }, { value: 'cobrar', label: 'Cuentas por cobrar', count: ar.length }, { value: 'pagar', label: 'Cuentas por pagar', count: ap.length }, { value: 'reglas', label: 'Reglas' }, { value: 'auditoria', label: 'Auditoría' }]} />
      {tab === 'reglas' ? <Reglas rules={q.data?.rules ?? []} companies={companies} onSaved={() => { setToast('Regla guardada'); void q.refetch() }} />
        : tab === 'auditoria' ? <Card padded={false}><table className="table"><thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Documento</th><th>Detalle</th></tr></thead><tbody>{(q.data?.audit ?? []).map((a) => <tr key={a.id}><td className="text-xs text-slate-500">{fdate(a.created_at, 'dd MMM yyyy HH:mm')}</td><td><Badge tone={a.action === 'insert' ? 'green' : a.action === 'delete' ? 'rose' : 'blue'}>{a.action}</Badge></td><td className="text-xs">{a.actor ?? 'sistema'}</td><td className="font-mono text-xs">{String(a.data?.number ?? a.entity_id)}</td><td className="text-xs text-slate-600">{String(a.data?.status ?? '')} · {money(Number(a.data?.total ?? 0))}</td></tr>)}{(q.data?.audit ?? []).length === 0 && <tr><td colSpan={5}><Empty title="Sin eventos de auditoría todavía" hint="Cada alta/cambio/baja de documento intercompany queda registrado con actor y payload." /></td></tr>}</tbody></table></Card>
        : <Card padded={false}>{list.length === 0 ? <Empty title="Sin documentos" /> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Nº</th><th>Fecha</th><th>Emisora → Receptora</th><th>Concepto</th><th>Origen</th><th>Estado</th><th>CxC / CxP</th><th>Zoho</th><th className="text-right">Total</th></tr></thead>
          <tbody>{list.map((d) => <tr key={d.id} className="cursor-pointer" onClick={() => setSel(d)}>
            <td className="font-mono text-xs">{d.number}</td><td className="text-xs text-slate-500">{fdate(d.doc_date)}<div className="text-[10px]">vence {fdate(d.due_date)}</div></td>
            <td className="text-sm"><b className={clsx(d.issuer_company_id === company?.id && 'text-emerald-700')}>{d.issuer_company?.code}</b> → <b className={clsx(d.receiver_company_id === company?.id && 'text-rose-700')}>{d.receiver_company?.code}</b></td>
            <td className="text-xs text-slate-600 max-w-xs truncate">{d.concept}</td><td><Badge tone="slate">{STATUS_LABEL[d.origin_type ?? ''] ?? d.origin_type}</Badge></td><td><StatusBadge status={d.status} /></td>
            <td className="text-xs"><StatusBadge status={d.ar_status} /> <StatusBadge status={d.ap_status} /></td>
            <td><StatusBadge status={d.zoho_sync_status} /></td><td className="text-right font-semibold">{money(d.total)}</td>
          </tr>)}</tbody>
        </table></div>}</Card>}

      <Modal open={!!sel} onClose={() => setSel(null)} title={<span className="flex items-center gap-2">{sel?.number} <StatusBadge status={sel?.status ?? ''} /></span>} size="md"
        footer={sel && sel.status !== 'anulado' && sel.status !== 'pagado' && <>
          <button className="btn-ghost text-rose-600" onClick={() => act(sel, { status: 'anulado' }, 'Documento anulado')}><Trash2 size={14} />Anular</button>
          {sel.status === 'emitido' && sel.receiver_company_id === company?.id && <button className="btn-secondary" onClick={() => act(sel, { status: 'aceptado' }, 'Documento aceptado por la receptora')}><CheckCircle2 size={15} />Aceptar</button>}
          <button className="btn-success" onClick={() => act(sel, { status: 'pagado', ar_status: 'cobrado', ap_status: 'pagado' }, 'Marcado como pagado/cobrado')}>Marcar pagado</button>
        </>}>
        {sel && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3"><div className="label text-emerald-700">Emisora · cuenta por cobrar</div><b>{sel.issuer_company?.legal_name}</b><div className="text-xs mt-1"><StatusBadge status={sel.ar_status} /> {sel.zoho_invoice_id && <span className="font-mono text-slate-500">Books {sel.zoho_invoice_id}</span>}</div></div>
            <div className="rounded-xl bg-rose-50 p-3"><div className="label text-rose-700">Receptora · cuenta por pagar</div><b>{sel.receiver_company?.legal_name}</b><div className="text-xs mt-1"><StatusBadge status={sel.ap_status} /> {sel.zoho_bill_id && <span className="font-mono text-slate-500">Bill {sel.zoho_bill_id}</span>}</div></div>
          </div>
          <div><div className="label">Concepto</div>{sel.concept} <Badge tone="slate">{STATUS_LABEL[sel.origin_type ?? ''] ?? sel.origin_type}</Badge><div className="text-xs text-slate-500 mt-1">Fecha {fdate(sel.doc_date)} · vence {fdate(sel.due_date)} · creado por {sel.creator?.name ?? 'sistema'}</div></div>
          <table className="table"><thead><tr><th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">P. unit.</th><th className="text-right">Importe</th></tr></thead><tbody>{sel.intercompany_items?.map((i) => <tr key={i.id}><td>{i.description}</td><td className="text-right">{i.qty}</td><td className="text-right">{money(i.unit_price)}</td><td className="text-right font-semibold">{money(i.line_total)}</td></tr>)}</tbody></table>
          <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1"><div className="flex justify-between"><span>Subtotal</span><span>{money(sel.subtotal)}</span></div><div className="flex justify-between"><span>ITBMS</span><span>{money(sel.tax)}</span></div><div className="flex justify-between font-extrabold text-base border-t border-slate-200 pt-1"><span>Total</span><span>{money(sel.total)}</span></div></div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1"><FileText size={11} />Sincronización Zoho: <StatusBadge status={sel.zoho_sync_status} /> · Invoice en Books de la emisora y Bill en Books de la receptora (org_id independientes).</div>
        </div>}
      </Modal>
      {nuevo && <NuevoDoc onClose={() => setNuevo(false)} onCreated={(n) => { setNuevo(false); setToast(n.includes("traspaso") ? `Documento ${n}` : `Documento ${n} emitido`); void q.refetch() }} companies={companies} issuerId={company!.id} prefix={company!.invoice_prefix} taxRate={Number(company!.tax_rate)} staffId={me?.id ?? null} branches={branches} currentBranchId={branch?.id ?? null} rules={q.data?.rules ?? []} />}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function Reglas({ rules, companies, onSaved }: { rules: Rule[]; companies: { id: string; code: string; legal_name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState({ issuer_company_id: companies[0]?.id ?? '', receiver_company_id: companies[1]?.id ?? '', markup_pct: 0, auto_on_transfer: true, auto_on_lab_order: false, payment_terms_days: 30, active: true })
  const save = async () => { await write(() => sb.from('intercompany_rules').upsert(f, { onConflict: 'issuer_company_id,receiver_company_id' })); onSaved() }
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Reglas configuradas" subtitle="Una regla por relación emisora → receptora" className="lg:col-span-2" padded={false}>
        <table className="table"><thead><tr><th>Emisora</th><th>Receptora</th><th>Margen</th><th>Auto traspaso</th><th>Auto orden lab.</th><th>Plazo</th><th>Estado</th></tr></thead><tbody>
          {rules.map((r) => <tr key={r.id} className="cursor-pointer" onClick={() => setF({ issuer_company_id: r.issuer_company_id, receiver_company_id: r.receiver_company_id, markup_pct: Number(r.markup_pct), auto_on_transfer: r.auto_on_transfer, auto_on_lab_order: r.auto_on_lab_order, payment_terms_days: r.payment_terms_days, active: r.active })}><td className="font-semibold">{r.issuer_company.code}</td><td className="font-semibold">{r.receiver_company.code}</td><td>{r.markup_pct}%</td><td>{r.auto_on_transfer ? <Badge tone="green">sí</Badge> : <Badge tone="slate">no</Badge>}</td><td>{r.auto_on_lab_order ? <Badge tone="green">sí</Badge> : <Badge tone="slate">no</Badge>}</td><td>{r.payment_terms_days} días</td><td>{r.active ? <Badge tone="green">activa</Badge> : <Badge tone="rose">inactiva</Badge>}</td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Crear / editar regla">
        <div className="space-y-3">
          <Field label="Emisora"><select className="input" value={f.issuer_company_id} onChange={(e) => setF({ ...f, issuer_company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></Field>
          <Field label="Receptora"><select className="input" value={f.receiver_company_id} onChange={(e) => setF({ ...f, receiver_company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Margen sobre costo %"><input type="number" className="input" value={f.markup_pct} onChange={(e) => setF({ ...f, markup_pct: Number(e.target.value) })} /></Field><Field label="Plazo de pago (días)"><input type="number" className="input" value={f.payment_terms_days} onChange={(e) => setF({ ...f, payment_terms_days: Number(e.target.value) })} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.auto_on_transfer} onChange={(e) => setF({ ...f, auto_on_transfer: e.target.checked })} />Generar automáticamente en traspasos</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.auto_on_lab_order} onChange={(e) => setF({ ...f, auto_on_lab_order: e.target.checked })} />Generar automáticamente en órdenes de laboratorio</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Regla activa</label>
          <button className="btn-primary w-full" disabled={f.issuer_company_id === f.receiver_company_id} onClick={save}>Guardar regla</button>
        </div>
      </Card>
    </div>
  )
}

function NuevoDoc({ onClose, onCreated, companies, issuerId, prefix, taxRate, staffId, branches, currentBranchId, rules }: { onClose: () => void; onCreated: (n: string) => void; companies: { id: string; code: string; legal_name: string }[]; issuerId: string; prefix: string; taxRate: number; staffId: string | null; branches: { id: string; name: string; company_id: string }[]; currentBranchId: string | null; rules: Rule[] }) {
  const [f, setF] = useState({ receiver_company_id: companies.find((c) => c.id !== issuerId)?.id ?? '', concept: '', origin_type: 'servicio', due: 30 })
  const [items, setItems] = useState([{ description: '', qty: 1, unit_price: 0 }])
  const isTr = f.origin_type === 'traspaso'
  const fromOpts = branches.filter((b) => b.company_id === issuerId), toOpts = branches.filter((b) => b.company_id === f.receiver_company_id)
  const [fromB, setFromB] = useState(fromOpts.find((b) => b.id === currentBranchId)?.id ?? fromOpts[0]?.id ?? '')
  const [toB, setToB] = useState('')
  const toBranch = toOpts.find((b) => b.id === toB) ? toB : (toOpts[0]?.id ?? '')
  const [tItems, setTItems] = useState<{ product_id: string; qty: number }[]>([])
  const [pq, setPq] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const prodQ = useQuery({ queryKey: ['ic-products', fromB], queryFn: () => loadICProducts(fromB), enabled: isTr && !!fromB })
  const prods = prodQ.data?.products ?? []
  const avail = (p?: ICProduct) => Number(p?.stock[0]?.qty ?? 0)
  const rule = rules.find((r) => r.issuer_company_id === issuerId && r.receiver_company_id === f.receiver_company_id && r.active && r.auto_on_transfer)
  const markup = Number(rule?.markup_pct ?? 0)
  const found = pq ? prods.filter((p) => (p.name.toLowerCase().includes(pq.toLowerCase()) || p.sku.toLowerCase().includes(pq.toLowerCase())) && avail(p) > 0).slice(0, 8) : []
  const trSubtotal = tItems.reduce((a, i) => { const p = prods.find((x) => x.id === i.product_id); return a + Math.round(Number(p?.cost ?? 0) * (1 + markup / 100) * 100) / 100 * i.qty }, 0)
  const trTax = Math.round(trSubtotal * taxRate) / 100
  const saveTransfer = async () => {
    setErr(null); setBusy(true)
    try {
      const t = { insert_transfers_one: await createTransfer({ number: `TR-${String(Date.now()).slice(-6)}`, from_branch_id: fromB, to_branch_id: toBranch, requested_by: staffId, note: f.concept || 'Traspaso intercompany' }, tItems.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_cost: prods.find((p) => p.id === i.product_id)?.cost ?? 0 }))) }
      const sent = { transfer_send: (await transferSend(t.insert_transfers_one.id, staffId)) as unknown as { intercompany_doc_id: string | null }[] }
      const docId = sent.transfer_send[0]?.intercompany_doc_id
      const d = docId ? { intercompany_docs_by_pk: (await run(sb.from('intercompany_docs').select('number,total').eq('id', docId).single())) as unknown as { number: string } } : null
      onCreated(`${d?.intercompany_docs_by_pk.number ?? ''} · traspaso ${t.insert_transfers_one.number} enviado (stock descontado en origen; la sucursal destino lo recibe en Stock → Traspasos)`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo emitir el traspaso') } finally { setBusy(false) }
  }
  const subtotal = items.reduce((a, i) => a + i.qty * i.unit_price, 0), tax = Math.round(subtotal * taxRate) / 100
  const save = async () => {
    const due = new Date(); due.setDate(due.getDate() + f.due)
    const doc = await insertNested('intercompany_docs', { number: `${prefix}-IC-${String(Date.now()).slice(-6)}`, issuer_company_id: issuerId, receiver_company_id: f.receiver_company_id, due_date: due.toISOString().slice(0, 10), concept: f.concept, origin_type: f.origin_type, subtotal, tax, total: subtotal + tax, status: 'emitido', created_by: staffId },
      'intercompany_items', 'doc_id', items.filter((i) => i.description).map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price, line_total: Math.round(i.qty * i.unit_price * 100) / 100 })))
    const r = { insert_intercompany_docs_one: doc }
    onCreated(r.insert_intercompany_docs_one.number)
  }
  return (
    <Modal open onClose={onClose} title="Documento intercompany manual" size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button>{isTr ? <button className="btn-primary" disabled={busy || !tItems.length || !fromB || !toBranch || !rule} onClick={saveTransfer}>Enviar traspaso · {money(trSubtotal + trTax)}</button> : <button className="btn-primary" disabled={!f.concept || !subtotal} onClick={save}>Emitir · {money(subtotal + tax)}</button>}</>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Emisora"><input className="input" disabled value={companies.find((c) => c.id === issuerId)?.legal_name} /></Field>
          <Field label="Receptora"><select className="input" value={f.receiver_company_id} onChange={(e) => setF({ ...f, receiver_company_id: e.target.value })}>{companies.filter((c) => c.id !== issuerId).map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></Field>
          <Field label="Concepto" className="col-span-2"><input className="input" value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} placeholder="Ej. servicios administrativos compartidos septiembre" /></Field>
          <Field label="Tipo"><select className="input" value={f.origin_type} onChange={(e) => setF({ ...f, origin_type: e.target.value })}>{['servicio', 'traspaso', 'orden_lab', 'manual'].map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}</select></Field>
          <Field label="Vencimiento (días)"><input type="number" className="input" value={f.due} onChange={(e) => setF({ ...f, due: Number(e.target.value) })} /></Field>
        </div>
        {isTr ? <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sucursal origen (emisora)"><select className="input" value={fromB} onChange={(e) => { setFromB(e.target.value); setTItems([]) }}>{fromOpts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Sucursal destino (receptora)"><select className="input" value={toBranch} onChange={(e) => setToB(e.target.value)}>{toOpts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          </div>
          {!rule ? <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3 py-2">No hay una regla activa con «Auto traspaso» entre estas compañías. Créala en la pestaña <b>Reglas</b> para poder facturar el traspaso.</div>
            : <div className="rounded-xl bg-violet-50 border border-violet-100 text-violet-800 text-xs px-3 py-2">Se valora a costo + {markup}% de margen. Al enviar se descuenta el stock en origen y se emite el documento intercompany; el destino suma el stock al recibirlo.</div>}
          <div className="relative"><span className="label">Añadir artículo</span><input className="input h-10" placeholder="Buscar por SKU o nombre…" value={pq} onChange={(e) => setPq(e.target.value)} />
            {found.length > 0 && <div className="absolute z-20 mt-1 w-full card p-1">{found.map((p) => <button key={p.id} type="button" className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm flex justify-between" onClick={() => { setTItems((it) => it.find((i) => i.product_id === p.id) ? it : [...it, { product_id: p.id, qty: 1 }]); setPq('') }}><span><b>{p.name}</b> <span className="text-xs text-slate-400 font-mono">{p.sku}</span></span><span className="text-xs text-slate-500">{avail(p)} disp.</span></button>)}</div>}
          </div>
          <table className="table"><thead><tr><th>Artículo</th><th>Disp.</th><th>Cant.</th><th className="text-right">P. unit.</th><th /></tr></thead><tbody>
            {tItems.map((i) => { const p = prods.find((x) => x.id === i.product_id); const pu = Math.round(Number(p?.cost ?? 0) * (1 + markup / 100) * 100) / 100; return <tr key={i.product_id}><td className="text-sm">{p?.name}</td><td className="text-xs text-slate-500">{avail(p)}</td><td><input type="number" className="input h-8 w-20" min={1} max={avail(p)} value={i.qty} onChange={(e) => setTItems(tItems.map((x) => (x.product_id === i.product_id ? { ...x, qty: Math.min(avail(p), Math.max(1, Number(e.target.value))) } : x)))} /></td><td className="text-right text-sm">{money(pu)}</td><td><button type="button" className="btn-ghost h-7 w-7 p-0 text-slate-400 hover:text-rose-600" onClick={() => setTItems(tItems.filter((x) => x.product_id !== i.product_id))}><Trash2 size={13} /></button></td></tr> })}
            {tItems.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-slate-400 py-6">{prodQ.isLoading ? 'Cargando inventario…' : 'Busca y añade artículos con stock en la sucursal origen'}</td></tr>}
          </tbody></table>
          <div className="text-right text-sm text-slate-600">Subtotal {money(trSubtotal)} · ITBMS {money(trTax)} · <b className="text-slate-900">Total {money(trSubtotal + trTax)}</b></div>
          {err && <div className="text-xs text-rose-600 font-semibold">{err}</div>}
        </div> : <>
        <div className="space-y-2">{items.map((i, k) => <div key={k} className="grid grid-cols-[1fr_70px_110px_32px] gap-2"><input className="input h-9" placeholder="Descripción" value={i.description} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, description: e.target.value } : x)))} /><input type="number" className="input h-9" value={i.qty} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, qty: Number(e.target.value) } : x)))} /><input type="number" className="input h-9" value={i.unit_price} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, unit_price: Number(e.target.value) } : x)))} /><button className="btn-ghost h-9 w-8 p-0 text-slate-400" onClick={() => setItems(items.filter((_, j) => j !== k))}><Trash2 size={13} /></button></div>)}<button className="btn-secondary h-8 text-xs" onClick={() => setItems([...items, { description: '', qty: 1, unit_price: 0 }])}><Plus size={12} />Línea</button></div>
        <div className="text-right text-sm text-slate-600">Subtotal {money(subtotal)} · ITBMS {money(tax)} · <b className="text-slate-900">Total {money(subtotal + tax)}</b></div>
        </>}
      </div>
    </Modal>
  )
}

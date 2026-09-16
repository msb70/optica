import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Search, ArrowLeftRight, ClipboardList, Tag, Send, PackageCheck, Plus, Trash2, AlertTriangle, Printer } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Modal, Field, Tabs, Badge, Empty, Toast, KPI } from '../components/ui'
import { money, fdate, CATEGORIES, num } from '../lib/format'
import type { Product, Transfer } from '../lib/types'

const STOCK_Q = `query Stock($branch: uuid!) { products(where:{active:{_eq:true}, track_stock:{_eq:true}}, order_by:[{category:asc},{name:asc}]) { id sku barcode name category brand model color cost price min_stock track_stock active stock(where:{branch_id:{_eq:$branch}}) { qty last_count_at } }
  moves: stock_movements(where:{branch_id:{_eq:$branch}}, order_by:{created_at:desc}, limit: 40) { id qty type note created_at product { name sku } staff { name } } }`
const TRANSFERS_Q = `query Transfers($branch: uuid!) { transfers(where:{_or:[{from_branch_id:{_eq:$branch}},{to_branch_id:{_eq:$branch}}]}, order_by:{created_at:desc}, limit:50) { id number status intercompany intercompany_doc_id note created_at sent_at received_at from_branch_id to_branch_id from_branch { name company { code } } to_branch { name company { code } } requester { name } transfer_items { id qty unit_cost product { name sku } } } }`
const NEW_TRANSFER = `mutation NewTransfer($o: transfers_insert_input!) { insert_transfers_one(object:$o) { id number } }`
const SEND = `mutation Send($id: uuid!, $staff: uuid) { transfer_send(args:{p_transfer_id:$id, p_staff_id:$staff}) { id status intercompany intercompany_doc_id } }`
const RECEIVE = `mutation Receive($id: uuid!, $staff: uuid) { transfer_receive(args:{p_transfer_id:$id, p_staff_id:$staff}) { id status } }`
const ADJUST = `mutation Adjust($o: stock_movements_insert_input!) { insert_stock_movements_one(object:$o) { id } }`
const COUNT = `mutation Count($objs: [stock_movements_insert_input!]!) { insert_stock_movements(objects:$objs) { affected_rows } }`

type P = Product & { stock: { qty: number; last_count_at?: string | null }[] }
type T = Transfer & { from_branch?: { name: string; company: { code: string } }; to_branch?: { name: string; company: { code: string } }; requester?: { name: string } }

export default function Stock() {
  const { branch, branches, companies, me } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'existencias' | 'traspasos' | 'conteo' | 'movimientos'>('existencias')
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [labels, setLabels] = useState<P[] | null>(null)
  const [adjust, setAdjust] = useState<P | null>(null)
  const [adj, setAdj] = useState({ qty: 0, note: '' })
  const [newT, setNewT] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [count, setCount] = useState<Record<string, number>>({})
  const q = useQuery({ queryKey: ['stock', branch?.id], queryFn: () => gql<{ products: P[]; moves: { id: string; qty: number; type: string; note?: string; created_at: string; product: { name: string; sku: string }; staff?: { name: string } }[] }>(STOCK_Q, { branch: branch!.id }), enabled: !!branch })
  const t = useQuery({ queryKey: ['transfers', branch?.id], queryFn: () => gql<{ transfers: T[] }>(TRANSFERS_Q, { branch: branch!.id }), enabled: !!branch && tab === 'traspasos' })
  const products = q.data?.products ?? []
  const rows = useMemo(() => products.map((p) => ({ ...p, qty: p.stock[0]?.qty ?? 0 })).filter((p) => (!onlyLow || p.qty <= p.min_stock) && (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))), [products, search, onlyLow])
  const totals = useMemo(() => ({ units: products.reduce((a, p) => a + (p.stock[0]?.qty ?? 0), 0), value: products.reduce((a, p) => a + (p.stock[0]?.qty ?? 0) * Number(p.cost), 0), retail: products.reduce((a, p) => a + (p.stock[0]?.qty ?? 0) * Number(p.price), 0), low: products.filter((p) => (p.stock[0]?.qty ?? 0) <= p.min_stock).length, out: products.filter((p) => (p.stock[0]?.qty ?? 0) === 0).length }), [products])
  const refresh = () => { void q.refetch(); void t.refetch(); void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['pos-products'] }) }

  const doAdjust = async () => { await gql(ADJUST, { o: { product_id: adjust!.id, branch_id: branch!.id, qty: adj.qty, type: 'ajuste', note: adj.note || 'Ajuste manual', staff_id: me?.id ?? null } }); setAdjust(null); setAdj({ qty: 0, note: '' }); setToast('Ajuste registrado'); refresh() }
  const doSend = async (id: string) => { const r = await gql<{ transfer_send: { intercompany: boolean }[] }>(SEND, { id, staff: me?.id ?? null }); setToast(r.transfer_send[0].intercompany ? 'Traspaso enviado · documento intercompany generado automáticamente' : 'Traspaso enviado · stock descontado'); refresh() }
  const doReceive = async (id: string) => { await gql(RECEIVE, { id, staff: me?.id ?? null }); setToast('Traspaso recibido · stock sumado'); refresh() }
  const doCount = async () => {
    const objs = Object.entries(count).filter(([id, v]) => { const p = products.find((x) => x.id === id); return p && v !== (p.stock[0]?.qty ?? 0) }).map(([id, v]) => { const p = products.find((x) => x.id === id)!; return { product_id: id, branch_id: branch!.id, qty: v - (p.stock[0]?.qty ?? 0), type: 'conteo', note: `Conteo físico: ${v} (sistema ${p.stock[0]?.qty ?? 0})`, staff_id: me?.id ?? null } })
    if (objs.length) await gql(COUNT, { objs }); setToast(`Conteo aplicado · ${objs.length} ajustes`); setCount({}); refresh()
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Almacén & Stock" subtitle={`${branch?.name} · stock por sucursal, traspasos, conteos y etiquetas`} actions={<><button className="btn-secondary" onClick={() => setLabels(rows.slice(0, 24))}><Tag size={15} />Etiquetas</button><button className="btn-primary" onClick={() => setNewT(true)}><ArrowLeftRight size={15} />Nuevo traspaso</button></>} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Unidades" value={num(totals.units)} tone="blue" />
        <KPI label="Valor a costo" value={money(totals.value)} tone="slate" />
        <KPI label="Valor a PVP" value={money(totals.retail)} tone="green" />
        <KPI label="Bajo mínimo" value={totals.low} tone="amber" icon={<AlertTriangle size={15} />} />
        <KPI label="Agotados" value={totals.out} tone="rose" />
      </div>
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'existencias', label: 'Existencias' }, { value: 'traspasos', label: 'Traspasos' }, { value: 'conteo', label: 'Conteo físico' }, { value: 'movimientos', label: 'Movimientos' }]} />
        {tab !== 'traspasos' && <div className="flex gap-2"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-8 h-9 w-64" placeholder="SKU o nombre…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><button className={clsx('btn-secondary h-9', onlyLow && 'bg-amber-50 border-amber-300 text-amber-700')} onClick={() => setOnlyLow(!onlyLow)}><AlertTriangle size={14} />Solo críticos</button></div>}
      </div>

      {q.isLoading ? <Loading /> : tab === 'existencias' ? (
        <Card padded={false}><div className="overflow-x-auto"><table className="table">
          <thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th className="text-right">Costo</th><th className="text-right">PVP</th><th className="text-right">Stock</th><th>Mín.</th><th>Último conteo</th><th></th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id} className={clsx(p.qty === 0 && 'bg-rose-50/40', p.qty > 0 && p.qty <= p.min_stock && 'bg-amber-50/40')}>
            <td className="font-mono text-xs">{p.sku}</td><td className="font-medium">{p.name}<div className="text-[11px] text-slate-400">{p.brand} {p.color}</div></td><td><Badge tone="slate">{CATEGORIES[p.category]}</Badge></td>
            <td className="text-right text-slate-500">{money(p.cost)}</td><td className="text-right">{money(p.price)}</td>
            <td className="text-right"><span className={clsx('font-extrabold text-base', p.qty === 0 ? 'text-rose-600' : p.qty <= p.min_stock ? 'text-amber-600' : 'text-slate-900')}>{p.qty}</span></td>
            <td className="text-xs text-slate-500">{p.min_stock}</td><td className="text-xs text-slate-500">{fdate(p.stock[0]?.last_count_at)}</td>
            <td><button className="btn-ghost h-7 text-xs" onClick={() => { setAdjust(p); setAdj({ qty: 0, note: '' }) }}>Ajustar</button></td>
          </tr>)}{rows.length === 0 && <tr><td colSpan={9}><Empty title="Sin productos" /></td></tr>}</tbody>
        </table></div></Card>
      ) : tab === 'traspasos' ? (
        <Card padded={false}>{t.isLoading ? <Loading /> : (t.data?.transfers.length ?? 0) === 0 ? <Empty title="Sin traspasos" /> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Nº</th><th>Origen → Destino</th><th>Artículos</th><th>Solicitó</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
          <tbody>{t.data!.transfers.map((x) => <tr key={x.id}>
            <td className="font-mono text-xs">{x.number}{x.intercompany && <Badge tone="violet" className="ml-1">intercompany</Badge>}</td>
            <td className="text-sm"><b>{x.from_branch?.name}</b> <span className="text-slate-400 text-xs">{x.from_branch?.company.code}</span> → <b>{x.to_branch?.name}</b> <span className="text-slate-400 text-xs">{x.to_branch?.company.code}</span></td>
            <td className="text-xs text-slate-600 max-w-xs truncate">{x.transfer_items?.map((i) => `${i.qty}× ${i.product?.name}`).join(', ')}</td>
            <td className="text-xs">{x.requester?.name}</td><td className="text-xs text-slate-500">{fdate(x.created_at)}</td><td><StatusBadge status={x.status} /></td>
            <td className="text-right">{x.status === 'borrador' && x.from_branch_id === branch?.id && <button className="btn-primary h-8 text-xs" onClick={() => doSend(x.id)}><Send size={13} />Enviar</button>}{x.status === 'enviado' && x.to_branch_id === branch?.id && <button className="btn-success h-8 text-xs" onClick={() => doReceive(x.id)}><PackageCheck size={13} />Recibir</button>}</td>
          </tr>)}</tbody>
        </table></div>}</Card>
      ) : tab === 'conteo' ? (
        <Card title="Conteo físico" subtitle="Introduce las cantidades contadas; las diferencias se registran como movimientos de tipo conteo." actions={<button className="btn-primary" disabled={!Object.keys(count).length} onClick={doCount}><ClipboardList size={15} />Aplicar conteo ({Object.keys(count).length})</button>} padded={false}>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto"><table className="table"><thead><tr><th>SKU</th><th>Producto</th><th className="text-right">Sistema</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th></tr></thead><tbody>
            {rows.map((p) => { const c = count[p.id]; const diff = c === undefined ? null : c - p.qty; return <tr key={p.id}><td className="font-mono text-xs">{p.sku}</td><td className="text-sm">{p.name}</td><td className="text-right font-semibold">{p.qty}</td><td className="text-right"><input type="number" className="input h-8 w-20 text-right" value={c ?? ''} placeholder={String(p.qty)} onChange={(e) => setCount({ ...count, [p.id]: Number(e.target.value) })} /></td><td className={clsx('text-right font-bold', diff === null ? 'text-slate-300' : diff === 0 ? 'text-emerald-600' : 'text-rose-600')}>{diff === null ? '—' : diff > 0 ? `+${diff}` : diff}</td></tr> })}
          </tbody></table></div>
        </Card>
      ) : (
        <Card padded={false}><div className="overflow-x-auto"><table className="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th className="text-right">Cant.</th><th>Nota</th><th>Usuario</th></tr></thead><tbody>
          {(q.data?.moves ?? []).map((m) => <tr key={m.id}><td className="text-xs text-slate-500">{fdate(m.created_at, 'dd MMM HH:mm')}</td><td className="text-sm">{m.product.name} <span className="text-xs text-slate-400 font-mono">{m.product.sku}</span></td><td><Badge tone={m.qty > 0 ? 'green' : 'rose'}>{m.type}</Badge></td><td className={clsx('text-right font-bold', m.qty > 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td><td className="text-xs text-slate-600">{m.note}</td><td className="text-xs">{m.staff?.name}</td></tr>)}
        </tbody></table></div></Card>
      )}

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={`Ajuste de stock · ${adjust?.name}`} size="sm" footer={<><button className="btn-secondary" onClick={() => setAdjust(null)}>Cancelar</button><button className="btn-primary" disabled={!adj.qty} onClick={doAdjust}>Aplicar</button></>}>
        <p className="text-sm text-slate-600 mb-3">Stock actual: <b>{adjust?.stock[0]?.qty ?? 0}</b> uds</p>
        <Field label="Cantidad (+ entrada / − salida)"><input type="number" className="input h-11 text-lg font-bold" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: Number(e.target.value) })} autoFocus /></Field>
        <Field label="Motivo" className="mt-3"><input className="input" placeholder="Merma, rotura, corrección…" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!labels} onClose={() => setLabels(null)} title="Etiquetas de precio" size="lg" footer={<button className="btn-primary" onClick={() => window.print()}><Printer size={15} />Imprimir</button>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {(labels ?? []).map((p) => <div key={p.id} className="border border-dashed border-slate-300 rounded-lg p-2 text-center"><div className="text-[10px] text-slate-500 truncate">{p.brand}</div><div className="text-xs font-semibold leading-tight h-8 overflow-hidden">{p.name}</div><div className="font-mono text-[10px] tracking-widest mt-1 bg-slate-900 text-white rounded px-1 inline-block">▌▌▌ {p.sku} ▌▌</div><div className="text-base font-extrabold mt-1">{money(p.price)}</div></div>)}
        </div>
      </Modal>

      {newT && <NuevoTraspaso onClose={() => setNewT(false)} onCreated={(n) => { setNewT(false); setToast(`Traspaso ${n} creado en borrador`); setTab('traspasos'); refresh() }} products={products} fromBranchId={branch!.id} branches={branches} companies={companies} requesterId={me?.id ?? null} />}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function NuevoTraspaso({ onClose, onCreated, products, fromBranchId, branches, companies, requesterId }: { onClose: () => void; onCreated: (n: string) => void; products: P[]; fromBranchId: string; branches: { id: string; name: string; company_id: string }[]; companies: { id: string; code: string }[]; requesterId: string | null }) {
  const [to, setTo] = useState(branches.find((b) => b.id !== fromBranchId)?.id ?? '')
  const [items, setItems] = useState<{ product_id: string; qty: number }[]>([])
  const [search, setSearch] = useState('')
  const from = branches.find((b) => b.id === fromBranchId), dest = branches.find((b) => b.id === to)
  const ic = from && dest && from.company_id !== dest.company_id
  const filtered = products.filter((p) => search && (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())) && (p.stock[0]?.qty ?? 0) > 0).slice(0, 8)
  const save = async () => {
    const r = await gql<{ insert_transfers_one: { number: string } }>(NEW_TRANSFER, { o: { number: `TR-${String(Date.now()).slice(-6)}`, from_branch_id: fromBranchId, to_branch_id: to, status: 'borrador', requested_by: requesterId, note: 'Creado desde Stock', transfer_items: { data: items.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_cost: products.find((p) => p.id === i.product_id)?.cost ?? 0 })) } } })
    onCreated(r.insert_transfers_one.number)
  }
  return (
    <Modal open onClose={onClose} title="Nuevo traspaso entre sucursales" size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={!items.length || !to} onClick={save}>Crear borrador</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origen"><input className="input" disabled value={from?.name ?? ''} /></Field>
          <Field label="Destino"><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{branches.filter((b) => b.id !== fromBranchId).map((b) => <option key={b.id} value={b.id}>{b.name} · {companies.find((c) => c.id === b.company_id)?.code}</option>)}</select></Field>
        </div>
        {ic && <div className="rounded-xl bg-violet-50 border border-violet-100 text-violet-800 text-xs px-3 py-2">Traspaso <b>intercompany</b>: al enviarlo se generará automáticamente el documento de facturación entre compañías según la regla configurada (cuenta por cobrar en la emisora, cuenta por pagar en la receptora, Invoice + Bill en Zoho Books).</div>}
        <div className="relative"><span className="label">Añadir artículo</span><input className="input h-10" placeholder="Buscar por SKU o nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {filtered.length > 0 && <div className="absolute z-20 mt-1 w-full card p-1">{filtered.map((p) => <button key={p.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm flex justify-between" onClick={() => { setItems((it) => it.find((i) => i.product_id === p.id) ? it : [...it, { product_id: p.id, qty: 1 }]); setSearch('') }}><span><b>{p.name}</b> <span className="text-xs text-slate-400 font-mono">{p.sku}</span></span><span className="text-xs text-slate-500">{p.stock[0]?.qty} disp.</span></button>)}</div>}
        </div>
        <table className="table"><thead><tr><th>Artículo</th><th>Disponible</th><th>Cantidad</th><th /></tr></thead><tbody>
          {items.map((i) => { const p = products.find((x) => x.id === i.product_id)!; return <tr key={i.product_id}><td className="text-sm">{p.name}</td><td className="text-xs text-slate-500">{p.stock[0]?.qty}</td><td><input type="number" className="input h-8 w-20" min={1} max={p.stock[0]?.qty ?? 0} value={i.qty} onChange={(e) => setItems(items.map((x) => (x.product_id === i.product_id ? { ...x, qty: Math.min(p.stock[0]?.qty ?? 0, Math.max(1, Number(e.target.value))) } : x)))} /></td><td><button className="btn-ghost h-7 w-7 p-0 text-slate-400 hover:text-rose-600" onClick={() => setItems(items.filter((x) => x.product_id !== i.product_id))}><Trash2 size={13} /></button></td></tr> })}
          {items.length === 0 && <tr><td colSpan={4} className="text-center text-xs text-slate-400 py-6"><Plus size={14} className="inline" /> Añade artículos con stock disponible</td></tr>}
        </tbody></table>
      </div>
    </Modal>
  )
}

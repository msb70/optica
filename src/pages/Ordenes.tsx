import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowRight, Bell, FlaskConical, Clock, CheckCircle2 } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Modal, Tabs, Badge, Empty, Toast } from '../components/ui'
import { fdate, fullName, ago, STATUS_LABEL } from '../lib/format'
import type { LabOrder } from '../lib/types'

const FLOW = ['pendiente', 'enviado', 'en_proceso', 'recibido', 'listo', 'entregado']
const Q = `query LabOrders($branch: uuid!, $closed: Boolean!) { lab_orders(where:{branch_id:{_eq:$branch}, status:{_nin: ["entregado","cancelado"]}}, order_by:{promised_at:asc}) @skip(if:$closed) { ...F }
  closed: lab_orders(where:{branch_id:{_eq:$branch}, status:{_in:["entregado","cancelado"]}}, order_by:{delivered_at:desc}, limit:60) @include(if:$closed) { ...F } }
  fragment F on lab_orders { id number status lab_name lens_type treatment frame promised_at sent_at received_at delivered_at notified_at notes created_at customer_id customer { first_name last_name phone } sale { number total } exam { rx_final } lab_order_events(order_by:{created_at:desc}) { id status note created_at } }`
const ADVANCE = `mutation Advance($id: uuid!, $set: lab_orders_set_input!, $ev: lab_order_events_insert_input!) { update_lab_orders_by_pk(pk_columns:{id:$id}, _set:$set) { id } insert_lab_order_events_one(object:$ev) { id } }`
const DELIVER_SALE = `mutation DeliverSale($number: String!) { update_sales(where:{number:{_eq:$number}}, _set:{delivery_status:"entregado", delivered_at:"now()"}) { affected_rows } }`
const NOTIFY = `mutation Notify($id: uuid!) { update_lab_orders_by_pk(pk_columns:{id:$id}, _set:{notified_at:"now()"}) { id } }`

export default function Ordenes() {
  const { branch, me } = useApp()
  const qc = useQueryClient()
  const [view, setView] = useState<'kanban' | 'cerradas'>('kanban')
  const [sel, setSel] = useState<LabOrder | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['lab', branch?.id, view], queryFn: () => gql<{ lab_orders?: LabOrder[]; closed?: LabOrder[] }>(Q, { branch: branch!.id, closed: view === 'cerradas' }), enabled: !!branch })
  const orders = q.data?.lab_orders ?? []
  const today = new Date().toISOString().slice(0, 10)

  const advance = async (o: LabOrder) => {
    const i = FLOW.indexOf(o.status); const nextS = FLOW[Math.min(FLOW.length - 1, i + 1)]
    const set: Record<string, unknown> = { status: nextS }
    if (nextS === 'enviado') set.sent_at = new Date().toISOString()
    if (nextS === 'recibido') set.received_at = new Date().toISOString()
    if (nextS === 'entregado') set.delivered_at = new Date().toISOString()
    await gql(ADVANCE, { id: o.id, set, ev: { lab_order_id: o.id, status: nextS, staff_id: me?.id ?? null, note: `Cambio de estado a ${STATUS_LABEL[nextS]}` } })
    if (nextS === 'entregado' && o.sale?.number) await gql(DELIVER_SALE, { number: o.sale.number })
    setToast(`${o.number} → ${STATUS_LABEL[nextS]}`); setSel(null); void q.refetch(); void qc.invalidateQueries({ queryKey: ['dash'] })
  }
  const notify = async (o: LabOrder) => { await gql(NOTIFY, { id: o.id }); setToast(`Notificación de entrega enviada a ${o.customer?.phone} (WhatsApp/SMS simulado)`); void q.refetch() }

  return (
    <div className="space-y-4">
      <PageHeader title="Órdenes / Encargos a laboratorio" subtitle={`${branch?.name} · flujo por estado con trazabilidad completa`} actions={<Tabs value={view} onChange={setView} items={[{ value: 'kanban', label: 'En curso', count: orders.length }, { value: 'cerradas', label: 'Entregadas' }]} />} />
      {q.isLoading ? <Loading /> : view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {FLOW.slice(0, 5).map((st) => {
            const col = orders.filter((o) => o.status === st || (st === 'en_proceso' && o.status === 'control_calidad'))
            return (
              <div key={st} className="rounded-2xl bg-slate-100/70 p-2 min-h-[12rem]">
                <div className="flex items-center justify-between px-2 py-1.5"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">{STATUS_LABEL[st]}</span><Badge tone="slate">{col.length}</Badge></div>
                <div className="space-y-2">
                  {col.map((o) => {
                    const late = o.promised_at && o.promised_at < today
                    return <button key={o.id} onClick={() => setSel(o)} className={clsx('card w-full text-left p-3 hover:border-brand-300 transition', late && 'border-rose-200')}>
                      <div className="flex items-center justify-between"><span className="font-mono text-[11px] text-slate-500">{o.number}</span>{late ? <Badge tone="rose"><Clock size={10} />atrasada</Badge> : <span className="text-[10px] text-slate-400">{fdate(o.promised_at, 'd MMM')}</span>}</div>
                      <div className="text-sm font-semibold mt-1 truncate">{fullName(o.customer)}</div>
                      <div className="text-xs text-slate-500 truncate">{o.lens_type}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><FlaskConical size={10} />{o.lab_name} · {ago(o.created_at)}</div>
                    </button>
                  })}
                  {col.length === 0 && <div className="text-xs text-slate-400 text-center py-6">—</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card padded={false}>{(q.data?.closed ?? []).length === 0 ? <Empty title="Sin órdenes entregadas" /> : <div className="overflow-x-auto"><table className="table"><thead><tr><th>Nº</th><th>Cliente</th><th>Lente</th><th>Laboratorio</th><th>Creada</th><th>Entregada</th><th>Días</th><th>Estado</th></tr></thead><tbody>{q.data!.closed!.map((o) => <tr key={o.id} className="cursor-pointer" onClick={() => setSel(o)}><td className="font-mono text-xs">{o.number}</td><td className="font-medium">{fullName(o.customer)}</td><td className="text-xs">{o.lens_type}</td><td className="text-xs">{o.lab_name}</td><td className="text-xs text-slate-500">{fdate(o.created_at)}</td><td className="text-xs text-slate-500">{fdate(o.delivered_at)}</td><td className="text-xs font-semibold">{o.delivered_at ? Math.round((new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 864e5) : '—'}</td><td><StatusBadge status={o.status} /></td></tr>)}</tbody></table></div>}</Card>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={<span className="flex items-center gap-2">{sel?.number} <StatusBadge status={sel?.status ?? ''} /></span>} size="md"
        footer={sel && !['entregado', 'cancelado'].includes(sel.status) && <>
          {['recibido', 'listo'].includes(sel.status) && <button className="btn-secondary" onClick={() => notify(sel)}><Bell size={15} />{sel.notified_at ? `Notificado ${ago(sel.notified_at)}` : 'Notificar cliente'}</button>}
          <button className="btn-primary" onClick={() => advance(sel)}>{sel.status === 'listo' ? <><CheckCircle2 size={15} />Marcar entregado</> : <>Avanzar a {STATUS_LABEL[FLOW[FLOW.indexOf(sel.status) + 1] ?? 'entregado']} <ArrowRight size={15} /></>}</button>
        </>}>
        {sel && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="label">Cliente</div><Link to={`/clientes/${sel.customer_id}`} className="font-semibold hover:text-brand-600">{fullName(sel.customer)}</Link><div className="text-xs text-slate-500">{sel.customer?.phone}</div></div>
            <div><div className="label">Venta</div><div className="font-mono text-xs">{sel.sale?.number ?? '—'}</div></div>
            <div><div className="label">Lente</div>{sel.lens_type}<div className="text-xs text-slate-500">{sel.treatment}</div></div>
            <div><div className="label">Armazón</div>{sel.frame}</div>
            <div><div className="label">Laboratorio</div>{sel.lab_name}</div>
            <div><div className="label">Promesa de entrega</div><span className={clsx(sel.promised_at && sel.promised_at < today && sel.status !== 'entregado' && 'text-rose-600 font-semibold')}>{fdate(sel.promised_at)}</span></div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">{FLOW.map((s, i) => <span key={s} className={clsx('flex items-center gap-1 text-[10px] font-semibold', FLOW.indexOf(sel.status) >= i ? 'text-brand-600' : 'text-slate-300')}><span className={clsx('h-2 w-2 rounded-full', FLOW.indexOf(sel.status) >= i ? 'bg-brand-600' : 'bg-slate-200')} />{STATUS_LABEL[s]}{i < FLOW.length - 1 && <span className="w-3 h-px bg-slate-200 mx-0.5" />}</span>)}</div>
          <div><div className="label">Trazabilidad</div><ol className="space-y-1.5">{sel.lab_order_events?.map((e) => <li key={e.id} className="flex items-center gap-2 text-xs"><StatusBadge status={e.status} /><span className="text-slate-600">{e.note}</span><span className="ml-auto text-slate-400">{fdate(e.created_at, 'dd MMM HH:mm')}</span></li>)}</ol></div>
        </div>}
      </Modal>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

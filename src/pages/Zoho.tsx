import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, Clock, Ban, BookOpen, Boxes, Users } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Tabs, Badge, Empty, Toast, KPI } from '../components/ui'
import { fdate, ago } from '../lib/format'
import type { ZohoJob } from '../lib/types'

const Q = `query Zoho($company: uuid!, $status: [String!]) {
  jobs: zoho_sync_queue(where:{company_id:{_eq:$company}, status:{_in:$status}}, order_by:{created_at:desc}, limit: 100) { id event_type target entity_id idempotency_key status attempts last_error next_retry_at zoho_id created_at processed_at payload }
  stats: zoho_sync_queue(where:{company_id:{_eq:$company}}) { status target }
}`
const RETRY = `mutation Retry($id: uuid!) { update_zoho_sync_queue_by_pk(pk_columns:{id:$id}, _set:{status:"pendiente", next_retry_at:null, last_error:null}) { id } }`
const DISCARD = `mutation Discard($id: uuid!) { update_zoho_sync_queue_by_pk(pk_columns:{id:$id}, _set:{status:"descartado"}) { id } }`
const TARGET_ICON: Record<string, React.ReactNode> = { books: <BookOpen size={13} />, inventory: <Boxes size={13} />, crm: <Users size={13} /> }
const EVENT_LABEL: Record<string, string> = { 'sale.completed': 'Venta → Invoice + Payment / Stock', 'customer.created': 'Cliente → Contact', 'quote.created': 'Cotización → Deal / Quote', 'intercompany.invoice': 'Intercompany → Invoice (emisora)', 'intercompany.bill': 'Intercompany → Bill (receptora)' }

export default function Zoho() {
  const { company } = useApp()
  const [tab, setTab] = useState<'pendiente' | 'error' | 'ok' | 'todos'>('pendiente')
  const [toast, setToast] = useState<string | null>(null)
  const statuses = { pendiente: ['pendiente', 'procesando'], error: ['error'], ok: ['ok'], todos: ['pendiente', 'procesando', 'ok', 'error', 'descartado'] }[tab]
  const q = useQuery({ queryKey: ['zoho', company?.id, tab], queryFn: () => gql<{ jobs: (ZohoJob & { payload: Record<string, unknown> })[]; stats: { status: string; target: string }[] }>(Q, { company: company!.id, status: statuses }), enabled: !!company, refetchInterval: 15_000 })
  const stats = (q.data?.stats ?? []).reduce<Record<string, number>>((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a }, {})
  const act = async (m: string, id: string, msg: string) => { await gql(m, { id }); setToast(msg); void q.refetch() }
  return (
    <div className="space-y-4">
      <PageHeader title="Sincronización Zoho" subtitle={`${company?.legal_name} · org_id ${company?.zoho_org_id ?? 'sin configurar'} · Books = source of truth contable`} actions={<button className="btn-secondary" onClick={() => q.refetch()}><RefreshCw size={15} className={clsx(q.isFetching && 'animate-spin')} />Actualizar</button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Pendientes" value={stats.pendiente ?? 0} tone="amber" icon={<Clock size={15} />} hint="en cola" />
        <KPI label="Con error" value={stats.error ?? 0} tone="rose" icon={<AlertTriangle size={15} />} hint="reintento automático con backoff" />
        <KPI label="Sincronizados" value={stats.ok ?? 0} tone="green" icon={<CheckCircle2 size={15} />} />
        <KPI label="Descartados" value={stats.descartado ?? 0} tone="slate" icon={<Ban size={15} />} />
      </div>
      <Card className="bg-gradient-to-br from-ink-900 to-ink-700 text-white border-0">
        <div className="grid md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Arquitectura</div><p className="mt-1 text-slate-200">Cada operación dispara un trigger en Postgres que encola un evento con <b>clave idempotente</b>. Un worker (Nhost Function o escenario Make) consume la cola, llama a la API de Zoho con OAuth 2.0 y marca <b>ok</b> o <b>error</b> con reintentos.</p></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Zoho Books</div><p className="mt-1 text-slate-200">Venta final → Invoice + Payment. Intercompany → Invoice en la emisora y Bill en la receptora (org_id independiente por compañía).</p></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Zoho Inventory</div><p className="mt-1 text-slate-200">Salida de stock por venta y traspasos entre almacenes por sucursal.</p></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Zoho CRM</div><p className="mt-1 text-slate-200">Cliente nuevo → Contact. Cotización → Deal / Quote con seguimiento.</p><Badge tone="amber" className="mt-2">Worker: siguiente fase</Badge></div>
        </div>
      </Card>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'pendiente', label: 'Pendientes', count: stats.pendiente }, { value: 'error', label: 'Errores', count: stats.error }, { value: 'ok', label: 'OK' }, { value: 'todos', label: 'Todos' }]} />
      <Card padded={false}>{q.isLoading ? <Loading /> : (q.data?.jobs.length ?? 0) === 0 ? <Empty title="Sin eventos en esta vista" /> : <div className="overflow-x-auto"><table className="table">
        <thead><tr><th>Creado</th><th>Evento</th><th>Destino</th><th>Idempotencia</th><th>Estado</th><th>Intentos</th><th>Zoho ID / error</th><th></th></tr></thead>
        <tbody>{q.data!.jobs.map((j) => <tr key={j.id} className={clsx(j.status === 'error' && 'bg-rose-50/40')}>
          <td className="text-xs text-slate-500">{fdate(j.created_at, 'dd MMM HH:mm')}<div className="text-[10px]">{ago(j.created_at)}</div></td>
          <td className="text-sm"><b>{j.event_type}</b><div className="text-[11px] text-slate-500">{EVENT_LABEL[j.event_type]}</div></td>
          <td><Badge tone={j.target === 'books' ? 'blue' : j.target === 'inventory' ? 'amber' : 'violet'}>{TARGET_ICON[j.target]}{j.target}</Badge></td>
          <td className="font-mono text-[10px] text-slate-400 max-w-[180px] truncate">{j.idempotency_key}</td>
          <td><StatusBadge status={j.status} /></td><td className="text-center">{j.attempts}</td>
          <td className="text-xs">{j.zoho_id ? <span className="font-mono text-emerald-700">{j.zoho_id}</span> : j.last_error ? <span className="text-rose-600">{j.last_error}{j.next_retry_at && <div className="text-[10px] text-slate-400">reintento {ago(j.next_retry_at)}</div>}</span> : <span className="text-slate-400">—</span>}</td>
          <td><div className="flex gap-1 justify-end">{j.status === 'error' && <button className="btn-secondary h-7 text-xs" onClick={() => act(RETRY, j.id, 'Reencolado')}><RotateCcw size={12} />Reintentar</button>}{['error', 'pendiente'].includes(j.status) && <button className="btn-ghost h-7 text-xs text-slate-500" onClick={() => act(DISCARD, j.id, 'Descartado')}><Ban size={12} /></button>}</div></td>
        </tr>)}</tbody>
      </table></div>}</Card>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

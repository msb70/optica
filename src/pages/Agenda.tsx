import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Eye, Check, X as XIcon } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Avatar, Empty, Badge } from '../components/ui'
import { fdate, ftime, fullName, SOURCES } from '../lib/format'
import type { Appointment } from '../lib/types'

const Q = `query Agenda($branch: uuid!, $from: timestamptz!, $to: timestamptz!) { appointments(where:{branch_id:{_eq:$branch}, scheduled_at:{_gte:$from, _lt:$to}}, order_by:{scheduled_at:asc}) { id scheduled_at duration_min status source notes customer_id customer { id first_name last_name phone code } optometrist { name } } }`
const SET = `mutation SetAppt($id: uuid!, $status: String!) { update_appointments_by_pk(pk_columns:{id:$id}, _set:{status:$status}) { id } }`

export default function Agenda() {
  const { branch } = useApp()
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const next = new Date(day); next.setDate(next.getDate() + 1)
  const q = useQuery({ queryKey: ['agenda', branch?.id, day], queryFn: () => gql<{ appointments: Appointment[] }>(Q, { branch: branch!.id, from: `${day}T00:00:00`, to: next.toISOString().slice(0, 10) + 'T00:00:00' }), enabled: !!branch })
  const shift = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(d.toISOString().slice(0, 10)) }
  const set = async (id: string, status: string) => { await gql(SET, { id, status }); void q.refetch() }
  const list = q.data?.appointments ?? []
  const counts = list.reduce<Record<string, number>>((a, x) => { a[x.status] = (a[x.status] ?? 0) + 1; return a }, {})
  return (
    <div className="space-y-4">
      <PageHeader title="Agenda de citas" subtitle={`${branch?.name} · ${list.length} citas · ${counts.atendida ?? 0} atendidas · ${counts.no_show ?? 0} no asistieron`}
        actions={<div className="flex items-center gap-1"><button className="btn-secondary h-9 w-9 p-0" onClick={() => shift(-1)}><ChevronLeft size={16} /></button><input type="date" className="input h-9 w-40" value={day} onChange={(e) => setDay(e.target.value)} /><button className="btn-secondary h-9 w-9 p-0" onClick={() => shift(1)}><ChevronRight size={16} /></button><button className="btn-ghost h-9" onClick={() => setDay(new Date().toISOString().slice(0, 10))}>Hoy</button></div>} />
      <Card padded={false}>
        {q.isLoading ? <Loading /> : list.length === 0 ? <Empty title={`Sin citas el ${fdate(day)}`} hint="Agenda citas desde la ficha del cliente." /> : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
              <li key={a.id} className={clsx('flex items-center gap-4 px-5 py-3', a.status === 'cancelada' && 'opacity-50')}>
                <div className="w-14 text-center"><div className="text-lg font-extrabold text-slate-900">{ftime(a.scheduled_at)}</div><div className="text-[10px] text-slate-400">{a.duration_min} min</div></div>
                <Avatar name={fullName(a.customer)} />
                <div className="flex-1 min-w-0"><Link to={`/clientes/${a.customer_id}`} className="font-semibold text-slate-800 hover:text-brand-600">{fullName(a.customer)}</Link><div className="text-xs text-slate-500">{a.customer?.phone} · {a.optometrist?.name ?? 'Sin optometrista'} · <Badge tone="slate">{SOURCES[a.source ?? ''] ?? a.source}</Badge></div></div>
                <StatusBadge status={a.status} />
                <div className="flex gap-1">
                  {['programada', 'confirmada'].includes(a.status) && <>
                    <button className="btn-secondary h-8 text-xs" onClick={() => set(a.id, 'confirmada')} title="Confirmar"><Check size={13} /></button>
                    <Link to={`/examenes/nuevo?customer=${a.customer_id}&appointment=${a.id}`} className="btn-primary h-8 text-xs"><Eye size={13} />Atender</Link>
                    <button className="btn-ghost h-8 text-xs text-rose-600" onClick={() => set(a.id, 'no_show')} title="No asistió"><XIcon size={13} /></button>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

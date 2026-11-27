import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Eye, Check, X as XIcon } from 'lucide-react'
import { useApp } from '../lib/app'
import { sb, run, write } from '../lib/supabase'
import { Card, PageHeader, Loading, StatusBadge, Avatar, Empty, Badge, Tabs } from '../components/ui'
import { fdate, ftime, fullName, SOURCES } from '../lib/format'
import type { Appointment } from '../lib/types'

const loadAgenda = (branch: string, from: string, to: string) => run(sb.from('appointments')
  .select('id,scheduled_at,duration_min,status,source,notes,customer_id,customer:customers(id,first_name,last_name,phone,code),optometrist:staff!optometrist_id(name)')
  .eq('branch_id', branch).gte('scheduled_at', from).lt('scheduled_at', to).order('scheduled_at')) as unknown as Promise<Appointment[]>

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)) // lunes
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const CHIP: Record<string, string> = { programada: 'bg-blue-50 text-blue-700 border-blue-100', confirmada: 'bg-indigo-50 text-indigo-700 border-indigo-100', atendida: 'bg-emerald-50 text-emerald-700 border-emerald-100', no_show: 'bg-rose-50 text-rose-700 border-rose-100', cancelada: 'bg-slate-50 text-slate-400 border-slate-100 line-through' }
type View = 'dia' | 'semana' | 'mes'

export default function Agenda() {
  const { branch } = useApp()
  const [view, setView] = useState<View>('dia')
  const [day, setDay] = useState(() => ymd(new Date()))
  const cur = parse(day)
  const range = view === 'dia' ? [cur, addDays(cur, 1)]
    : view === 'semana' ? [startOfWeek(cur), addDays(startOfWeek(cur), 7)]
    : (() => { const first = new Date(cur.getFullYear(), cur.getMonth(), 1); const gs = startOfWeek(first); return [gs, addDays(gs, 42)] })()
  const q = useQuery({ queryKey: ['agenda', branch?.id, view, ymd(range[0])], queryFn: () => loadAgenda(branch!.id, range[0].toISOString(), range[1].toISOString()).then((appointments) => ({ appointments })), enabled: !!branch })
  const shift = (n: number) => { const d = new Date(cur); if (view === 'dia') d.setDate(d.getDate() + n); else if (view === 'semana') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n, 1); setDay(ymd(d)) }
  const set = async (id: string, status: string) => { await write(() => sb.from('appointments').update({ status }).eq('id', id)); void q.refetch() }
  const all = q.data?.appointments ?? []
  const inMonth = (a: Appointment) => view !== 'mes' || new Date(a.scheduled_at).getMonth() === cur.getMonth()
  const list = all.filter(inMonth)
  const counts = list.reduce<Record<string, number>>((a, x) => { a[x.status] = (a[x.status] ?? 0) + 1; return a }, {})
  const byDay = (d: Date) => all.filter((a) => ymd(new Date(a.scheduled_at)) === ymd(d))
  const openDay = (d: Date) => { setDay(ymd(d)); setView('dia') }
  const today = ymd(new Date())
  const title = view === 'dia' ? fdate(day, "EEEE dd 'de' MMMM yyyy") : view === 'semana' ? `${fdate(ymd(range[0]), 'dd MMM')} – ${fdate(ymd(addDays(range[1], -1)), 'dd MMM yyyy')}` : `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`
  const Chip = ({ a }: { a: Appointment }) => <Link to={`/clientes/${a.customer_id}`} title={`${ftime(a.scheduled_at)} · ${fullName(a.customer)} · ${a.optometrist?.name ?? ''}`} className={clsx('block truncate rounded-md border px-1.5 py-0.5 text-[11px] leading-tight', CHIP[a.status] ?? CHIP.programada)}><b>{ftime(a.scheduled_at)}</b> {fullName(a.customer)}</Link>
  return (
    <div className="space-y-4">
      <PageHeader title="Agenda de citas" subtitle={`${branch?.name} · ${title} · ${list.length} citas · ${counts.atendida ?? 0} atendidas · ${counts.no_show ?? 0} no asistieron`}
        actions={<div className="flex flex-wrap items-center gap-2"><Tabs value={view} onChange={setView} items={[{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} /><div className="flex items-center gap-1"><button className="btn-secondary h-9 w-9 p-0" onClick={() => shift(-1)}><ChevronLeft size={16} /></button><input type="date" className="input h-9 w-40" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /><button className="btn-secondary h-9 w-9 p-0" onClick={() => shift(1)}><ChevronRight size={16} /></button><button className="btn-ghost h-9" onClick={() => setDay(today)}>Hoy</button></div></div>} />
      {view === 'dia' && <Card padded={false}>
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
      </Card>}
      {view === 'semana' && <Card padded={false}>{q.isLoading ? <Loading /> : <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[420px]">
        {Array.from({ length: 7 }, (_, i) => addDays(range[0], i)).map((d, i) => { const items = byDay(d); return <div key={i} className="flex flex-col min-w-0">
          <button onClick={() => openDay(d)} className={clsx('px-2 py-2 border-b border-slate-100 text-left hover:bg-slate-50', ymd(d) === today && 'bg-brand-50')}><div className="text-[10px] uppercase font-semibold text-slate-400">{WEEKDAYS[i]}</div><div className={clsx('text-lg font-extrabold', ymd(d) === today ? 'text-brand-700' : 'text-slate-800')}>{d.getDate()}</div><div className="text-[10px] text-slate-400">{items.length} citas</div></button>
          <div className="p-1.5 space-y-1 overflow-y-auto">{items.map((a) => <Chip key={a.id} a={a} />)}</div>
        </div> })}
      </div>}</Card>}
      {view === 'mes' && <Card padded={false}>{q.isLoading ? <Loading /> : <>
        <div className="grid grid-cols-7 border-b border-slate-100">{WEEKDAYS.map((w) => <div key={w} className="px-2 py-1.5 text-[10px] uppercase font-semibold text-slate-400">{w}</div>)}</div>
        <div className="grid grid-cols-7">{Array.from({ length: 42 }, (_, i) => addDays(range[0], i)).map((d, i) => { const items = byDay(d); const other = d.getMonth() !== cur.getMonth(); return <div key={i} onClick={() => openDay(d)} className={clsx('min-h-[96px] border-b border-r border-slate-100 p-1.5 cursor-pointer hover:bg-slate-50 min-w-0', other && 'bg-slate-50/60 text-slate-300', ymd(d) === today && 'bg-brand-50')}>
          <div className="flex justify-between items-center"><span className={clsx('text-xs font-bold', ymd(d) === today ? 'text-brand-700' : other ? 'text-slate-300' : 'text-slate-700')}>{d.getDate()}</span>{items.length > 0 && <span className="text-[10px] text-slate-400">{items.length}</span>}</div>
          <div className="mt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>{items.slice(0, 3).map((a) => <Chip key={a.id} a={a} />)}{items.length > 3 && <button className="text-[10px] text-brand-600 font-semibold" onClick={() => openDay(d)}>+{items.length - 3} más</button>}</div>
        </div> })}</div>
      </>}</Card>}
    </div>
  )
}

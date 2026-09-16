import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ShoppingCart, Eye, FileText, CalendarPlus, MessageSquare, Phone, Mail, MapPin, Cake, Receipt, FlaskConical, RotateCcw, Printer } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, Badge, Avatar, StatusBadge, Stat, Tabs, Field, Modal } from '../components/ui'
import RxTable from '../components/RxTable'
import { money, fdate, fdatetime, SOURCES, fullName, ago } from '../lib/format'
import type { Customer, Exam, Sale, Quote, LabOrder, Rma, Appointment } from '../lib/types'

const Q = `query Customer360($id: uuid!) {
  c: customers_by_pk(id:$id) { id code first_name last_name email phone tax_id birth_date gender address source referred_by balance tags notes created_at zoho_contact_id company_id branch_id branch { name } company { legal_name }
    sales(order_by:{sale_date:desc}) { id number sale_date total paid status delivery_status seller { name } branch { name } sale_items { id description qty line_total category } }
    exams(order_by:{exam_date:desc}) { id exam_date template reason rx_final rx_final_transposed autorefraction rx_initial diagnosis recommendation next_review_date optometrist { name } branch { name } }
    quotes(order_by:{created_at:desc}) { id number status total created_at valid_until seller { name } }
    lab_orders(order_by:{created_at:desc}) { id number status lab_name promised_at created_at lens_type }
    rmas(order_by:{created_at:desc}) { id number type status reason created_at }
    appointments(order_by:{scheduled_at:desc}) { id scheduled_at status optometrist { name } }
    customer_notes(order_by:{created_at:desc}) { id kind body created_at staff { name } }
  }
  timeline: v_customer_timeline(where:{customer_id:{_eq:$id}}, order_by:{at:desc}, limit: 60) { kind ref_id at title detail }
}`
const NOTE = `mutation Note($o: customer_notes_insert_input!) { insert_customer_notes_one(object:$o) { id } }`
const APPT = `mutation Appt($o: appointments_insert_input!) { insert_appointments_one(object:$o) { id } }`

type C = Customer & { branch?: { name: string }; company?: { legal_name: string }; sales: Sale[]; exams: Exam[]; quotes: Quote[]; lab_orders: LabOrder[]; rmas: Rma[]; appointments: Appointment[]; customer_notes: { id: string; kind: string; body: string; created_at: string; staff?: { name: string } }[] }
type TL = { kind: string; ref_id: string; at: string; title: string; detail: string }
const TL_ICON: Record<string, React.ReactNode> = { venta: <Receipt size={13} />, examen: <Eye size={13} />, cotizacion: <FileText size={13} />, cita: <CalendarPlus size={13} />, orden_lab: <FlaskConical size={13} />, rma: <RotateCcw size={13} />, nota: <MessageSquare size={13} /> }
const TL_TONE: Record<string, string> = { venta: 'bg-emerald-100 text-emerald-700', examen: 'bg-violet-100 text-violet-700', cotizacion: 'bg-brand-100 text-brand-700', cita: 'bg-cyan-100 text-cyan-700', orden_lab: 'bg-amber-100 text-amber-700', rma: 'bg-rose-100 text-rose-700', nota: 'bg-slate-100 text-slate-600' }

export default function ClienteDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const { me, staff, branch } = useApp()
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => gql<{ c: C; timeline: TL[] }>(Q, { id }), enabled: !!id })
  const [tab, setTab] = useState<'timeline' | 'rx' | 'compras' | 'cotizaciones' | 'ordenes' | 'citas'>('timeline')
  const [note, setNote] = useState('')
  const [noteKind, setNoteKind] = useState('nota')
  const [rxPrint, setRxPrint] = useState<Exam | null>(null)
  const [apptOpen, setApptOpen] = useState(false)
  const [appt, setAppt] = useState({ date: new Date().toISOString().slice(0, 10), time: '10:00', optometrist_id: '' })
  if (q.isLoading) return <Loading />
  const c = q.data?.c
  if (!c) return <div className="text-sm text-slate-500">Cliente no encontrado.</div>
  const totalSpent = c.sales.filter((s) => ['completada', 'parcial'].includes(s.status)).reduce((a, s) => a + Number(s.total), 0)
  const lastExam = c.exams[0]
  const today = new Date().toISOString().slice(0, 10)
  const rxExpired = lastExam?.next_review_date && lastExam.next_review_date < today
  const age = c.birth_date ? Math.floor((Date.now() - new Date(c.birth_date).getTime()) / 31557600000) : null

  const addNote = async () => { if (!note.trim()) return; await gql(NOTE, { o: { customer_id: c.id, staff_id: me?.id ?? null, kind: noteKind, body: note.trim() } }); setNote(''); void q.refetch() }
  const addAppt = async () => { await gql(APPT, { o: { company_id: c.company_id, branch_id: branch?.id ?? c.branch_id, customer_id: c.id, optometrist_id: appt.optometrist_id || null, scheduled_at: `${appt.date}T${appt.time}:00`, source: c.source } }); setApptOpen(false); void q.refetch() }

  return (
    <div className="space-y-4">
      <PageHeader title={<span className="flex items-center gap-3"><Avatar name={fullName(c)} className="h-11 w-11 text-base" />{fullName(c)}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{c.code}</span>· <Badge tone="slate">{SOURCES[c.source] ?? c.source}</Badge>{c.tags?.map((t) => <Badge key={t} tone="violet">{t}</Badge>)}· cliente desde {fdate(c.created_at, 'MMM yyyy')} · {c.branch?.name}{c.zoho_contact_id ? <Badge tone="green">Zoho CRM</Badge> : <Badge tone="amber">Zoho pendiente</Badge>}</span>}
        actions={<><button className="btn-secondary" onClick={() => setApptOpen(true)}><CalendarPlus size={15} />Cita</button><Link to={`/examenes/nuevo?customer=${c.id}`} className="btn-secondary"><Eye size={15} />Examen</Link><Link to={`/cotizaciones?new=${c.id}`} className="btn-secondary"><FileText size={15} />Cotizar</Link><button className="btn-primary" onClick={() => nav(`/pos?customer=${c.id}`)}><ShoppingCart size={15} />Vender</button></>} />

      <div className="grid md:grid-cols-4 gap-3">
        <Card className="p-4"><Stat label="Total comprado" value={money(totalSpent)} sub={`${c.sales.length} ventas`} /></Card>
        <Card className="p-4"><Stat label="Saldo" value={<span className={clsx(Number(c.balance) < 0 ? 'text-rose-600' : Number(c.balance) > 0 ? 'text-emerald-600' : '')}>{money(c.balance)}</span>} sub={Number(c.balance) < 0 ? 'Deuda pendiente' : Number(c.balance) > 0 ? 'A favor del cliente' : 'Sin saldo'} /></Card>
        <Card className="p-4"><Stat label="Última RX" value={lastExam ? fdate(lastExam.exam_date) : '—'} sub={lastExam ? <span className={clsx(rxExpired && 'text-rose-600 font-semibold')}>{rxExpired ? 'Vencida · ' : 'Revisión '}{fdate(lastExam.next_review_date)}</span> : 'Sin examen'} /></Card>
        <Card className="p-4"><Stat label="Órdenes activas" value={c.lab_orders.filter((o) => !['entregado', 'cancelado'].includes(o.status)).length} sub={`${c.rmas.length} reclamos históricos`} /></Card>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-4">
          <Card title="Datos">
            <ul className="text-sm space-y-2 text-slate-700">
              <li className="flex items-center gap-2"><Phone size={14} className="text-slate-400" />{c.phone ?? '—'}</li>
              <li className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /><span className="truncate">{c.email ?? '—'}</span></li>
              <li className="flex items-center gap-2"><Cake size={14} className="text-slate-400" />{c.birth_date ? `${fdate(c.birth_date)} · ${age} años` : '—'}</li>
              <li className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{c.address ?? '—'}</li>
              <li className="flex items-center gap-2 text-xs text-slate-500">Cédula/RUC: {c.tax_id ?? '—'} · Género: {c.gender ?? '—'}</li>
              {c.referred_by && <li className="text-xs text-slate-500">Referido por: {c.referred_by}</li>}
            </ul>
          </Card>
          <Card title="RX vigente" subtitle={lastExam ? `${fdate(lastExam.exam_date)} · ${lastExam.optometrist?.name ?? ''}` : undefined} actions={lastExam && <button className="btn-ghost h-7 text-xs" onClick={() => setRxPrint(lastExam)}><Printer size={13} />Imprimir</button>}>
            <RxTable rx={lastExam?.rx_final} compact />
            {lastExam?.diagnosis && <div className="mt-2 text-xs text-slate-600"><b>Dx:</b> {lastExam.diagnosis} · <b>Rec:</b> {lastExam.recommendation}</div>}
          </Card>
          <Card title="Notas y mensajes">
            <div className="flex gap-1.5 mb-2">
              <select className="input h-8 w-28 text-xs" value={noteKind} onChange={(e) => setNoteKind(e.target.value)}>{['nota', 'llamada', 'whatsapp', 'email', 'sms'].map((k) => <option key={k}>{k}</option>)}</select>
              <input className="input h-8 text-xs" placeholder="Escribe una nota…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
            </div>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {c.customer_notes.map((n) => <li key={n.id} className="text-xs rounded-xl bg-slate-50 p-2.5"><div className="flex items-center gap-1.5 text-slate-500 mb-0.5"><Badge tone="slate">{n.kind}</Badge>{n.staff?.name} · {ago(n.created_at)}</div><div className="text-slate-700">{n.body}</div></li>)}
              {c.customer_notes.length === 0 && <li className="text-xs text-slate-400">Sin notas</li>}
            </ul>
          </Card>
        </div>

        <Card padded={false}>
          <div className="px-5 pt-4"><Tabs value={tab} onChange={setTab} items={[{ value: 'timeline', label: 'Timeline' }, { value: 'rx', label: 'Historial RX', count: c.exams.length }, { value: 'compras', label: 'Compras', count: c.sales.length }, { value: 'cotizaciones', label: 'Cotizaciones', count: c.quotes.length }, { value: 'ordenes', label: 'Órdenes', count: c.lab_orders.length }, { value: 'citas', label: 'Citas', count: c.appointments.length }]} /></div>
          <div className="p-5">
            {tab === 'timeline' && (
              <ol className="relative border-l border-slate-200 ml-3 space-y-4">
                {(q.data?.timeline ?? []).map((t, i) => (
                  <li key={i} className="ml-5 relative">
                    <span className={clsx('absolute -left-[29px] top-0.5 h-6 w-6 rounded-full grid place-items-center ring-4 ring-white', TL_TONE[t.kind] ?? TL_TONE.nota)}>{TL_ICON[t.kind]}</span>
                    <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                    <div className="text-xs text-slate-500">{fdatetime(t.at)} {t.detail && <>· <StatusBadge status={t.detail} /></>}</div>
                  </li>
                ))}
              </ol>
            )}
            {tab === 'rx' && <div className="grid md:grid-cols-2 gap-3">{c.exams.map((e) => (
              <div key={e.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2"><div><div className="font-bold text-sm">{fdate(e.exam_date)} <Badge tone={e.template === 'nino' ? 'violet' : 'slate'}>{e.template}</Badge></div><div className="text-xs text-slate-500">{e.optometrist?.name} · {e.branch?.name} · {e.reason}</div></div><button className="btn-ghost h-7 text-xs" onClick={() => setRxPrint(e)}><Printer size={13} /></button></div>
                <RxTable rx={e.rx_final} title="RX final" compact />
                <div className="mt-2 text-xs text-slate-600"><b>Dx:</b> {e.diagnosis} · <b>Próx. revisión:</b> {fdate(e.next_review_date)}</div>
              </div>
            ))}</div>}
            {tab === 'compras' && <table className="table"><thead><tr><th>Nº</th><th>Fecha</th><th>Detalle</th><th>Vendedor</th><th>Estado</th><th className="text-right">Total</th></tr></thead><tbody>{c.sales.map((s) => <tr key={s.id}><td className="font-mono text-xs">{s.number}</td><td className="text-slate-500 text-xs">{fdate(s.sale_date)}</td><td className="text-xs">{s.sale_items?.map((i) => `${i.qty}× ${i.description}`).join(', ')}</td><td className="text-xs">{s.seller?.name}</td><td><StatusBadge status={s.status} /> <StatusBadge status={s.delivery_status} /></td><td className="text-right font-semibold">{money(s.total)}{Number(s.paid) < Number(s.total) && <div className="text-[10px] text-rose-600">pagado {money(s.paid)}</div>}</td></tr>)}</tbody></table>}
            {tab === 'cotizaciones' && <table className="table"><thead><tr><th>Nº</th><th>Fecha</th><th>Vendedor</th><th>Estado</th><th className="text-right">Total</th><th></th></tr></thead><tbody>{c.quotes.map((s) => <tr key={s.id}><td className="font-mono text-xs">{s.number}</td><td className="text-slate-500 text-xs">{fdate(s.created_at)} · válida hasta {fdate(s.valid_until)}</td><td className="text-xs">{s.seller?.name}</td><td><StatusBadge status={s.status} /></td><td className="text-right font-semibold">{money(s.total)}</td><td>{['abierta', 'seguimiento'].includes(s.status) && <Link to={`/pos?quote=${s.id}`} className="btn-primary h-7 text-xs">Convertir</Link>}</td></tr>)}</tbody></table>}
            {tab === 'ordenes' && <table className="table"><thead><tr><th>Nº</th><th>Fecha</th><th>Laboratorio</th><th>Lente</th><th>Promesa</th><th>Estado</th></tr></thead><tbody>{c.lab_orders.map((o) => <tr key={o.id}><td className="font-mono text-xs">{o.number}</td><td className="text-xs text-slate-500">{fdate(o.created_at)}</td><td className="text-xs">{o.lab_name}</td><td className="text-xs">{o.lens_type}</td><td className="text-xs">{fdate(o.promised_at)}</td><td><StatusBadge status={o.status} /></td></tr>)}</tbody></table>}
            {tab === 'citas' && <table className="table"><thead><tr><th>Fecha</th><th>Optometrista</th><th>Estado</th></tr></thead><tbody>{c.appointments.map((a) => <tr key={a.id}><td className="text-sm">{fdatetime(a.scheduled_at)}</td><td className="text-xs">{a.optometrist?.name}</td><td><StatusBadge status={a.status} /></td></tr>)}</tbody></table>}
          </div>
        </Card>
      </div>

      <Modal open={!!rxPrint} onClose={() => setRxPrint(null)} title="Receta óptica (RX)" size="sm" footer={<><button className="btn-primary" onClick={() => window.print()}><Printer size={15} />Imprimir</button></>}>
        {rxPrint && <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3"><img src="/favicon.svg" className="h-9 w-9" alt="" /><div><div className="font-extrabold">{c.company?.legal_name}</div><div className="text-xs text-slate-500">{rxPrint.branch?.name} · {fdate(rxPrint.exam_date)}</div></div></div>
          <div><b>Paciente:</b> {fullName(c)} · {age ? `${age} años` : ''}</div>
          <RxTable rx={rxPrint.rx_final} title="RX final" />
          <RxTable rx={rxPrint.rx_final_transposed} title="Transposición" compact />
          <div className="text-xs text-slate-600"><b>Diagnóstico:</b> {rxPrint.diagnosis}<br /><b>Recomendación:</b> {rxPrint.recommendation}<br /><b>Próxima revisión:</b> {fdate(rxPrint.next_review_date)}</div>
          <div className="pt-6 border-t border-dashed text-xs text-slate-500">Firma: {rxPrint.optometrist?.name}</div>
        </div>}
      </Modal>

      <Modal open={apptOpen} onClose={() => setApptOpen(false)} title="Nueva cita" size="sm" footer={<><button className="btn-secondary" onClick={() => setApptOpen(false)}>Cancelar</button><button className="btn-primary" onClick={addAppt}>Agendar</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><input type="date" className="input" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} /></Field>
          <Field label="Hora"><input type="time" className="input" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} /></Field>
          <Field label="Optometrista" className="col-span-2"><select className="input" value={appt.optometrist_id} onChange={(e) => setAppt({ ...appt, optometrist_id: e.target.value })}><option value="">— Asignar después —</option>{staff.filter((s) => s.role === 'optometrista').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
      </Modal>
    </div>
  )
}

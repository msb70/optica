import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, Search, ArrowRight, Copy, Printer, FileText } from 'lucide-react'
import { useApp } from '../lib/app'
import { sb, run, write, likeTerm } from '../lib/supabase'
import { Card, PageHeader, Loading, Badge, Avatar, Field, Empty, Toast } from '../components/ui'
import RxTable from '../components/RxTable'
import { fdate, fullName } from '../lib/format'
import type { Exam, Rx, Eye, Customer } from '../lib/types'

const CUST_COLS = 'id,code,first_name,last_name,phone,birth_date,tags'
const custOr = (t: string, cols: string[]) => cols.map((c) => `${c}.ilike.${t}`).join(',')
const loadExams = (branch: string, search: string) => run(sb.from('exams')
  .select('id,exam_date,template,reason,rx_final,diagnosis,recommendation,next_review_date,status,customer_id,customer:customers!inner(id,first_name,last_name,code,birth_date),optometrist:staff!optometrist_id(name)')
  .eq('branch_id', branch).or(custOr(likeTerm(search), ['first_name', 'last_name', 'code']), { referencedTable: 'customer' })
  .order('exam_date', { ascending: false }).limit(80)).then((exams) => ({ exams: exams as unknown as Exam[] }))

export default function Examenes() {
  const { branch } = useApp()
  const [search, setSearch] = useState('')
  const q = useQuery({ queryKey: ['exams', branch?.id, search], queryFn: () => loadExams(branch!.id, search), enabled: !!branch })
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <PageHeader title="Exámenes optométricos" subtitle={`${branch?.name} · plantillas adulto / niño · transposición automática`} actions={<Link to="/examenes/nuevo" className="btn-primary"><Plus size={15} />Nuevo examen</Link>} />
      <div className="relative max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9 h-10" placeholder="Buscar paciente…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Fecha</th><th>Paciente</th><th>Plantilla</th><th>Motivo</th><th>RX final (OD / OI)</th><th>Diagnóstico</th><th>Optometrista</th><th>Próx. revisión</th><th></th></tr></thead>
            <tbody>{(q.data?.exams ?? []).map((e) => {
              const od = e.rx_final?.od, oi = e.rx_final?.oi
              const f = (x?: Eye) => (x ? `${x.sph! > 0 ? '+' : ''}${Number(x.sph).toFixed(2)} ${Number(x.cyl ?? 0).toFixed(2)}×${x.axis ?? 0}` : '—')
              const expired = e.next_review_date && e.next_review_date < today
              return <tr key={e.id}>
                <td className="font-semibold">{fdate(e.exam_date)}</td>
                <td><Link to={`/clientes/${e.customer_id}`} className="flex items-center gap-2 hover:text-brand-600"><Avatar name={fullName(e.customer)} className="h-7 w-7 text-[10px]" />{fullName(e.customer)}</Link></td>
                <td><Badge tone={e.template === 'nino' ? 'violet' : 'slate'}>{e.template === 'nino' ? 'Niño' : 'Adulto'}</Badge></td>
                <td className="text-xs text-slate-600">{e.reason}</td>
                <td className="font-mono text-xs">{f(od)} <span className="text-slate-300">/</span> {f(oi)}</td>
                <td className="text-xs">{e.diagnosis}</td>
                <td className="text-xs">{e.optometrist?.name}</td>
                <td className={clsx('text-xs', expired ? 'text-rose-600 font-semibold' : 'text-slate-600')}>{fdate(e.next_review_date)}{expired && ' · vencida'}</td>
                <td><Link to={`/cotizaciones?new=${e.customer_id}&exam=${e.id}`} className="btn-secondary h-7 text-xs"><FileText size={12} />Cotizar</Link></td>
              </tr>
            })}
            {q.data?.exams.length === 0 && <tr><td colSpan={9}><Empty title="Sin exámenes" /></td></tr>}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------
const searchCustomers = (q: string) => run(sb.from('customers').select(CUST_COLS).or(custOr(likeTerm(q), ['first_name', 'last_name', 'phone', 'code'])).limit(8))
  .then((customers) => ({ customers: customers as unknown as Customer[] }))
async function loadCustomerForExam(id: string) {
  const [c, exams] = await Promise.all([
    run(sb.from('customers').select(CUST_COLS).eq('id', id).maybeSingle()),
    run(sb.from('exams').select('rx_final,autorefraction').eq('customer_id', id).order('exam_date', { ascending: false }).limit(1)),
  ])
  return { customers_by_pk: c as unknown as Customer, exams: exams as unknown as { rx_final: Rx; autorefraction: Rx }[] }
}


const emptyEye = (): Eye => ({ sph: 0, cyl: 0, axis: 0, add: 0, va: '20/20' })
const emptyRx = (): Rx => ({ od: emptyEye(), oi: emptyEye(), pd: 62 })
const transpose = (e: Eye): Eye => (!e.cyl ? e : { ...e, sph: Number(e.sph ?? 0) + Number(e.cyl), cyl: -Number(e.cyl), axis: ((Number(e.axis ?? 0) + 90) % 180) })
const step = (v: number, d: number, s = 0.25) => Math.round((v + d * s) * 100) / 100

function EyeRow({ label, eye, onChange, kid }: { label: string; eye: Eye; onChange: (e: Eye) => void; kid?: boolean }) {
  const num = (k: keyof Eye, s: number, min: number, max: number) => (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white min-w-0">
      <button type="button" className="h-9 w-7 shrink-0 text-slate-500 hover:bg-slate-50" onClick={() => onChange({ ...eye, [k]: Math.max(min, step(Number(eye[k] ?? 0), -1, s)) })}>−</button>
      <input className="w-full min-w-0 h-9 text-center font-mono text-sm outline-none" value={eye[k] ?? ''} onChange={(e) => onChange({ ...eye, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />
      <button type="button" className="h-9 w-7 shrink-0 text-slate-500 hover:bg-slate-50" onClick={() => onChange({ ...eye, [k]: Math.min(max, step(Number(eye[k] ?? 0), 1, s)) })}>+</button>
    </div>
  )
  return (
    <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))_88px] gap-2 items-center">
      <span className="font-bold text-slate-700">{label}</span>
      {num('sph', 0.25, -25, 25)}{num('cyl', 0.25, -10, 10)}{num('axis', 1, 0, 180)}
      {kid ? <span className="text-xs text-slate-400 text-center">—</span> : num('add', 0.25, 0, 4)}
      <select className="input h-9 w-full text-xs" value={eye.va ?? ''} onChange={(e) => onChange({ ...eye, va: e.target.value })}>{['20/20', '20/25', '20/30', '20/40', '20/50', '20/70', '20/100', '20/200'].map((v) => <option key={v}>{v}</option>)}</select>
    </div>
  )
}

function RxEditor({ title, rx, onChange, kid, actions }: { title: string; rx: Rx; onChange: (r: Rx) => void; kid?: boolean; actions?: React.ReactNode }) {
  return (
    <Card title={title} actions={actions}>
      <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))_88px] gap-2 text-[10px] uppercase font-semibold text-slate-400 mb-1 px-0"><span /><span className="text-center">Esfera</span><span className="text-center">Cilindro</span><span className="text-center">Eje</span><span className="text-center">Adición</span><span className="text-center">AV</span></div>
      <div className="space-y-2">
        <EyeRow label="OD" eye={rx.od ?? emptyEye()} onChange={(e) => onChange({ ...rx, od: e })} kid={kid} />
        <EyeRow label="OI" eye={rx.oi ?? emptyEye()} onChange={(e) => onChange({ ...rx, oi: e })} kid={kid} />
      </div>
      <div className="mt-3 flex items-center gap-3"><span className="label mb-0">DP (mm)</span><input type="number" className="input h-8 w-20" value={rx.pd ?? ''} onChange={(e) => onChange({ ...rx, pd: Number(e.target.value) })} /></div>
    </Card>
  )
}

export function ExamenNuevo() {
  const reasonsQ = useQuery({ queryKey: ['consult-reasons'], queryFn: () => run(sb.from('consult_reasons').select('id,name').eq('active', true).order('sort').order('name')).then((consult_reasons) => ({ consult_reasons: consult_reasons as { id: string; name: string }[] })), staleTime: 300_000 })
  const { company, branch, staff, me } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [custQ, setCustQ] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [template, setTemplate] = useState<'adulto' | 'nino'>('adulto')
  const [reason, setReason] = useState('Revisión anual')
  const [auto, setAuto] = useState<Rx>(emptyRx())
  const [ini, setIni] = useState<Rx>(emptyRx())
  const [fin, setFin] = useState<Rx>(emptyRx())
  const [dx, setDx] = useState('')
  const [rec, setRec] = useState('')
  const [opto, setOpto] = useState(me?.role === 'optometrista' ? me.id : '')
  const [next, setNext] = useState('')
  const [prev, setPrev] = useState<Rx | null>(null)
  const [saved, setSaved] = useState<{ id: string; rx_final_transposed: Rx } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const custs = useQuery({ queryKey: ['exam-cust', company?.id, custQ], queryFn: () => searchCustomers(custQ), enabled: !!company && custQ.length >= 2 })

  useEffect(() => {
    const id = params.get('customer'); if (!id) return
    loadCustomerForExam(id).then((r) => { setCustomer(r.customers_by_pk); if (r.exams[0]) setPrev(r.exams[0].rx_final); if (r.customers_by_pk?.tags?.includes('niño')) setTemplate('nino') })
  }, [params])

  const save = async () => {
    if (!customer || !company || !branch) return
    const apptId = params.get('appointment')
    const ex = await write(() => sb.from('exams').insert({ company_id: company.id, branch_id: branch.id, customer_id: customer.id, optometrist_id: opto || null, appointment_id: apptId || null, template, reason, autorefraction: auto, rx_initial: ini, rx_final: fin, diagnosis: dx || null, recommendation: rec || null, next_review_date: next || null, status: 'completado' }).select('id,rx_final_transposed,next_review_date').single())
    if (apptId) await write(() => sb.from('appointments').update({ status: 'atendida' }).eq('id', apptId))
    const r = { insert_exams_one: ex as unknown as { id: string; rx_final_transposed: Rx } }
    setSaved(r.insert_exams_one); setToast('Examen guardado')
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Nuevo examen optométrico" subtitle="Autorefracción → refracción inicial → RX final. La transposición y la próxima revisión se calculan en la base de datos."
        actions={<div className="inline-flex rounded-xl bg-slate-100 p-1">{(['adulto', 'nino'] as const).map((t) => <button key={t} onClick={() => setTemplate(t)} className={clsx('px-3 py-1.5 text-xs font-semibold rounded-lg', template === t ? 'bg-white shadow-sm' : 'text-slate-500')}>{t === 'nino' ? 'Plantilla niño' : 'Plantilla adulto'}</button>)}</div>} />

      <Card>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="relative md:col-span-1">
            <span className="label">Paciente</span>
            {customer ? <div className="flex items-center gap-2 input h-10"><Avatar name={fullName(customer)} className="h-6 w-6 text-[10px]" /><span className="font-semibold text-sm truncate">{fullName(customer)}</span><span className="text-xs text-slate-400">{customer.code}</span><button className="ml-auto text-xs text-slate-400 hover:text-rose-600" onClick={() => setCustomer(null)}>cambiar</button></div>
              : <><input className="input h-10" placeholder="Buscar paciente…" value={custQ} onChange={(e) => setCustQ(e.target.value)} autoFocus />
                {custQ.length >= 2 && <div className="absolute z-20 mt-1 w-full card p-1">{(custs.data?.customers ?? []).map((c) => <button key={c.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm" onClick={() => { setCustomer(c); setCustQ(''); nav(`/examenes/nuevo?customer=${c.id}`, { replace: true }) }}><b>{fullName(c)}</b> <span className="text-xs text-slate-500">{c.code} · {c.phone}</span></button>)}</div>}</>}
          </div>
          <Field label="Optometrista"><select className="input h-10" value={opto} onChange={(e) => setOpto(e.target.value)}><option value="">—</option>{staff.filter((s) => s.role === 'optometrista').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Motivo de consulta"><input className="input h-10" list="reasons" value={reason} onChange={(e) => setReason(e.target.value)} /><datalist id="reasons">{(reasonsQ.data?.consult_reasons ?? []).map((r) => <option key={r.id} value={r.name} />)}</datalist></Field>
        </div>
        {prev && <div className="mt-3 rounded-xl bg-violet-50 border border-violet-100 p-3 flex flex-wrap items-center gap-3"><div className="text-xs font-semibold text-violet-700">RX anterior del paciente</div><div className="flex-1 min-w-[260px]"><RxTable rx={prev} compact /></div><button className="btn-secondary h-8 text-xs" onClick={() => { setIni(structuredClone(prev)); setFin(structuredClone(prev)) }}><Copy size={12} />Copiar como base</button></div>}
      </Card>

      <div className="grid gap-4">
        <RxEditor title="1 · Autorefracción" rx={auto} onChange={setAuto} kid={template === 'nino'} actions={<button className="btn-ghost h-7 text-xs" onClick={() => setIni(structuredClone(auto))}>Copiar a inicial <ArrowRight size={12} /></button>} />
        <RxEditor title="2 · Refracción inicial" rx={ini} onChange={setIni} kid={template === 'nino'} actions={<button className="btn-ghost h-7 text-xs" onClick={() => setFin(structuredClone(ini))}>Copiar a final <ArrowRight size={12} /></button>} />
        <RxEditor title="3 · RX final" rx={fin} onChange={setFin} kid={template === 'nino'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Transposición automática" subtitle="Vista previa del cilindro opuesto">
          <RxTable rx={{ od: transpose(fin.od ?? emptyEye()), oi: transpose(fin.oi ?? emptyEye()), pd: fin.pd }} compact />
        </Card>
        <Card title="Diagnóstico y recomendación" className="lg:col-span-2">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Diagnóstico"><input className="input" list="dx" value={dx} onChange={(e) => setDx(e.target.value)} /><datalist id="dx">{['Miopía', 'Hipermetropía', 'Astigmatismo', 'Miopía + astigmatismo', 'Presbicia', 'Emetropía', 'Anisometropía'].map((r) => <option key={r} value={r} />)}</datalist></Field>
            <Field label="Recomendación"><input className="input" list="rec" value={rec} onChange={(e) => setRec(e.target.value)} /><datalist id="rec">{['Lentes monofocales con AR', 'Progresivos', 'Filtro luz azul', 'Lentes de contacto', 'Fotocromático', 'Sin cambio de fórmula'].map((r) => <option key={r} value={r} />)}</datalist></Field>
            <Field label="Próxima revisión" hint={`Sugerida: ${template === 'nino' ? '6' : '12'} meses (automática si se deja vacío)`}><input type="date" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {saved ? <>
          <span className="text-sm text-emerald-700 font-semibold mr-auto">Examen guardado · próxima revisión calculada</span>
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} />Imprimir RX</button>
          <Link to={`/clientes/${customer?.id}`} className="btn-secondary">Ver paciente</Link>
          <Link to={`/cotizaciones?new=${customer?.id}&exam=${saved.id}`} className="btn-primary"><FileText size={15} />Generar cotización desde RX</Link>
        </> : <>
          <button className="btn-secondary" onClick={() => nav(-1)}>Cancelar</button>
          <button className="btn-primary h-11 px-6" disabled={!customer} onClick={save}>Guardar examen</button>
        </>}
      </div>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Lock, Unlock, PlusCircle, MinusCircle, AlertTriangle, Printer, Banknote } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, Modal, Field, StatusBadge, Stat, Toast, Badge, Empty } from '../components/ui'
import { money, fdatetime, fdate, METHODS, ftime } from '../lib/format'
import type { CashSession } from '../lib/types'

const Q = `query Caja($branch: uuid!) {
  open: cash_sessions(where:{branch_id:{_eq:$branch}, status:{_eq:"abierta"}}, order_by:{opened_at:desc}, limit:1) { id opened_at opening_amount status notes opener { name }
    cash_movements(order_by:{created_at:desc}) { id type amount concept created_at }
    payments(order_by:{created_at:desc}) { id method amount reference created_at sale { number customer { first_name last_name } } } }
  history: cash_sessions(where:{branch_id:{_eq:$branch}, status:{_eq:"cerrada"}}, order_by:{opened_at:desc}, limit:30) { id opened_at closed_at opening_amount expected_cash counted_cash difference status notes opener { name } closer { name }
    payments_aggregate { aggregate { sum { amount } count } } }
}`
const OPEN = `mutation Open($o: cash_sessions_insert_input!) { insert_cash_sessions_one(object:$o) { id } }`
const CLOSE = `mutation Close($id: uuid!, $counted: numeric!, $staff: uuid, $notes: String) { close_cash_session(args:{p_session_id:$id, p_counted:$counted, p_staff_id:$staff, p_notes:$notes}) { id difference expected_cash } }`
const MOVE = `mutation Move($o: cash_movements_insert_input!) { insert_cash_movements_one(object:$o) { id } }`

type OpenPayment = { id: string; method: string; amount: number; reference?: string; created_at: string; sale?: { number: string; customer?: { first_name: string; last_name: string } } }
type Open = Omit<CashSession, 'payments'> & { payments: OpenPayment[] }
type Hist = CashSession & { closer?: { name: string }; payments_aggregate: { aggregate: { sum: { amount: number | null }; count: number } } }

export default function Caja() {
  const { company, branch, me, refreshCash, currency } = useApp()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['caja', branch?.id], queryFn: () => gql<{ open: Open[]; history: Hist[] }>(Q, { branch: branch!.id }), enabled: !!branch, refetchInterval: 20_000 })
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [moveModal, setMoveModal] = useState<'ingreso' | 'egreso' | null>(null)
  const [opening, setOpening] = useState(150)
  const [counted, setCounted] = useState<number>(0)
  const [notes, setNotes] = useState('')
  const [mv, setMv] = useState({ amount: 0, concept: '' })
  const [toast, setToast] = useState<string | null>(null)
  const [detail, setDetail] = useState<Hist | null>(null)
  const refresh = () => { void q.refetch(); refreshCash(); void qc.invalidateQueries({ queryKey: ['alerts'] }) }

  if (q.isLoading) return <Loading />
  const s = q.data?.open[0]
  const byMethod = (s?.payments ?? []).reduce<Record<string, number>>((a, p) => { a[p.method] = (a[p.method] ?? 0) + Number(p.amount); return a }, {})
  const ingresos = (s?.cash_movements ?? []).filter((m) => m.type === 'ingreso').reduce((a, m) => a + Number(m.amount), 0)
  const egresos = (s?.cash_movements ?? []).filter((m) => m.type === 'egreso').reduce((a, m) => a + Number(m.amount), 0)
  const expected = Number(s?.opening_amount ?? 0) + (byMethod.efectivo ?? 0) + ingresos - egresos
  const totalSales = Object.values(byMethod).reduce((a, b) => a + b, 0)

  const doOpen = async () => { await gql(OPEN, { o: { company_id: company!.id, branch_id: branch!.id, opened_by: me?.id ?? null, opening_amount: opening } }); setOpenModal(false); setToast('Caja abierta'); refresh() }
  const doClose = async () => { const r = await gql<{ close_cash_session: { difference: number }[] }>(CLOSE, { id: s!.id, counted, staff: me?.id ?? null, notes: notes || null }); setCloseModal(false); const d = Number(r.close_cash_session[0].difference); setToast(d === 0 ? 'Caja cerrada · cuadre perfecto' : `Caja cerrada con diferencia de ${currency(d)}`); refresh() }
  const doMove = async () => { await gql(MOVE, { o: { cash_session_id: s!.id, type: moveModal, amount: mv.amount, concept: mv.concept, staff_id: me?.id ?? null } }); setMoveModal(null); setMv({ amount: 0, concept: '' }); refresh() }

  return (
    <div className="space-y-5">
      <PageHeader title={<>Caja <span className="text-slate-400 font-medium">· {branch?.name}</span></>} subtitle={s ? `Sesión abierta por ${s.opener?.name ?? '—'} · ${fdatetime(s.opened_at)}` : 'No hay sesión abierta'}
        actions={s ? <><button className="btn-secondary" onClick={() => setMoveModal('ingreso')}><PlusCircle size={15} />Ingreso</button><button className="btn-secondary" onClick={() => setMoveModal('egreso')}><MinusCircle size={15} />Egreso</button><button className="btn-dark" onClick={() => { setCounted(Math.round(expected * 100) / 100); setCloseModal(true) }}><Lock size={15} />Cerrar y arquear</button></> : <button className="btn-primary" onClick={() => setOpenModal(true)}><Unlock size={15} />Abrir caja</button>} />

      {s ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4"><Stat label="Fondo inicial" value={currency(s.opening_amount)} /></Card>
            <Card className="p-4"><Stat label="Ventas cobradas" value={currency(totalSales)} sub={`${s.payments.length} pagos`} /></Card>
            <Card className="p-4"><Stat label="Efectivo en ventas" value={currency(byMethod.efectivo ?? 0)} /></Card>
            <Card className="p-4"><Stat label="Movimientos" value={currency(ingresos - egresos)} sub={`+${money(ingresos)} / -${money(egresos)}`} /></Card>
            <Card className="p-4 bg-ink-900 text-white border-0"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Efectivo esperado</div><div className="text-2xl font-extrabold">{currency(expected)}</div></Card>
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Desglose por método" className="lg:col-span-1">
              <ul className="space-y-2">
                {Object.entries(METHODS).map(([k, v]) => <li key={k} className="flex items-center justify-between text-sm"><span className="text-slate-600">{v}</span><span className="font-semibold">{currency(byMethod[k] ?? 0)}</span></li>)}
              </ul>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">Movimientos manuales</div>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {s.cash_movements!.length === 0 && <li className="text-xs text-slate-400">Sin movimientos</li>}
                  {s.cash_movements!.map((m) => <li key={m.id} className="flex items-center gap-2 text-xs"><Badge tone={m.type === 'ingreso' ? 'green' : 'rose'}>{m.type}</Badge><span className="flex-1 truncate text-slate-700">{m.concept}</span><span className="font-semibold">{money(m.amount)}</span><span className="text-slate-400">{ftime(m.created_at)}</span></li>)}
                </ul>
              </div>
            </Card>
            <Card title="Cobros de la sesión" className="lg:col-span-2" padded={false}>
              <div className="overflow-x-auto max-h-[28rem] overflow-y-auto"><table className="table">
                <thead><tr><th>Hora</th><th>Venta</th><th>Cliente</th><th>Método</th><th>Ref.</th><th className="text-right">Importe</th></tr></thead>
                <tbody>{s.payments.map((p) => <tr key={p.id}><td className="text-slate-500">{ftime(p.created_at)}</td><td className="font-mono text-xs">{p.sale?.number}</td><td>{p.sale?.customer ? `${p.sale.customer.first_name} ${p.sale.customer.last_name}` : '—'}</td><td><Badge tone={p.method === 'efectivo' ? 'green' : 'blue'}>{METHODS[p.method]}</Badge></td><td className="text-xs text-slate-400">{p.reference}</td><td className="text-right font-semibold">{money(p.amount)}</td></tr>)}
                {s.payments.length === 0 && <tr><td colSpan={6}><Empty title="Aún no hay cobros en esta sesión" /></td></tr>}</tbody>
              </table></div>
            </Card>
          </div>
        </>
      ) : (
        <Card><Empty title="Caja cerrada" hint="Abre la caja con el fondo inicial para empezar a cobrar en efectivo. Las ventas con tarjeta se registran igualmente." action={<button className="btn-primary mt-2" onClick={() => setOpenModal(true)}><Unlock size={15} />Abrir caja</button>} /></Card>
      )}

      <Card title="Historial de cierres" subtitle="Últimas 30 sesiones · reporte diario automático al cierre" padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Fecha</th><th>Apertura</th><th>Cierre</th><th>Responsable</th><th className="text-right">Cobros</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th><th></th></tr></thead>
          <tbody>{(q.data?.history ?? []).map((h) => {
            const d = Number(h.difference ?? 0)
            return <tr key={h.id} className={clsx(Math.abs(d) >= 1 && 'bg-rose-50/40')}>
              <td className="font-semibold">{fdate(h.opened_at)}</td><td className="text-slate-500">{ftime(h.opened_at)}</td><td className="text-slate-500">{ftime(h.closed_at)}</td><td>{h.closer?.name ?? h.opener?.name}</td>
              <td className="text-right">{money(h.payments_aggregate.aggregate.sum.amount)} <span className="text-xs text-slate-400">({h.payments_aggregate.aggregate.count})</span></td>
              <td className="text-right">{money(h.expected_cash)}</td><td className="text-right">{money(h.counted_cash)}</td>
              <td className={clsx('text-right font-bold', d === 0 ? 'text-emerald-600' : 'text-rose-600')}>{d === 0 ? 'OK' : <span className="inline-flex items-center gap-1"><AlertTriangle size={12} />{money(d)}</span>}</td>
              <td><button className="btn-ghost h-7 text-xs" onClick={() => setDetail(h)}><Printer size={13} />Reporte</button></td>
            </tr>
          })}</tbody>
        </table></div>
      </Card>

      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caja" size="sm" footer={<><button className="btn-secondary" onClick={() => setOpenModal(false)}>Cancelar</button><button className="btn-primary" onClick={doOpen}>Abrir</button></>}>
        <Field label="Fondo inicial en efectivo"><input type="number" className="input h-11 text-lg font-bold" value={opening} onChange={(e) => setOpening(Number(e.target.value))} autoFocus /></Field>
        <p className="text-xs text-slate-500 mt-2">Responsable: {me?.name ?? '—'} · {branch?.name}</p>
      </Modal>

      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Cierre y arqueo de caja" size="sm" footer={<><button className="btn-secondary" onClick={() => setCloseModal(false)}>Cancelar</button><button className="btn-dark" onClick={doClose}><Lock size={15} />Cerrar caja</button></>}>
        <div className="rounded-2xl bg-slate-50 p-4 mb-4 text-sm space-y-1">
          <div className="flex justify-between"><span>Fondo inicial</span><span>{currency(s?.opening_amount ?? 0)}</span></div>
          <div className="flex justify-between"><span>+ Efectivo en ventas</span><span>{currency(byMethod.efectivo ?? 0)}</span></div>
          <div className="flex justify-between"><span>+ Ingresos − Egresos</span><span>{currency(ingresos - egresos)}</span></div>
          <div className="flex justify-between font-bold border-t border-slate-200 pt-1 mt-1"><span>Efectivo esperado</span><span>{currency(expected)}</span></div>
        </div>
        <Field label="Efectivo contado (arqueo)"><input type="number" step="0.01" className="input h-11 text-lg font-bold" value={counted} onChange={(e) => setCounted(Number(e.target.value))} autoFocus /></Field>
        <div className={clsx('mt-2 text-sm font-semibold', Math.abs(counted - expected) < 0.01 ? 'text-emerald-600' : 'text-rose-600')}>Diferencia: {currency(counted - expected)} {Math.abs(counted - expected) >= 1 && '· generará alerta de descuadre'}</div>
        <Field label="Notas" className="mt-3"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </Modal>

      <Modal open={!!moveModal} onClose={() => setMoveModal(null)} title={moveModal === 'ingreso' ? 'Ingreso manual de efectivo' : 'Egreso manual de efectivo'} size="sm" footer={<><button className="btn-secondary" onClick={() => setMoveModal(null)}>Cancelar</button><button className="btn-primary" disabled={!mv.amount || !mv.concept} onClick={doMove}>Registrar</button></>}>
        <Field label="Importe"><input type="number" step="0.01" className="input h-11 text-lg font-bold" value={mv.amount || ''} onChange={(e) => setMv({ ...mv, amount: Number(e.target.value) })} autoFocus /></Field>
        <Field label="Concepto" className="mt-3"><input className="input" placeholder={moveModal === 'ingreso' ? 'Ej. reposición de fondo' : 'Ej. mensajería laboratorio'} value={mv.concept} onChange={(e) => setMv({ ...mv, concept: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Reporte diario · ${fdate(detail?.opened_at)}`} size="sm" footer={<><button className="btn-secondary" onClick={() => window.print()}><Printer size={15} />Imprimir</button><button className="btn-primary" onClick={() => setDetail(null)}>Cerrar</button></>}>
        {detail && (
          <div className="text-sm space-y-2">
            <div className="flex items-center gap-2 text-slate-500"><Banknote size={15} />{branch?.name} · {company?.legal_name}</div>
            {[['Apertura', fdatetime(detail.opened_at)], ['Cierre', fdatetime(detail.closed_at)], ['Abrió', detail.opener?.name], ['Cerró', detail.closer?.name], ['Fondo inicial', money(detail.opening_amount)], ['Cobros', `${money(detail.payments_aggregate.aggregate.sum.amount)} (${detail.payments_aggregate.aggregate.count})`], ['Efectivo esperado', money(detail.expected_cash)], ['Efectivo contado', money(detail.counted_cash)]].map(([k, v]) => <div key={k as string} className="flex justify-between border-b border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>)}
            <div className="flex justify-between py-1 text-base"><span className="font-bold">Diferencia</span><span className={clsx('font-extrabold', Number(detail.difference) === 0 ? 'text-emerald-600' : 'text-rose-600')}>{money(detail.difference)}</span></div>
            {detail.notes && <div className="text-xs text-slate-500">Notas: {detail.notes}</div>}
            <StatusBadge status={detail.status} />
          </div>
        )}
      </Modal>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

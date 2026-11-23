import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { Modal, Field } from './ui'
import { CARD_BRANDS, METHODS } from '../lib/format'

export type Pay = { method: string; amount: number; reference?: string }
const OPTS = ['efectivo', 'tarjeta', 'transferencia', 'yappy', 'saldo_cliente']

/** Cobro simple (anticipos y saldos de órdenes de trabajo). */
export default function PayModal({ open, title, subtitle, suggested, maxAmount, confirmLabel, onClose, onConfirm, currency, children }: {
  open: boolean; title: string; subtitle?: React.ReactNode; suggested: number; maxAmount?: number; confirmLabel: string
  onClose: () => void; onConfirm: (pays: Pay[]) => Promise<void>; currency: (n: number) => string; children?: React.ReactNode
}) {
  const [pays, setPays] = useState<Pay[]>([])
  const [method, setMethod] = useState('efectivo')
  const [amount, setAmount] = useState(suggested)
  const [brand, setBrand] = useState('')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const paid = pays.reduce((a, p) => a + p.amount, 0)
  useEffect(() => { if (open) { setPays([]); setAmount(Math.round(suggested * 100) / 100); setErr(null) } }, [open, suggested])
  const add = () => {
    setErr(null)
    if (amount <= 0) return
    if (method === 'tarjeta' && !brand) { setErr('Selecciona la tarjeta'); return }
    if (maxAmount !== undefined && paid + amount > maxAmount + 0.009) { setErr('El importe supera el saldo pendiente'); return }
    setPays([...pays, { method, amount: Math.round(amount * 100) / 100, reference: method === 'tarjeta' ? brand : ref || undefined }])
    setBrand(''); setRef(''); setAmount(0)
  }
  const confirm = async () => { setBusy(true); setErr(null); try { await onConfirm(pays.length ? pays : amount > 0 && method !== 'tarjeta' ? [{ method, amount, reference: ref || undefined }] : []) } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo registrar') } finally { setBusy(false) } }
  const pending = pays.length ? pays : (amount > 0 && method !== 'tarjeta' ? [{ method, amount }] : [])
  return (
    <Modal open={open} onClose={onClose} title={title} size="md" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || (!pending.length && (maxAmount ?? 1) > 0.009)} onClick={confirm}>{confirmLabel} · {currency(pending.reduce((a, p) => a + p.amount, 0))}</button></>}>
      <div className="space-y-3">
        {subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}
        {children}
        <div className="grid grid-cols-3 gap-2">{OPTS.map((m) => <button key={m} type="button" onClick={() => { setMethod(m); setBrand('') }} className={clsx('rounded-xl border p-2 text-xs font-semibold', method === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600')}>{METHODS[m]}</button>)}</div>
        {method === 'tarjeta' && <div className="grid grid-cols-4 gap-2">{CARD_BRANDS.map((b) => <button key={b} type="button" onClick={() => setBrand(b)} className={clsx('rounded-xl border px-2 py-2 text-xs font-semibold', brand === b ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600')}>{b}</button>)}</div>}
        <div className={clsx('grid gap-2 items-end', ['transferencia', 'yappy'].includes(method) ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-[1fr_auto]')}>
          <Field label="Importe"><input type="number" step="0.01" className="input h-11 text-lg font-bold" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          {['transferencia', 'yappy'].includes(method) && <Field label="Nº de operación"><input className="input h-11" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
          <button type="button" className="btn-dark h-11" onClick={add}><Plus size={15} />Añadir</button>
        </div>
        {pays.length > 0 && <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{pays.map((p, i) => <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm"><b>{METHODS[p.method]}</b><span className="text-xs text-slate-400">{p.reference}</span><span className="ml-auto font-bold">{currency(p.amount)}</span><button className="btn-ghost h-7 w-7 p-0" onClick={() => setPays(pays.filter((_, j) => j !== i))}><Trash2 size={13} /></button></li>)}</ul>}
        {err && <div className="text-xs text-rose-600 font-semibold">{err}</div>}
      </div>
    </Modal>
  )
}

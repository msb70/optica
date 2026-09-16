import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { X, Loader2, Inbox, TrendingUp, TrendingDown } from 'lucide-react'
import { STATUS_LABEL, STATUS_TONE } from '../lib/format'

export const tones: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15',
  blue: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10',
  dark: 'bg-ink-900 text-white',
}

export function Badge({ tone = 'slate', children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={clsx('badge', tones[tone] ?? tones.slate, className)}>{children}</span>
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'slate'}>{STATUS_LABEL[status] ?? status}</Badge>
}

export function Card({ children, className, title, subtitle, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('card fade-up', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            {title && <h3 className="text-sm font-bold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && 'px-5 pb-5', (title || actions) && padded && 'pt-2')}>{children}</div>
    </section>
  )
}

export function KPI({ label, value, delta, hint, icon, tone = 'blue' }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode; icon?: ReactNode; tone?: string }) {
  const up = (delta ?? 0) >= 0
  const iconTone: Record<string, string> = { blue: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', slate: 'bg-slate-100 text-slate-600' }
  return (
    <div className="card fade-up p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{label}</span>
        {icon && <span className={clsx('h-8 w-8 rounded-xl grid place-items-center shrink-0', iconTone[tone])}>{icon}</span>}
      </div>
      <div className="text-2xl font-extrabold tracking-tight text-slate-900 truncate">{value}</div>
      <div className="flex items-center gap-2 text-xs min-h-4">
        {delta !== undefined && delta !== null && (
          <span className={clsx('inline-flex items-center gap-0.5 font-semibold', up ? 'text-emerald-600' : 'text-rose-600')}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-slate-500 truncate">{hint}</span>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) { return <Loader2 className={clsx('animate-spin text-brand-600', className)} size={20} /> }
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner />{label}</div>
}
export function Empty({ title = 'Sin resultados', hint, action }: { title?: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="h-12 w-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400"><Inbox size={22} /></span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500 max-w-xs">{hint}</p>}
      {action}
    </div>
  )
}
export function ErrorBox({ error }: { error: unknown }) {
  const msg = (error as Error)?.message ?? String(error)
  return <div className="rounded-xl bg-rose-50 text-rose-700 text-sm px-4 py-3 border border-rose-100">{msg}</div>
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={clsx('relative w-full bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl fade-up max-h-[92vh] flex flex-col', w)}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button className="btn-ghost h-8 w-8 p-0 rounded-full" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/60 rounded-b-3xl">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={clsx('block', className)}><span className="label">{label}</span>{children}{hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}</label>
}

export function Tabs<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)} className={clsx('px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5', value === it.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800')}>
          {it.label}{it.count !== undefined && <span className={clsx('rounded-full px-1.5 text-[10px]', value === it.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, className, tone }: { name: string; className?: string; tone?: string }) {
  const palette = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700']
  const idx = tone ? 0 : name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  return <span className={clsx('inline-grid place-items-center rounded-full font-bold shrink-0', palette[idx], className ?? 'h-8 w-8 text-xs')}>{ini}</span>
}

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'green' | 'amber' | 'rose' }) {
  const c = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone]
  return <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"><div className={clsx('h-full rounded-full transition-all', c)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900 truncate">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
}

export function Toast({ msg, tone = 'green', onClose }: { msg: string | null; tone?: 'green' | 'rose' | 'amber'; onClose: () => void }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [msg, onClose])
  if (!msg) return null
  const c = { green: 'bg-emerald-600', rose: 'bg-rose-600', amber: 'bg-amber-600' }[tone]
  return <div className={clsx('fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg fade-up', c)}>{msg}</div>
}

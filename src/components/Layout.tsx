import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { LayoutDashboard, ShoppingCart, Wallet, Users, Eye, FileText, FlaskConical, Boxes, RotateCcw, Building2, BarChart3, Settings, Bell, LogOut, Menu, X, ChevronDown, RefreshCw, CalendarDays, Wifi, WifiOff } from 'lucide-react'
import { useApp } from '../lib/app'
import { useAuth } from '../lib/auth'
import { gql, isDevMode } from '../lib/nhost'
import type { Alert } from '../lib/types'
import { Avatar, Badge, Toast } from './ui'
import { ROLES, ago } from '../lib/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'POS · Venta', icon: ShoppingCart },
  { to: '/caja', label: 'Caja', icon: Wallet },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/examenes', label: 'Exámenes · RX', icon: Eye },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { to: '/ordenes', label: 'Órdenes lab.', icon: FlaskConical },
  { to: '/stock', label: 'Stock', icon: Boxes },
  { to: '/rma', label: 'RMA · Reclamos', icon: RotateCcw },
  { to: '/intercompany', label: 'Intercompany', icon: Building2 },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/zoho', label: 'Sync Zoho', icon: RefreshCw },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
]

const ALERTS_Q = `query Alerts($company: uuid!) { v_alerts(where:{company_id:{_eq:$company}}, order_by:{at:desc}, limit: 60) { kind company_id branch_id ref_id message at severity branch { name } } }`

export default function Layout() {
  const { companies, branches, company, branch, setCompanyId, setBranchId, me, cashSession } = useApp()
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [bell, setBell] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { const h = (e: Event) => setErr((e as CustomEvent<string>).detail); window.addEventListener('gql-error', h); return () => window.removeEventListener('gql-error', h) }, [])
  const alerts = useQuery({ queryKey: ['alerts', company?.id], queryFn: () => gql<{ v_alerts: Alert[] }>(ALERTS_Q, { company: company!.id }), enabled: !!company, refetchInterval: 60_000 })
  const alertList = alerts.data?.v_alerts ?? []
  const high = alertList.filter((a) => a.severity === 'alta').length

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-ink-900 text-slate-300">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
        <img src="/favicon.svg" className="h-8 w-8 rounded-lg" alt="" />
        <div className="leading-tight">
          <div className="font-extrabold text-white tracking-tight">Optilux</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Gestión de ópticas</div>
        </div>
        <button className="ml-auto lg:hidden text-slate-400" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'bg-white/10 text-white shadow-inner' : 'hover:bg-white/5 hover:text-white')}>
            <n.icon size={17} className="shrink-0 opacity-80" />{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/5 text-xs">
        <div className={clsx('flex items-center gap-2 rounded-xl px-3 py-2', cashSession ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
          <Wallet size={14} />{cashSession ? `Caja abierta · ${ago(cashSession.opened_at)}` : 'Caja cerrada'}
        </div>
        <div className="mt-2 flex items-center gap-1.5 px-3 text-slate-500">{isDevMode ? <><WifiOff size={12} />Modo desarrollo local</> : <><Wifi size={12} />Nhost · eu-central-1</>}</div>
      </div>
    </aside>
  )

  return (
    <div className="flex h-full">
      <div className="hidden lg:block shrink-0">{Sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{Sidebar}</div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center gap-2 px-3 md:px-5 no-print sticky top-0 z-30">
          <button className="btn-ghost lg:hidden h-9 w-9 p-0" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="relative hidden sm:block">
              <select className="appearance-none rounded-xl bg-slate-100 hover:bg-slate-200/70 pl-3 pr-8 py-2 text-sm font-semibold text-slate-800 outline-none cursor-pointer" value={company?.id ?? ''} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <span className="text-slate-300 hidden sm:inline">/</span>
            <div className="relative">
              <select className="appearance-none rounded-xl bg-slate-100 hover:bg-slate-200/70 pl-3 pr-8 py-2 text-sm font-semibold text-slate-800 outline-none cursor-pointer max-w-[44vw] sm:max-w-none truncate" value={branch?.id ?? ''} onChange={(e) => setBranchId(e.target.value)}>
                {branches.filter((b) => (window.innerWidth < 640) || b.company_id === company?.id).map((b) => <option key={b.id} value={b.id}>{window.innerWidth < 640 ? `${companies.find((c) => c.id === b.company_id)?.code} · ${b.name}` : b.name}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="btn-primary h-9 hidden md:inline-flex" onClick={() => nav('/pos')}><ShoppingCart size={16} />Nueva venta <span className="kbd ml-1">F2</span></button>
            <div className="relative">
              <button className="btn-ghost h-9 w-9 p-0 relative" onClick={() => setBell((v) => !v)} aria-label="Alertas">
                <Bell size={19} />
                {alertList.length > 0 && <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white grid place-items-center px-1', high ? 'bg-rose-500' : 'bg-amber-500')}>{alertList.length}</span>}
              </button>
              {bell && (
                <div className="absolute right-0 mt-2 w-[22rem] max-w-[92vw] card p-0 overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><span className="font-bold text-sm">Alertas</span><span className="text-xs text-slate-500">{company?.trade_name}</span></div>
                  <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {alertList.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Sin alertas activas</li>}
                    {alertList.map((a, i) => (
                      <li key={i} className="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer" onClick={() => { setBell(false); nav(alertRoute(a)) }}>
                        <div className="flex items-center gap-2"><Badge tone={a.severity === 'alta' ? 'rose' : a.severity === 'media' ? 'amber' : 'slate'}>{alertKind(a.kind)}</Badge><span className="text-[11px] text-slate-400 ml-auto">{a.branch?.name}</span></div>
                        <div className="text-slate-700 mt-1 leading-snug">{a.message}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-slate-200">
              <Avatar name={me?.name ?? user?.email ?? 'U'} />
              <div className="hidden md:block leading-tight">
                <div className="text-sm font-semibold text-slate-800">{me?.name ?? user?.displayName ?? user?.email}</div>
                <div className="text-[11px] text-slate-500">{me ? ROLES[me.role] : 'Usuario'}</div>
              </div>
              <button className="btn-ghost h-9 w-9 p-0" onClick={() => { void signOut() }} title="Salir"><LogOut size={17} /></button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6" onClick={() => bell && setBell(false)}>
          <Outlet />
        </main>
        <Toast msg={err} tone="rose" onClose={() => setErr(null)} />
      </div>
    </div>
  )
}

export function alertKind(k: string) {
  return ({ caja_descuadrada: 'Caja', stock_critico: 'Stock', cotizacion_sin_seguimiento: 'Cotización', rx_vencida: 'RX vencida' } as Record<string, string>)[k] ?? k
}
export function alertRoute(a: Alert) {
  return ({ caja_descuadrada: '/caja', stock_critico: '/stock', cotizacion_sin_seguimiento: '/cotizaciones', rx_vencida: `/clientes/${a.ref_id}` } as Record<string, string>)[a.kind] ?? '/'
}

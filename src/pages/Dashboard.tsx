import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DollarSign, Receipt, Percent, Package, Users, Target, ArrowRight, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, KPI, PageHeader, Loading, Badge, Progress, Tabs, StatusBadge, Avatar } from '../components/ui'
import { AreaTrend, Bars, Donut } from '../components/charts'
import { money, num, pct, monthLabel, monthStartISO, SOURCES, fdate, fullName } from '../lib/format'
import { alertKind, alertRoute } from '../components/Layout'
import type { Alert, Sale } from '../lib/types'

const Q = `query Dash($company: uuid!, $branch: uuid!, $from: date!, $scopeBranch: Boolean!, $today: timestamptz!, $fromTs: timestamptz!) {
  kpi: v_kpi_branch_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}, order_by:{month:asc}) { branch_id month tickets revenue avg_ticket discounts gross_margin margin_pct units lens_revenue frame_revenue avg_delivery_days branch { name monthly_goal } }
  daily: v_sales_daily(where:{company_id:{_eq:$company}, day:{_gte:$from}}, order_by:{day:asc}) { branch_id day tickets revenue units }
  funnel: v_funnel_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id month citas examenes cotizaciones ventas entregas }
  sellers: v_sales_by_seller(where:{company_id:{_eq:$company}, month:{_gte:$from}}, order_by:{revenue:desc}) { branch_id seller_id seller_name month tickets revenue avg_ticket commissions }
  sources: v_sales_by_source(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id source month tickets revenue }
  alerts: v_alerts(where:{company_id:{_eq:$company}}, order_by:{at:desc}, limit:8) { kind company_id branch_id ref_id message at severity branch { name } }
  today: sales_aggregate(where:{branch_id:{_eq:$branch}, sale_date:{_gte:$today}, status:{_in:["completada","parcial"]}}) { aggregate { count sum { total } } }
  recent: sales(where:{branch_id:{_eq:$branch}}, order_by:{sale_date:desc}, limit:8) { id number sale_date total status delivery_status customer { first_name last_name } seller { name } }
  rmas_aggregate(where:{company_id:{_eq:$company}, created_at:{_gte:$fromTs}}) { aggregate { count } }
  _b: branches(where:{id:{_eq:$branch}}) @include(if:$scopeBranch) { id }
}`

type Row = Record<string, string | number | null> & { branch?: { name: string; monthly_goal: number } }

export default function Dashboard() {
  const { company, branch, branches, currency } = useApp()
  const [scope, setScope] = useState<'branch' | 'company'>('branch')
  const from = monthStartISO(5)
  const q = useQuery({
    queryKey: ['dash', company?.id, branch?.id, from],
    queryFn: () => gql<{ kpi: Row[]; daily: Row[]; funnel: Row[]; sellers: Row[]; sources: Row[]; alerts: Alert[]; today: { aggregate: { count: number; sum: { total: number | null } } }; recent: Sale[]; rmas_aggregate: { aggregate: { count: number } } }>(Q, { company: company!.id, branch: branch!.id, from, scopeBranch: false, today: new Date().toISOString().slice(0, 10), fromTs: from + 'T00:00:00Z' }),
    enabled: !!company && !!branch,
  })

  const d = q.data
  const view = useMemo(() => {
    if (!d) return null
    const inScope = (r: Row) => scope === 'company' || r.branch_id === branch?.id
    const cur = monthStartISO(0), prev = monthStartISO(1)
    const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
    const kpiCur = d.kpi.filter((r) => inScope(r) && r.month === cur)
    const kpiPrev = d.kpi.filter((r) => inScope(r) && r.month === prev)
    const rev = sum(kpiCur, 'revenue'), revPrev = sum(kpiPrev, 'revenue')
    const tickets = sum(kpiCur, 'tickets'), ticketsPrev = sum(kpiPrev, 'tickets')
    const units = sum(kpiCur, 'units')
    const margin = sum(kpiCur, 'gross_margin'), marginPct = rev ? margin / (rev / 1.07) : 0
    const disc = sum(kpiCur, 'discounts')
    const lens = sum(kpiCur, 'lens_revenue'), frame = sum(kpiCur, 'frame_revenue')
    const goal = scope === 'company' ? branches.filter((b) => b.company_id === company?.id).reduce((a, b) => a + Number(b.monthly_goal), 0) : Number(branch?.monthly_goal ?? 0)
    const delivery = kpiCur.length ? kpiCur.reduce((a, r) => a + Number(r.avg_delivery_days ?? 0), 0) / kpiCur.length : 0
    // Serie mensual
    const months = [...new Set(d.kpi.map((r) => r.month as string))].sort()
    const monthly = months.map((m) => ({ month: monthLabel(m), revenue: sum(d.kpi.filter((r) => inScope(r) && r.month === m), 'revenue'), tickets: sum(d.kpi.filter((r) => inScope(r) && r.month === m), 'tickets'), margin: sum(d.kpi.filter((r) => inScope(r) && r.month === m), 'gross_margin') }))
    // Diario últimos 30 días
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const dailyMap = new Map<string, number>()
    d.daily.filter((r) => inScope(r) && new Date(r.day as string) >= cutoff).forEach((r) => dailyMap.set(r.day as string, (dailyMap.get(r.day as string) ?? 0) + Number(r.revenue)))
    const daily = [...dailyMap.entries()].sort().map(([day, revenue]) => ({ day: fdate(day, 'd MMM'), revenue: Math.round(revenue) }))
    // Embudo mes actual
    const f = d.funnel.filter((r) => inScope(r) && r.month === cur)
    const funnel = ['citas', 'examenes', 'cotizaciones', 'ventas', 'entregas'].map((k) => ({ key: k, value: sum(f, k) }))
    // Vendedores mes actual
    const sellerMap = new Map<string, { name: string; revenue: number; tickets: number; commissions: number }>()
    d.sellers.filter((r) => inScope(r) && r.month === cur).forEach((r) => { const s = sellerMap.get(r.seller_id as string) ?? { name: r.seller_name as string, revenue: 0, tickets: 0, commissions: 0 }; s.revenue += Number(r.revenue); s.tickets += Number(r.tickets); s.commissions += Number(r.commissions); sellerMap.set(r.seller_id as string, s) })
    const sellers = [...sellerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6)
    // Origen (últimos 3 meses)
    const srcMap = new Map<string, number>()
    d.sources.filter((r) => inScope(r) && (r.month as string) >= monthStartISO(2)).forEach((r) => srcMap.set(r.source as string, (srcMap.get(r.source as string) ?? 0) + Number(r.revenue)))
    const sources = [...srcMap.entries()].map(([name, value]) => ({ name: SOURCES[name] ?? name, value: Math.round(value) })).sort((a, b) => b.value - a.value)
    // Por sucursal (mes actual)
    const byBranch = branches.filter((b) => b.company_id === company?.id).map((b) => { const rows = d.kpi.filter((r) => r.branch_id === b.id && r.month === cur); return { name: b.name, revenue: Math.round(sum(rows, 'revenue')), goal: Number(b.monthly_goal), tickets: sum(rows, 'tickets') } })
    return { rev, revPrev, tickets, ticketsPrev, units, margin, marginPct, disc, lens, frame, goal, delivery, monthly, daily, funnel, sellers, sources, byBranch, avg: tickets ? rev / tickets : 0, avgPrev: ticketsPrev ? revPrev / ticketsPrev : 0, upt: tickets ? units / tickets : 0 }
  }, [d, scope, branch, branches, company])

  if (q.isLoading || !view) return <Loading />
  const delta = (a: number, b: number) => (b ? (a - b) / b : null)
  const todayRev = Number(d?.today.aggregate.sum.total ?? 0), todayCount = d?.today.aggregate.count ?? 0

  return (
    <div className="space-y-5">
      <PageHeader title={<>Dashboard <span className="text-slate-400 font-medium">· {scope === 'company' ? company?.trade_name : branch?.name}</span></>} subtitle={`Mes en curso vs. mes anterior · ${company?.legal_name}`}
        actions={<Tabs value={scope} onChange={setScope} items={[{ value: 'branch', label: branch?.name ?? 'Sucursal' }, { value: 'company', label: 'Toda la compañía' }]} />} />

      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KPI label="Ventas del mes" value={currency(view.rev)} delta={delta(view.rev, view.revPrev)} hint="vs. mes anterior" icon={<DollarSign size={16} />} />
        <KPI label="Tickets" value={num(view.tickets)} delta={delta(view.tickets, view.ticketsPrev)} hint={`hoy: ${todayCount} · ${money(todayRev)}`} icon={<Receipt size={16} />} tone="violet" />
        <KPI label="Ticket promedio" value={currency(view.avg)} delta={delta(view.avg, view.avgPrev)} hint={`${view.upt.toFixed(2)} uds/ticket`} icon={<Target size={16} />} tone="green" />
        <KPI label="Margen estimado" value={pct(view.marginPct)} hint={currency(view.margin)} icon={<Percent size={16} />} tone="amber" />
        <KPI label="Descuentos" value={currency(view.disc)} hint={view.rev ? pct(view.disc / (view.rev + view.disc)) + ' del bruto' : '—'} icon={<Percent size={16} />} tone="rose" />
        <KPI label="Entrega promedio" value={`${view.delivery.toFixed(1)} d`} hint={`${d?.rmas_aggregate.aggregate.count ?? 0} RMA en 6 meses`} icon={<Package size={16} />} tone="slate" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Ventas últimos 30 días" subtitle="Ingresos diarios (impuestos incluidos)">
          <AreaTrend data={view.daily} x="day" y="revenue" />
        </Card>
        <Card title="Meta del mes" subtitle={`Objetivo ${currency(view.goal)}`}>
          <div className="text-3xl font-extrabold text-slate-900">{view.goal ? pct(view.rev / view.goal, 0) : '—'}</div>
          <div className="mt-2"><Progress value={view.goal ? view.rev / view.goal : 0} tone={view.goal && view.rev / view.goal >= 0.9 ? 'green' : view.goal && view.rev / view.goal >= 0.6 ? 'brand' : 'amber'} /></div>
          <div className="mt-2 text-xs text-slate-500">Faltan {currency(Math.max(0, view.goal - view.rev))} · {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()} días restantes</div>
          <div className="mt-5 space-y-2.5">
            {view.byBranch.map((b) => (
              <div key={b.name}>
                <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-700">{b.name}</span><span className="text-slate-500">{money(b.revenue)} / {money(b.goal)}</span></div>
                <Progress value={b.goal ? b.revenue / b.goal : 0} tone={b.goal && b.revenue / b.goal >= 0.9 ? 'green' : 'brand'} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Embudo comercial" subtitle="Cita → Examen → Cotización → Venta → Entrega (mes actual)">
          <div className="space-y-2 mt-1">
            {view.funnel.map((s, i) => {
              const max = view.funnel[0].value || 1
              const label = ({ citas: 'Citas', examenes: 'Exámenes', cotizaciones: 'Cotizaciones', ventas: 'Ventas', entregas: 'Entregas' } as Record<string, string>)[s.key]
              return (
                <div key={s.key} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-slate-600 text-xs font-semibold">{label}</span>
                  <div className="flex-1 h-7 rounded-lg bg-slate-100 overflow-hidden"><div className="h-full rounded-lg flex items-center px-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(8, (s.value / max) * 100)}%`, background: `linear-gradient(90deg, #1b5cf5, ${['#337eff', '#59a3ff', '#10b981', '#059669', '#047857'][i]})` }}>{num(s.value)}</div></div>
                  <span className="w-12 text-right text-xs text-slate-500" title="% respecto a citas">{i ? pct(view.funnel[0].value ? s.value / view.funnel[0].value : 0, 0) : ''}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-brand-50 p-3"><div className="text-slate-500">Conversión cotización → venta</div><div className="text-lg font-extrabold text-brand-700">{pct(view.funnel[2].value ? view.funnel[3].value / view.funnel[2].value : 0, 0)}</div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-slate-500">Examen → venta</div><div className="text-lg font-extrabold text-emerald-700">{pct(view.funnel[1].value ? view.funnel[3].value / view.funnel[1].value : 0, 0)}</div></div>
          </div>
        </Card>
        <Card title="Tendencia 6 meses" subtitle="Ingresos y margen bruto">
          <Bars data={view.monthly} x="month" series={[{ key: 'revenue', label: 'Ventas' }, { key: 'margin', label: 'Margen', color: '#10b981' }]} />
        </Card>
        <Card title="Mix lentes / armazón" subtitle="Ingresos por categoría del mes">
          <Donut data={[{ name: 'Lentes', value: Math.round(view.lens) }, { name: 'Armazones y solares', value: Math.round(view.frame) }, { name: 'Otros', value: Math.max(0, Math.round(view.rev / 1.07 - view.lens - view.frame)) }]} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Ranking vendedores" subtitle="Mes actual · ventas y comisiones" actions={<Link to="/reportes" className="text-xs font-semibold text-brand-600 inline-flex items-center gap-1">Ver reportes <ArrowRight size={12} /></Link>}>
          <ul className="divide-y divide-slate-100">
            {view.sellers.map((s, i) => (
              <li key={s.name} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-xs font-bold text-slate-400">{i + 1}</span><Avatar name={s.name} />
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-slate-800 truncate">{s.name}</div><div className="text-xs text-slate-500">{s.tickets} tickets · com. {money(s.commissions)}</div></div>
                <div className="text-sm font-bold text-slate-900">{money(s.revenue)}</div>
              </li>
            ))}
            {view.sellers.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Sin ventas este mes</li>}
          </ul>
        </Card>
        <Card title="Origen de clientes" subtitle="Ingresos por canal · últimos 3 meses">
          <Donut data={view.sources.slice(0, 6)} height={200} />
        </Card>
        <Card title="Alertas" subtitle="Caja, stock, seguimiento y RX" actions={<Badge tone="rose"><AlertTriangle size={11} />{d?.alerts.filter((a) => a.severity === 'alta').length} altas</Badge>}>
          <ul className="space-y-2">
            {(d?.alerts ?? []).map((a, i) => (
              <li key={i}><Link to={alertRoute(a)} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2.5 hover:bg-slate-50">
                <Badge tone={a.severity === 'alta' ? 'rose' : a.severity === 'media' ? 'amber' : 'slate'}>{alertKind(a.kind)}</Badge>
                <span className="text-xs text-slate-700 leading-snug flex-1">{a.message}</span><span className="text-[10px] text-slate-400 shrink-0">{a.branch?.name}</span>
              </Link></li>
            ))}
            {d?.alerts.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Todo en orden</li>}
          </ul>
        </Card>
      </div>

      <Card title="Últimas ventas" subtitle={branch?.name} actions={<Link to="/pos" className="btn-primary h-8 text-xs">Nueva venta</Link>} padded={false}>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Estado</th><th>Entrega</th><th className="text-right">Total</th></tr></thead>
          <tbody>{d?.recent.map((s) => (
            <tr key={s.id}><td className="font-mono text-xs">{s.number}</td><td className="text-slate-500">{fdate(s.sale_date, 'dd MMM HH:mm')}</td><td className="font-medium">{fullName(s.customer)}</td><td>{s.seller?.name}</td><td><StatusBadge status={s.status} /></td><td><StatusBadge status={s.delivery_status} /></td><td className="text-right font-semibold">{money(s.total)}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
      <div className="text-[11px] text-slate-400 flex items-center gap-1"><Users size={11} /> Datos en vivo desde Nhost/Hasura · KPIs calculados por vistas SQL (v_kpi_branch_month, v_funnel_month, v_alerts)</div>
    </div>
  )
}

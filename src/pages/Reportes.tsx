import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, Tabs, Avatar, Progress } from '../components/ui'
import { Bars, Lines, Donut, AreaTrend } from '../components/charts'
import { money, num, pct, monthLabel, monthStartISO, SOURCES, CATEGORIES } from '../lib/format'

const Q = `query Reports($company: uuid!, $from: date!, $fromTs: timestamptz!) {
  kpi: v_kpi_branch_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}, order_by:{month:asc}) { branch_id month tickets revenue avg_ticket discounts gross_margin margin_pct units lens_revenue frame_revenue avg_delivery_days branch { name monthly_goal } }
  sellers: v_sales_by_seller(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id seller_id seller_name month tickets revenue avg_ticket commissions discounts branch { name } }
  sources: v_sales_by_source(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id source month tickets revenue }
  funnel: v_funnel_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id month citas examenes cotizaciones ventas entregas branch { name } }
  items: sale_items(where:{sale:{company_id:{_eq:$company}, sale_date:{_gte:$fromTs}, status:{_in:["completada","parcial"]}}}) { category qty line_total unit_cost product { brand name } }
  optos: sales(where:{company_id:{_eq:$company}, sale_date:{_gte:$fromTs}, optometrist_id:{_is_null:false}, status:{_in:["completada","parcial"]}}) { total optometrist { name } }
  rmas: rmas(where:{company_id:{_eq:$company}, created_at:{_gte:$fromTs}}) { type status refund_amount branch { name } }
  companies_all: v_kpi_branch_month(where:{month:{_gte:$from}}) { month revenue tickets company { code } }
}`
type R = Record<string, unknown>

export default function Reportes() {
  const { company } = useApp()
  const [months, setMonths] = useState<3 | 6 | 12>(6)
  const [tab, setTab] = useState<'ventas' | 'vendedores' | 'productos' | 'origen' | 'operacion' | 'grupo'>('ventas')
  const from = monthStartISO(months - 1)
  const q = useQuery({ queryKey: ['reports', company?.id, from], queryFn: () => gql<{ kpi: R[]; sellers: R[]; sources: R[]; funnel: R[]; items: R[]; optos: R[]; rmas: R[]; companies_all: R[] }>(Q, { company: company!.id, from, fromTs: from + 'T00:00:00Z' }), enabled: !!company })
  const d = q.data
  const v = useMemo(() => {
    if (!d) return null
    const n = (x: unknown) => Number(x ?? 0)
    const monthsList = [...new Set(d.kpi.map((r) => r.month as string))].sort()
    const byMonth = monthsList.map((m) => { const rows = d.kpi.filter((r) => r.month === m); return { month: monthLabel(m), revenue: rows.reduce((a, r) => a + n(r.revenue), 0), margin: rows.reduce((a, r) => a + n(r.gross_margin), 0), tickets: rows.reduce((a, r) => a + n(r.tickets), 0), discounts: rows.reduce((a, r) => a + n(r.discounts), 0), units: rows.reduce((a, r) => a + n(r.units), 0) } })
    const branchesMap = new Map<string, R>()
    d.kpi.forEach((r) => { const b = (r.branch as { name: string; monthly_goal: number }); const cur = branchesMap.get(b.name) ?? { name: b.name, revenue: 0, tickets: 0, margin: 0, goal: n(b.monthly_goal) * monthsList.length, lens: 0, frame: 0, delivery: [] as number[] }; cur.revenue = n(cur.revenue) + n(r.revenue); cur.tickets = n(cur.tickets) + n(r.tickets); cur.margin = n(cur.margin) + n(r.gross_margin); cur.lens = n(cur.lens) + n(r.lens_revenue); cur.frame = n(cur.frame) + n(r.frame_revenue); if (r.avg_delivery_days) (cur.delivery as number[]).push(n(r.avg_delivery_days)); branchesMap.set(b.name, cur) })
    const byBranch = [...branchesMap.values()].sort((a, b) => n(b.revenue) - n(a.revenue))
    const branchMonthly = monthsList.map((m) => { const row: R = { month: monthLabel(m) }; d.kpi.filter((r) => r.month === m).forEach((r) => { row[(r.branch as { name: string }).name] = Math.round(n(r.revenue)) }); return row })
    const sellersMap = new Map<string, R>()
    d.sellers.forEach((r) => { const k = r.seller_id as string; const c = sellersMap.get(k) ?? { name: r.seller_name, branch: (r.branch as { name: string }).name, revenue: 0, tickets: 0, commissions: 0, discounts: 0 }; c.revenue = n(c.revenue) + n(r.revenue); c.tickets = n(c.tickets) + n(r.tickets); c.commissions = n(c.commissions) + n(r.commissions); c.discounts = n(c.discounts) + n(r.discounts); sellersMap.set(k, c) })
    const sellers = [...sellersMap.values()].sort((a, b) => n(b.revenue) - n(a.revenue))
    const srcMap = new Map<string, { revenue: number; tickets: number }>()
    d.sources.forEach((r) => { const c = srcMap.get(r.source as string) ?? { revenue: 0, tickets: 0 }; c.revenue += n(r.revenue); c.tickets += n(r.tickets); srcMap.set(r.source as string, c) })
    const sources = [...srcMap.entries()].map(([k, x]) => ({ name: SOURCES[k] ?? k, value: Math.round(x.revenue), tickets: x.tickets })).sort((a, b) => b.value - a.value)
    const catMap = new Map<string, { revenue: number; units: number; cost: number }>()
    const brandMap = new Map<string, number>()
    d.items.forEach((i) => { const c = catMap.get(i.category as string) ?? { revenue: 0, units: 0, cost: 0 }; c.revenue += n(i.line_total); c.units += n(i.qty); c.cost += n(i.unit_cost) * n(i.qty); catMap.set(i.category as string, c); const b = (i.product as { brand?: string } | null)?.brand; if (b && ['armazon', 'solar'].includes(i.category as string)) brandMap.set(b, (brandMap.get(b) ?? 0) + n(i.line_total)) })
    const cats = [...catMap.entries()].map(([k, x]) => ({ name: CATEGORIES[k] ?? k, revenue: Math.round(x.revenue), units: x.units, margin: x.revenue ? (x.revenue - x.cost) / x.revenue : 0 })).sort((a, b) => b.revenue - a.revenue)
    const brands = [...brandMap.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8)
    const optoMap = new Map<string, { revenue: number; count: number }>()
    d.optos.forEach((s) => { const k = (s.optometrist as { name: string }).name; const c = optoMap.get(k) ?? { revenue: 0, count: 0 }; c.revenue += n(s.total); c.count++; optoMap.set(k, c) })
    const optos = [...optoMap.entries()].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.revenue - a.revenue)
    const funnelByBranch = [...new Set(d.funnel.map((r) => (r.branch as { name: string }).name))].map((b) => { const rows = d.funnel.filter((r) => (r.branch as { name: string }).name === b); const s = (k: string) => rows.reduce((a, r) => a + n(r[k]), 0); return { name: b, citas: s('citas'), examenes: s('examenes'), cotizaciones: s('cotizaciones'), ventas: s('ventas'), entregas: s('entregas') } })
    const rmaByType = ['devolucion', 'reparacion', 'garantia', 'cambio'].map((t) => ({ name: t, value: d.rmas.filter((r) => r.type === t).length }))
    const groupMonthly = monthsList.map((m) => { const row: R = { month: monthLabel(m) }; d.companies_all.filter((r) => r.month === m).forEach((r) => { const k = (r.company as { code: string }).code; row[k] = Math.round(n(row[k]) + n(r.revenue)) }); return row })
    const groupCodes = [...new Set(d.companies_all.map((r) => (r.company as { code: string }).code))]
    const totals = byMonth.reduce((a, m) => ({ revenue: a.revenue + m.revenue, margin: a.margin + m.margin, tickets: a.tickets + m.tickets, discounts: a.discounts + m.discounts, units: a.units + m.units }), { revenue: 0, margin: 0, tickets: 0, discounts: 0, units: 0 })
    return { byMonth, byBranch, branchMonthly, sellers, sources, cats, brands, optos, funnelByBranch, rmaByType, groupMonthly, groupCodes, totals, branchNames: [...branchesMap.keys()] }
  }, [d])

  const exportCsv = () => {
    if (!v) return
    const rows = [['Mes', 'Ventas', 'Margen', 'Tickets', 'Descuentos', 'Unidades'], ...v.byMonth.map((m) => [m.month, m.revenue.toFixed(2), m.margin.toFixed(2), m.tickets, m.discounts.toFixed(2), m.units])]
    const blob = new Blob([rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ventas_${company?.code}_${months}m.csv`; a.click()
  }
  if (q.isLoading || !v) return <Loading />
  const colors = ['#1b5cf5', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

  return (
    <div className="space-y-4">
      <PageHeader title="Reportes y KPIs" subtitle={`${company?.legal_name} · ${months} meses · ventas por sucursal / vendedor / optometrista · mix · origen`} actions={<><Tabs value={months} onChange={setMonths} items={[{ value: 3, label: '3 meses' }, { value: 6, label: '6 meses' }, { value: 12, label: '12 meses' }]} /><button className="btn-secondary" onClick={exportCsv}><Download size={15} />CSV</button></>} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[['Ventas', money(v.totals.revenue)], ['Margen bruto', `${money(v.totals.margin)} · ${pct(v.totals.revenue ? v.totals.margin / (v.totals.revenue / 1.07) : 0, 0)}`], ['Tickets', num(v.totals.tickets)], ['Ticket promedio', money(v.totals.tickets ? v.totals.revenue / v.totals.tickets : 0)], ['Uds. por ticket', (v.totals.tickets ? v.totals.units / v.totals.tickets : 0).toFixed(2)]].map(([l, x]) => <Card key={l} className="p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</div><div className="text-xl font-extrabold text-slate-900 mt-1 truncate">{x}</div></Card>)}
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'ventas', label: 'Ventas por sucursal' }, { value: 'vendedores', label: 'Vendedores y optometristas' }, { value: 'productos', label: 'Mix de productos' }, { value: 'origen', label: 'Origen y embudo' }, { value: 'operacion', label: 'Operación (entrega, RMA, descuentos)' }, { value: 'grupo', label: 'Grupo (3 compañías)' }]} />

      {tab === 'ventas' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Ventas mensuales por sucursal" className="lg:col-span-2"><Bars data={v.branchMonthly} x="month" series={v.branchNames.map((b, i) => ({ key: b, label: b, color: colors[i % colors.length] }))} stacked height={280} /></Card>
        <Card title="Cumplimiento de meta" subtitle="Acumulado del periodo vs. meta mensual × meses"><ul className="space-y-3">{v.byBranch.map((b) => <li key={b.name as string}><div className="flex justify-between text-sm mb-1"><b>{b.name as string}</b><span className="text-slate-500">{money(b.revenue as number)} · {pct((b.revenue as number) / ((b.goal as number) || 1), 0)}</span></div><Progress value={(b.revenue as number) / ((b.goal as number) || 1)} tone={(b.revenue as number) / ((b.goal as number) || 1) >= 0.9 ? 'green' : 'brand'} /><div className="text-[11px] text-slate-400 mt-0.5">{num(b.tickets as number)} tickets · margen {pct((b.margin as number) / ((b.revenue as number) / 1.07 || 1), 0)}</div></li>)}</ul></Card>
        <Card title="Ingresos vs. margen" className="lg:col-span-3"><Lines data={v.byMonth} x="month" series={[{ key: 'revenue', label: 'Ventas' }, { key: 'margin', label: 'Margen bruto', color: '#10b981' }, { key: 'discounts', label: 'Descuentos', color: '#ef4444' }]} money height={240} /></Card>
      </div>}

      {tab === 'vendedores' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Ranking de vendedores" subtitle="Ventas, ticket promedio, descuentos y comisiones" className="lg:col-span-2" padded={false}><div className="overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>Vendedor</th><th>Sucursal</th><th className="text-right">Tickets</th><th className="text-right">Ventas</th><th className="text-right">Ticket prom.</th><th className="text-right">Descuentos</th><th className="text-right">Comisión</th></tr></thead><tbody>{v.sellers.map((s, i) => <tr key={i}><td className="text-slate-400 font-bold">{i + 1}</td><td><span className="flex items-center gap-2"><Avatar name={s.name as string} className="h-7 w-7 text-[10px]" /><b>{s.name as string}</b></span></td><td className="text-xs">{s.branch as string}</td><td className="text-right">{num(s.tickets as number)}</td><td className="text-right font-semibold">{money(s.revenue as number)}</td><td className="text-right">{money((s.revenue as number) / ((s.tickets as number) || 1))}</td><td className="text-right text-rose-600">{money(s.discounts as number)}</td><td className="text-right text-emerald-700 font-semibold">{money(s.commissions as number)}</td></tr>)}</tbody></table></div></Card>
        <Card title="Ventas por optometrista" subtitle="Ventas con RX asociada"><Bars data={v.optos.map((o) => ({ name: o.name.replace(/^Dra?\. /, ''), revenue: Math.round(o.revenue) }))} x="name" series={[{ key: 'revenue', label: 'Ventas', color: '#8b5cf6' }]} horizontal height={260} /></Card>
      </div>}

      {tab === 'productos' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Mix por categoría" subtitle="Ingresos netos"><Donut data={v.cats.map((c) => ({ name: c.name, value: c.revenue }))} /></Card>
        <Card title="Margen por categoría" padded={false}><table className="table"><thead><tr><th>Categoría</th><th className="text-right">Unidades</th><th className="text-right">Ingresos</th><th className="text-right">Margen</th></tr></thead><tbody>{v.cats.map((c) => <tr key={c.name}><td className="font-semibold">{c.name}</td><td className="text-right">{num(c.units)}</td><td className="text-right">{money(c.revenue)}</td><td className="text-right"><span className={c.margin > 0.5 ? 'text-emerald-600 font-semibold' : 'text-slate-700'}>{pct(c.margin, 0)}</span></td></tr>)}</tbody></table></Card>
        <Card title="Top marcas (armazones y solares)"><Bars data={v.brands} x="name" series={[{ key: 'value', label: 'Ventas' }]} horizontal height={260} /></Card>
        <Card title="Ratio lentes / armazón por sucursal" className="lg:col-span-3"><Bars data={v.byBranch.map((b) => ({ name: b.name, Lentes: Math.round(b.lens as number), Armazones: Math.round(b.frame as number) }))} x="name" series={[{ key: 'Lentes', label: 'Lentes', color: '#8b5cf6' }, { key: 'Armazones', label: 'Armazones y solares', color: '#1b5cf5' }]} height={220} /></Card>
      </div>}

      {tab === 'origen' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Ingresos por origen" subtitle="Walk-in, referido, Instagram, Google Ads, campañas, empresa, doctor"><Donut data={v.sources} /></Card>
        <Card title="Tickets por origen" padded={false}><table className="table"><thead><tr><th>Origen</th><th className="text-right">Tickets</th><th className="text-right">Ingresos</th><th className="text-right">Ticket prom.</th></tr></thead><tbody>{v.sources.map((s) => <tr key={s.name}><td className="font-semibold">{s.name}</td><td className="text-right">{num(s.tickets)}</td><td className="text-right">{money(s.value)}</td><td className="text-right">{money(s.value / (s.tickets || 1))}</td></tr>)}</tbody></table></Card>
        <Card title="Embudo por sucursal" subtitle="Conversión cita → examen → cotización → venta → entrega" padded={false}><table className="table"><thead><tr><th>Sucursal</th><th className="text-right">Citas</th><th className="text-right">Exám.</th><th className="text-right">Cotiz.</th><th className="text-right">Ventas</th><th className="text-right">Conv.</th></tr></thead><tbody>{v.funnelByBranch.map((f) => <tr key={f.name}><td className="font-semibold">{f.name}</td><td className="text-right">{f.citas}</td><td className="text-right">{f.examenes}</td><td className="text-right">{f.cotizaciones}</td><td className="text-right">{f.ventas}</td><td className="text-right font-bold text-brand-700">{pct(f.cotizaciones ? f.ventas / f.cotizaciones : 0, 0)}</td></tr>)}</tbody></table></Card>
      </div>}

      {tab === 'operacion' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Tiempo de entrega promedio (días)" subtitle="Desde venta hasta entrega de lentes"><Bars data={v.byBranch.map((b) => ({ name: b.name, dias: Number((((b.delivery as number[]).reduce((a, x) => a + x, 0) / ((b.delivery as number[]).length || 1))).toFixed(1)) }))} x="name" series={[{ key: 'dias', label: 'Días', color: '#f59e0b' }]} money={false} height={220} /></Card>
        <Card title="Devoluciones y reclamos" subtitle={`${d?.rmas.length} RMA en el periodo · ${money(d?.rmas.reduce((a, r) => a + Number(r.refund_amount ?? 0), 0))} reembolsado`}><Donut data={v.rmaByType} money={false} /></Card>
        <Card title="Descuentos otorgados" subtitle="Total mensual"><AreaTrend data={v.byMonth} x="month" y="discounts" color="#ef4444" height={220} /></Card>
      </div>}

      {tab === 'grupo' && <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Ventas por compañía del grupo" subtitle="Consolidado Optilux S.A. · Optilux Chorrera S.A. · Optilux David (reportes fiscales separados por razón social)" className="lg:col-span-3"><Bars data={v.groupMonthly} x="month" series={v.groupCodes.map((c, i) => ({ key: c, label: c, color: colors[i] }))} height={280} /></Card>
      </div>}
    </div>
  )
}

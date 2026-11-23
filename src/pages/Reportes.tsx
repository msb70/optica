import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileDown, ChevronDown, X, Filter } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, Tabs, Avatar, Progress } from '../components/ui'
import { Bars, Lines, Donut, AreaTrend } from '../components/charts'
import { money, num, pct, monthLabel, monthStartISO, SOURCES, CATEGORIES } from '../lib/format'

const Q = `query Reports($company: uuid!, $from: date!, $fromTs: timestamptz!) {
  kpi: v_kpi_branch_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}, order_by:{month:asc}) { branch_id month avg_delivery_days }
  funnel: v_funnel_month(where:{company_id:{_eq:$company}, month:{_gte:$from}}) { branch_id month citas examenes cotizaciones ventas entregas branch { name } }
  sales: sales(where:{company_id:{_eq:$company}, sale_date:{_gte:$fromTs}, status:{_in:["completada","parcial"]}}) { id branch_id seller_id optometrist_id source sale_date total tax discount cost_total commission_amount sale_items { product_id category qty line_total unit_cost description product { brand name sku } } }
  rmas: rmas(where:{company_id:{_eq:$company}, created_at:{_gte:$fromTs}}) { type status refund_amount branch_id branch { name } }
  companies_all: v_kpi_branch_month(where:{month:{_gte:$from}}) { month revenue tickets company { code } }
}`
type Item = { product_id: string | null; category: string | null; qty: number; line_total: number; unit_cost: number; description: string; product?: { brand?: string | null; name: string; sku: string } | null }
type Sale = { id: string; branch_id: string; seller_id: string | null; optometrist_id: string | null; source: string | null; sale_date: string; total: number; tax: number; discount: number; cost_total: number; commission_amount: number; sale_items: Item[] }
type Filters = { branches: string[]; sellers: string[]; optos: string[]; products: string[]; categories: string[]; brands: string[]; sources: string[] }
const EMPTY: Filters = { branches: [], sellers: [], optos: [], products: [], categories: [], brands: [], sources: [] }

function MultiSelect({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 200)
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className={`input h-9 text-xs flex items-center justify-between gap-1 text-left ${value.length ? 'border-brand-400 bg-brand-50 text-brand-800' : ''}`}>
        <span className="truncate">{value.length ? `${label}: ${value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `${value.length} seleccionados`}` : `${label}: todos`}</span><ChevronDown size={13} className="shrink-0" />
      </button>
      {open && <div className="absolute z-30 mt-1 w-72 card p-2 shadow-lg">
        {options.length > 8 && <input className="input h-8 text-xs mb-2" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
        <div className="max-h-64 overflow-y-auto space-y-0.5">{shown.map((o) => <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs cursor-pointer"><input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} /><span className="truncate">{o.label}</span></label>)}{shown.length === 0 && <div className="text-xs text-slate-400 px-2 py-2">Sin opciones</div>}</div>
        {value.length > 0 && <button type="button" className="btn-ghost h-7 text-xs mt-1 w-full" onClick={() => onChange([])}>Limpiar</button>}
      </div>}
    </div>
  )
}
type R = Record<string, unknown>

export default function Reportes() {
  const { company, branches: allBranches, staff } = useApp()
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(6)
  const [f, setF] = useState<Filters>(EMPTY)
  const [printing, setPrinting] = useState(false)
  const [tab, setTab] = useState<'ventas' | 'vendedores' | 'productos' | 'origen' | 'operacion' | 'grupo'>('ventas')
  const from = monthStartISO(months - 1)
  const q = useQuery({ queryKey: ['reports', company?.id, from], queryFn: () => gql<{ kpi: R[]; funnel: R[]; sales: Sale[]; rmas: R[]; companies_all: R[] }>(Q, { company: company!.id, from, fromTs: from + 'T00:00:00Z' }), enabled: !!company })
  const d = q.data
  const companyBranches = allBranches.filter((b) => b.company_id === company?.id)
  const staffName = (id: string | null) => staff.find((x) => x.id === id)?.name ?? 'Sin asignar'
  const opts = useMemo(() => {
    const sales = d?.sales ?? []
    const uniq = (arr: [string, string][]) => [...new Map(arr).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
    const items = sales.flatMap((x) => x.sale_items)
    return {
      branches: companyBranches.map((b) => ({ value: b.id, label: b.name })),
      sellers: uniq(sales.filter((x) => x.seller_id).map((x) => [x.seller_id!, staffName(x.seller_id)])),
      optos: uniq(sales.filter((x) => x.optometrist_id).map((x) => [x.optometrist_id!, staffName(x.optometrist_id)])),
      products: uniq(items.filter((i) => i.product_id).map((i) => [i.product_id!, `${i.product?.name ?? i.description}${i.product?.sku ? ` · ${i.product.sku}` : ''}`])),
      categories: uniq(items.filter((i) => i.category).map((i) => [i.category!, CATEGORIES[i.category!] ?? i.category!])),
      brands: uniq(items.filter((i) => i.product?.brand).map((i) => [i.product!.brand!, i.product!.brand!])),
      sources: uniq(sales.map((x) => [x.source ?? 'sin_origen', SOURCES[x.source ?? ''] ?? (x.source ?? 'Sin origen')])),
    }
  }, [d, companyBranches.length, staff.length])
  const itemFilter = f.products.length + f.categories.length + f.brands.length > 0
  const activeCount = Object.values(f).reduce((a, x) => a + (x.length ? 1 : 0), 0)
  const v = useMemo(() => {
    if (!d) return null
    const n = (x: unknown) => Number(x ?? 0)
    const inSet = (arr: string[], val: string | null | undefined) => !arr.length || arr.includes(val ?? '')
    const itemOk = (i: Item) => inSet(f.products, i.product_id) && inSet(f.categories, i.category) && inSet(f.brands, i.product?.brand)
    // líneas filtradas por venta; ingresos con impuesto prorrateado para que cuadre con el total de la venta
    const rows = d.sales.filter((x) => inSet(f.branches, x.branch_id) && inSet(f.sellers, x.seller_id) && inSet(f.optos, x.optometrist_id) && inSet(f.sources, x.source ?? 'sin_origen')).map((x) => {
      const items = x.sale_items.filter(itemOk)
      const allLines = x.sale_items.reduce((a, i) => a + n(i.line_total), 0) || 1
      const share = itemFilter ? items.reduce((a, i) => a + n(i.line_total), 0) / allLines : 1
      const revenue = itemFilter ? n(x.total) * share : n(x.total)
      const cost = itemFilter ? items.reduce((a, i) => a + n(i.unit_cost) * n(i.qty), 0) : n(x.cost_total)
      return { s: x, items, revenue, net: revenue - n(x.tax) * share, cost, discount: n(x.discount) * share, commission: n(x.commission_amount) * share, units: items.reduce((a, i) => a + n(i.qty), 0), month: x.sale_date.slice(0, 7) + '-01' }
    }).filter((r) => !itemFilter || r.items.length > 0)
    const monthsList = Array.from({ length: months }, (_, k) => monthStartISO(months - 1 - k).slice(0, 7) + '-01')
    const byMonth = monthsList.map((m) => { const rs = rows.filter((r) => r.month === m); return { month: monthLabel(m), revenue: rs.reduce((a, r) => a + r.revenue, 0), margin: rs.reduce((a, r) => a + r.net - r.cost, 0), tickets: rs.length, discounts: rs.reduce((a, r) => a + r.discount, 0), units: rs.reduce((a, r) => a + r.units, 0) } })
    const brs = companyBranches.filter((b) => inSet(f.branches, b.id))
    const byBranch = brs.map((b) => { const rs = rows.filter((r) => r.s.branch_id === b.id); const del = d.kpi.filter((k) => k.branch_id === b.id && k.avg_delivery_days).map((k) => n(k.avg_delivery_days)); return { name: b.name, revenue: rs.reduce((a, r) => a + r.revenue, 0), net: rs.reduce((a, r) => a + r.net, 0), tickets: rs.length, margin: rs.reduce((a, r) => a + r.net - r.cost, 0), goal: n(b.monthly_goal) * months, lens: rs.reduce((a, r) => a + r.items.filter((i) => i.category === 'lente').reduce((x, i) => x + n(i.line_total), 0), 0), frame: rs.reduce((a, r) => a + r.items.filter((i) => ['armazon', 'solar'].includes(i.category ?? '')).reduce((x, i) => x + n(i.line_total), 0), 0), delivery: del } }).sort((a, b) => b.revenue - a.revenue)
    const branchMonthly = monthsList.map((m) => { const row: R = { month: monthLabel(m) }; brs.forEach((b) => { row[b.name] = Math.round(rows.filter((r) => r.month === m && r.s.branch_id === b.id).reduce((a, r) => a + r.revenue, 0)) }); return row })
    const group = <K extends string>(key: (r: typeof rows[number]) => K | null) => { const m = new Map<K, typeof rows>(); rows.forEach((r) => { const k = key(r); if (k == null) return; m.set(k, [...(m.get(k) ?? []), r]) }); return m }
    const sellers = [...group((r) => r.s.seller_id).entries()].map(([id, rs]) => ({ name: staffName(id), branch: companyBranches.find((b) => b.id === rs[0].s.branch_id)?.name ?? '', revenue: rs.reduce((a, r) => a + r.revenue, 0), tickets: rs.length, commissions: rs.reduce((a, r) => a + r.commission, 0), discounts: rs.reduce((a, r) => a + r.discount, 0) })).sort((a, b) => b.revenue - a.revenue)
    const optos = [...group((r) => r.s.optometrist_id).entries()].map(([id, rs]) => ({ name: staffName(id), revenue: rs.reduce((a, r) => a + r.revenue, 0), count: rs.length })).sort((a, b) => b.revenue - a.revenue)
    const sources = [...group((r) => r.s.source ?? 'sin_origen').entries()].map(([k, rs]) => ({ name: SOURCES[k] ?? (k === 'sin_origen' ? 'Sin origen' : k), value: Math.round(rs.reduce((a, r) => a + r.revenue, 0)), tickets: rs.length })).sort((a, b) => b.value - a.value)
    const catMap = new Map<string, { revenue: number; units: number; cost: number }>(); const brandMap = new Map<string, number>(); const prodMap = new Map<string, { name: string; units: number; revenue: number }>()
    rows.forEach((r) => r.items.forEach((i) => { const k = i.category ?? 'otros'; const c = catMap.get(k) ?? { revenue: 0, units: 0, cost: 0 }; c.revenue += n(i.line_total); c.units += n(i.qty); c.cost += n(i.unit_cost) * n(i.qty); catMap.set(k, c); const b = i.product?.brand; if (b) brandMap.set(b, (brandMap.get(b) ?? 0) + n(i.line_total)); const pk = i.product_id ?? i.description; const p = prodMap.get(pk) ?? { name: i.product?.name ?? i.description, units: 0, revenue: 0 }; p.units += n(i.qty); p.revenue += n(i.line_total); prodMap.set(pk, p) }))
    const cats = [...catMap.entries()].map(([k, x]) => ({ name: CATEGORIES[k] ?? k, revenue: Math.round(x.revenue), units: x.units, margin: x.revenue ? (x.revenue - x.cost) / x.revenue : 0 })).sort((a, b) => b.revenue - a.revenue)
    const brands = [...brandMap.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 10)
    const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15)
    const funnelByBranch = brs.map((b) => { const rs = d.funnel.filter((r) => r.branch_id === b.id); const sm = (k: string) => rs.reduce((a, r) => a + n(r[k]), 0); return { name: b.name, citas: sm('citas'), examenes: sm('examenes'), cotizaciones: sm('cotizaciones'), ventas: sm('ventas'), entregas: sm('entregas') } })
    const rmasF = d.rmas.filter((r) => inSet(f.branches, r.branch_id as string))
    const rmaByType = ['devolucion', 'reparacion', 'garantia', 'cambio'].map((t) => ({ name: t, value: rmasF.filter((r) => r.type === t).length }))
    const groupMonthly = monthsList.map((m) => { const row: R = { month: monthLabel(m) }; d.companies_all.filter((r) => r.month === m).forEach((r) => { const k = (r.company as { code: string }).code; row[k] = Math.round(n(row[k]) + n(r.revenue)) }); return row })
    const groupCodes = [...new Set(d.companies_all.map((r) => (r.company as { code: string }).code))]
    const totals = byMonth.reduce((a, m) => ({ revenue: a.revenue + m.revenue, margin: a.margin + m.margin, tickets: a.tickets + m.tickets, discounts: a.discounts + m.discounts, units: a.units + m.units }), { revenue: 0, margin: 0, tickets: 0, discounts: 0, units: 0 })
    const netTotal = rows.reduce((a, r) => a + r.net, 0)
    return { byMonth, byBranch, branchMonthly, sellers, sources, cats, brands, topProducts, optos, funnelByBranch, rmaByType, rmasF, groupMonthly, groupCodes, totals, netTotal, branchNames: brs.map((b) => b.name) }
  }, [d, f, months, itemFilter, companyBranches.length, staff.length])
  const filterSummary = (Object.keys(f) as (keyof Filters)[]).filter((k) => f[k].length).map((k) => { const names: Record<keyof Filters, string> = { branches: 'Sucursal', sellers: 'Vendedor', optos: 'Optometrista', products: 'Producto', categories: 'Categoría', brands: 'Marca', sources: 'Origen' }; return `${names[k]}: ${f[k].map((x) => opts[k].find((o) => o.value === x)?.label ?? x).join(', ')}` })
  const exportPdf = () => { setPrinting(true); setTimeout(() => { const prev = document.title; document.title = `${new Date().toISOString().slice(0, 10)}_Reporte_${company?.code}_${months}m`; window.print(); document.title = prev; setPrinting(false) }, 600) }

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
      <PageHeader title="Reportes y KPIs" subtitle={`${company?.legal_name} · ${months === 1 ? '1 mes' : `${months} meses`}${activeCount ? ` · ${activeCount} filtro(s) activo(s)` : ''}`} actions={<div className="flex items-center gap-2 no-print"><Tabs value={months} onChange={setMonths} items={[{ value: 1, label: '1 mes' }, { value: 3, label: '3 meses' }, { value: 6, label: '6 meses' }, { value: 12, label: '12 meses' }]} /><button className="btn-secondary" onClick={exportCsv}><Download size={15} />CSV</button><button className="btn-primary" onClick={exportPdf}><FileDown size={15} />PDF</button></div>} />
      <Card className="p-3 no-print"><div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500"><Filter size={13} />Filtros {activeCount > 0 && <button className="btn-ghost h-6 text-xs ml-auto" onClick={() => setF(EMPTY)}><X size={12} />Quitar filtros ({activeCount})</button>}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          <MultiSelect label="Sucursal" options={opts.branches} value={f.branches} onChange={(x) => setF({ ...f, branches: x })} />
          <MultiSelect label="Vendedor" options={opts.sellers} value={f.sellers} onChange={(x) => setF({ ...f, sellers: x })} />
          <MultiSelect label="Optometrista" options={opts.optos} value={f.optos} onChange={(x) => setF({ ...f, optos: x })} />
          <MultiSelect label="Productos" options={opts.products} value={f.products} onChange={(x) => setF({ ...f, products: x })} />
          <MultiSelect label="Categoría" options={opts.categories} value={f.categories} onChange={(x) => setF({ ...f, categories: x })} />
          <MultiSelect label="Marca" options={opts.brands} value={f.brands} onChange={(x) => setF({ ...f, brands: x })} />
          <MultiSelect label="Origen" options={opts.sources} value={f.sources} onChange={(x) => setF({ ...f, sources: x })} />
        </div></Card>
      <div className="hidden print:block text-xs text-slate-600 border-b border-slate-200 pb-2">Periodo: {months === 1 ? 'mes en curso' : `últimos ${months} meses`} · generado {new Date().toLocaleString('es-PA')} · {filterSummary.length ? filterSummary.join(' · ') : 'Sin filtros'}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[['Ventas', money(v.totals.revenue)], ['Margen bruto', `${money(v.totals.margin)} · ${pct(v.netTotal ? v.totals.margin / v.netTotal : 0, 0)}`], ['Tickets', num(v.totals.tickets)], ['Ticket promedio', money(v.totals.tickets ? v.totals.revenue / v.totals.tickets : 0)], ['Uds. por ticket', (v.totals.tickets ? v.totals.units / v.totals.tickets : 0).toFixed(2)]].map(([l, x]) => <Card key={l} className="p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</div><div className="text-xl font-extrabold text-slate-900 mt-1 truncate">{x}</div></Card>)}
      </div>
      <div className="no-print"><Tabs value={tab} onChange={setTab} items={[{ value: 'ventas', label: 'Ventas por sucursal' }, { value: 'vendedores', label: 'Vendedores y optometristas' }, { value: 'productos', label: 'Mix de productos' }, { value: 'origen', label: 'Origen y embudo' }, { value: 'operacion', label: 'Operación (entrega, RMA, descuentos)' }, { value: 'grupo', label: 'Grupo (3 compañías)' }]} /></div>

      {(printing || tab === 'ventas') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Ventas mensuales por sucursal" className="lg:col-span-2"><Bars data={v.branchMonthly} x="month" series={v.branchNames.map((b, i) => ({ key: b, label: b, color: colors[i % colors.length] }))} stacked height={280} /></Card>
        <Card title="Cumplimiento de meta" subtitle="Acumulado del periodo vs. meta mensual × meses"><ul className="space-y-3">{v.byBranch.map((b) => <li key={b.name as string}><div className="flex justify-between text-sm mb-1"><b>{b.name as string}</b><span className="text-slate-500">{money(b.revenue as number)} · {pct((b.revenue as number) / ((b.goal as number) || 1), 0)}</span></div><Progress value={(b.revenue as number) / ((b.goal as number) || 1)} tone={(b.revenue as number) / ((b.goal as number) || 1) >= 0.9 ? 'green' : 'brand'} /><div className="text-[11px] text-slate-400 mt-0.5">{num(b.tickets as number)} tickets · margen {pct(b.margin / (b.net || 1), 0)}</div></li>)}</ul></Card>
        <Card title="Ingresos vs. margen" className="lg:col-span-3"><Lines data={v.byMonth} x="month" series={[{ key: 'revenue', label: 'Ventas' }, { key: 'margin', label: 'Margen bruto', color: '#10b981' }, { key: 'discounts', label: 'Descuentos', color: '#ef4444' }]} money height={240} /></Card>
      </div>}

      {(printing || tab === 'vendedores') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Ranking de vendedores" subtitle="Ventas, ticket promedio, descuentos y comisiones" className="lg:col-span-2" padded={false}><div className="overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>Vendedor</th><th>Sucursal</th><th className="text-right">Tickets</th><th className="text-right">Ventas</th><th className="text-right">Ticket prom.</th><th className="text-right">Descuentos</th><th className="text-right">Comisión</th></tr></thead><tbody>{v.sellers.map((s, i) => <tr key={i}><td className="text-slate-400 font-bold">{i + 1}</td><td><span className="flex items-center gap-2"><Avatar name={s.name as string} className="h-7 w-7 text-[10px]" /><b>{s.name as string}</b></span></td><td className="text-xs">{s.branch as string}</td><td className="text-right">{num(s.tickets as number)}</td><td className="text-right font-semibold">{money(s.revenue as number)}</td><td className="text-right">{money((s.revenue as number) / ((s.tickets as number) || 1))}</td><td className="text-right text-rose-600">{money(s.discounts as number)}</td><td className="text-right text-emerald-700 font-semibold">{money(s.commissions as number)}</td></tr>)}</tbody></table></div></Card>
        <Card title="Ventas por optometrista" subtitle="Ventas con RX asociada"><Bars data={v.optos.map((o) => ({ name: o.name.replace(/^Dra?\. /, ''), revenue: Math.round(o.revenue) }))} x="name" series={[{ key: 'revenue', label: 'Ventas', color: '#8b5cf6' }]} horizontal height={260} /></Card>
      </div>}

      {(printing || tab === 'productos') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Mix por categoría" subtitle="Ingresos netos"><Donut data={v.cats.map((c) => ({ name: c.name, value: c.revenue }))} /></Card>
        <Card title="Margen por categoría" padded={false}><table className="table"><thead><tr><th>Categoría</th><th className="text-right">Unidades</th><th className="text-right">Ingresos</th><th className="text-right">Margen</th></tr></thead><tbody>{v.cats.map((c) => <tr key={c.name}><td className="font-semibold">{c.name}</td><td className="text-right">{num(c.units)}</td><td className="text-right">{money(c.revenue)}</td><td className="text-right"><span className={c.margin > 0.5 ? 'text-emerald-600 font-semibold' : 'text-slate-700'}>{pct(c.margin, 0)}</span></td></tr>)}</tbody></table></Card>
        <Card title="Top productos" subtitle="Por ingresos en el periodo" className="lg:col-span-3" padded={false}><table className="table"><thead><tr><th>#</th><th>Producto</th><th className="text-right">Unidades</th><th className="text-right">Ingresos</th></tr></thead><tbody>{v.topProducts.map((p, i) => <tr key={i}><td className="text-slate-400 font-bold">{i + 1}</td><td className="font-semibold">{p.name}</td><td className="text-right">{num(p.units)}</td><td className="text-right">{money(p.revenue)}</td></tr>)}{v.topProducts.length === 0 && <tr><td colSpan={4} className="text-center text-xs text-slate-400 py-6">Sin ventas con estos filtros</td></tr>}</tbody></table></Card>
        <Card title="Top marcas"><Bars data={v.brands} x="name" series={[{ key: 'value', label: 'Ventas' }]} horizontal height={260} /></Card>
        <Card title="Ratio lentes / armazón por sucursal" className="lg:col-span-3"><Bars data={v.byBranch.map((b) => ({ name: b.name, Lentes: Math.round(b.lens as number), Armazones: Math.round(b.frame as number) }))} x="name" series={[{ key: 'Lentes', label: 'Lentes', color: '#8b5cf6' }, { key: 'Armazones', label: 'Armazones y solares', color: '#1b5cf5' }]} height={220} /></Card>
      </div>}

      {(printing || tab === 'origen') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Ingresos por origen" subtitle="Walk-in, referido, Instagram, Google Ads, campañas, empresa, doctor"><Donut data={v.sources} /></Card>
        <Card title="Tickets por origen" padded={false}><table className="table"><thead><tr><th>Origen</th><th className="text-right">Tickets</th><th className="text-right">Ingresos</th><th className="text-right">Ticket prom.</th></tr></thead><tbody>{v.sources.map((s) => <tr key={s.name}><td className="font-semibold">{s.name}</td><td className="text-right">{num(s.tickets)}</td><td className="text-right">{money(s.value)}</td><td className="text-right">{money(s.value / (s.tickets || 1))}</td></tr>)}</tbody></table></Card>
        <Card title="Embudo por sucursal" subtitle="Conversión cita → examen → cotización → venta → entrega" padded={false}><table className="table"><thead><tr><th>Sucursal</th><th className="text-right">Citas</th><th className="text-right">Exám.</th><th className="text-right">Cotiz.</th><th className="text-right">Ventas</th><th className="text-right">Conv.</th></tr></thead><tbody>{v.funnelByBranch.map((f) => <tr key={f.name}><td className="font-semibold">{f.name}</td><td className="text-right">{f.citas}</td><td className="text-right">{f.examenes}</td><td className="text-right">{f.cotizaciones}</td><td className="text-right">{f.ventas}</td><td className="text-right font-bold text-brand-700">{pct(f.cotizaciones ? f.ventas / f.cotizaciones : 0, 0)}</td></tr>)}</tbody></table></Card>
      </div>}

      {(printing || tab === 'operacion') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Tiempo de entrega promedio (días)" subtitle="Desde venta hasta entrega de lentes"><Bars data={v.byBranch.map((b) => ({ name: b.name, dias: Number((((b.delivery as number[]).reduce((a, x) => a + x, 0) / ((b.delivery as number[]).length || 1))).toFixed(1)) }))} x="name" series={[{ key: 'dias', label: 'Días', color: '#f59e0b' }]} money={false} height={220} /></Card>
        <Card title="Devoluciones y reclamos" subtitle={`${v.rmasF.length} RMA en el periodo · ${money(v.rmasF.filter((r) => r.type === 'devolucion').reduce((a, r) => a + Number(r.refund_amount ?? 0), 0))} reembolsado`}><Donut data={v.rmaByType} money={false} /></Card>
        <Card title="Descuentos otorgados" subtitle="Total mensual"><AreaTrend data={v.byMonth} x="month" y="discounts" color="#ef4444" height={220} /></Card>
      </div>}

      {(printing || tab === 'grupo') && <div className="break-inside-avoid grid lg:grid-cols-3 gap-4">
        <Card title="Ventas por compañía del grupo" subtitle="Consolidado Optilux S.A. · Optilux Chorrera S.A. · Optilux David (reportes fiscales separados por razón social)" className="lg:col-span-3"><Bars data={v.groupMonthly} x="month" series={v.groupCodes.map((c, i) => ({ key: c, label: c, color: colors[i] }))} height={280} /></Card>
      </div>}
    </div>
  )
}

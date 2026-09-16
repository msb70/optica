import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'

export const PALETTE = ['#1b5cf5', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b', '#ec4899']
const axis = { fontSize: 11, fill: '#64748b' }
const grid = { stroke: '#e2e8f0', strokeDasharray: '3 3' }
const tip = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -12px rgba(15,23,42,.2)', fontSize: 12 } }
const fmtMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(v)
const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))

export function AreaTrend({ data, x, y, height = 220, color = PALETTE[0], money = true, y2, color2 }: { data: Record<string, unknown>[]; x: string; y: string; height?: number; color?: string; money?: boolean; y2?: string; color2?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${y}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey={x} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtK} />
        <Tooltip {...tip} formatter={(v) => (money ? fmtMoney(Number(v)) : v)} />
        <Area type="monotone" dataKey={y} stroke={color} strokeWidth={2.2} fill={`url(#g-${y})`} dot={false} activeDot={{ r: 4 }} />
        {y2 && <Line type="monotone" dataKey={y2} stroke={color2 ?? PALETTE[6]} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function Bars({ data, x, series, height = 220, stacked = false, money = true, horizontal = false }: { data: Record<string, unknown>[]; x: string; series: { key: string; label: string; color?: string }[]; height?: number; stacked?: boolean; money?: boolean; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap={horizontal ? 6 : 12}>
        <CartesianGrid {...grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtK} /><YAxis type="category" dataKey={x} tick={axis} axisLine={false} tickLine={false} width={110} /></>
          : <><XAxis dataKey={x} tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtK} /></>}
        <Tooltip {...tip} formatter={(v) => (money ? fmtMoney(Number(v)) : v)} cursor={{ fill: '#f1f5f9' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i]} stackId={stacked ? 'a' : undefined} radius={stacked && i < series.length - 1 ? 0 : [6, 6, 0, 0]} maxBarSize={38} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, height = 220, money = true }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v) => `${money ? fmtMoney(Number(v)) : v} (${total ? ((Number(v) / total) * 100).toFixed(0) : 0}%)`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function Lines({ data, x, series, height = 220, money = false }: { data: Record<string, unknown>[]; x: string; series: { key: string; label: string; color?: string }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey={x} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtK} />
        <Tooltip {...tip} formatter={(v) => (money ? fmtMoney(Number(v)) : v)} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}

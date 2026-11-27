import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Search, UserPlus, Phone, Mail } from 'lucide-react'
import { useApp } from '../lib/app'
import { sb, run, runCount, likeTerm } from '../lib/supabase'
import { Card, PageHeader, Loading, Badge, Avatar, Empty } from '../components/ui'
import { money, fdate, SOURCES, fullName } from '../lib/format'
import { NewCustomerModal } from './POS'
import type { Customer } from '../lib/types'

async function loadCustomers(search: string, source: string[]) {
  const t = likeTerm(search)
  const [rows, total] = await Promise.all([
    run(sb.from('customers')
      .select('id,code,first_name,last_name,email,phone,tax_id,birth_date,gender,source,balance,tags,created_at,branch:branches(name),sales(count:id.count(),total:total.sum(),last:sale_date.max()),exams(exam_date,next_review_date)')
      .in('source', source)
      .or(['first_name', 'last_name', 'phone', 'code', 'email', 'tax_id'].map((c) => `${c}.ilike.${t}`).join(','))
      .in('sales.status', ['completada', 'parcial'])
      .order('exam_date', { referencedTable: 'exams', ascending: false }).limit(1, { referencedTable: 'exams' })
      .order('created_at', { ascending: false }).limit(100)),
    runCount(sb.from('customers').select('id', { count: 'exact', head: true })),
  ])
  type Agg = { count: number; total: number | null; last: string | null }
  const customers = (rows as unknown as (Row & { sales: Agg[] })[]).map(({ sales, ...c }) => ({ ...c, sales_aggregate: { aggregate: { count: Number(sales?.[0]?.count ?? 0), sum: { total: sales?.[0]?.total ?? null }, max: { sale_date: sales?.[0]?.last ?? null } } } })) as Row[]
  return { customers, customers_aggregate: { aggregate: { count: total.count } } }
}
type Row = Customer & { branch?: { name: string }; sales_aggregate: { aggregate: { count: number; sum: { total: number | null }; max: { sale_date: string | null } } }; exams: { exam_date: string; next_review_date?: string | null }[] }

export default function Clientes() {
  const { company, branch } = useApp()
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['customers', company?.id, search, source], queryFn: () => loadCustomers(search, source ? [source] : Object.keys(SOURCES)), enabled: !!company })
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <PageHeader title="Clientes / Pacientes" subtitle={`${q.data?.customers_aggregate.aggregate.count ?? '…'} clientes del grupo (compartidos entre todas las ópticas)`} actions={<button className="btn-primary" onClick={() => setOpen(true)}><UserPlus size={15} />Nuevo cliente</button>} />
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[240px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9 h-10" placeholder="Buscar por nombre, teléfono, cédula, código o email…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
        <select className="input h-10 w-44" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Todos los orígenes</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Cliente</th><th>Contacto</th><th>Origen</th><th>Sucursal</th><th>Última RX</th><th className="text-right">Compras</th><th className="text-right">Saldo</th><th>Alta</th></tr></thead>
            <tbody>{(q.data?.customers ?? []).map((c) => {
              const rxExpired = c.exams[0]?.next_review_date && c.exams[0].next_review_date < today
              return <tr key={c.id}>
                <td><Link to={`/clientes/${c.id}`} className="flex items-center gap-3"><Avatar name={fullName(c)} /><div><div className="font-semibold text-slate-800 hover:text-brand-600">{fullName(c)}</div><div className="text-xs text-slate-400 font-mono">{c.code}{c.tags?.includes('niño') && <Badge tone="violet" className="ml-1">niño</Badge>}</div></div></Link></td>
                <td className="text-xs text-slate-600"><div className="flex items-center gap-1"><Phone size={11} />{c.phone}</div>{c.email && <div className="flex items-center gap-1 text-slate-400"><Mail size={11} />{c.email}</div>}</td>
                <td><Badge tone="slate">{SOURCES[c.source] ?? c.source}</Badge></td>
                <td className="text-slate-600">{c.branch?.name}</td>
                <td>{c.exams[0] ? <span className={clsx('text-xs', rxExpired ? 'text-rose-600 font-semibold' : 'text-slate-600')}>{fdate(c.exams[0].exam_date)}{rxExpired && ' · vencida'}</span> : <span className="text-xs text-slate-400">Sin examen</span>}</td>
                <td className="text-right"><div className="font-semibold">{money(c.sales_aggregate.aggregate.sum.total)}</div><div className="text-xs text-slate-400">{c.sales_aggregate.aggregate.count} compras · {c.sales_aggregate.aggregate.max.sale_date ? fdate(c.sales_aggregate.aggregate.max.sale_date, 'MMM yy') : '—'}</div></td>
                <td className={clsx('text-right font-semibold', Number(c.balance) < 0 ? 'text-rose-600' : Number(c.balance) > 0 ? 'text-emerald-600' : 'text-slate-400')}>{Number(c.balance) === 0 ? '—' : money(c.balance)}</td>
                <td className="text-xs text-slate-500">{fdate(c.created_at)}</td>
              </tr>
            })}
            {q.data?.customers.length === 0 && <tr><td colSpan={8}><Empty title="Sin clientes" hint="Prueba otro criterio o crea un cliente nuevo." /></td></tr>}</tbody>
          </table></div>
        )}
      </Card>
      <NewCustomerModal open={open} onClose={() => setOpen(false)} companyId={company?.id ?? ''} branchId={branch?.id ?? ''} onCreated={() => { setOpen(false); void q.refetch() }} />
    </div>
  )
}

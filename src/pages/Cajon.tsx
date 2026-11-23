import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HandCoins, PackageCheck, Inbox, FlaskConical } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Loading, StatusBadge, Avatar, Empty, Toast, KPI, Badge } from '../components/ui'
import PayModal, { type Pay } from '../components/PayModal'
import { DELIVER } from './Cotizaciones'
import { money, fdate, fullName, ago } from '../lib/format'

const Q = `query Cajon($branch: uuid!) {
  quotes(where:{branch_id:{_eq:$branch}, status:{_in:["abonada","aprobada","lista"]}}, order_by:{created_at:asc}) { id number status total deposit_total approved_at ready_at created_at customer_id customer { first_name last_name phone } seller { name } quote_items { description } lab_orders { number status promised_at } }
  legacy: lab_orders(where:{branch_id:{_eq:$branch}, status:{_eq:"listo"}, quote_id:{_is_null:true}}, order_by:{received_at:asc}) { id number received_at customer_id customer { first_name last_name phone } sale { number total paid } }
}`
const DEPOSIT = `mutation Dep($id: uuid!, $p: jsonb!, $s: uuid, $st: uuid) { add_quote_deposit(args:{p_quote_id:$id, p_payments:$p, p_cash_session_id:$s, p_staff_id:$st}) { id status } }`
type QW = { id: string; number: string; status: string; total: number; deposit_total: number; approved_at?: string | null; ready_at?: string | null; created_at: string; customer_id: string; customer?: { first_name: string; last_name: string; phone?: string | null }; seller?: { name: string } | null; quote_items: { description: string }[]; lab_orders: { number: string; status: string; promised_at?: string | null }[] }
type Legacy = { id: string; number: string; received_at?: string | null; customer_id: string; customer?: { first_name: string; last_name: string; phone?: string | null }; sale?: { number: string; total: number; paid: number } | null }

export default function Cajon() {
  const { branch, company, currency, cashSession, me } = useApp()
  const [dep, setDep] = useState<QW | null>(null)
  const [del, setDel] = useState<QW | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['cajon', branch?.id], queryFn: () => gql<{ quotes: QW[]; legacy: Legacy[] }>(Q, { branch: branch!.id }), enabled: !!branch, refetchInterval: 60_000 })
  if (q.isLoading) return <Loading />
  const all = q.data?.quotes ?? [], legacy = q.data?.legacy ?? []
  const minPct = Number(company?.min_deposit_pct ?? 50)
  const poco = all.filter((x) => x.status === 'abonada')
  const taller = all.filter((x) => x.status === 'aprobada')
  const listos = all.filter((x) => x.status === 'lista')
  const saldo = (x: QW) => Number(x.total) - Number(x.deposit_total)
  const sum = (l: QW[], f: (x: QW) => number) => l.reduce((a, x) => a + f(x), 0)
  const Row = ({ x, children }: { x: QW; children: React.ReactNode }) => <tr>
    <td className="font-mono text-xs">{x.number}</td>
    <td><Link to={`/clientes/${x.customer_id}`} className="flex items-center gap-2 hover:text-brand-600"><Avatar name={fullName(x.customer)} className="h-7 w-7 text-[10px]" /><div><div className="font-semibold text-sm">{fullName(x.customer)}</div><div className="text-[11px] text-slate-400">{x.customer?.phone}</div></div></Link></td>
    <td className="text-xs text-slate-600 max-w-xs truncate">{x.quote_items.map((i) => i.description).join(', ')}</td>
    <td className="text-right">{money(x.total)}</td>
    <td className="text-right text-emerald-700">{money(x.deposit_total)}<div className="text-[10px] text-slate-400">{Math.round(Number(x.deposit_total) / (Number(x.total) || 1) * 100)}%</div></td>
    <td className="text-right font-bold">{money(saldo(x))}</td>
    {children}
  </tr>
  return (
    <div className="space-y-4">
      <PageHeader title="Cajón" subtitle={`${branch?.name} · trabajos con poco abono y trabajos listos pendientes de entrega · anticipo mínimo ${minPct}%`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Poco abono" value={poco.length} hint={`${money(sum(poco, (x) => Number(x.deposit_total)))} abonado · no se mandan a hacer`} tone="amber" icon={<HandCoins size={15} />} />
        <KPI label="En taller" value={taller.length} hint={`${money(sum(taller, saldo))} por cobrar`} tone="violet" icon={<FlaskConical size={15} />} />
        <KPI label="Listos por entregar" value={listos.length + legacy.length} hint={`${money(sum(listos, saldo))} por cobrar`} tone="green" icon={<PackageCheck size={15} />} />
        <KPI label="Total en cajón" value={money(sum(all, (x) => Number(x.total)))} hint={`${money(sum(all, (x) => Number(x.deposit_total)))} ya cobrado en anticipos`} icon={<Inbox size={15} />} />
      </div>

      <Card title="Listos pendientes de entrega" subtitle="Trabajo terminado: avisar al cliente, cobrar el saldo y facturar" padded={false}>
        {listos.length + legacy.length === 0 ? <Empty title="No hay trabajos listos por entregar" /> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Orden</th><th>Cliente</th><th>Detalle</th><th className="text-right">Total</th><th className="text-right">Abonado</th><th className="text-right">Saldo</th><th>Listo desde</th><th /></tr></thead>
          <tbody>{listos.map((x) => <Row key={x.id} x={x}><td className="text-xs">{x.ready_at ? <>{fdate(x.ready_at)}<div className="text-[10px] text-amber-700">{ago(x.ready_at)}</div></> : '—'}</td><td className="text-right"><button className="btn-primary h-8 text-xs" onClick={() => setDel(x)}><PackageCheck size={13} />Entregar y facturar</button></td></Row>)}
            {legacy.map((o) => <tr key={o.id}><td className="font-mono text-xs">{o.number}</td><td className="font-semibold text-sm">{fullName(o.customer)}<div className="text-[11px] text-slate-400 font-normal">{o.customer?.phone}</div></td><td className="text-xs text-slate-500">Venta {o.sale?.number} <Badge tone="slate">facturada antes</Badge></td><td className="text-right">{money(o.sale?.total)}</td><td className="text-right text-emerald-700">{money(o.sale?.paid)}</td><td className="text-right font-bold">{money(Number(o.sale?.total ?? 0) - Number(o.sale?.paid ?? 0))}</td><td className="text-xs">{fdate(o.received_at)}</td><td className="text-right"><Link className="btn-secondary h-8 text-xs" to="/ordenes">Ver orden</Link></td></tr>)}
          </tbody></table></div>}
      </Card>

      <Card title="Poco abono" subtitle={`No llegaron al ${minPct}% de anticipo: solo hay recibo y no se manda a hacer`} padded={false}>
        {poco.length === 0 ? <Empty title="Sin trabajos con poco abono" /> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Cotización</th><th>Cliente</th><th>Detalle</th><th className="text-right">Total</th><th className="text-right">Abonado</th><th className="text-right">Saldo</th><th>Falta para el mínimo</th><th /></tr></thead>
          <tbody>{poco.map((x) => <Row key={x.id} x={x}><td className="text-xs font-semibold text-amber-700">{money(Math.max(0, Number(x.total) * minPct / 100 - Number(x.deposit_total)))}<div className="text-[10px] text-slate-400 font-normal">desde {ago(x.created_at)}</div></td><td className="text-right"><button className="btn-secondary h-8 text-xs" onClick={() => setDep(x)}><HandCoins size={13} />Abonar</button></td></Row>)}</tbody></table></div>}
      </Card>

      <Card title="En taller / laboratorio" subtitle="Órdenes de trabajo aprobadas que aún no están listas" padded={false}>
        {taller.length === 0 ? <Empty title="Sin trabajos en curso" /> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Orden</th><th>Cliente</th><th>Detalle</th><th className="text-right">Total</th><th className="text-right">Abonado</th><th className="text-right">Saldo</th><th>Laboratorio</th><th /></tr></thead>
          <tbody>{taller.map((x) => <Row key={x.id} x={x}><td className="text-xs">{x.lab_orders[0] ? <><span className="font-mono">{x.lab_orders[0].number}</span> <StatusBadge status={x.lab_orders[0].status} /><div className="text-[10px] text-slate-400">promesa {fdate(x.lab_orders[0].promised_at)}</div></> : <span className="text-slate-400">sin orden de laboratorio</span>}</td><td className="text-right"><div className="flex gap-1 justify-end"><button className="btn-ghost h-8 text-xs" onClick={() => setDep(x)}><HandCoins size={13} /></button><button className="btn-secondary h-8 text-xs" onClick={() => setDel(x)}>Entregar</button></div></td></Row>)}</tbody></table></div>}
      </Card>

      <PayModal open={!!dep} title={`Abono · ${dep?.number ?? ''}`} currency={currency} confirmLabel="Registrar abono"
        suggested={dep ? Math.max(0, Number(dep.total) * minPct / 100 - Number(dep.deposit_total)) : 0} maxAmount={dep ? saldo(dep) : undefined}
        subtitle={dep && <>Total {money(dep.total)} · abonado {money(dep.deposit_total)}. Al llegar al {minPct}% pasa a orden de trabajo.</>}
        onClose={() => setDep(null)} onConfirm={async (p: Pay[]) => { const r = await gql<{ add_quote_deposit: { status: string }[] }>(DEPOSIT, { id: dep!.id, p, s: cashSession?.id ?? null, st: me?.id ?? null }); setToast(r.add_quote_deposit[0]?.status === 'aprobada' ? `${dep!.number} aprobada: pasa a taller` : 'Abono registrado'); setDep(null); void q.refetch() }} />
      <PayModal open={!!del} title={`Entregar y facturar · ${del?.number ?? ''}`} currency={currency} confirmLabel="Facturar"
        suggested={del ? saldo(del) : 0} maxAmount={del ? saldo(del) : undefined}
        subtitle={del && <>Factura por {money(del.total)} aplicando {money(del.deposit_total)} de anticipos. Saldo: <b>{money(saldo(del))}</b>.{del.status !== 'lista' && <span className="block mt-1 text-amber-700">El trabajo aún no figura como listo.</span>}</>}
        onClose={() => setDel(null)} onConfirm={async (p: Pay[]) => { const r = await gql<{ deliver_quote: { number: string }[] }>(DELIVER, { id: del!.id, p, s: cashSession?.id ?? null, st: me?.id ?? null }); setToast(`Entregado · factura ${r.deliver_quote[0]?.number}`); setDel(null); void q.refetch() }} />
      <Toast msg={toast} onClose={() => setToast(null)} />
    </div>
  )
}

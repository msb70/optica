import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Store, Users, Plus, Shield, Link2, Pencil } from 'lucide-react'
import { useApp } from '../lib/app'
import { gql } from '../lib/nhost'
import { Card, PageHeader, Modal, Field, Tabs, Badge, Toast, Avatar } from '../components/ui'
import { money, ROLES } from '../lib/format'
import type { Company, Branch, Staff } from '../lib/types'

const AUDIT = `query Audit { audit_log(order_by:{created_at:desc}, limit: 40) { id entity entity_id action actor created_at company { code } } }`
const UP_COMPANY = `mutation UpCo($id: uuid!, $set: companies_set_input!) { update_companies_by_pk(pk_columns:{id:$id}, _set:$set) { id } }`
const IN_COMPANY = `mutation InCo($o: companies_insert_input!) { insert_companies_one(object:$o) { id } }`
const IN_BRANCH = `mutation InBr($o: branches_insert_input!) { insert_branches_one(object:$o) { id } }`
const UP_BRANCH = `mutation UpBr($id: uuid!, $set: branches_set_input!) { update_branches_by_pk(pk_columns:{id:$id}, _set:$set) { id } }`
const IN_STAFF = `mutation InSt($o: staff_insert_input!) { insert_staff_one(object:$o) { id } }`
const UP_STAFF = `mutation UpSt($id: uuid!, $set: staff_set_input!) { update_staff_by_pk(pk_columns:{id:$id}, _set:$set) { id } }`

const PERMS: Record<string, string[]> = { admin: ['Todo', 'Todas las compañías y sucursales', 'Descuento sin límite', 'Configuración'], gerente: ['Su compañía', 'Cierre de caja', 'Descuentos hasta su límite', 'Reportes', 'Intercompany'], vendedor: ['POS y cotizaciones', 'Clientes', 'Descuentos hasta su límite'], optometrista: ['Exámenes y RX', 'Agenda', 'Clientes'], cajero: ['Caja: apertura, cierre, arqueo', 'Cobros'], almacen: ['Stock, traspasos, conteos', 'Etiquetas'] }

export default function Configuracion() {
  const { companies, branches, staff } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'companias' | 'sucursales' | 'personal' | 'roles' | 'auditoria'>('companias')
  const [toast, setToast] = useState<string | null>(null)
  const [coEdit, setCoEdit] = useState<Partial<Company> | null>(null)
  const [brEdit, setBrEdit] = useState<Partial<Branch> | null>(null)
  const [stEdit, setStEdit] = useState<Partial<Staff> | null>(null)
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => gql<{ audit_log: { id: number; entity: string; entity_id: string; action: string; actor?: string; created_at: string; company?: { code: string } }[] }>(AUDIT), enabled: tab === 'auditoria' })
  const done = (m: string) => { setToast(m); void qc.invalidateQueries({ queryKey: ['org'] }); setCoEdit(null); setBrEdit(null); setStEdit(null) }
  const saveCo = async () => { const { id, ...rest } = coEdit!; if (id) await gql(UP_COMPANY, { id, set: rest }); else await gql(IN_COMPANY, { o: { ...rest, invoice_prefix: rest.invoice_prefix ?? rest.code } }); done('Compañía guardada') }
  const saveBr = async () => { const { id, ...rest } = brEdit!; if (id) await gql(UP_BRANCH, { id, set: rest }); else await gql(IN_BRANCH, { o: rest }); done('Sucursal guardada') }
  const saveSt = async () => { const { id, ...rest } = stEdit!; if (id) await gql(UP_STAFF, { id, set: rest }); else await gql(IN_STAFF, { o: rest }); done('Usuario guardado') }

  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" subtitle="Grupo → compañías legales → sucursales · usuarios y permisos por rol + compañía + sucursal · Zoho org_id por compañía" />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'companias', label: 'Compañías', count: companies.length }, { value: 'sucursales', label: 'Sucursales', count: branches.length }, { value: 'personal', label: 'Personal', count: staff.length }, { value: 'roles', label: 'Roles y permisos' }, { value: 'auditoria', label: 'Auditoría' }]} />

      {tab === 'companias' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {companies.map((c) => <Card key={c.id} title={<span className="flex items-center gap-2"><Building2 size={16} className="text-brand-600" />{c.legal_name}</span>} subtitle={`${c.code} · ${c.tax_id ?? 'sin RUC'}`} actions={<button className="btn-ghost h-7 text-xs" onClick={() => setCoEdit(c)}><Pencil size={12} />Editar</button>}>
          <dl className="text-sm grid grid-cols-2 gap-y-1.5"><dt className="text-slate-500">País / moneda</dt><dd className="font-semibold">{c.country} · {c.currency}</dd><dt className="text-slate-500">Impuesto</dt><dd className="font-semibold">{c.tax_rate}%</dd><dt className="text-slate-500">Prefijo fiscal</dt><dd className="font-mono">{c.invoice_prefix}</dd><dt className="text-slate-500">Zoho org_id</dt><dd className="font-mono text-xs">{c.zoho_org_id ?? <Badge tone="amber">sin conectar</Badge>}</dd><dt className="text-slate-500">Sucursales</dt><dd className="font-semibold">{branches.filter((b) => b.company_id === c.id).length}</dd></dl>
          <div className="mt-3 flex flex-wrap gap-1.5">{branches.filter((b) => b.company_id === c.id).map((b) => <Badge key={b.id} tone="slate"><Store size={10} />{b.name}</Badge>)}</div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Link2 size={12} />Books · Inventory · CRM: <Badge tone="amber">OAuth pendiente</Badge></div>
        </Card>)}
        <button className="card border-dashed grid place-items-center min-h-[12rem] text-slate-500 hover:text-brand-600 hover:border-brand-300" onClick={() => setCoEdit({ code: '', legal_name: '', country: 'PA', currency: 'USD', tax_rate: 7, invoice_prefix: '' })}><span className="flex flex-col items-center gap-2 text-sm font-semibold"><Plus size={22} />Nueva compañía legal</span></button>
      </div>}

      {tab === 'sucursales' && <Card padded={false} actions={<button className="btn-primary h-8 text-xs" onClick={() => setBrEdit({ company_id: companies[0]?.id, code: '', name: '', monthly_goal: 0, active: true })}><Plus size={13} />Nueva sucursal</button>} title="Sucursales">
        <table className="table"><thead><tr><th>Sucursal</th><th>Compañía</th><th>Dirección</th><th>Teléfono</th><th className="text-right">Meta mensual</th><th>Personal</th><th>Estado</th><th /></tr></thead><tbody>
          {branches.map((b) => <tr key={b.id}><td className="font-semibold">{b.name} <span className="font-mono text-xs text-slate-400">{b.code}</span></td><td>{companies.find((c) => c.id === b.company_id)?.legal_name}</td><td className="text-xs text-slate-600">{b.address}</td><td className="text-xs">{b.phone}</td><td className="text-right font-semibold">{money(b.monthly_goal)}</td><td className="text-xs">{staff.filter((s) => s.branch_id === b.id).length}</td><td>{b.active ? <Badge tone="green">activa</Badge> : <Badge tone="rose">inactiva</Badge>}</td><td><button className="btn-ghost h-7 text-xs" onClick={() => setBrEdit(b)}><Pencil size={12} /></button></td></tr>)}
        </tbody></table>
      </Card>}

      {tab === 'personal' && <Card padded={false} title="Personal y permisos" actions={<button className="btn-primary h-8 text-xs" onClick={() => setStEdit({ company_id: companies[0]?.id, branch_id: branches[0]?.id, name: '', email: '', role: 'vendedor', commission_pct: 3, max_discount_pct: 10, monthly_goal: 0, active: true })}><Plus size={13} />Nuevo usuario</button>}>
        <table className="table"><thead><tr><th>Nombre</th><th>Rol</th><th>Compañía</th><th>Sucursal</th><th className="text-right">Comisión</th><th className="text-right">Desc. máx.</th><th className="text-right">Meta</th><th>Acceso</th><th /></tr></thead><tbody>
          {staff.map((s) => <tr key={s.id}><td><span className="flex items-center gap-2"><Avatar name={s.name} className="h-7 w-7 text-[10px]" /><div><b>{s.name}</b><div className="text-[11px] text-slate-400">{s.email}</div></div></span></td><td><Badge tone={s.role === 'admin' ? 'dark' : s.role === 'gerente' ? 'violet' : s.role === 'optometrista' ? 'blue' : 'slate'}>{ROLES[s.role]}</Badge></td><td className="text-xs">{companies.find((c) => c.id === s.company_id)?.code}</td><td className="text-xs">{branches.find((b) => b.id === s.branch_id)?.name ?? <span className="text-slate-400">todas</span>}</td><td className="text-right">{s.commission_pct}%</td><td className="text-right">{s.max_discount_pct}%</td><td className="text-right">{Number(s.monthly_goal) ? money(s.monthly_goal) : '—'}</td><td>{s.user_id ? <Badge tone="green">vinculado</Badge> : <Badge tone="amber">sin login</Badge>}</td><td><button className="btn-ghost h-7 text-xs" onClick={() => setStEdit(s)}><Pencil size={12} /></button></td></tr>)}
        </tbody></table>
      </Card>}

      {tab === 'roles' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Object.entries(PERMS).map(([r, p]) => <Card key={r} title={<span className="flex items-center gap-2"><Shield size={15} className="text-brand-600" />{ROLES[r]}</span>} subtitle={`${staff.filter((s) => s.role === r).length} usuarios`}><ul className="text-sm space-y-1.5">{p.map((x) => <li key={x} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" />{x}</li>)}</ul><p className="mt-3 text-[11px] text-slate-400">El alcance efectivo se calcula como rol ∩ compañía ∩ sucursal del usuario. En Hasura se aplican como permisos por fila (X-Hasura-Company-Id / X-Hasura-Branch-Id) en la siguiente iteración.</p></Card>)}</div>}

      {tab === 'auditoria' && <Card padded={false} title="Auditoría clínica y financiera" subtitle="Ventas, exámenes, cajas, pagos e intercompany (trigger audit_trg)"><table className="table"><thead><tr><th>Fecha</th><th>Compañía</th><th>Entidad</th><th>Acción</th><th>Actor</th><th>ID</th></tr></thead><tbody>{(audit.data?.audit_log ?? []).map((a) => <tr key={a.id}><td className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString('es-PA')}</td><td className="text-xs">{a.company?.code}</td><td className="font-semibold text-sm">{a.entity}</td><td><Badge tone={a.action === 'insert' ? 'green' : a.action === 'delete' ? 'rose' : 'blue'}>{a.action}</Badge></td><td className="text-xs">{a.actor ?? 'sistema'}</td><td className="font-mono text-[10px] text-slate-400">{a.entity_id}</td></tr>)}</tbody></table></Card>}

      <Modal open={!!coEdit} onClose={() => setCoEdit(null)} title={coEdit?.id ? 'Editar compañía' : 'Nueva compañía legal'} size="md" footer={<><button className="btn-secondary" onClick={() => setCoEdit(null)}>Cancelar</button><button className="btn-primary" onClick={saveCo} disabled={!coEdit?.code || !coEdit?.legal_name}>Guardar</button></>}>
        {coEdit && <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Código"><input className="input" value={coEdit.code ?? ''} onChange={(e) => setCoEdit({ ...coEdit, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Razón social"><input className="input" value={coEdit.legal_name ?? ''} onChange={(e) => setCoEdit({ ...coEdit, legal_name: e.target.value })} /></Field>
          <Field label="Nombre comercial"><input className="input" value={coEdit.trade_name ?? ''} onChange={(e) => setCoEdit({ ...coEdit, trade_name: e.target.value })} /></Field>
          <Field label="RUC / NIF"><input className="input" value={coEdit.tax_id ?? ''} onChange={(e) => setCoEdit({ ...coEdit, tax_id: e.target.value })} /></Field>
          <Field label="País"><input className="input" value={coEdit.country ?? ''} onChange={(e) => setCoEdit({ ...coEdit, country: e.target.value })} /></Field>
          <Field label="Moneda"><input className="input" value={coEdit.currency ?? ''} onChange={(e) => setCoEdit({ ...coEdit, currency: e.target.value })} /></Field>
          <Field label="Impuesto % (multi-país)"><input type="number" className="input" value={coEdit.tax_rate ?? 0} onChange={(e) => setCoEdit({ ...coEdit, tax_rate: Number(e.target.value) })} /></Field>
          <Field label="Prefijo numeración fiscal"><input className="input" value={coEdit.invoice_prefix ?? ''} onChange={(e) => setCoEdit({ ...coEdit, invoice_prefix: e.target.value.toUpperCase() })} /></Field>
          <Field label="Zoho org_id (Books/Inventory/CRM)" className="sm:col-span-2"><input className="input" value={coEdit.zoho_org_id ?? ''} onChange={(e) => setCoEdit({ ...coEdit, zoho_org_id: e.target.value })} /></Field>
        </div>}
      </Modal>
      <Modal open={!!brEdit} onClose={() => setBrEdit(null)} title={brEdit?.id ? 'Editar sucursal' : 'Nueva sucursal'} size="md" footer={<><button className="btn-secondary" onClick={() => setBrEdit(null)}>Cancelar</button><button className="btn-primary" onClick={saveBr} disabled={!brEdit?.code || !brEdit?.name}>Guardar</button></>}>
        {brEdit && <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Compañía" className="sm:col-span-2"><select className="input" value={brEdit.company_id ?? ''} onChange={(e) => setBrEdit({ ...brEdit, company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></Field>
          <Field label="Código"><input className="input" value={brEdit.code ?? ''} onChange={(e) => setBrEdit({ ...brEdit, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Nombre"><input className="input" value={brEdit.name ?? ''} onChange={(e) => setBrEdit({ ...brEdit, name: e.target.value })} /></Field>
          <Field label="Dirección" className="sm:col-span-2"><input className="input" value={brEdit.address ?? ''} onChange={(e) => setBrEdit({ ...brEdit, address: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="input" value={brEdit.phone ?? ''} onChange={(e) => setBrEdit({ ...brEdit, phone: e.target.value })} /></Field>
          <Field label="Meta mensual"><input type="number" className="input" value={brEdit.monthly_goal ?? 0} onChange={(e) => setBrEdit({ ...brEdit, monthly_goal: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={brEdit.active ?? true} onChange={(e) => setBrEdit({ ...brEdit, active: e.target.checked })} />Activa</label>
        </div>}
      </Modal>
      <Modal open={!!stEdit} onClose={() => setStEdit(null)} title={stEdit?.id ? 'Editar usuario' : 'Nuevo usuario'} size="md" footer={<><button className="btn-secondary" onClick={() => setStEdit(null)}>Cancelar</button><button className="btn-primary" onClick={saveSt} disabled={!stEdit?.name}>Guardar</button></>}>
        {stEdit && <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nombre"><input className="input" value={stEdit.name ?? ''} onChange={(e) => setStEdit({ ...stEdit, name: e.target.value })} /></Field>
          <Field label="Email (para vincular login)"><input className="input" value={stEdit.email ?? ''} onChange={(e) => setStEdit({ ...stEdit, email: e.target.value })} /></Field>
          <Field label="Rol"><select className="input" value={stEdit.role ?? 'vendedor'} onChange={(e) => setStEdit({ ...stEdit, role: e.target.value as Staff['role'] })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Compañía"><select className="input" value={stEdit.company_id ?? ''} onChange={(e) => setStEdit({ ...stEdit, company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
          <Field label="Sucursal"><select className="input" value={stEdit.branch_id ?? ''} onChange={(e) => setStEdit({ ...stEdit, branch_id: e.target.value || null })}><option value="">Todas</option>{branches.filter((b) => b.company_id === stEdit.company_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Comisión %"><input type="number" className="input" value={stEdit.commission_pct ?? 0} onChange={(e) => setStEdit({ ...stEdit, commission_pct: Number(e.target.value) })} /></Field>
          <Field label="Descuento máximo %"><input type="number" className="input" value={stEdit.max_discount_pct ?? 0} onChange={(e) => setStEdit({ ...stEdit, max_discount_pct: Number(e.target.value) })} /></Field>
          <Field label="Meta mensual"><input type="number" className="input" value={stEdit.monthly_goal ?? 0} onChange={(e) => setStEdit({ ...stEdit, monthly_goal: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stEdit.active ?? true} onChange={(e) => setStEdit({ ...stEdit, active: e.target.checked })} />Activo</label>
        </div>}
      </Modal>
      <Toast msg={toast} onClose={() => setToast(null)} />
      <div className="text-[11px] text-slate-400 flex items-center gap-1"><Users size={11} />El personal se vincula al login de Nhost por email o user_id; el usuario autenticado sin ficha de personal opera como administrador en el MVP.</div>
    </div>
  )
}

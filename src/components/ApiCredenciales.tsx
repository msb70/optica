import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Plus, Copy } from 'lucide-react'
import { sb, run, rpc, write, SUPABASE_URL } from '../lib/supabase'
import { Badge, Card, Modal } from './ui'

const SCOPES: [string, string][] = [
  ['clientes:leer', 'Leer clientes'], ['clientes:escribir', 'Crear/actualizar clientes'], ['citas:leer', 'Leer citas'], ['citas:escribir', 'Crear/actualizar citas'],
  ['facturas:leer', 'Leer facturas y notas de crédito'], ['cobros:leer', 'Leer cobros y anticipos'], ['inventario:leer', 'Leer productos, existencias y movimientos'],
]
type ApiClient = { id: string; name: string; key_prefix: string; scopes: string[]; environment: string; active: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null }

/** Credenciales de servicio de la API /v1 (CRM, Zoho…). La clave completa solo se muestra al crearla. */
export default function ApiCredenciales() {
  const q = useQuery({ queryKey: ['api-clients'], queryFn: () => run(sb.from('api_clients').select('id,name,key_prefix,scopes,environment,active,created_at,last_used_at,revoked_at').order('created_at', { ascending: false })) as Promise<ApiClient[]> })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', environment: 'sandbox', scopes: [] as string[] })
  const [key, setKey] = useState<string | null>(null)
  const base = `${SUPABASE_URL}/functions/v1/api/v1`
  const create = async () => { const k = await rpc<string>('api_client_create', { p_name: f.name.trim(), p_scopes: f.scopes, p_environment: f.environment }); setKey(k); setOpen(false); setF({ name: '', environment: 'sandbox', scopes: [] }); void q.refetch() }
  const revoke = async (c: ApiClient) => { if (!confirm(`¿Revocar la credencial "${c.name}"? Los sistemas que la usan dejarán de funcionar.`)) return; await write(() => sb.from('api_clients').update({ active: false, revoked_at: new Date().toISOString() }).eq('id', c.id)); void q.refetch() }
  return (
    <Card padded={false} title={<span className="flex items-center gap-2"><KeyRound size={15} className="text-brand-600" />API para sistemas externos</span>}
      subtitle={<>Base: <code className="text-[11px]">{base}</code> · Documentación: <a className="text-brand-600 underline" href={`${base}/openapi.json`} target="_blank" rel="noreferrer">openapi.json</a></>}
      actions={<button className="btn-primary h-8 text-xs" onClick={() => setOpen(true)}><Plus size={13} />Nueva credencial</button>}>
      {key && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><b>Copia la clave ahora: no se volverá a mostrar.</b><div className="mt-2 flex items-center gap-2"><code className="flex-1 break-all text-xs bg-white rounded-lg px-2 py-1.5 border">{key}</code><button className="btn-secondary h-8 text-xs" onClick={() => void navigator.clipboard.writeText(key)}><Copy size={13} />Copiar</button><button className="btn-ghost h-8 text-xs" onClick={() => setKey(null)}>Listo</button></div></div>}
      <table className="table"><thead><tr><th>Nombre</th><th>Clave</th><th>Entorno</th><th>Permisos</th><th>Último uso</th><th /></tr></thead><tbody>
        {(q.data ?? []).map((c) => <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
          <td className="font-semibold">{c.name}</td><td className="font-mono text-xs">{c.key_prefix}_…</td>
          <td><Badge tone={c.environment === 'produccion' ? 'rose' : 'amber'}>{c.environment === 'produccion' ? 'Producción' : 'Pruebas'}</Badge></td>
          <td className="text-xs text-slate-600 max-w-sm">{c.scopes.join(', ')}</td>
          <td className="text-xs text-slate-500">{c.last_used_at ? new Date(c.last_used_at).toLocaleString('es-PA') : '—'}</td>
          <td className="text-right">{c.active ? <button className="btn-ghost h-7 text-xs text-rose-600" onClick={() => void revoke(c)}>Revocar</button> : <Badge tone="slate">Revocada</Badge>}</td>
        </tr>)}
        {q.data?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-500">Sin credenciales. Crea una por cada sistema que se conecte (p. ej. «CRM Optilux», «Zoho Books»).</td></tr>}
      </tbody></table>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva credencial de API" size="md" footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={!f.name.trim() || !f.scopes.length} onClick={() => void create()}>Crear</button></>}>
        <label className="block mb-3"><span className="label">Sistema</span><input className="input" placeholder="CRM Optilux" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="block mb-3"><span className="label">Entorno</span><select className="input" value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}><option value="sandbox">Pruebas (opx_test_…)</option><option value="produccion">Producción (opx_live_…)</option></select></label>
        <span className="label">Permisos (solo los necesarios)</span>
        <div className="grid gap-1 mt-1">{SCOPES.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.scopes.includes(v)} onChange={() => setF({ ...f, scopes: f.scopes.includes(v) ? f.scopes.filter((x) => x !== v) : [...f.scopes, v] })} /><code className="text-xs">{v}</code><span className="text-slate-500 text-xs">{l}</span></label>)}</div>
      </Modal>
    </Card>
  )
}

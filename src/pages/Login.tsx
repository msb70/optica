import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const r = mode === 'in' ? await signIn(email, password) : await signUp(email, password, name)
    setErr(r); setBusy(false)
  }

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-ink-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3"><img src="/favicon.svg" className="h-10 w-10 rounded-xl" alt="" /><span className="text-xl font-extrabold tracking-tight">Optilux</span></div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Ventas-first.<br />Multi-compañía.<br />Cero fricción.</h1>
          <p className="mt-4 text-slate-300 leading-relaxed">POS en menos de 10 segundos, caja con arqueo, cliente 360°, examen y RX, cotización → venta en 1 clic, stock por sucursal e intercompany con sincronización a Zoho.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {[['3', 'compañías'], ['5', 'sucursales'], ['1', 'plataforma']].map(([n, l]) => <div key={l} className="rounded-2xl bg-white/5 border border-white/10 p-3"><div className="text-2xl font-extrabold">{n}</div><div className="text-slate-400 text-xs">{l}</div></div>)}
          </div>
        </div>
        <div className="relative text-xs text-slate-500">Grupo Optilux · MVP · Nhost + Hasura · Zoho Books / Inventory / CRM</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm fade-up">
          <div className="lg:hidden flex items-center gap-2 mb-8"><img src="/favicon.svg" className="h-9 w-9 rounded-lg" alt="" /><span className="text-lg font-extrabold">Optilux</span></div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{mode === 'in' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">{mode === 'in' ? 'Accede con tu usuario de Optilux.' : 'Regístrate para entrar al MVP.'}</p>
          {mode === 'up' && <label className="block mb-3"><span className="label">Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>}
          <label className="block mb-3"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
          <label className="block mb-4"><span className="label">Contraseña</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label>
          {err && <div className="mb-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm px-3 py-2">{err}</div>}
          <button className="btn-primary w-full h-11" disabled={busy}>{busy ? <Spinner className="text-white" /> : mode === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
          <button type="button" className="btn-ghost w-full mt-2 text-xs" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null) }}>{mode === 'in' ? '¿Sin cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}</button>
        </form>
      </div>
    </div>
  )
}

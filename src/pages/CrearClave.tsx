import { useEffect, useState, type FormEvent } from 'react'
import { nhost } from '../lib/nhost'
import { Spinner } from '../components/ui'

/** Destino del enlace del correo de invitación / restablecimiento: el usuario elige su contraseña. */
export default function CrearClave({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''))
    const rt = qs.get('refreshToken')
    const linkErr = qs.get('error_description') || qs.get('error')
    if (linkErr) { setErr(linkErr); setState('invalid'); return }
    if (!rt) { setState(nhost.getUserSession() ? 'ready' : 'invalid'); return }
    nhost.auth.refreshToken({ refreshToken: rt })
      .then((r) => { nhost.sessionStorage.set(r.body); window.history.replaceState(null, '', '/?accion=crear-clave'); setState('ready') })
      .catch(() => setState('invalid'))
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    if (p1.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres'); return }
    if (p1 !== p2) { setErr('Las contraseñas no coinciden'); return }
    setBusy(true)
    try { await nhost.auth.changeUserPassword({ newPassword: p1 }); window.history.replaceState(null, '', '/'); onDone() }
    catch (e2) { const x = e2 as { body?: { message?: string }; message?: string }; setErr(x.body?.message || x.message || 'No se pudo guardar la contraseña') }
    finally { setBusy(false) }
  }
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 fade-up">
        <div className="flex items-center gap-2 mb-6"><img src="/favicon.svg" className="h-9 w-9 rounded-lg" alt="" /><span className="text-lg font-extrabold">Optilux</span></div>
        {state === 'checking' && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner />Validando el enlace…</div>}
        {state === 'invalid' && <><h2 className="text-xl font-extrabold text-slate-900">Enlace no válido</h2><p className="text-sm text-slate-500 mt-2">El enlace caducó o ya se usó. Pide al administrador que te reenvíe la invitación o usa “¿Olvidaste tu contraseña?” en la pantalla de acceso.</p>{err && <p className="text-xs text-rose-600 mt-2">{err}</p>}<a href="/" className="btn-secondary mt-4 w-full">Ir al inicio de sesión</a></>}
        {state === 'ready' && <>
          <h2 className="text-xl font-extrabold text-slate-900">Crea tu contraseña</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">Mínimo 8 caracteres. La usarás para entrar a Optilux.</p>
          <label className="block mb-3"><span className="label">Nueva contraseña</span><input className="input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus required minLength={8} /></label>
          <label className="block mb-4"><span className="label">Repítela</span><input className="input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} required minLength={8} /></label>
          {err && <div className="mb-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm px-3 py-2">{err}</div>}
          <button className="btn-primary w-full h-11" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar y entrar'}</button>
        </>}
      </form>
    </div>
  )
}

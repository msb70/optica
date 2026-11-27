// Invita a una persona del Personal por correo (Supabase Auth). Solo quien tenga "editar" en Configuración.
// POST { staffId, redirectTo }  →  { email }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const ALLOWED_REDIRECT = /^https:\/\/(optica-ocui\.onrender\.com|[a-z0-9-]+\.onrender\.com)\/|^http:\/\/localhost:\d+\//

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 1) quién llama
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !caller.user) return json({ error: 'Sesión no válida' }, 401)

  // 2) ¿puede editar Configuración?
  const { data: perm } = await admin.from('user_module_access').select('access').eq('user_id', caller.user.id).eq('module', 'configuracion').maybeSingle()
  if (perm?.access !== 'editar') return json({ error: 'Tu usuario no tiene permiso para invitar (Configuración · editar)' }, 403)

  const { staffId, redirectTo } = await req.json().catch(() => ({})) as { staffId?: string; redirectTo?: string }
  if (!staffId) return json({ error: 'Falta staffId' }, 400)
  const redirect = redirectTo && ALLOWED_REDIRECT.test(redirectTo) ? redirectTo : undefined

  const { data: st } = await admin.from('staff').select('id,name,email,user_id,active').eq('id', staffId).maybeSingle()
  if (!st) return json({ error: 'Ficha de personal no encontrada' }, 404)
  if (!st.active) return json({ error: 'La ficha está inactiva' }, 400)
  const email = (st.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'La ficha no tiene email' }, 400)

  // 3) invitar; si la cuenta ya existe y está confirmada, se manda un enlace para crear contraseña
  let userId: string | null = null
  const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirect, data: { name: st.name } })
  if (!inv.error) userId = inv.data.user?.id ?? null
  else if (/already|registered|exists/i.test(inv.error.message)) {
    const { error } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!).auth.resetPasswordForEmail(email, { redirectTo: redirect })
    if (error) return json({ error: `No se pudo enviar el correo: ${error.message}` }, 502)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    userId = list.users.find((u) => (u.email ?? '').toLowerCase() === email)?.id ?? null
  } else if (/rate limit/i.test(inv.error.message)) {
    return json({ error: 'Se alcanzó el límite de correos por hora. Configura un SMTP propio en Supabase o inténtalo más tarde.' }, 429)
  } else return json({ error: `No se pudo invitar: ${inv.error.message}` }, 502)

  // 4) vincular la ficha con la cuenta
  if (userId) {
    const other = await admin.from('staff').select('id').eq('user_id', userId).neq('id', st.id).maybeSingle()
    if (other.data) return json({ error: 'Ese email ya está vinculado a otra ficha de personal' }, 409)
    await admin.from('staff').update({ user_id: userId, invited_at: new Date().toISOString() }).eq('id', st.id)
  }
  return json({ email })
})

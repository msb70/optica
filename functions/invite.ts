/**
 * POST /v1/invite  { staffId: string, redirectTo: string }
 * Invita a un miembro del personal: crea su cuenta (si no existe), la vincula a su ficha y le envía
 * el correo para crear la contraseña. Solo pueden invitar usuarios con permiso de edición en Configuración.
 */
type Req = { method: string; headers: Record<string, string | undefined>; body: { staffId?: string; redirectTo?: string } }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

const AUTH = process.env.NHOST_AUTH_URL!
const GQL = process.env.NHOST_GRAPHQL_URL!
const ADMIN = process.env.NHOST_ADMIN_SECRET!
const ALLOWED_REDIRECT = /^https:\/\/optica-ocui\.onrender\.com|^http:\/\/localhost:(5173|4173)/

async function admin<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(GQL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': ADMIN }, body: JSON.stringify({ query, variables }) })
  const b = (await r.json()) as { data?: T; errors?: { message: string }[] }
  if (b.errors?.length) throw new Error(b.errors.map((e) => e.message).join('; '))
  return b.data as T
}

export default async (req: Req, res: Res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  try {
    // 1. Quién invita (token del usuario conectado)
    const auth = req.headers.authorization
    if (!auth) return res.status(401).json({ error: 'Sesión requerida' })
    const meRes = await fetch(`${AUTH}/user`, { headers: { authorization: auth } })
    if (!meRes.ok) return res.status(401).json({ error: 'Sesión no válida' })
    const me = (await meRes.json()) as { id: string }
    const can = await admin<{ user_module_access: { access: string }[] }>(
      `query($u: uuid!) { user_module_access(where:{user_id:{_eq:$u}, module:{_eq:"configuracion"}, access:{_eq:"editar"}}) { access } }`, { u: me.id })
    if (!can.user_module_access.length) return res.status(403).json({ error: 'Necesitas permiso de edición en Configuración para invitar usuarios' })

    // 2. A quién se invita
    const { staffId, redirectTo } = req.body ?? {}
    if (!staffId) return res.status(400).json({ error: 'Falta staffId' })
    const redirect = redirectTo && ALLOWED_REDIRECT.test(redirectTo) ? redirectTo : 'https://optica-ocui.onrender.com/?accion=crear-clave'
    const st = await admin<{ staff_by_pk: { id: string; name: string; email: string | null; active: boolean; user_id: string | null } | null }>(
      `query($id: uuid!) { staff_by_pk(id:$id) { id name email active user_id } }`, { id: staffId })
    const s = st.staff_by_pk
    if (!s) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (!s.active) return res.status(400).json({ error: 'El usuario está inactivo' })
    const email = (s.email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'La ficha no tiene un email válido' })

    // 3. Cuenta de acceso: se crea si no existe y se vincula a la ficha
    const ex = await admin<{ users: { id: string; disabled: boolean }[] }>(`query($e: citext!) { users(where:{email:{_eq:$e}}) { id disabled } }`, { e: email })
    let uid = ex.users[0]?.id
    if (!uid) {
      const ins = await admin<{ insertUser: { id: string } }>(
        `mutation($o: users_insert_input!) { insertUser(object:$o) { id } }`,
        { o: { email, displayName: s.name.slice(0, 32), locale: 'es', defaultRole: 'user', emailVerified: true, roles: { data: [{ role: 'user' }, { role: 'me' }] } } })
      uid = ins.insertUser.id
    }
    const other = await admin<{ staff: { id: string }[] }>(`query($u: uuid!, $id: uuid!) { staff(where:{user_id:{_eq:$u}, id:{_neq:$id}}) { id } }`, { u: uid, id: s.id })
    if (other.staff.length) return res.status(409).json({ error: 'Ese email ya está vinculado a otra ficha de personal' })
    await admin(`mutation($id: uuid!, $u: uuid!) { update_staff_by_pk(pk_columns:{id:$id}, _set:{user_id:$u, invited_at:"now()"}) { id } }`, { id: s.id, u: uid })

    // 4. Correo para crear la contraseña (plantilla de restablecimiento de Nhost)
    const mail = await fetch(`${AUTH}/user/password/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, options: { redirectTo: redirect } }) })
    if (!mail.ok) {
      const b = (await mail.json().catch(() => ({}))) as { message?: string; error?: string }
      return res.status(502).json({ error: `Cuenta creada y vinculada, pero el correo no se pudo enviar: ${b.message ?? b.error ?? mail.status}` })
    }
    return res.status(200).json({ ok: true, email })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error inesperado' })
  }
}

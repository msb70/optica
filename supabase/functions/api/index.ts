// API /v1 de Optilux para sistemas externos (CRM, Zoho, portal). Ver openapi.ts.
// URL base: https://<proyecto>.supabase.co/functions/v1/api/v1
// Autenticación: Authorization: Bearer opx_test_… / opx_live_… (credenciales de servicio con permisos por ámbito)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { OPENAPI } from './openapi.ts'

const VERSION = '1.0.0'
const TZ_OFFSET_MIN = -300 // Panamá, UTC-05:00 todo el año
const MAX_LIMIT = 500

type Client = { id: string; name: string; scopes: string[]; company_ids: string[] | null; environment: string }
class HttpError extends Error { constructor(public status: number, public body: Record<string, unknown>) { super(String(body.error)) } }
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => { throw new HttpError(status, { error, ...extra }) }

const headers = { 'content-type': 'application/json; charset=utf-8', 'x-api-version': VERSION, 'access-control-allow-origin': '*' }
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } })

/** Fecha con zona horaria explícita de Panamá (-05:00). */
function pa(ts: string | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const local = new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString().replace('Z', '')
  return `${local}-05:00`
}
const enc = (s: string) => btoa(s).replace(/=+$/, '')
const dec = (s: string) => { try { return atob(s) } catch { return '' } }
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// ---------- paginación incremental por fecha de modificación (sin topes ocultos) ----------
type Page = { limit: number; since?: string; cursor?: { at: string; id: string } }
function pageParams(q: URLSearchParams): Page {
  const limit = Math.min(Math.max(Number(q.get('limit') ?? 100) || 100, 1), MAX_LIMIT)
  const since = q.get('updated_since') ?? undefined
  if (since && isNaN(new Date(since).getTime())) fail(400, 'updated_since no es una fecha ISO 8601 válida', { campo: 'updated_since' })
  const c = q.get('cursor')
  let cursor: Page['cursor']
  if (c) { const [at, id] = dec(c).split('|'); if (!at || !id) fail(400, 'cursor no válido', { campo: 'cursor' }); cursor = { at, id } }
  return { limit, since, cursor }
}
// deno-lint-ignore no-explicit-any
function applyPage(b: any, p: Page, col = 'updated_at') {
  if (p.cursor) b = b.or(`${col}.gt.${p.cursor.at},and(${col}.eq.${p.cursor.at},id.gt.${p.cursor.id})`)
  else if (p.since) b = b.gt(col, new Date(p.since).toISOString())
  return b.order(col, { ascending: true }).order('id', { ascending: true }).limit(p.limit + 1)
}
// deno-lint-ignore no-explicit-any
function pageOut<T extends Record<string, any>>(rows: T[], p: Page, map: (r: T) => unknown, col = 'updated_at') {
  const more = rows.length > p.limit
  const items = more ? rows.slice(0, p.limit) : rows
  const last = items[items.length - 1]
  return { data: items.map(map), paginacion: { limite: p.limit, hay_mas: more, siguiente_cursor: more && last ? enc(`${last[col]}|${last.id}`) : null } }
}

// ---------- utilidades ----------
const need = (c: Client, scope: string) => { if (!c.scopes.includes(scope)) fail(403, `Falta el permiso "${scope}" en esta credencial`, { permiso_requerido: scope, permisos_actuales: c.scopes }) }
// deno-lint-ignore no-explicit-any
const scoped = (b: any, c: Client, col = 'company_id') => (c.company_ids?.length ? b.in(col, c.company_ids) : b)
// deno-lint-ignore no-explicit-any
async function data(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<any> {
  const r = await p
  if (r.error) {
    if (r.error.code === '23505') fail(409, 'Ya existe un registro con esos datos', { detalle: r.error.message })
    if (r.error.code === '23514' || r.error.code === '22P02') fail(422, 'Datos no válidos', { detalle: r.error.message })
    fail(500, 'Error interno', { detalle: r.error.message })
  }
  return r.data
}
/** Teléfono normalizado como en la base (solo dígitos, con prefijo 507 si viene en formato local de 8 dígitos). */
const normTel = (s: string) => { const d = s.replace(/\D/g, ''); return d.length === 8 ? '507' + d : d }
const CANALES = ['crm', 'whatsapp', 'call_center', 'formulario_web', 'web', 'walk-in', 'referido', 'instagram', 'google_ads', 'campania', 'empresa', 'doctor', 'facebook']
const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
async function branchOf(db: SupabaseClient, c: Client, id: unknown, errs: Record<string, string>, campo = 'sucursal_id') {
  if (!isUuid(id)) { errs[campo] = 'obligatorio (uuid de sucursal)'; return null }
  const b = await data(scoped(db.from('branches').select('id,company_id').eq('id', id as string), c).maybeSingle()) as { id: string; company_id: string } | null
  if (!b) errs[campo] = 'sucursal inexistente o fuera del alcance de la credencial'
  return b
}

// ---------- mapeos (nombres en español, estables) ----------
const CITA_ESTADO: Record<string, string> = { programada: 'agendada', confirmada: 'confirmada', atendida: 'asistio', no_show: 'no_asistio', cancelada: 'cancelada', reagendada: 'reagendada' }
const CITA_ESTADO_IN = Object.fromEntries(Object.entries(CITA_ESTADO).map(([k, v]) => [v, k]))
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>
const cliente = (r: Row) => ({
  id: r.id, codigo: r.code, nombre: r.first_name, apellido: r.last_name, telefono: r.phone, email: r.email, cedula: r.tax_id,
  sucursal_id: r.branch_id, compania_id: r.company_id, origen: r.source, sin_comunicaciones: r.no_comms,
  consentimiento_marketing: r.marketing_consent, consentimiento_marketing_fecha: pa(r.marketing_consent_at),
  origen_externo: r.external_source, id_externo: r.external_id, creado: pa(r.created_at), modificado: pa(r.updated_at),
})
const cita = (r: Row) => ({
  id: r.id, sucursal_id: r.branch_id, cliente_id: r.customer_id, optometrista_id: r.optometrist_id,
  inicio: pa(r.scheduled_at), fin: pa(new Date(new Date(r.scheduled_at).getTime() + (r.duration_min ?? 30) * 60000).toISOString()),
  estado: CITA_ESTADO[r.status] ?? r.status, canal: r.source, notas: r.notes, motivo_cancelacion: r.cancel_reason,
  reagendada_desde: r.rescheduled_from, origen_externo: r.external_source, id_externo: r.external_id, creado: pa(r.created_at), modificado: pa(r.updated_at),
})
const factura = (r: Row) => ({
  id: r.id, numero: r.number, serie: String(r.number).split('-').slice(0, 2).join('-'), consecutivo: Number(String(r.number).split('-').pop()),
  fecha: pa(r.sale_date), sucursal_id: r.branch_id, compania_id: r.company_id,
  estado: r.voided_at || r.status === 'anulada' ? 'anulada' : 'emitida', anulada_en: pa(r.voided_at), motivo_anulacion: r.void_reason,
  estado_pago: r.status === 'parcial' ? 'parcial' : r.status === 'devuelta' ? 'devuelta' : 'pagada',
  paciente_id: r.customer_id,
  facturar_a: { tipo: r.bill_to_type, nombre: r.bill_to_name ?? (r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : null), ruc: r.bill_to_tax_id ?? r.customer?.tax_id ?? null },
  subtotal: Number(r.subtotal), descuento: Number(r.discount), impuesto: Number(r.tax), total: Number(r.total), pagado: Number(r.paid),
  lineas: (r.sale_items ?? []).map((i: Row) => ({ producto_id: i.product_id, descripcion: i.description, categoria: i.category, cantidad: i.qty, precio_unitario: Number(i.unit_price), descuento_pct: Number(i.discount_pct), total: Number(i.line_total) })),
  orden_trabajo_id: r.quote_id, ordenes_laboratorio: (r.lab_orders ?? []).map((l: Row) => ({ id: l.id, numero: l.number, referencia: l.reference })),
  fiscal: { numero: r.fiscal_number, cufe: r.fiscal_cufe, estado: r.fiscal_status },
  creado: pa(r.created_at), modificado: pa(r.updated_at),
})
const cobro = (r: Row) => ({ id: r.id, factura_id: r.sale_id, factura_numero: r.sale?.number ?? null, forma_pago: r.method, tarjeta: r.card_brand, monto: Number(r.amount), referencia: r.reference, caja_id: r.cash_session_id, cuenta_deposito: r.deposit_account, fecha: pa(r.created_at), modificado: pa(r.updated_at) })
const anticipo = (r: Row) => ({ id: r.id, orden_trabajo_id: r.quote_id, orden_trabajo_numero: r.quote?.number ?? null, forma_pago: r.method, monto: Number(r.amount), referencia: r.reference, caja_id: r.cash_session_id, fecha: pa(r.created_at), modificado: pa(r.updated_at) })
const CAT: Record<string, string> = { armazon: 'montura', lente: 'lente', lente_contacto: 'lente_contacto', solar: 'solar', accesorio: 'accesorio', servicio: 'servicio' }
const producto = (r: Row) => ({ id: r.id, sku: r.sku, codigo_barras: r.barcode, descripcion: r.name, categoria: CAT[r.category] ?? r.category, marca: r.brand, modelo: r.model, color: r.color, precio: Number(r.price), lista_precios: 'general', impuesto_pct: Number(r.tax_rate ?? 7), controla_stock: r.track_stock, activo: r.active, modificado: pa(r.updated_at) })
const existencia = (r: Row) => ({ id: r.id, producto_id: r.product_id, sucursal_id: r.branch_id, unidades: r.qty, reservadas: r.reserved, disponibles: Math.max(0, r.qty - r.reserved), ultimo_conteo: pa(r.last_count_at), modificado: pa(r.updated_at) })

// ---------- autenticación, límite y registro ----------
async function authenticate(db: SupabaseClient, req: Request): Promise<Client> {
  const key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!/^opx_(test|live)_[0-9a-f]{8}_[0-9a-f]{48}$/.test(key)) fail(401, 'Credencial ausente o con formato no válido (Authorization: Bearer opx_…)')
  const c = await data(db.from('api_clients').select('id,name,scopes,company_ids,environment,active,revoked_at').eq('key_hash', await sha256(key)).maybeSingle()) as (Client & { active: boolean; revoked_at: string | null }) | null
  if (!c || !c.active || c.revoked_at) fail(401, 'Credencial no válida o revocada')
  return c!
}

// ---------- idempotencia de escrituras ----------
async function idempotent(db: SupabaseClient, c: Client, req: Request, body: unknown, run: () => Promise<{ status: number; body: unknown }>) {
  const key = req.headers.get('idempotency-key')
  if (!key) return run()
  if (key.length > 200) fail(400, 'Idempotency-Key demasiado larga (máx. 200)')
  const hash = await sha256(req.method + new URL(req.url).pathname + JSON.stringify(body))
  const prev = await data(db.from('api_idempotency').select('request_hash,status,response').eq('client_id', c.id).eq('key', key).maybeSingle()) as { request_hash: string; status: number; response: unknown } | null
  if (prev) {
    if (prev.request_hash !== hash) fail(422, 'Esta Idempotency-Key ya se usó con otra petición')
    return { status: prev.status, body: prev.response, replay: true }
  }
  const r = await run()
  if (r.status < 500) await db.from('api_idempotency').insert({ client_id: c.id, key, request_hash: hash, status: r.status, response: r.body })
  return r
}

// ---------- recursos ----------
async function route(db: SupabaseClient, c: Client, req: Request, parts: string[], q: URLSearchParams): Promise<{ status: number; body: unknown; replay?: boolean }> {
  const [res, id, sub] = parts
  const m = req.method
  const ok = (body: unknown, status = 200) => ({ status, body })

  // ----- clientes -----
  if (res === 'clientes') {
    if (m === 'GET') {
      need(c, 'clientes:leer')
      const cols = 'id,code,first_name,last_name,phone,email,tax_id,branch_id,company_id,source,no_comms,marketing_consent,marketing_consent_at,external_source,external_id,created_at,updated_at'
      if (id) { const r = await data(scoped(db.from('customers').select(cols).eq('id', id), c).maybeSingle()); if (!r) fail(404, 'Cliente no encontrado'); return ok(cliente(r as Row)) }
      const p = pageParams(q)
      let b = scoped(db.from('customers').select(cols), c)
      const tel = q.get('telefono'), nom = q.get('nombre'), ext = q.get('id_externo')
      if (tel) b = b.eq('phone_norm', normTel(tel))
      if (nom) { const t = `%${nom.replace(/[,()%*]/g, ' ').trim()}%`; b = b.or(`first_name.ilike.${t},last_name.ilike.${t}`) }
      if (ext) b = b.eq('external_id', ext).eq('external_source', c.name)
      return ok(pageOut(await data(applyPage(b, p)) as Row[], p, cliente))
    }
    if (m === 'POST' || m === 'PATCH') {
      need(c, 'clientes:escribir')
      const body = await req.json().catch(() => fail(400, 'El cuerpo debe ser JSON')) as Row
      return idempotent(db, c, req, body, async () => {
        const errs: Record<string, string> = {}
        const row: Row = {}
        if (m === 'POST' || body.nombre !== undefined) { if (!body.nombre?.trim()) errs.nombre = 'obligatorio'; else row.first_name = body.nombre.trim() }
        if (m === 'POST' || body.apellido !== undefined) { if (!body.apellido?.trim()) errs.apellido = 'obligatorio'; else row.last_name = body.apellido.trim() }
        if (m === 'POST' || body.telefono !== undefined) { if (!/^\+\d{7,15}$/.test(String(body.telefono ?? '').replace(/[\s-]/g, ''))) errs.telefono = 'obligatorio, con prefijo de país (+507…)'; else row.phone = body.telefono }
        if (body.email !== undefined) { if (body.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) errs.email = 'formato no válido'; else row.email = body.email || null }
        if (body.cedula !== undefined) row.tax_id = body.cedula || null
        if (m === 'POST' && body.canal !== undefined && !CANALES.includes(body.canal)) errs.canal = `uno de: ${CANALES.join(', ')}`
        if (body.sin_comunicaciones !== undefined) row.no_comms = !!body.sin_comunicaciones
        if (body.consentimiento_marketing !== undefined) { row.marketing_consent = !!body.consentimiento_marketing; row.marketing_consent_source = c.name }
        if (m === 'POST' || body.sucursal_id !== undefined) { const b = await branchOf(db, c, body.sucursal_id, errs); if (b) { row.branch_id = b.id; if (m === 'POST') row.company_id = b.company_id } }
        if (Object.keys(errs).length) fail(422, 'Hay campos con errores', { campos: errs })
        if (m === 'PATCH') {
          if (!id) fail(400, 'Falta el id del cliente en la ruta')
          const r = await data(scoped(db.from('customers').update(row).eq('id', id), c).select('*').maybeSingle()); if (!r) fail(404, 'Cliente no encontrado')
          return ok(cliente(r as Row))
        }
        // alta: primero por id externo (reintentos), luego por teléfono (no duplicar)
        if (body.id_externo) {
          const ex = await data(db.from('customers').select('*').eq('external_source', c.name).eq('external_id', String(body.id_externo)).maybeSingle()) as Row | null
          if (ex) return ok({ ...cliente(ex), existente: true })
        }
        const dup = await data(db.from('customers').select('*').eq('phone_norm', normTel(String(body.telefono))).maybeSingle()) as Row | null
        if (dup) fail(409, 'Ya existe un cliente con ese teléfono', { cliente: cliente(dup) })
        const code = 'C' + String(Date.now()).slice(-7)
        const r = await data(db.from('customers').insert({ ...row, code, source: body.canal ?? 'crm', external_source: body.id_externo ? c.name : null, external_id: body.id_externo ?? null }).select('*').single())
        return ok(cliente(r as Row), 201)
      })
    }
  }

  // ----- citas -----
  if (res === 'citas') {
    const cols = 'id,branch_id,company_id,customer_id,optometrist_id,scheduled_at,duration_min,status,source,notes,cancel_reason,rescheduled_from,external_source,external_id,created_at,updated_at'
    if (m === 'GET' && id && sub === 'asistencia') {
      need(c, 'citas:leer')
      const a = await data(scoped(db.from('appointments').select(cols).eq('id', id), c).maybeSingle()) as Row | null
      if (!a) fail(404, 'Cita no encontrada')
      const day0 = new Date(new Date(a!.scheduled_at).getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10)
      const from = new Date(`${day0}T00:00:00-05:00`).toISOString(), to = new Date(`${day0}T23:59:59.999-05:00`).toISOString()
      const [ex, sa] = await Promise.all([
        data(db.from('exams').select('id,exam_date,created_at').eq('customer_id', a!.customer_id).eq('exam_date', day0)),
        data(db.from('sales').select('id,number,sale_date').eq('customer_id', a!.customer_id).gte('sale_date', from).lte('sale_date', to)),
      ]) as [Row[], Row[]]
      return ok({ cita_id: a!.id, fecha: day0, estado_cita: CITA_ESTADO[a!.status] ?? a!.status, tuvo_examen: ex.length > 0, tuvo_venta: sa.length > 0, asistio: a!.status === 'atendida' || ex.length > 0 || sa.length > 0, examenes: ex.map((e) => e.id), ventas: sa.map((s) => ({ id: s.id, numero: s.number })) })
    }
    if (m === 'GET') {
      need(c, 'citas:leer')
      if (id) { const r = await data(scoped(db.from('appointments').select(cols).eq('id', id), c).maybeSingle()); if (!r) fail(404, 'Cita no encontrada'); return ok(cita(r as Row)) }
      const p = pageParams(q)
      let b = scoped(db.from('appointments').select(cols), c)
      if (q.get('sucursal_id')) b = b.eq('branch_id', q.get('sucursal_id'))
      if (q.get('desde')) b = b.gte('scheduled_at', new Date(q.get('desde')!).toISOString())
      if (q.get('hasta')) b = b.lt('scheduled_at', new Date(q.get('hasta')!).toISOString())
      if (q.get('id_externo')) b = b.eq('external_id', q.get('id_externo')).eq('external_source', c.name)
      return ok(pageOut(await data(applyPage(b, p)) as Row[], p, cita))
    }
    if (m === 'POST' || m === 'PATCH') {
      need(c, 'citas:escribir')
      const body = await req.json().catch(() => fail(400, 'El cuerpo debe ser JSON')) as Row
      return idempotent(db, c, req, body, async () => {
        const errs: Record<string, string> = {}
        const row: Row = {}
        const hasTz = (s: unknown) => typeof s === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(s) && !isNaN(new Date(s).getTime())
        let prev: Row | null = null
        if (m === 'PATCH') { if (!id) fail(400, 'Falta el id de la cita en la ruta'); prev = await data(scoped(db.from('appointments').select(cols).eq('id', id), c).maybeSingle()) as Row | null; if (!prev) fail(404, 'Cita no encontrada') }
        if (m === 'POST' || body.inicio !== undefined) { if (!hasTz(body.inicio)) errs.inicio = 'obligatorio, ISO 8601 con zona horaria (…-05:00)'; else row.scheduled_at = new Date(body.inicio).toISOString() }
        if (body.fin !== undefined) {
          if (!hasTz(body.fin)) errs.fin = 'ISO 8601 con zona horaria'
          else { const start = row.scheduled_at ?? prev?.scheduled_at; const mins = Math.round((new Date(body.fin).getTime() - new Date(start).getTime()) / 60000); if (mins <= 0 || mins > 480) errs.fin = 'debe ser posterior al inicio (máx. 8 h)'; else row.duration_min = mins }
        }
        if (m === 'POST' || body.sucursal_id !== undefined) { const b = await branchOf(db, c, body.sucursal_id, errs); if (b) { row.branch_id = b.id; row.company_id = b.company_id } }
        if (m === 'POST') {
          if (!isUuid(body.cliente_id)) errs.cliente_id = 'obligatorio (uuid de cliente)'
          else if (!(await data(db.from('customers').select('id').eq('id', body.cliente_id).maybeSingle()))) errs.cliente_id = 'cliente inexistente'
          else row.customer_id = body.cliente_id
        }
        if (body.notas !== undefined) row.notes = body.notas
        if (body.canal !== undefined) row.source = body.canal
        if (body.estado !== undefined) { if (!CITA_ESTADO_IN[body.estado]) errs.estado = `uno de: ${Object.keys(CITA_ESTADO_IN).join(', ')}`; else row.status = CITA_ESTADO_IN[body.estado] }
        if (body.motivo_cancelacion !== undefined) row.cancel_reason = body.motivo_cancelacion
        if (Object.keys(errs).length) fail(422, 'Hay campos con errores', { campos: errs })
        if (m === 'PATCH') {
          if (row.scheduled_at && row.scheduled_at !== new Date(prev!.scheduled_at).toISOString() && !row.status) row.status = 'reagendada'
          const r = await data(db.from('appointments').update(row).eq('id', id).select(cols).single())
          return ok(cita(r as Row))
        }
        if (body.id_externo) {
          const ex = await data(db.from('appointments').select(cols).eq('external_source', c.name).eq('external_id', String(body.id_externo)).maybeSingle()) as Row | null
          if (ex) return ok({ ...cita(ex), existente: true })
        }
        const r = await data(db.from('appointments').insert({ status: 'programada', source: 'crm', ...row, external_source: body.id_externo ? c.name : null, external_id: body.id_externo ?? null }).select(cols).single())
        return ok(cita(r as Row), 201)
      })
    }
  }

  // ----- facturas, notas de crédito, cobros, anticipos -----
  if (res === 'facturas' && m === 'GET') {
    need(c, 'facturas:leer')
    const cols = 'id,number,sale_date,branch_id,company_id,customer_id,status,voided_at,void_reason,bill_to_type,bill_to_name,bill_to_tax_id,subtotal,discount,tax,total,paid,quote_id,fiscal_number,fiscal_cufe,fiscal_status,created_at,updated_at,customer:customers(first_name,last_name,tax_id),sale_items(product_id,description,category,qty,unit_price,discount_pct,line_total),lab_orders(id,number,reference)'
    if (id) { const r = await data(scoped(db.from('sales').select(cols).eq('id', id), c).maybeSingle()); if (!r) fail(404, 'Factura no encontrada'); return ok(factura(r as Row)) }
    const p = pageParams(q)
    let b = scoped(db.from('sales').select(cols), c)
    if (q.get('sucursal_id')) b = b.eq('branch_id', q.get('sucursal_id'))
    return ok(pageOut(await data(applyPage(b, p)) as Row[], p, factura))
  }
  if (res === 'notas-credito' && m === 'GET') {
    need(c, 'facturas:leer')
    const p = pageParams(q)
    const rows = await data(applyPage(scoped(db.from('credit_notes').select('*,sale:sales(number)'), c), p)) as Row[]
    return ok(pageOut(rows, p, (r) => ({ id: r.id, numero: r.number, factura_id: r.sale_id, factura_numero: r.sale?.number, motivo: r.reason, total: Number(r.total), estado: r.status, fiscal: { numero: r.fiscal_number, cufe: r.fiscal_cufe, estado: r.fiscal_status }, creado: pa(r.created_at), modificado: pa(r.updated_at) })))
  }
  if (res === 'cobros' && m === 'GET') {
    need(c, 'cobros:leer')
    const p = pageParams(q)
    const cols = 'id,sale_id,method,card_brand,amount,reference,cash_session_id,deposit_account,created_at,updated_at,sale:sales!inner(number,company_id)'
    const rows = await data(applyPage(scoped(db.from('payments').select(cols), c, 'sale.company_id'), p)) as Row[]
    return ok(pageOut(rows, p, cobro))
  }
  if (res === 'anticipos' && m === 'GET') {
    need(c, 'cobros:leer')
    const p = pageParams(q)
    const cols = 'id,quote_id,method,amount,reference,cash_session_id,created_at,updated_at,quote:quotes!inner(number,company_id)'
    const rows = await data(applyPage(scoped(db.from('quote_deposits').select(cols), c, 'quote.company_id'), p)) as Row[]
    return ok(pageOut(rows, p, anticipo))
  }

  // ----- inventario -----
  if (res === 'productos' && m === 'GET') {
    need(c, 'inventario:leer')
    const cols = 'id,sku,barcode,name,category,brand,model,color,price,tax_rate,track_stock,active,updated_at'
    if (id) { const r = await data(db.from('products').select(cols).eq('id', id).maybeSingle()); if (!r) fail(404, 'Producto no encontrado'); return ok(producto(r as Row)) }
    const p = pageParams(q)
    let b = db.from('products').select(cols)
    if (q.get('codigo_barras')) b = b.eq('barcode', q.get('codigo_barras'))
    if (q.get('sku')) b = b.eq('sku', q.get('sku'))
    if (q.get('q')) { const t = `%${q.get('q')!.replace(/[,()%*]/g, ' ').trim()}%`; b = b.or(`name.ilike.${t},sku.ilike.${t},brand.ilike.${t},model.ilike.${t}`) }
    return ok(pageOut(await data(applyPage(b, p)) as Row[], p, producto))
  }
  if (res === 'existencias' && m === 'GET') {
    need(c, 'inventario:leer')
    const p = pageParams(q)
    let b = scoped(db.from('stock').select('id,product_id,branch_id,qty,reserved,last_count_at,updated_at,branch:branches!inner(company_id)'), c, 'branch.company_id')
    if (q.get('sucursal_id')) b = b.eq('branch_id', q.get('sucursal_id'))
    if (q.get('producto_id')) b = b.eq('product_id', q.get('producto_id'))
    return ok(pageOut(await data(applyPage(b, p)) as Row[], p, existencia))
  }
  if (res === 'movimientos' && m === 'GET') {
    need(c, 'inventario:leer')
    const p = pageParams(q)
    let b = scoped(db.from('stock_movements').select('id,product_id,branch_id,qty,type,ref_type,ref_id,created_at,branch:branches!inner(company_id)'), c, 'branch.company_id')
    if (q.get('sucursal_id')) b = b.eq('branch_id', q.get('sucursal_id'))
    const rows = await data(applyPage(b, p, 'created_at')) as Row[]
    return ok(pageOut(rows, p, (r) => ({ id: r.id, producto_id: r.product_id, sucursal_id: r.branch_id, unidades: r.qty, tipo: r.type, documento_tipo: r.ref_type, documento_id: r.ref_id, fecha: pa(r.created_at) }), 'created_at'))
  }

  // ----- eliminados (lápidas) -----
  if (res === 'eliminados' && m === 'GET') {
    const ent: Record<string, [string, string]> = { clientes: ['customers', 'clientes:leer'], citas: ['appointments', 'citas:leer'], facturas: ['sales', 'facturas:leer'], cobros: ['payments', 'cobros:leer'], productos: ['products', 'inventario:leer'], existencias: ['stock', 'inventario:leer'] }
    const e = ent[q.get('entidad') ?? '']
    if (!e) fail(400, `entidad obligatoria: ${Object.keys(ent).join(', ')}`, { campo: 'entidad' })
    need(c, e[1])
    const p = pageParams(q)
    const rows = await data(applyPage(db.from('deleted_records').select('id,entity_id,company_id,deleted_at').eq('entity', e[0]), p, 'deleted_at')) as Row[]
    return ok(pageOut(rows.filter((r) => !c.company_ids?.length || !r.company_id || c.company_ids.includes(r.company_id)), p, (r) => ({ id: r.entity_id, eliminado: pa(r.deleted_at) }), 'deleted_at'))
  }

  // ----- catálogos de apoyo -----
  if (res === 'sucursales' && m === 'GET') {
    const rows = await data(scoped(db.from('branches').select('id,code,name,company_id,address,phone,active,optilab_account'), c).order('name')) as Row[]
    return ok({ data: rows.map((r) => ({ id: r.id, codigo: r.code, nombre: r.name, compania_id: r.company_id, direccion: r.address, telefono: r.phone, activa: r.active })) })
  }
  fail(404, 'Recurso no encontrado', { ruta: '/' + parts.join('/'), metodo: m })
  return ok(null)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...headers, 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' } })
  // /functions/v1/api/v1/<recurso>…  → partes tras "v1"
  const all = url.pathname.split('/').filter(Boolean)
  const i = all.lastIndexOf('v1')
  const parts = i >= 0 ? all.slice(i + 1) : []
  if (!(i >= 0 && all[i - 1] === 'api')) return json({ error: 'Use la ruta /v1/…' }, 404)
  if (parts[0] === 'openapi.json') return json(OPENAPI)
  if (parts[0] === 'health' || parts.length === 0) return json({ estado: 'ok', version: VERSION, hora: pa(new Date().toISOString()) })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let client: Client | null = null
  try {
    client = await authenticate(db, req)
    const { data: allowed } = await db.rpc('api_hit', { p_client: client.id, p_method: req.method, p_path: '/' + parts.join('/') })
    if (allowed === false) return json({ error: 'Límite de peticiones por minuto superado', reintentar_en_segundos: 60 }, 429, { 'retry-after': '60' })
    const r = await route(db, client, req, parts, url.searchParams)
    return json(r.body, r.status, r.replay ? { 'idempotent-replay': 'true' } : {})
  } catch (e) {
    if (e instanceof HttpError) return json(e.body, e.status)
    console.error('api error', (e as Error).message) // sin datos personales en los registros
    return json({ error: 'Error interno' }, 500)
  }
})

// Envío de pedidos a Optilab (flujo 1). PREPARADO, SIN CONECTAR: no hace nada hasta configurar los secretos
//   OPTILAB_API_URL  (p. ej. https://…/api)   OPTILAB_API_KEY  (clave Bearer entregada por Optilab)
// Procesa las órdenes en estado optilab_status = 'en_cola' (las pone la óptica con el botón "Enviar al laboratorio",
// que llama a la función de base de datos optilab_enqueue y valida los datos antes).
// Reglas de la API de Optilab (propuesta borrador 2): respuesta síncrona (timeout ≥ 60 s), sin idempotencia
// → tras un timeout se consulta /external/submissions antes de reintentar; 60 peticiones/min por IP.
// Pendiente: nombres exactos de campos según la Guía de Integración v1.5 (mapeo en buildPayload).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

const FRAME: Record<string, string> = { aro_completo: 'aro completo', semi_al_aire: 'semi al aire', al_aire: 'al aire' }
const eye = (e: Row | undefined) => e && ({ esfera: e.esf ?? e.sph, cilindro: e.cil ?? e.cyl, eje: e.eje ?? e.axis, adicion: e.add, dnp: e.dnp, altura: e.altura, diametro: e.diametro, prisma: e.prisma, base: e.base })

function buildPayload(l: Row) {
  return {
    referencia: l.reference,                                  // única, máx. 45
    fecha: String(l.created_at).slice(0, 10),                  // AAAA-MM-DD
    codigo_cuenta: l.optilab_account ?? l.branch?.optilab_account,
    factura: l.quote?.number ?? l.sale?.number ?? l.number,     // número de la orden de trabajo impresa
    paciente: l.customer ? `${l.customer.first_name} ${l.customer.last_name}` : null,
    cedula: l.customer?.tax_id ?? null,
    expediente: l.patient_record ?? l.customer?.code ?? null,
    receta: { od: eye(l.rx_snapshot?.od), oi: eye(l.rx_snapshot?.oi) },
    lentes: { od: l.lens_code_od, oi: l.lens_code_oi },
    tratamientos: { od: l.treatments_od ?? [], oi: l.treatments_oi ?? [] },
    montura: { tipo: FRAME[l.frame_type] ?? l.frame_type, material: l.frame_material, modelo: l.frame_model, horizontal: l.frame_h, vertical: l.frame_v, diagonal: l.frame_diag, puente: l.frame_bridge },
    observaciones: l.notes ?? null,
  }
}

async function alreadySubmitted(base: string, key: string, reference: string): Promise<Row | null> {
  const r = await fetch(`${base}/external/submissions`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) })
  if (!r.ok) return null
  const list = await r.json().catch(() => []) as Row[] | { data?: Row[] }
  const items = Array.isArray(list) ? list : list.data ?? []
  return items.find((s) => s.referencia === reference || s.reference === reference) ?? null
}

async function processOne(db: SupabaseClient, base: string, key: string, l: Row) {
  const set = (v: Row) => db.from('lab_orders').update(v).eq('id', l.id)
  const ev = (status: string, note: string) => db.from('lab_order_events').insert({ lab_order_id: l.id, status: l.status, note: `Optilab: ${note}` }).then(() => status)
  // reintento tras un timeout: primero comprobar que no llegó
  if (l.optilab_attempts > 0) {
    const prev = await alreadySubmitted(base, key, l.reference).catch(() => null)
    if (prev) { await set({ optilab_status: 'aceptado', optilab_response: prev, optilab_sent_at: new Date().toISOString(), optilab_error: null, status: l.status === 'pendiente' ? 'enviado' : l.status, sent_at: l.sent_at ?? new Date().toISOString() }); return ev('aceptado', 'pedido confirmado en el historial de envíos') }
  }
  await set({ optilab_attempts: (l.optilab_attempts ?? 0) + 1 })
  let r: Response
  try {
    r = await fetch(`${base}/external/orders`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(buildPayload(l)), signal: AbortSignal.timeout(65_000) })
  } catch (e) {
    await set({ optilab_error: `sin respuesta (${(e as Error).name}); se verificará en el historial antes de reintentar` })
    return 'pendiente_verificar'
  }
  const body = await r.json().catch(() => ({})) as Row
  if (r.ok) { await set({ optilab_status: 'aceptado', optilab_order_id: body.id ?? body.pedido ?? null, optilab_response: body, optilab_sent_at: new Date().toISOString(), optilab_error: null, status: l.status === 'pendiente' ? 'enviado' : l.status, sent_at: l.sent_at ?? new Date().toISOString() }); return ev('aceptado', 'pedido recibido por el laboratorio') }
  if (r.status === 429) { await set({ optilab_error: 'límite de peticiones; se reintentará' }); return 'reintentar' }
  if (r.status === 400 || r.status === 502) { await set({ optilab_status: 'rechazado', optilab_response: body, optilab_error: JSON.stringify(body.errores ?? body.errors ?? body.motivo ?? body).slice(0, 1000) }); return ev('rechazado', r.status === 400 ? 'datos con errores, revisar y reenviar' : 'rechazado por el laboratorio') }
  await set({ optilab_status: 'error', optilab_response: body, optilab_error: `HTTP ${r.status}${r.status === 401 || r.status === 403 ? ' (clave o cuenta no autorizada)' : ''}` })
  return 'error'
}

Deno.serve(async () => {
  const base = Deno.env.get('OPTILAB_API_URL'), key = Deno.env.get('OPTILAB_API_KEY')
  if (!base || !key) return json({ estado: 'no_configurado', mensaje: 'Faltan OPTILAB_API_URL / OPTILAB_API_KEY. No se envió nada.' }, 503)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await db.from('lab_orders')
    .select('*,branch:branches(optilab_account),customer:customers(first_name,last_name,tax_id,code),quote:quotes(number),sale:sales(number)')
    .eq('optilab_status', 'en_cola').order('created_at').limit(5)   // lotes pequeños: el laboratorio responde de forma síncrona
  if (error) return json({ error: error.message }, 500)
  const out: Record<string, string> = {}
  for (const l of data ?? []) out[l.reference] = await processOne(db, base.replace(/\/$/, ''), key, l)
  return json({ procesados: Object.keys(out).length, resultado: out })
})

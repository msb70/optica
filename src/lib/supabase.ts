import { createClient } from '@supabase/supabase-js'

/** Proyecto Supabase de Optilux (Irlanda, eu-west-1). La clave publicable es pública por diseño: la seguridad la ponen las RLS. */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://dyjhhnplmzhptomwkrxq.supabase.co'
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Mm_ZBfFYZSuGW7stRVuWAg_dPs0a_Pn'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null }
type Res<T> = { data: T | null; error: PgError | null; count?: number | null }

export class DbError extends Error {
  code?: string
  constructor(e: PgError) { super(friendly(e)); this.code = e.code }
}

/** Mensajes de Postgres/PostgREST traducidos a algo que entienda el usuario. */
function friendly(e: PgError): string {
  if (e.code === '42501' || /row-level security/.test(e.message)) return 'Tu usuario no tiene permiso para esta operación'
  if (e.code === '23505') return 'Ya existe un registro con esos datos'
  if (e.code === '23503') return 'El registro está relacionado con otros datos y no se puede modificar así'
  if (e.code === 'PGRST116') return 'No se encontró el registro'
  return e.message
}

const emit = (msg: string) => window.dispatchEvent(new CustomEvent('gql-error', { detail: msg }))

/** Guardia de escritura: devuelve un mensaje si el usuario solo puede ver el módulo actual. */
let writeGuard: (() => string | null) | null = null
export const setWriteGuard = (fn: (() => string | null) | null) => { writeGuard = fn }

/** Ejecuta una lectura y devuelve los datos o lanza un error legible. */
export async function run<T>(p: PromiseLike<Res<T>>): Promise<T> {
  const r = await p
  if (r.error) { const err = new DbError(r.error); emit(err.message); throw err }
  return r.data as T
}

/** Lectura con conteo exacto (`{ count: 'exact' }` en el select). */
export async function runCount<T>(p: PromiseLike<Res<T>>): Promise<{ data: T; count: number }> {
  const r = await p
  if (r.error) { const err = new DbError(r.error); emit(err.message); throw err }
  return { data: r.data as T, count: r.count ?? 0 }
}

/** Escritura: respeta el modo "solo ver" del módulo antes de enviar nada. */
export async function write<T>(build: () => PromiseLike<Res<T>>): Promise<NonNullable<T>> {
  const msg = writeGuard?.()
  if (msg) { emit(msg); throw new Error(msg) }
  return (await run(build())) as NonNullable<T>
}

/** Llama a una función del servidor (validan óptica y permisos en la base de datos). */
export const rpc = <T = unknown>(fn: string, args: Record<string, unknown>) => write<T>(() => sb.rpc(fn, args) as unknown as PromiseLike<Res<T>>)

/** Suma una columna de un array de filas. */
export const sum = <T,>(rows: T[] | null | undefined, k: keyof T) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0)

/** Lee todas las filas paginando de 1000 en 1000 (límite de filas por petición de la API). */
export async function runAll<T>(build: () => { range: (a: number, b: number) => PromiseLike<Res<T[]>> }, page = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += page) {
    const rows = await run(build().range(from, from + page - 1))
    out.push(...rows)
    if (rows.length < page) return out
  }
}

/** Texto seguro para filtros `or=(...)` de PostgREST (quita separadores). */
export const likeTerm = (s: string) => `%${s.replace(/[,()*%\\]/g, ' ').trim()}%`

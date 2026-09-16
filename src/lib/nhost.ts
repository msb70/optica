import { createClient } from '@nhost/nhost-js'

export const NHOST_SUBDOMAIN = import.meta.env.VITE_NHOST_SUBDOMAIN || 'uisspsyswrtvnkgneuwl'
export const NHOST_REGION = import.meta.env.VITE_NHOST_REGION || 'eu-central-1'

/** Modo desarrollo: Hasura local sin Nhost Auth (solo si VITE_DEV_ADMIN_SECRET está definido) */
export const DEV_GRAPHQL_URL: string | undefined = import.meta.env.VITE_DEV_GRAPHQL_URL
export const DEV_ADMIN_SECRET: string | undefined = import.meta.env.VITE_DEV_ADMIN_SECRET
export const isDevMode = Boolean(DEV_GRAPHQL_URL && DEV_ADMIN_SECRET)

export const nhost = createClient({ subdomain: NHOST_SUBDOMAIN, region: NHOST_REGION })

export class GraphQLError extends Error {
  errors: { message: string; extensions?: Record<string, unknown> }[]
  constructor(errors: { message: string; extensions?: Record<string, unknown> }[]) {
    super(errors.map((e) => e.message).join('; '))
    this.errors = errors
  }
}

/** Ejecuta una operación GraphQL contra Hasura (Nhost) y devuelve `data`. */
export async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (isDevMode) {
    const res = await fetch(DEV_GRAPHQL_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': DEV_ADMIN_SECRET!, 'x-hasura-role': 'user' },
      body: JSON.stringify({ query, variables }),
    })
    const body = (await res.json()) as { data?: T; errors?: GraphQLError['errors'] }
    if (body.errors?.length) { const err = new GraphQLError(body.errors); window.dispatchEvent(new CustomEvent('gql-error', { detail: err.message })); throw err }
    return body.data as T
  }
  const res = await nhost.graphql.request<T>({ query, variables })
  const body = res.body as { data?: T; errors?: GraphQLError['errors'] }
  if (body.errors?.length) { const err = new GraphQLError(body.errors); window.dispatchEvent(new CustomEvent('gql-error', { detail: err.message })); throw err }
  return body.data as T
}

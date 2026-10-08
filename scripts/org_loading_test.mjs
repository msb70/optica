import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.localStorage = { getItem: () => null }
const server = await createServer({
  server: { middlewareMode: true },
  plugins: [{
    name: 'test-shell-export',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.tsx')) return `${code}\nexport { Shell }`
    },
  }],
})
try {
  const { Shell } = await server.ssrLoadModule('/src/App.tsx')
  const { AppProvider } = await server.ssrLoadModule('/src/lib/app.tsx')
  const { AuthProvider, useAuth } = await server.ssrLoadModule('/src/lib/auth.tsx')
  for (const [name, state, expected] of [
    ['expired session', { status: 'error', error: new Error('Could not verify JWT: JWTExpired'), fetchStatus: 'idle' }, 'No se pudo cargar la organización'],
    ['empty organization', { status: 'success', data: { companies: [], branches: [], staff: [] }, dataUpdatedAt: Date.now(), fetchStatus: 'idle' }, 'No hay compañías disponibles'],
    ['pending request', { status: 'pending', fetchStatus: 'fetching' }, 'Cargando organización'],
  ]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
    client.getQueryCache().build(client, { queryKey: ['org'] }).setState(state)
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(AuthProvider, null, createElement(AppProvider, null, createElement(Shell)))))
    assert.ok(html.includes(expected), `${name}: expected ${expected}, received ${html}`)
    if (state.status !== 'pending') assert.ok(!html.includes('Cargando organización'), `${name}: stuck loading`)
    console.log(`✓ ${name}`)
    client.clear()
  }
  const { nhost } = await server.ssrLoadModule('/src/lib/nhost.ts')
  let cleared = false
  let auth
  function CaptureAuth() { auth = useAuth(); return null }
  const originalSignOut = nhost.auth.signOut
  const originalClearSession = nhost.clearSession
  nhost.auth.signOut = async () => { throw new Error('Internal server error') }
  nhost.clearSession = () => { cleared = true }
  try {
    renderToStaticMarkup(createElement(AuthProvider, null, createElement(CaptureAuth)))
    await auth.signOut()
    assert.ok(cleared, 'a failed remote sign-out must still clear the expired local session')
    console.log('✓ sign out when Auth returns 500')
  } finally {
    nhost.auth.signOut = originalSignOut
    nhost.clearSession = originalClearSession
  }
} finally {
  await server.close()
}

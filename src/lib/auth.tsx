import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { nhost, isDevMode } from './nhost'

type User = { id: string; email?: string | null; displayName?: string | null } | null

interface AuthCtx {
  user: User
  isAuthenticated: boolean
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    if (isDevMode) {
      setUser({ id: 'dev', email: 'dev@optilux.local', displayName: 'Desarrollador' })
      setLoading(false)
      return
    }
    const s = nhost.getUserSession()
    setUser(s?.user ? { id: s.user.id, email: s.user.email, displayName: s.user.displayName } : null)
    setLoading(false)
    return nhost.sessionStorage.onChange((s) => {
      setUser(s?.user ? { id: s.user.id, email: s.user.email, displayName: s.user.displayName } : null)
    })
  }, [])

  const errMsg = (e: unknown) => {
    const err = e as { message?: string; body?: { message?: string } }
    return err?.body?.message || err?.message || 'Error de autenticación'
  }

  const value: AuthCtx = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signIn: async (email, password) => {
      try {
        const r = await nhost.auth.signInEmailPassword({ email, password })
        if (!r.body?.session) return 'Credenciales inválidas'
        return null
      } catch (e) { return errMsg(e) }
    },
    signUp: async (email, password, displayName) => {
      try {
        const r = await nhost.auth.signUpEmailPassword({ email, password, options: { displayName, locale: 'es' } })
        if (!r.body?.session) return 'Cuenta creada. Revisa tu correo para verificarla e inicia sesión.'
        return null
      } catch (e) { return errMsg(e) }
    },
    signOut: async () => {
      if (isDevMode) return
      try {
        await nhost.auth.signOut({ refreshToken: nhost.getUserSession()?.refreshToken ?? '' })
      } catch {
        // Permite salir de una sesión caducada incluso si Auth no responde.
      } finally {
        nhost.clearSession()
      }
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}

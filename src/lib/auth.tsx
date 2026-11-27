import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { sb } from './supabase'

type User = { id: string; email?: string | null; displayName?: string | null } | null

interface AuthCtx {
  user: User
  isAuthenticated: boolean
  isLoading: boolean
  /** true cuando se entró desde un enlace de invitación o de recuperar contraseña */
  needsPassword: boolean
  clearNeedsPassword: () => void
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

const toUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): User =>
  u ? { id: u.id, email: u.email, displayName: (u.user_metadata?.name as string) ?? null } : null

const AUTH_MSG: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Tu cuenta aún no está confirmada. Usa el enlace de invitación del correo.',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null)
  const [isLoading, setLoading] = useState(true)
  // los enlaces de invitación/recuperación traen type=invite|recovery en el fragmento de la URL
  const [needsPassword, setNeedsPassword] = useState(() => /type=(invite|recovery)/.test(window.location.hash) || new URLSearchParams(window.location.search).get('accion') === 'crear-clave')

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setUser(toUser(data.session?.user)); setLoading(false) })
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      setUser(toUser(session?.user))
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value: AuthCtx = {
    user,
    isAuthenticated: !!user,
    isLoading,
    needsPassword,
    clearNeedsPassword: () => setNeedsPassword(false),
    signIn: async (email, password) => {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? AUTH_MSG[error.message] ?? error.message : null
    },
    signOut: async () => {
      // local: permite salir aunque la sesión ya haya caducado en el servidor
      await sb.auth.signOut({ scope: 'local' })
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}

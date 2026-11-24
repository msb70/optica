import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gql } from './nhost'
import type { Access } from './permissions'
import { useAuth } from './auth'
import type { Company, Branch, Staff, CashSession } from './types'

interface AppCtx {
  companies: Company[]
  branches: Branch[]
  staff: Staff[]
  company: Company | null
  branch: Branch | null
  setCompanyId: (id: string) => void
  setBranchId: (id: string) => void
  me: Staff | null
  cashSession: CashSession | null
  refreshCash: () => void
  loading: boolean
  organizationError: Error | null
  retryOrganization: () => void
  currency: (n: number | string | null | undefined) => string
  rolePermissions: { role: string; module: string; access: Access }[]
  access: (module: string) => Access
}

const Ctx = createContext<AppCtx | null>(null)

const ORG_QUERY = `query Org { companies(order_by:{code:asc}) { id code legal_name trade_name tax_id country currency tax_rate invoice_prefix zoho_org_id active allow_negative_stock min_deposit_pct warranty_frame_months warranty_lens_months }
  branches(order_by:{name:asc}) { id company_id code name address phone monthly_goal active zoho_scope zoho_org_id zoho_tag }
  staff(where:{active:{_eq:true}}, order_by:{name:asc}) { id user_id company_id branch_id name email role commission_pct max_discount_pct monthly_goal active all_branches permissions staff_branches { branch_id } }
  role_permissions { role module access } }`

const CASH_QUERY = `query OpenCash($branch: uuid!) { cash_sessions(where:{branch_id:{_eq:$branch}, status:{_eq:"abierta"}}, order_by:{opened_at:desc}, limit:1) {
  id company_id branch_id opened_by opened_at closed_at opening_amount expected_cash counted_cash difference status notes opener { id name } } }`

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const org = useQuery({ queryKey: ['org'], queryFn: () => gql<{ companies: Company[]; branches: Branch[]; staff: Staff[]; role_permissions: { role: string; module: string; access: Access }[] }>(ORG_QUERY), staleTime: 60_000 })
  const allCompanies = org.data?.companies ?? []
  const allBranches = org.data?.branches ?? []
  const staff = org.data?.staff ?? []
  // R12: cada usuario solo ve sus sucursales (el administrador ve todas)
  const meEarly = useMemo(() => {
    if (!user) return null
    return staff.find((s) => s.user_id === user.id) || staff.find((s) => s.email && s.email.toLowerCase() === (user.email || '').toLowerCase()) || null
  }, [staff, user])
  const allowed = useMemo(() => {
    if (!meEarly || meEarly.role === 'admin' || meEarly.all_branches) return null
    const ids = new Set((meEarly.staff_branches ?? []).map((b) => b.branch_id))
    if (!ids.size && meEarly.branch_id) ids.add(meEarly.branch_id)
    return ids
  }, [meEarly])
  const branches = useMemo(() => (allowed ? allBranches.filter((b) => allowed.has(b.id)) : allBranches), [allBranches, allowed])
  const companies = useMemo(() => (allowed ? allCompanies.filter((c) => branches.some((b) => b.company_id === c.id)) : allCompanies), [allCompanies, branches, allowed])

  const [companyId, setCompanyIdState] = useState<string>(() => localStorage.getItem('optilux.company') || '')
  const [branchId, setBranchIdState] = useState<string>(() => localStorage.getItem('optilux.branch') || '')

  useEffect(() => {
    if (!companies.length) return
    if (!companies.find((c) => c.id === companyId)) { const best = [...companies].sort((a, b) => branches.filter((x) => x.company_id === b.id).length - branches.filter((x) => x.company_id === a.id).length)[0]; setCompanyIdState(best.id) }
  }, [companies, branches, companyId])
  useEffect(() => {
    const list = branches.filter((b) => b.company_id === companyId)
    if (!list.length) return
    if (!list.find((b) => b.id === branchId)) setBranchIdState(list[0].id)
  }, [branches, companyId, branchId])
  useEffect(() => { if (companyId) localStorage.setItem('optilux.company', companyId) }, [companyId])
  useEffect(() => { if (branchId) localStorage.setItem('optilux.branch', branchId) }, [branchId])

  const company = companies.find((c) => c.id === companyId) ?? null
  const branch = branches.find((b) => b.id === branchId) ?? null

  const me = useMemo(() => {
    if (!user) return null
    const byUser = staff.find((s) => s.user_id === user.id) || staff.find((s) => s.email && s.email.toLowerCase() === (user.email || '').toLowerCase())
    return byUser ?? staff.find((s) => s.role === 'admin') ?? null
  }, [staff, user])

  const rolePermissions = org.data?.role_permissions ?? []
  const access = (module: string): Access => {
    if (!me || me.role === 'admin') return 'editar'
    const custom = (me.permissions as Record<string, Access> | null | undefined)?.[module]
    if (custom) return custom
    return rolePermissions.find((p) => p.role === me.role && p.module === module)?.access ?? 'ninguno'
  }
  const cash = useQuery({ queryKey: ['cash-open', branchId], queryFn: () => gql<{ cash_sessions: CashSession[] }>(CASH_QUERY, { branch: branchId }), enabled: !!branchId, refetchInterval: 30_000 })

  const value: AppCtx = {
    companies, branches, staff, company, branch, me, rolePermissions, access,
    setCompanyId: (id) => { setCompanyIdState(id); const first = branches.find((b) => b.company_id === id); if (first) setBranchIdState(first.id) },
    setBranchId: (id) => { setBranchIdState(id); const b = branches.find((x) => x.id === id); if (b && b.company_id !== companyId) setCompanyIdState(b.company_id) },
    cashSession: cash.data?.cash_sessions?.[0] ?? null,
    refreshCash: () => { void cash.refetch() },
    loading: org.isLoading,
    organizationError: org.error,
    retryOrganization: () => { void org.refetch() },
    currency: (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: company?.currency || 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(Number(n ?? 0)),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}

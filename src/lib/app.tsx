import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gql } from './nhost'
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
  currency: (n: number | string | null | undefined) => string
}

const Ctx = createContext<AppCtx | null>(null)

const ORG_QUERY = `query Org { companies(order_by:{code:asc}) { id code legal_name trade_name tax_id country currency tax_rate invoice_prefix zoho_org_id active }
  branches(order_by:{name:asc}) { id company_id code name address phone monthly_goal active }
  staff(where:{active:{_eq:true}}, order_by:{name:asc}) { id user_id company_id branch_id name email role commission_pct max_discount_pct monthly_goal active } }`

const CASH_QUERY = `query OpenCash($branch: uuid!) { cash_sessions(where:{branch_id:{_eq:$branch}, status:{_eq:"abierta"}}, order_by:{opened_at:desc}, limit:1) {
  id company_id branch_id opened_by opened_at closed_at opening_amount expected_cash counted_cash difference status notes opener { id name } } }`

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const org = useQuery({ queryKey: ['org'], queryFn: () => gql<{ companies: Company[]; branches: Branch[]; staff: Staff[] }>(ORG_QUERY), staleTime: 60_000 })
  const companies = org.data?.companies ?? []
  const branches = org.data?.branches ?? []
  const staff = org.data?.staff ?? []

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

  const cash = useQuery({ queryKey: ['cash-open', branchId], queryFn: () => gql<{ cash_sessions: CashSession[] }>(CASH_QUERY, { branch: branchId }), enabled: !!branchId, refetchInterval: 30_000 })

  const value: AppCtx = {
    companies, branches, staff, company, branch, me,
    setCompanyId: (id) => { setCompanyIdState(id); const first = branches.find((b) => b.company_id === id); if (first) setBranchIdState(first.id) },
    setBranchId: (id) => { setBranchIdState(id); const b = branches.find((x) => x.id === id); if (b && b.company_id !== companyId) setCompanyIdState(b.company_id) },
    cashSession: cash.data?.cash_sessions?.[0] ?? null,
    refreshCash: () => { void cash.refetch() },
    loading: org.isLoading,
    currency: (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: company?.currency || 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(Number(n ?? 0)),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}

'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Company, UserCompanyRole, UserRole } from '@/lib/types/database'

interface CompanyContextType {
  companies: Company[]
  activeCompany: Company | null
  setActiveCompany: (company: Company) => void
  userRoles: UserCompanyRole[]
  activeRole: UserRole | null
  isHome: boolean
  loading: boolean
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  activeCompany: null,
  setActiveCompany: () => {},
  userRoles: [],
  activeRole: null,
  isHome: true,
  loading: true,
})

export function CompanyProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null)
  const [userRoles, setUserRoles] = useState<UserCompanyRole[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Load companies
      const { data: companiesData } = await supabase.from('companies').select('*').order('name')
      setCompanies(companiesData || [])

      // Load user's company roles
      const { data: rolesData } = await supabase
        .from('user_company_roles')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
      setUserRoles(rolesData || [])

      // Determine which companies this user has access to
      const userCompanyIds = new Set((rolesData || []).map(r => r.company_id))

      // Restore saved company or default to home company
      const savedId = localStorage.getItem('activeCompanyId')
      const saved = companiesData?.find(c => String(c.id) === savedId && userCompanyIds.has(c.id))
      const homeRole = (rolesData || []).find(r => r.is_home)
      const homeCompany = homeRole
        ? companiesData?.find(c => c.id === homeRole.company_id)
        : null

      const initialCompany = saved || homeCompany || companiesData?.[0] || null

      if (initialCompany) {
        setActiveCompanyState(initialCompany)
        localStorage.setItem('activeCompanyId', String(initialCompany.id))

        // Set the DB session variable for RLS
        try {
          await supabase.rpc('set_active_company', { p_company_id: initialCompany.id })
        } catch {
          // Fallback: RPC may not exist yet if migration hasn't run
        }
      }

      setLoading(false)
    }
    load()
  }, [userId])

  const setActiveCompany = useCallback(async (company: Company) => {
    setActiveCompanyState(company)
    localStorage.setItem('activeCompanyId', String(company.id))

    // Set the DB session variable for RLS
    try {
      await supabase.rpc('set_active_company', { p_company_id: company.id })
    } catch {
      // Fallback: RPC may not exist yet
    }
  }, [supabase])

  const activeRoleRecord = userRoles.find(r => r.company_id === activeCompany?.id)
  const activeRole = (activeRoleRecord?.role as UserRole) || null
  const isHome = activeRoleRecord?.is_home ?? true

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompany, userRoles, activeRole, isHome, loading }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanyContext() {
  return useContext(CompanyContext)
}

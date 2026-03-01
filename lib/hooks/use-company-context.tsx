'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Company, UserCompanyRole } from '@/lib/types/database'

interface CompanyContextType {
  companies: Company[]
  activeCompany: Company | null
  setActiveCompany: (company: Company) => void
  userRoles: UserCompanyRole[]
  activeRole: string | null
  loading: boolean
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  activeCompany: null,
  setActiveCompany: () => {},
  userRoles: [],
  activeRole: null,
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
      setUserRoles(rolesData || [])

      // Restore saved company or default to first
      const savedId = localStorage.getItem('activeCompanyId')
      const saved = companiesData?.find(c => String(c.id) === savedId)
      setActiveCompanyState(saved || companiesData?.[0] || null)
      setLoading(false)
    }
    load()
  }, [userId])

  const setActiveCompany = (company: Company) => {
    setActiveCompanyState(company)
    localStorage.setItem('activeCompanyId', String(company.id))
  }

  const activeRole = userRoles.find(r => r.company_id === activeCompany?.id)?.role as string || null

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompany, userRoles, activeRole, loading }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanyContext() {
  return useContext(CompanyContext)
}

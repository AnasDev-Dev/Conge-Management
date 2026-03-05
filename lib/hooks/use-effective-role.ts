'use client'

import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { MANAGER_ROLES } from '@/lib/constants'
import { UserRole } from '@/lib/types/database'

/**
 * Returns the user's effective role for the active company.
 * Uses the company-specific role from user_company_roles if available,
 * otherwise falls back to the global role from utilisateurs.
 */
export function useEffectiveRole() {
  const { user } = useCurrentUser()
  const { activeRole, isHome, activeCompany } = useCompanyContext()

  const effectiveRole: UserRole = activeRole || user?.role || 'EMPLOYEE'
  const isManager = MANAGER_ROLES.includes(effectiveRole)

  return {
    effectiveRole,
    isManager,
    isHome,
    activeCompany,
  }
}

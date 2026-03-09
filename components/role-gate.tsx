'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { useDbPermissions } from '@/lib/hooks/use-db-permissions'
import { UserRole } from '@/lib/types/database'
import { type Action, type PageKey, ROLE_PERMISSIONS } from '@/lib/permissions'

interface RoleGateProps {
  userRole: UserRole
  action?: Action
  page?: PageKey
  children: ReactNode
  fallback?: ReactNode
}

export function RoleGate({ userRole, action, page, children, fallback = null }: RoleGateProps) {
  const { activeRole } = useCompanyContext()
  const { permissionsMap } = useDbPermissions()
  const effectiveRole: UserRole = activeRole || userRole
  const perms = (permissionsMap || ROLE_PERMISSIONS)[effectiveRole] || ROLE_PERMISSIONS[effectiveRole]

  if (action && !perms.actions.includes(action)) {
    return <>{fallback}</>
  }

  if (page && !perms.pages.includes(page)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

interface PageGuardProps {
  userRole: UserRole
  page: PageKey
  children: ReactNode
}

export function PageGuard({ userRole, page, children }: PageGuardProps) {
  const { activeRole } = useCompanyContext()
  const { permissionsMap, loading } = useDbPermissions()
  const router = useRouter()

  // Wait for permissions and user to load before deciding
  if (loading || userRole === 'EMPLOYEE' as UserRole && !activeRole) {
    // Still loading — show spinner instead of redirecting
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  const effectiveRole: UserRole = activeRole || userRole
  const perms = (permissionsMap || ROLE_PERMISSIONS)[effectiveRole] || ROLE_PERMISSIONS[effectiveRole]

  if (!perms.pages.includes(page)) {
    router.push('/dashboard')
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Redirection...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

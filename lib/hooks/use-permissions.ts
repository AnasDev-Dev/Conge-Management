'use client'

import { useMemo } from 'react'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { useDbPermissions } from '@/lib/hooks/use-db-permissions'
import { UserRole } from '@/lib/types/database'
import {
  type Action,
  type PageKey,
  type SidebarItem,
  type DataScope,
  type RolePermissions,
  ROLE_PERMISSIONS,
  pathnameToPageKey,
} from '@/lib/permissions'

export interface UsePermissionsReturn {
  /** The resolved effective role (company-aware, falls back to user.role) */
  effectiveRole: UserRole
  /** Full permissions object for the effective role */
  permissions: RolePermissions
  /** Data scope: 'own' | 'department' | 'all' */
  dataScope: DataScope
  /** Check if the current role can see a sidebar item */
  canSee: (item: SidebarItem) => boolean
  /** Check if the current role can access a page */
  canAccess: (page: PageKey) => boolean
  /** Check if the current role can perform an action */
  can: (action: Action) => boolean
  /** Check if current role has manager-level data scope */
  isManager: boolean
  /** Check if a given pathname is accessible */
  canAccessPath: (pathname: string) => boolean
}

/**
 * Hook that resolves the current user's permissions based on their effective role.
 * Uses DB-loaded permissions when available, falls back to static config.
 */
export function usePermissions(userRole: UserRole): UsePermissionsReturn {
  const { activeRole } = useCompanyContext()
  const { permissionsMap } = useDbPermissions()
  const effectiveRole: UserRole = activeRole || userRole

  // Use DB permissions if loaded, otherwise static
  const permMap = permissionsMap || ROLE_PERMISSIONS

  return useMemo(() => {
    const permissions = permMap[effectiveRole] || ROLE_PERMISSIONS[effectiveRole]
    return {
      effectiveRole,
      permissions,
      dataScope: permissions.dataScope,
      canSee: (item: SidebarItem) => permissions.sidebar.includes(item),
      canAccess: (page: PageKey) => permissions.pages.includes(page),
      can: (action: Action) => permissions.actions.includes(action),
      isManager: permissions.dataScope !== 'own',
      canAccessPath: (pathname: string) => {
        const pageKey = pathnameToPageKey(pathname)
        if (!pageKey) return true
        return permissions.pages.includes(pageKey)
      },
    }
  }, [effectiveRole, permMap])
}

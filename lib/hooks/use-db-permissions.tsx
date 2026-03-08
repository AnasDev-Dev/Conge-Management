'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { UserRole } from '@/lib/types/database'
import {
  type RolePermissions,
  type SidebarItem,
  type PageKey,
  type Action,
  type DataScope,
  ROLE_PERMISSIONS,
} from '@/lib/permissions'

interface DbPermissionsContextType {
  /** DB-loaded permissions map, or null if not loaded / table doesn't exist */
  permissionsMap: Record<UserRole, RolePermissions> | null
  /** Whether DB permissions are still loading */
  loading: boolean
  /** Reload from DB */
  reload: () => Promise<void>
}

const DbPermissionsContext = createContext<DbPermissionsContextType>({
  permissionsMap: null,
  loading: true,
  reload: async () => {},
})

interface DbRow {
  role: string
  sidebar: SidebarItem[]
  pages: PageKey[]
  actions: Action[]
  data_scope: DataScope
}

export function DbPermissionsProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompanyContext()
  const [permissionsMap, setPermissionsMap] = useState<Record<UserRole, RolePermissions> | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const reload = useCallback(async () => {
    if (!activeCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('role, sidebar, pages, actions, data_scope')
        .eq('company_id', activeCompany.id)

      if (error) throw error

      if (data && data.length > 0) {
        const map = {} as Record<UserRole, RolePermissions>
        for (const row of data as DbRow[]) {
          map[row.role as UserRole] = {
            sidebar: row.sidebar,
            pages: row.pages,
            actions: row.actions,
            dataScope: row.data_scope,
          }
        }
        setPermissionsMap(map)
      } else {
        setPermissionsMap(null)
      }
    } catch {
      // Table may not exist yet
      setPermissionsMap(null)
    } finally {
      setLoading(false)
    }
  }, [activeCompany, supabase])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <DbPermissionsContext.Provider value={{ permissionsMap, loading, reload }}>
      {children}
    </DbPermissionsContext.Provider>
  )
}

export function useDbPermissions() {
  return useContext(DbPermissionsContext)
}

/**
 * Get the effective ROLE_PERMISSIONS map (DB-loaded or static fallback).
 * Used by usePermissions and anywhere that needs the full map.
 */
export function useEffectivePermissionsMap(): Record<UserRole, RolePermissions> {
  const { permissionsMap } = useDbPermissions()
  return permissionsMap || ROLE_PERMISSIONS
}

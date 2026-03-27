import { UserRole } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All sidebar route keys */
export type SidebarItem =
  | 'dashboard'
  | 'employees'
  | 'validations'
  | 'mission-validations'
  | 'requests'
  | 'missions'
  | 'calendar'
  | 'recovery-requests'
  | 'settings'
  | 'balance-init'
  | 'profile'
  | 'notifications'

/** All page-level route keys (superset of sidebar — includes sub-pages) */
export type PageKey = SidebarItem | 'new-request' | 'new-mission' | 'employee-detail' | 'request-detail' | 'mission-detail'

/** CRUD + special actions */
export type Action =
  // Employee management
  | 'employees.create'
  | 'employees.edit'
  | 'employees.delete'
  | 'employees.viewBalances'
  // Leave requests
  | 'requests.createOnBehalf'
  | 'requests.viewAll'
  // Missions
  | 'missions.createOnBehalf'
  | 'missions.viewAll'
  // Calendar
  | 'calendar.viewTeam'
  // Recovery
  | 'recovery.validate'
  | 'recovery.creditManual'
  // Settings tabs
  | 'settings.workingDays'
  | 'settings.holidays'
  | 'settings.recovery'
  | 'settings.departments'
  | 'settings.categories'
  | 'settings.missions'
  | 'settings.permissions'
  // Balance init
  | 'balance-init.edit'
  // Approval pipeline
  | 'approval.leaveStage1'   // RH
  | 'approval.leaveStage2'   // Chef de Service
  | 'approval.leaveStage3'   // Directeur Executif
  | 'approval.missionStage1' // Chef de Service
  | 'approval.missionStage2' // RH
  | 'approval.missionStage3' // Directeur Executif

/** Data scope for list views */
export type DataScope = 'own' | 'department' | 'all'

/** Permission set for a single role */
export interface RolePermissions {
  sidebar: SidebarItem[]
  pages: PageKey[]
  actions: Action[]
  dataScope: DataScope
}

// ---------------------------------------------------------------------------
// Permission Matrix
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  EMPLOYEE: {
    sidebar: [
      'dashboard',
      'requests',
      'missions',
      'calendar',
      'recovery-requests',
      'profile',
      'notifications',
    ],
    pages: [
      'dashboard',
      'requests',
      'request-detail',
      'new-request',
      'missions',
      'mission-detail',
      'new-mission',
      'calendar',
      'recovery-requests',
      'profile',
      'notifications',
    ],
    actions: [],
    dataScope: 'own',
  },

  CHEF_SERVICE: {
    sidebar: [
      'dashboard',
      'employees',
      'validations',
      'mission-validations',
      'requests',
      'missions',
      'calendar',
      'recovery-requests',
      'profile',
      'notifications',
    ],
    pages: [
      'dashboard',
      'employees',
      'employee-detail',
      'validations',
      'mission-validations',
      'requests',
      'request-detail',
      'new-request',
      'missions',
      'mission-detail',
      'new-mission',
      'calendar',
      'recovery-requests',
      'profile',
      'notifications',
    ],
    actions: [
      'requests.createOnBehalf',
      'requests.viewAll',
      'missions.createOnBehalf',
      'missions.viewAll',
      'calendar.viewTeam',
      'recovery.validate',
      'approval.leaveStage2',
      'approval.missionStage1',
    ],
    dataScope: 'department',
  },

  RH: {
    sidebar: [
      'dashboard',
      'employees',
      'validations',
      'mission-validations',
      'requests',
      'missions',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    pages: [
      'dashboard',
      'employees',
      'employee-detail',
      'validations',
      'mission-validations',
      'requests',
      'request-detail',
      'new-request',
      'missions',
      'mission-detail',
      'new-mission',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    actions: [
      'employees.create',
      'employees.edit',
      'employees.viewBalances',
      'requests.createOnBehalf',
      'requests.viewAll',
      'missions.createOnBehalf',
      'missions.viewAll',
      'calendar.viewTeam',
      'recovery.validate',
      'recovery.creditManual',
      'settings.workingDays',
      'settings.holidays',
      'settings.recovery',
      'settings.departments',
      'settings.categories',
      'settings.missions',
      'balance-init.edit',
      'approval.leaveStage1',
      'approval.missionStage2',
    ],
    dataScope: 'all',
  },

  DIRECTEUR_EXECUTIF: {
    sidebar: [
      'dashboard',
      'employees',
      'validations',
      'mission-validations',
      'requests',
      'missions',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    pages: [
      'dashboard',
      'employees',
      'employee-detail',
      'validations',
      'mission-validations',
      'requests',
      'request-detail',
      'new-request',
      'missions',
      'mission-detail',
      'new-mission',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    actions: [
      'employees.create',
      'employees.edit',
      'employees.viewBalances',
      'requests.createOnBehalf',
      'requests.viewAll',
      'missions.createOnBehalf',
      'missions.viewAll',
      'calendar.viewTeam',
      'recovery.validate',
      'settings.departments',
      'settings.categories',
      'settings.missions',
      'balance-init.edit',
      'approval.leaveStage3',
      'approval.missionStage3',
    ],
    dataScope: 'all',
  },

  ADMIN: {
    sidebar: [
      'dashboard',
      'employees',
      'validations',
      'mission-validations',
      'requests',
      'missions',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    pages: [
      'dashboard',
      'employees',
      'employee-detail',
      'validations',
      'mission-validations',
      'requests',
      'request-detail',
      'new-request',
      'missions',
      'mission-detail',
      'new-mission',
      'calendar',
      'recovery-requests',
      'settings',
      'balance-init',
      'profile',
      'notifications',
    ],
    actions: [
      'employees.create',
      'employees.edit',
      'employees.delete',
      'employees.viewBalances',
      'requests.createOnBehalf',
      'requests.viewAll',
      'missions.createOnBehalf',
      'missions.viewAll',
      'calendar.viewTeam',
      'recovery.validate',
      'recovery.creditManual',
      'settings.workingDays',
      'settings.holidays',
      'settings.recovery',
      'settings.departments',
      'settings.categories',
      'settings.missions',
      'settings.permissions',
      'balance-init.edit',
      'approval.leaveStage1',
      'approval.leaveStage2',
      'approval.leaveStage3',
      'approval.missionStage1',
      'approval.missionStage2',
      'approval.missionStage3',
    ],
    dataScope: 'all',
  },
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Get the full permissions object for a role */
export function getPermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role]
}

/** Check if a role can see a sidebar item */
export function canSeeSidebar(role: UserRole, item: SidebarItem): boolean {
  return ROLE_PERMISSIONS[role].sidebar.includes(item)
}

/** Check if a role can access a page */
export function canAccessPage(role: UserRole, page: PageKey): boolean {
  return ROLE_PERMISSIONS[role].pages.includes(page)
}

/** Check if a role can perform an action */
export function canPerformAction(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role].actions.includes(action)
}

/** Check if role has manager-level data scope (department or all) */
export function hasManagerScope(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].dataScope !== 'own'
}

/** Get the data scope for a role */
export function getDataScope(role: UserRole): DataScope {
  return ROLE_PERMISSIONS[role].dataScope
}

/** Map URL pathname to PageKey */
export function pathnameToPageKey(pathname: string): PageKey | null {
  // Exact matches
  const exactMap: Record<string, PageKey> = {
    '/dashboard': 'dashboard',
    '/dashboard/employees': 'employees',
    '/dashboard/validations': 'validations',
    '/dashboard/mission-validations': 'mission-validations',
    '/dashboard/requests': 'requests',
    '/dashboard/new-request': 'new-request',
    '/dashboard/new-mission': 'new-mission',
    '/dashboard/missions': 'missions',
    '/dashboard/calendar': 'calendar',
    '/dashboard/recovery-requests': 'recovery-requests',
    '/dashboard/settings': 'settings',
    '/dashboard/balance-init': 'balance-init',
    '/dashboard/profile': 'profile',
    '/dashboard/notifications': 'notifications',
  }

  if (exactMap[pathname]) return exactMap[pathname]

  // Dynamic routes
  if (pathname.startsWith('/dashboard/employees/')) return 'employee-detail'
  if (pathname.startsWith('/dashboard/requests/')) return 'request-detail'
  if (pathname.startsWith('/dashboard/missions/')) return 'mission-detail'

  return null
}

/** Map URL pathname to SidebarItem (for nav highlighting) */
export function pathnameToSidebarItem(pathname: string): SidebarItem | null {
  const sidebarMap: Record<string, SidebarItem> = {
    '/dashboard': 'dashboard',
    '/dashboard/employees': 'employees',
    '/dashboard/validations': 'validations',
    '/dashboard/mission-validations': 'mission-validations',
    '/dashboard/requests': 'requests',
    '/dashboard/missions': 'missions',
    '/dashboard/calendar': 'calendar',
    '/dashboard/recovery-requests': 'recovery-requests',
    '/dashboard/settings': 'settings',
    '/dashboard/balance-init': 'balance-init',
    '/dashboard/profile': 'profile',
    '/dashboard/notifications': 'notifications',
  }

  if (sidebarMap[pathname]) return sidebarMap[pathname]

  // Sub-pages map to parent sidebar item
  if (pathname.startsWith('/dashboard/employees/')) return 'employees'
  if (pathname.startsWith('/dashboard/requests/') || pathname === '/dashboard/new-request') return 'requests'
  if (pathname.startsWith('/dashboard/missions/') || pathname === '/dashboard/new-mission') return 'missions'

  return null
}

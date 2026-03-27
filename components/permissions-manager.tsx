'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { useDbPermissions } from '@/lib/hooks/use-db-permissions'
import { UserRole } from '@/lib/types/database'
import {
  type SidebarItem,
  type PageKey,
  type Action,
  type DataScope,
  type RolePermissions,
  ROLE_PERMISSIONS,
} from '@/lib/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Save, RotateCcw, Loader2, Shield, Check, X, Lock } from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────

const ALL_ROLES: UserRole[] = ['EMPLOYEE', 'CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN']

const ROLE_LABELS: Record<UserRole, string> = {
  EMPLOYEE: 'Employe',
  CHEF_SERVICE: 'Chef de Service',
  RH: 'Ressources Humaines',
  DIRECTEUR_EXECUTIF: 'Directeur Executif',
  ADMIN: 'Administrateur',
}

const SIDEBAR_LABELS: Record<SidebarItem, string> = {
  dashboard: 'Tableau de bord',
  employees: 'Employes',
  validations: 'Validations conges',
  'mission-validations': 'Validations missions',
  requests: 'Demandes',
  missions: 'Missions',
  calendar: 'Calendrier',
  'recovery-requests': 'Recuperation',
  settings: 'Parametres',
  'balance-init': 'Init. Soldes',
  profile: 'Profil',
  notifications: 'Notifications',
}

const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  'dashboard', 'employees', 'validations', 'mission-validations',
  'requests', 'missions', 'calendar', 'recovery-requests',
  'settings', 'balance-init', 'profile', 'notifications',
]

const ACTION_GROUPS: { label: string; actions: { key: Action; label: string }[] }[] = [
  {
    label: 'Employes',
    actions: [
      { key: 'employees.create', label: 'Creer des employes' },
      { key: 'employees.edit', label: 'Modifier des employes' },
      { key: 'employees.delete', label: 'Supprimer des employes' },
      { key: 'employees.viewBalances', label: 'Voir les soldes' },
    ],
  },
  {
    label: 'Demandes de conge',
    actions: [
      { key: 'requests.createOnBehalf', label: 'Creer pour autrui' },
      { key: 'requests.viewAll', label: 'Voir toutes les demandes' },
    ],
  },
  {
    label: 'Missions',
    actions: [
      { key: 'missions.createOnBehalf', label: 'Creer pour autrui' },
      { key: 'missions.viewAll', label: 'Voir toutes les missions' },
    ],
  },
  {
    label: 'Calendrier',
    actions: [
      { key: 'calendar.viewTeam', label: "Voir l'equipe" },
    ],
  },
  {
    label: 'Recuperation',
    actions: [
      { key: 'recovery.validate', label: 'Valider les recuperations' },
      { key: 'recovery.creditManual', label: 'Crediter manuellement' },
    ],
  },
  {
    label: 'Parametres',
    actions: [
      { key: 'settings.workingDays', label: 'Jours ouvrables' },
      { key: 'settings.holidays', label: 'Jours feries' },
      { key: 'settings.recovery', label: 'Recuperation' },
      { key: 'settings.departments', label: 'Gerer les departements' },
      { key: 'settings.categories', label: 'Gerer les categories' },
      { key: 'settings.missions', label: 'Config missions (zones/tarifs)' },
      { key: 'settings.permissions', label: 'Gerer les permissions' },
    ],
  },
  {
    label: 'Init. Soldes',
    actions: [
      { key: 'balance-init.edit', label: 'Modifier les soldes initiaux' },
    ],
  },
  {
    label: 'Approbation conges',
    actions: [
      { key: 'approval.leaveStage1', label: 'Etape 1 (RH)' },
      { key: 'approval.leaveStage2', label: 'Etape 2 (Chef de Service)' },
      { key: 'approval.leaveStage3', label: 'Etape 3 (Directeur Executif)' },
    ],
  },
  {
    label: 'Approbation missions',
    actions: [
      { key: 'approval.missionStage1', label: 'Etape 1 (Chef de Service)' },
      { key: 'approval.missionStage2', label: 'Etape 2 (RH)' },
      { key: 'approval.missionStage3', label: 'Etape 3 (Directeur Executif)' },
    ],
  },
]

const DATA_SCOPE_OPTIONS: { value: DataScope; label: string }[] = [
  { value: 'own', label: 'Propres donnees' },
  { value: 'department', label: 'Departement' },
  { value: 'all', label: 'Toutes les donnees' },
]

// ─── Component ──────────────────────────────────────────────

export function PermissionsManager() {
  const { activeCompany } = useCompanyContext()
  const { reload } = useDbPermissions()

  const [selectedRole, setSelectedRole] = useState<UserRole>('EMPLOYEE')
  const [editState, setEditState] = useState<Record<UserRole, RolePermissions>>({ ...ROLE_PERMISSIONS })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load current permissions from DB via API route (bypasses RLS)
  const loadFromDb = useCallback(async () => {
    if (!activeCompany) return
    setLoading(true)
    try {
      const res = await fetch(`/api/role-permissions?company_id=${activeCompany.id}`)
      const data = await res.json()

      if (!res.ok) {
        console.error('Load permissions error:', data.error)
        setEditState({ ...ROLE_PERMISSIONS })
        return
      }

      const state = { ...ROLE_PERMISSIONS }
      if (Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          state[row.role as UserRole] = {
            sidebar: row.sidebar as SidebarItem[],
            pages: row.pages as PageKey[],
            actions: row.actions as Action[],
            dataScope: row.data_scope as DataScope,
          }
        }
      }
      setEditState(state)
    } catch (err) {
      console.error('Load permissions error:', err)
      setEditState({ ...ROLE_PERMISSIONS })
    } finally {
      setLoading(false)
    }
  }, [activeCompany])

  useEffect(() => {
    loadFromDb()
  }, [loadFromDb])

  // Map sidebar items to their related sub-pages
  const SIDEBAR_SUB_PAGES: Partial<Record<SidebarItem, PageKey[]>> = {
    requests: ['request-detail', 'new-request'],
    employees: ['employee-detail'],
    missions: ['mission-detail', 'new-mission'],
  }

  // Toggle helpers
  const toggleSidebar = (item: SidebarItem) => {
    setEditState(prev => {
      const perms = { ...prev[selectedRole] }
      const list = [...perms.sidebar]
      const idx = list.indexOf(item)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(item)
      perms.sidebar = list

      const subPages = SIDEBAR_SUB_PAGES[item] || []
      if (idx >= 0) {
        // Removed: also remove matching page + sub-pages
        perms.pages = perms.pages.filter(p => p !== item && !subPages.includes(p))
      } else {
        // Added: also add matching page + sub-pages
        const toAdd = [item as PageKey, ...subPages].filter(p => !perms.pages.includes(p))
        perms.pages = [...perms.pages, ...toAdd]
      }
      return { ...prev, [selectedRole]: perms }
    })
  }

  const toggleAction = (action: Action) => {
    // Prevent removing settings.permissions from ADMIN (bootstrap protection)
    if (action === 'settings.permissions' && selectedRole === 'ADMIN') {
      const currentlyEnabled = editState[selectedRole].actions.includes(action)
      if (currentlyEnabled) {
        toast.error('Impossible de retirer "Gerer les permissions" du role Administrateur')
        return
      }
    }

    setEditState(prev => {
      const perms = { ...prev[selectedRole] }
      const list = [...perms.actions]
      const idx = list.indexOf(action)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(action)
      perms.actions = list
      return { ...prev, [selectedRole]: perms }
    })
  }

  const setDataScope = (scope: DataScope) => {
    setEditState(prev => {
      const perms = { ...prev[selectedRole], dataScope: scope }
      return { ...prev, [selectedRole]: perms }
    })
  }

  // Ensure ADMIN always retains settings.permissions before sending to API
  const ensureAdminBootstrap = (perms: RolePermissions, role: UserRole): RolePermissions => {
    if (role === 'ADMIN' && !perms.actions.includes('settings.permissions')) {
      return { ...perms, actions: [...perms.actions, 'settings.permissions'] }
    }
    return perms
  }

  // Save
  const handleSave = async () => {
    if (!activeCompany) return
    setSaving(true)
    try {
      const perms = ensureAdminBootstrap(editState[selectedRole], selectedRole)
      const res = await fetch('/api/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: activeCompany.id,
          role: selectedRole,
          sidebar: perms.sidebar,
          pages: perms.pages,
          actions: perms.actions,
          data_scope: perms.dataScope,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Save failed')
      toast.success(`Permissions du role "${ROLE_LABELS[selectedRole]}" enregistrees`)
      await reload()
      await loadFromDb()
    } catch (err) {
      console.error('Save permissions error:', err)
      toast.error('Erreur lors de la sauvegarde des permissions')
    } finally {
      setSaving(false)
    }
  }

  // Save all roles at once
  const handleSaveAll = async () => {
    if (!activeCompany) return
    setSaving(true)
    try {
      const rows = ALL_ROLES.map(role => {
        const perms = ensureAdminBootstrap(editState[role], role)
        return {
          company_id: activeCompany.id,
          role,
          sidebar: perms.sidebar,
          pages: perms.pages,
          actions: perms.actions,
          data_scope: perms.dataScope,
        }
      })
      const res = await fetch('/api/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Save failed')
      toast.success('Toutes les permissions ont ete enregistrees')
      await reload()
      await loadFromDb()
    } catch (err) {
      console.error('Save all permissions error:', err)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // Reset selected role to static defaults
  const handleReset = () => {
    setEditState(prev => ({
      ...prev,
      [selectedRole]: { ...ROLE_PERMISSIONS[selectedRole] },
    }))
    toast.success(`Permissions de "${ROLE_LABELS[selectedRole]}" reinitialises aux valeurs par defaut`)
  }

  const currentPerms = editState[selectedRole]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Role selector */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Selectionner un role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all border ${
                  selectedRole === role
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sidebar permissions */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Menu lateral (Sidebar)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Elements visibles dans le menu pour le role <strong>{ROLE_LABELS[selectedRole]}</strong>
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ALL_SIDEBAR_ITEMS.map(item => {
              const enabled = currentPerms.sidebar.includes(item)
              return (
                <button
                  key={item}
                  onClick={() => toggleSidebar(item)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                    enabled
                      ? 'border-primary/30 bg-primary/5 text-foreground'
                      : 'border-border/50 bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {enabled ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <X className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="truncate">{SIDEBAR_LABELS[item]}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Actions permissions */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Actions autorisees
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Operations que le role <strong>{ROLE_LABELS[selectedRole]}</strong> peut effectuer
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {ACTION_GROUPS.map(group => (
              <div key={group.label}>
                <h4 className="mb-2 text-sm font-semibold text-foreground">{group.label}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.actions.map(({ key, label }) => {
                    const enabled = currentPerms.actions.includes(key)
                    const isLocked = key === 'settings.permissions' && selectedRole === 'ADMIN'
                    return (
                      <button
                        key={key}
                        onClick={() => toggleAction(key)}
                        disabled={isLocked}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                          isLocked
                            ? 'border-primary/30 bg-primary/10 text-foreground cursor-not-allowed opacity-80'
                            : enabled
                              ? 'border-primary/30 bg-primary/5 text-foreground'
                              : 'border-border/50 bg-muted/30 text-muted-foreground'
                        }`}
                      >
                        {isLocked ? (
                          <Lock className="h-4 w-4 shrink-0 text-primary" />
                        ) : enabled ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        )}
                        <span className="truncate">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data scope */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Portee des donnees
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Quelles donnees le role <strong>{ROLE_LABELS[selectedRole]}</strong> peut voir
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {DATA_SCOPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDataScope(opt.value)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                  currentPerms.dataScope === opt.value
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer "{ROLE_LABELS[selectedRole]}"
        </Button>
        <Button onClick={handleSaveAll} disabled={saving} variant="outline">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer tous les roles
        </Button>
        <Button onClick={handleReset} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" />
          Reinitialiser par defaut
        </Button>
      </div>

      {/* Overview matrix */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Apercu des permissions (tous les roles)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Menu</th>
                {ALL_ROLES.map(role => (
                  <th key={role} className="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">
                    {ROLE_LABELS[role].split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_SIDEBAR_ITEMS.map(item => (
                <tr key={item} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-foreground">{SIDEBAR_LABELS[item]}</td>
                  {ALL_ROLES.map(role => (
                    <td key={role} className="px-2 py-2 text-center">
                      {editState[role].sidebar.includes(item) ? (
                        <Check className="mx-auto h-4 w-4 text-primary" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/30" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="py-2 pr-4 font-medium text-foreground">Portee</td>
                {ALL_ROLES.map(role => (
                  <td key={role} className="px-2 py-2 text-center">
                    <Badge variant="secondary" className="text-xs">
                      {editState[role].dataScope}
                    </Badge>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

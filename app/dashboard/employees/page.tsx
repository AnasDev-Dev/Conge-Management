'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight, LayoutGrid, List, Search, User, UserPlus, Users } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { PageGuard } from '@/components/role-gate'
import { AddEmployeeDialog } from '@/components/add-employee-dialog'
import { calculateSeniority, calculateMonthlyAccrual, roundHalf } from '@/lib/leave-utils'

type EmployeeRow = Pick<
  Utilisateur,
  'id' | 'full_name' | 'email' | 'job_title' | 'role' | 'is_active' | 'balance_conge' | 'balance_recuperation' | 'hire_date' | 'gender'
> & {
  departments?: { annual_leave_days: number }[] | { annual_leave_days: number } | null
}

type LeaveRow = Pick<LeaveRequest, 'id' | 'user_id' | 'status' | 'days_count' | 'created_at' | 'request_type' | 'start_date'>

type EmployeeSummary = {
  totalRequests: number
  approvedDays: number
  pendingRequests: number
}

const approvedStatuses = new Set(['APPROVED'])
const pendingStatuses = new Set(['PENDING', 'VALIDATED_DC', 'VALIDATED_RP'])

const roleKeywords: Record<string, string[]> = {
  EMPLOYEE: ['employe', 'employee', 'collaborateur', 'staff'],
  CHEF_SERVICE: ['chef', 'manager', 'service', 'responsable'],
  RH: ['rh', 'hr', 'personnel', 'ressources', 'humaines'],
  DIRECTEUR_EXECUTIF: ['directeur', 'executif', 'direction'],
  ADMIN: ['admin', 'administrateur', 'administration'],
}

const roleChipClass: Partial<Record<Utilisateur['role'], string>> = {
  EMPLOYEE: 'border-[#cfdacb] bg-[#ecf3e8] text-[#46604a]',
  CHEF_SERVICE: 'border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]',
  RH: 'border-[#cde1d8] bg-[#e8f3ee] text-[#3e6756]',
  DIRECTEUR_EXECUTIF: 'border-[#e4d3c8] bg-[#f6ebe4] text-[#6b4c3b]',
  ADMIN: 'border-[#d8dade] bg-[#eff1f3] text-[#4e5661]',
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildSearchIndex(employee: EmployeeRow, summary: EmployeeSummary): string {
  const activeWords = employee.is_active ? ['actif', 'active'] : ['inactif', 'inactive', 'disabled']
  const metrics = [
    String(employee.balance_conge),
    String(employee.balance_recuperation),
    String(summary.totalRequests),
    String(summary.approvedDays),
    String(summary.pendingRequests),
    'conge',
    'conges',
    'recuperation',
    'solde',
    'jours',
    'en attente',
  ]

  return normalizeText(
    [
      employee.full_name,
      employee.email,
      employee.job_title,
      employee.role,
      ...roleKeywords[employee.role],
      ...activeWords,
      ...metrics,
    ].join(' ')
  )
}

function getRoleChipClasses(role: Utilisateur['role']) {
  return roleChipClass[role] || 'border-border/70 bg-secondary/50 text-foreground'
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [requests, setRequests] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const { user: currentUser } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(currentUser?.role || 'EMPLOYEE')
  const canCreateEmployee = currentUser && can('employees.create')
  const canViewBalances = can('employees.viewBalances')

  const loadData = useCallback(async () => {
    try {
      let empQuery = supabase
        .from('utilisateurs')
        .select('id, full_name, email, job_title, role, is_active, balance_conge, balance_recuperation, hire_date, gender, company_id, departments(annual_leave_days)')
        .order('full_name')

      // Filter by active company if set
      if (activeCompany) {
        empQuery = empQuery.eq('company_id', activeCompany.id)
      }

      // First fetch employees, then fetch only their leave requests
      const { data: employeeData, error: employeeError } = await empQuery
      if (employeeError) throw employeeError

      const empIds = (employeeData || []).map((e: { id: string }) => e.id)
      let requestData: LeaveRow[] = []
      let requestError = null

      if (empIds.length > 0) {
        const result = await supabase
          .from('leave_requests')
          .select('id, user_id, status, days_count, created_at, request_type, start_date, balance_conge_used')
          .in('user_id', empIds)
        requestData = (result.data || []) as LeaveRow[]
        requestError = result.error
      }

      if (employeeError) throw employeeError
      if (requestError) throw requestError

      setEmployees((employeeData || []) as EmployeeRow[])
      setRequests((requestData || []) as LeaveRow[])
    } catch (error) {
      console.error('Error loading employees data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, activeCompany])

  useEffect(() => {
    loadData()
  }, [loadData])

  const summaryByUser = useMemo(() => {
    const summary = new Map<string, EmployeeSummary>()

    for (const request of requests) {
      const current = summary.get(request.user_id) || { totalRequests: 0, approvedDays: 0, pendingRequests: 0 }
      current.totalRequests += 1
      if (approvedStatuses.has(request.status)) {
        current.approvedDays += request.days_count || 0
      }
      if (pendingStatuses.has(request.status)) {
        current.pendingRequests += 1
      }
      summary.set(request.user_id, current)
    }

    return summary
  }, [requests])

  // CONGE usage per user for current year (for accurate balance display)
  // Uses balance_conge_used (actual congé portion) to handle mixed requests correctly
  const congeUsageByUser = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const usage = new Map<string, { used: number; pending: number }>()

    for (const request of requests) {
      if (new Date(request.start_date).getFullYear() !== currentYear) continue
      // Use balance_conge_used if available (handles mixed requests), otherwise days_count for pure CONGE
      const congeAmount = (request as Record<string, unknown>).balance_conge_used as number | null
      const amount = congeAmount ?? (request.request_type === 'CONGE' ? request.days_count : 0)
      if (amount <= 0) continue

      const current = usage.get(request.user_id) || { used: 0, pending: 0 }
      if (approvedStatuses.has(request.status)) {
        current.used += amount
      }
      if (pendingStatuses.has(request.status)) {
        current.pending += amount
      }
      usage.set(request.user_id, current)
    }

    return usage
  }, [requests])

  // RECUPERATION pending usage per user (to subtract from displayed balance)
  const recupPendingByUser = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const pending = new Map<string, number>()

    for (const request of requests) {
      if (new Date(request.start_date).getFullYear() !== currentYear) continue
      if (!pendingStatuses.has(request.status)) continue
      const recupAmount = (request as Record<string, unknown>).balance_recuperation_used as number | null
      const amount = recupAmount ?? (request.request_type === 'RECUPERATION' ? request.days_count : 0)
      if (amount <= 0) continue
      pending.set(request.user_id, (pending.get(request.user_id) || 0) + amount)
    }
    return pending
  }, [requests])

  const filteredEmployees = useMemo(() => {
    const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return employees

    return employees.filter((employee) => {
      const summary = summaryByUser.get(employee.id) || { totalRequests: 0, approvedDays: 0, pendingRequests: 0 }
      const index = buildSearchIndex(employee, summary)
      return tokens.every((token) => index.includes(token))
    })
  }, [employees, searchTerm, summaryByUser])

  return (
    <PageGuard userRole={currentUser?.role || 'EMPLOYEE'} page="employees">
    <div className="flex min-h-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Employés</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Consultez les collaborateurs et leurs historiques de congés.</p>
      </div>

      {/* Search + Add bar */}
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Users className="h-4.5 w-4.5 text-primary" />
          Liste des employés
          {searchTerm && (
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-normal text-primary">
              {filteredEmployees.length} résultats
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-[22rem]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Recherche: nom, rôle, email, solde..."
              className="pl-11"
            />
          </div>
          <div className="hidden sm:flex items-center rounded-lg border border-border/70 p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`rounded-md p-1.5 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-md p-1.5 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {canCreateEmployee && (
            <Button onClick={() => setAddDialogOpen(true)} size="sm" className="shrink-0">
              <UserPlus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Nouvel employé</span>
            </Button>
          )}
        </div>
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/70 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-11 w-11 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 rounded-lg" />
                <Skeleton className="h-12 rounded-lg" />
              </div>
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Aucun employé trouvé.</div>
      ) : viewMode === 'table' ? (
        /* ── TABLE VIEW ── */
        <div className="overflow-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[800px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-secondary">
              <tr className="text-left text-xs uppercase tracking-[0.08em] text-foreground/85">
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Employé</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Rôle</th>
                {canViewBalances && <th className="whitespace-nowrap px-4 py-3 font-semibold">Solde</th>}
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Congé pris</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">En attente</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => {
                const employeeSummary = summaryByUser.get(employee.id) || {
                  totalRequests: 0,
                  approvedDays: 0,
                  pendingRequests: 0,
                }
                const isFemale = employee.gender === 'F'

                return (
                  <tr key={employee.id} className="soft-row">
                    <td className="border-b border-border/45 px-4 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isFemale ? 'bg-rose-100' : 'bg-sky-100'}`}>
                          <User className={`h-4 w-4 ${isFemale ? 'text-rose-500' : 'text-sky-500'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{employee.full_name}</p>
                          <p className="text-xs text-muted-foreground">{employee.email || 'Email non renseigné'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border/45 px-4 py-3 align-middle">
                      <Badge variant="secondary" className={`border ${getRoleChipClasses(employee.role)}`}>
                        {employee.role}
                      </Badge>
                    </td>
                    {canViewBalances && (
                      <td className="border-b border-border/45 px-4 py-3 text-sm text-muted-foreground align-middle">
                        {(() => {
                          const deptDays = Array.isArray(employee.departments)
                            ? (employee.departments as unknown as { annual_leave_days: number }[])[0]?.annual_leave_days
                            : employee.departments?.annual_leave_days
                          const seniority = calculateSeniority(employee.hire_date ?? null, deptDays)
                          const empUsage = congeUsageByUser.get(employee.id) || { used: 0, pending: 0 }
                          const accrual = calculateMonthlyAccrual(seniority.totalEntitlement, employee.balance_conge, empUsage.used, empUsage.pending)
                          return (
                            <p className="text-sm">
                              <span className="font-semibold text-foreground">{accrual.availableNow}j</span>
                              <span className="text-muted-foreground"> congé · {roundHalf(Math.max(employee.balance_recuperation - (recupPendingByUser.get(employee.id) || 0), 0))}j récup</span>
                            </p>
                          )
                        })()}
                      </td>
                    )}
                    <td className="whitespace-nowrap border-b border-border/45 px-4 py-3 align-middle">
                      <span className="font-semibold text-primary">{employeeSummary.approvedDays} jours</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-border/45 px-4 py-3 align-middle">
                      <span className="font-semibold text-[var(--status-pending-text)]">{employeeSummary.pendingRequests}</span>
                    </td>
                    <td className="border-b border-border/45 px-4 py-3 text-right align-middle">
                      <Link href={`/dashboard/employees/${employee.id}`}>
                        <Button variant="outline" size="sm">
                          Voir détails
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── CARDS VIEW ── */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((employee) => {
            const employeeSummary = summaryByUser.get(employee.id) || {
              totalRequests: 0,
              approvedDays: 0,
              pendingRequests: 0,
            }

            // Balance calculations
            const deptDays = Array.isArray(employee.departments)
              ? (employee.departments as unknown as { annual_leave_days: number }[])[0]?.annual_leave_days
              : employee.departments?.annual_leave_days
            const seniority = calculateSeniority(employee.hire_date ?? null, deptDays)
            const empUsage = congeUsageByUser.get(employee.id) || { used: 0, pending: 0 }
            const accrual = calculateMonthlyAccrual(seniority.totalEntitlement, employee.balance_conge, empUsage.used, empUsage.pending)
            const recup = roundHalf(Math.max(employee.balance_recuperation - (recupPendingByUser.get(employee.id) || 0), 0))

            // Progress bar percentages
            const congeTotal = accrual.carryOver + accrual.cumulativeEarned
            const congePct = congeTotal > 0 ? Math.min((accrual.availableNow / congeTotal) * 100, 100) : 0

            // Avatar styling by gender
            const isFemale = employee.gender === 'F'
            const avatarBg = isFemale ? 'bg-rose-100' : 'bg-sky-100'
            const avatarIconColor = isFemale ? 'text-rose-500' : 'text-sky-500'

            return (
              <div
                key={employee.id}
                className="group relative rounded-2xl border border-border/70 bg-card p-5 transition-shadow hover:shadow-md"
              >
                {/* Header: name + email left, avatar right */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{employee.full_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{employee.email || 'Email non renseigné'}</p>
                    <Badge variant="secondary" className={`mt-2 border text-[11px] ${getRoleChipClasses(employee.role)}`}>
                      {employee.role}
                    </Badge>
                  </div>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${avatarBg}`}>
                    <User className={`h-5 w-5 ${avatarIconColor}`} />
                  </div>
                </div>

                {/* Balance bars */}
                {canViewBalances && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-muted-foreground">Congé</span>
                        <span className="text-sm font-bold text-foreground">{accrual.availableNow}j</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${congePct}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-muted-foreground">Récup</span>
                        <span className="text-sm font-bold text-foreground">{recup}j</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${recup > 0 ? Math.min(recup * 10, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Pris </span>
                    <span className="font-semibold text-primary">{employeeSummary.approvedDays}j</span>
                  </div>
                  <div className="h-3 w-px bg-border" />
                  <div>
                    <span className="text-muted-foreground">En attente </span>
                    <span className="font-semibold text-[var(--status-pending-text)]">{employeeSummary.pendingRequests}</span>
                  </div>
                </div>

                {/* Action button */}
                <Link href={`/dashboard/employees/${employee.id}`} className="mt-3 block">
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                    Voir détails
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {canCreateEmployee && (
        <AddEmployeeDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onCreated={loadData} />
      )}
    </div>
    </PageGuard>
  )
}

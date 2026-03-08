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
import { Calendar, ChevronRight, Clock, Search, UserPlus, Users } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { PageGuard } from '@/components/role-gate'
import { AddEmployeeDialog } from '@/components/add-employee-dialog'

type EmployeeRow = Pick<
  Utilisateur,
  'id' | 'full_name' | 'email' | 'job_title' | 'role' | 'is_active' | 'balance_conge' | 'balance_recuperation'
>

type LeaveRow = Pick<LeaveRequest, 'id' | 'user_id' | 'status' | 'days_count' | 'created_at'>

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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const { user: currentUser } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(currentUser?.role || 'EMPLOYEE')
  const canCreateEmployee = currentUser && can('employees.create')

  const loadData = useCallback(async () => {
    try {
      let empQuery = supabase
        .from('utilisateurs')
        .select('id, full_name, email, job_title, role, is_active, balance_conge, balance_recuperation, company_id')
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
          .select('id, user_id, status, days_count, created_at')
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

  const filteredEmployees = useMemo(() => {
    const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return employees

    return employees.filter((employee) => {
      const summary = summaryByUser.get(employee.id) || { totalRequests: 0, approvedDays: 0, pendingRequests: 0 }
      const index = buildSearchIndex(employee, summary)
      return tokens.every((token) => index.includes(token))
    })
  }, [employees, searchTerm, summaryByUser])

  const activeEmployees = employees.filter((employee) => employee.is_active).length
  const totalApprovedDays = Array.from(summaryByUser.values()).reduce((sum, user) => sum + user.approvedDays, 0)

  const pendingTotal = Array.from(summaryByUser.values()).reduce((sum, user) => sum + user.pendingRequests, 0)

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Employés</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Consultez les collaborateurs et leurs historiques de congés.</p>
      </div>

      {/* KPI cards */}
      <div className="shrink-0 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{activeEmployees}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Actifs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 sm:flex">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{totalApprovedDays}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Congé pris</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 sm:flex">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{pendingTotal}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">En attente</p>
          </div>
        </div>
      </div>

      <Card className="flex min-h-0 flex-col border-border/70 bg-card shadow-none backdrop-blur-none md:flex-1 md:sticky md:top-0 md:h-[calc(100dvh-12.5rem)] lg:h-[calc(100dvh-11rem)]">
        <CardHeader className="shrink-0 border-b border-border/70 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4.5 w-4.5 text-primary" />
              Liste des employés
              {searchTerm && (
                <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-normal text-primary">
                  {filteredEmployees.length} résultats
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-[24rem]">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Recherche: nom, rôle, email, solde..."
                  className="pl-11"
                />
              </div>
              {canCreateEmployee && (
                <Button onClick={() => setAddDialogOpen(true)} size="sm" className="shrink-0">
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Nouvel employé</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 pt-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/70 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Aucun employé trouvé.</div>
          ) : (
            <>
              <div className="hidden h-full min-h-0 md:block">
                <div className="h-full overflow-auto rounded-2xl border border-border/70 overscroll-contain">
                  <table className="w-full min-w-[900px] border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-secondary">
                      <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.08em] text-foreground/85">
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Employé</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Rôle</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Solde</th>
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

                        return (
                          <tr key={employee.id} className="soft-row">
                            <td className="border-b border-border/45 px-4 py-3.5 align-top">
                              <p className="font-medium text-foreground">{employee.full_name}</p>
                              <p className="text-xs text-muted-foreground">{employee.email || 'Email non renseigné'}</p>
                            </td>
                            <td className="border-b border-border/45 px-4 py-3.5 align-top">
                              <Badge variant="secondary" className={`border ${getRoleChipClasses(employee.role)}`}>
                                {employee.role}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{employee.balance_conge}</span> congé /{' '}
                              <span className="font-medium text-foreground">{employee.balance_recuperation}</span> récup.
                            </td>
                            <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                              <span className="font-semibold text-primary">{employeeSummary.approvedDays} jours</span>
                            </td>
                            <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                              <span className="font-semibold text-[var(--status-pending-text)]">{employeeSummary.pendingRequests}</span>
                            </td>
                            <td className="border-b border-border/45 px-4 py-3.5 text-right align-top">
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
              </div>

              <div className="md:hidden">
                <div className="space-y-3">
                  {filteredEmployees.map((employee) => {
                    const employeeSummary = summaryByUser.get(employee.id) || {
                      totalRequests: 0,
                      approvedDays: 0,
                      pendingRequests: 0,
                    }

                    return (
                      <div key={employee.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{employee.full_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{employee.email || 'Email non renseigné'}</p>
                          </div>
                          <Badge variant="secondary" className={`border ${getRoleChipClasses(employee.role)}`}>
                            {employee.role}
                          </Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-secondary/60 p-2.5">
                            <p className="text-xs text-muted-foreground">Congé pris</p>
                            <p className="font-semibold text-primary">{employeeSummary.approvedDays} jours</p>
                          </div>
                          <div className="rounded-xl bg-secondary/60 p-2.5">
                            <p className="text-xs text-muted-foreground">En attente</p>
                            <p className="font-semibold text-[var(--status-pending-text)]">{employeeSummary.pendingRequests}</p>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          Solde: {employee.balance_conge} congé / {employee.balance_recuperation} récupération
                        </p>

                        <Link href={`/dashboard/employees/${employee.id}`} className="mt-3 block">
                          <Button variant="outline" className="w-full">
                            Voir les congés
                          </Button>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canCreateEmployee && (
        <AddEmployeeDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onCreated={loadData} />
      )}
    </div>
  )
}

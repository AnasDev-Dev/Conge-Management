'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Calendar,
  Search,
  Save,
  Loader2,
} from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { PageGuard } from '@/components/role-gate'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { calculateSeniority, calculateMonthlyAccrual, roundHalf } from '@/lib/leave-utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

type EmployeeWithDept = Pick<
  Utilisateur,
  'id' | 'full_name' | 'job_title' | 'hire_date' | 'date_anciennete' | 'balance_conge' | 'department_id'
> & {
  departments: { name: string; annual_leave_days: number } | null
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export default function BalanceInitPage() {
  const { user } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(user?.role || 'EMPLOYEE')
  const canEditBalance = can('balance-init.edit')
  const [employees, setEmployees] = useState<EmployeeWithDept[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [balanceEdits, setBalanceEdits] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Track used/pending CONGE days per employee for monthly accrual display
  const [usageByUser, setUsageByUser] = useState<Map<string, { used: number; pending: number }>>(new Map())

  const companyId = activeCompany?.id ?? user?.company_id

  const loadEmployees = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear()
      let empQuery = supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, hire_date, date_anciennete, balance_conge, department_id, departments(name, annual_leave_days)')
        .eq('is_active', true)
        .order('full_name')
      if (companyId) empQuery = empQuery.eq('company_id', companyId)
      const [{ data, error }, { data: requestData }] = await Promise.all([
        empQuery,
        supabase
          .from('leave_requests')
          .select('user_id, status, days_count, request_type')
          .eq('request_type', 'CONGE')
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`),
      ])

      if (error) throw error
      const normalized = (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        departments: Array.isArray(row.departments) ? row.departments[0] || null : row.departments,
      })) as EmployeeWithDept[]
      setEmployees(normalized)

      // Build usage map
      const usage = new Map<string, { used: number; pending: number }>()
      for (const req of requestData || []) {
        const current = usage.get(req.user_id) || { used: 0, pending: 0 }
        if (req.status === 'APPROVED') {
          current.used += req.days_count || 0
        } else if (['PENDING', 'VALIDATED_RP', 'VALIDATED_DC'].includes(req.status)) {
          current.pending += req.days_count || 0
        }
        usage.set(req.user_id, current)
      }
      setUsageByUser(usage)
    } catch (error) {
      console.error('Error loading employees:', error)
      toast.error('Erreur lors du chargement des employés')
    } finally {
      setLoading(false)
    }
  }, [supabase, companyId])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  const hasEdits = balanceEdits.size > 0

  const handleBalanceChange = (empId: string, value: string) => {
    const num = parseFloat(value)
    setBalanceEdits((prev) => {
      const next = new Map(prev)
      if (value === '' || isNaN(num)) {
        next.delete(empId)
      } else {
        next.set(empId, num)
      }
      return next
    })
  }

  const saveBalanceEdits = async () => {
    if (balanceEdits.size === 0) return
    setSaving(true)
    try {
      const updates = Array.from(balanceEdits.entries()).map(async ([id, balance]) => {
        const res = await fetch(`/api/employees/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance_conge: balance }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Erreur ${res.status}`)
        }
        return id
      })
      const results = await Promise.allSettled(updates)
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length > 0) {
        toast.error(`Erreur lors de la sauvegarde de ${failed.length} solde(s)`)
        return
      }
      // Update local state
      setEmployees((prev) =>
        prev.map((emp) => {
          const newBalance = balanceEdits.get(emp.id)
          return newBalance !== undefined ? { ...emp, balance_conge: newBalance } : emp
        })
      )
      const count = balanceEdits.size
      setBalanceEdits(new Map())
      toast.success(`${count} solde(s) mis à jour`)
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const seniorityMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateSeniority>>()
    for (const emp of employees) {
      const deptDays = emp.departments?.annual_leave_days
      map.set(emp.id, calculateSeniority(emp.hire_date, deptDays, null, emp.date_anciennete))
    }
    return map
  }, [employees])

  // Monthly accrual info per employee (entitlement from dept + seniority, carry-over from balance_conge)
  const accrualMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateMonthlyAccrual>>()
    for (const emp of employees) {
      const usage = usageByUser.get(emp.id) || { used: 0, pending: 0 }
      const seniority = seniorityMap.get(emp.id)
      const annualEntitlement = seniority?.totalEntitlement ?? 18
      const carryOver = emp.balance_conge // now means solde antérieur
      map.set(emp.id, calculateMonthlyAccrual(annualEntitlement, carryOver, usage.used, usage.pending))
    }
    return map
  }, [employees, usageByUser, seniorityMap])

  const filteredEmployees = useMemo(() => {
    const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return employees

    return employees.filter((emp) => {
      const seniority = seniorityMap.get(emp.id)
      const index = normalizeText(
        [emp.full_name, emp.job_title, emp.departments?.name, emp.hire_date, String(emp.balance_conge), String(seniority?.totalEntitlement)].join(' ')
      )
      return tokens.every((t) => index.includes(t))
    })
  }, [employees, searchTerm, seniorityMap])

  // Shared sticky-column classes
  const stickyColBase = 'sticky left-0 z-[5] after:absolute after:-right-[6px] after:top-0 after:bottom-0 after:w-[6px] after:bg-gradient-to-r after:from-black/[0.06] after:to-transparent after:pointer-events-none dark:after:from-black/20'

  return (
    <PageGuard userRole={user?.role || 'EMPLOYEE'} page="balance-init">
    <div className="flex min-h-full flex-col gap-3 sm:gap-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
          Reports & Soldes
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm md:text-base">
          Saisissez le solde antérieur de l&apos;année précédente. La dotation annuelle est calculée automatiquement depuis le département.
        </p>
      </div>

      {/* Search + Save bar */}
      <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="hidden h-4 w-4 text-primary sm:block" />
          <span className="text-sm font-medium text-foreground">
            Soldes {new Date().getFullYear()}
          </span>
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {filteredEmployees.length} employé(s)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-[18rem] sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher..."
              className="h-9 pl-9 text-sm"
            />
          </div>
          {canEditBalance && hasEdits && (
            <Button
              size="sm"
              onClick={saveBalanceEdits}
              disabled={saving}
              className="h-9 gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer ({balanceEdits.size})
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3 px-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-12 w-36 rounded-xl" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">Aucun employé trouvé.</div>
      ) : (
        <>
          {/* ── Mobile cards ── */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filteredEmployees.map((emp) => {
              const seniority = seniorityMap.get(emp.id)!

              return (
                <div
                  key={emp.id}
                  className="rounded-2xl border border-border/70 bg-background/80 p-3.5"
                >
                  {/* Name row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground text-sm">{emp.full_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{emp.job_title || '—'}</p>
                    </div>
                    {emp.departments?.name && (
                      <span className="inline-flex shrink-0 max-w-[100px] truncate rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {emp.departments.name}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  {(() => {
                    const accrual = accrualMap.get(emp.id)!
                    return (
                      <div className="mt-2.5 space-y-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg bg-blue-50/60 px-2 py-1.5 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/20 dark:ring-blue-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-blue-500 dark:text-blue-400">Ancienneté</p>
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                              {seniority.yearsOfService > 0 ? `${seniority.yearsOfService.toFixed(1)} an` : '—'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-violet-50/60 px-2 py-1.5 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/20 dark:ring-violet-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-violet-500 dark:text-violet-400">Dotation annuelle</p>
                            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{seniority.totalEntitlement} j</p>
                          </div>
                          <div className="rounded-lg bg-amber-50/60 px-2 py-1.5 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/20 dark:ring-amber-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-amber-500 dark:text-amber-400">Solde antérieur</p>
                            {canEditBalance ? (
                              <Input
                                type="number"
                                step="0.5"
                                value={balanceEdits.has(emp.id) ? balanceEdits.get(emp.id) : emp.balance_conge}
                                onChange={(e) => handleBalanceChange(emp.id, e.target.value)}
                                className="h-6 w-full border-amber-200 bg-white/80 px-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            ) : (
                              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{roundHalf(emp.balance_conge)} j</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="rounded-lg bg-emerald-50/60 px-2 py-1.5 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/20 dark:ring-emerald-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-emerald-500 dark:text-emerald-400">/mois</p>
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{accrual.monthlyRate} j</p>
                          </div>
                          <div className="rounded-lg bg-teal-50/60 px-2 py-1.5 ring-1 ring-inset ring-teal-100 dark:bg-teal-950/20 dark:ring-teal-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-teal-500 dark:text-teal-400">Cumulé</p>
                            <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">{accrual.cumulativeEarned} j</p>
                          </div>
                          <div className="rounded-lg bg-cyan-50/60 px-2 py-1.5 ring-1 ring-inset ring-cyan-100 dark:bg-cyan-950/20 dark:ring-cyan-900/30">
                            <p className="text-[9px] uppercase tracking-wide text-cyan-500 dark:text-cyan-400">Disponible</p>
                            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{accrual.availableNow} j</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          {/* ── Desktop table with frozen first column ── */}
          <div className="hidden flex-1 md:block md:min-h-0">
            <div className="h-full overflow-auto rounded-2xl border border-border/70 overscroll-contain">
              <table className="w-full min-w-[1100px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className={`${stickyColBase} z-30 w-[220px] min-w-[180px] whitespace-nowrap border-b border-border/50 bg-muted px-4 py-3 font-semibold`}>
                      Employé
                    </th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold">Département</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold">Embauche</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Ancienneté</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Dotation annuelle</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Solde antérieur</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">/mois</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Cumulé</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, index) => {
                    const seniority = seniorityMap.get(emp.id)!
                    const isEven = index % 2 === 0

                    return (
                      <tr key={emp.id} className={`group transition-colors hover:bg-muted/40 ${isEven ? 'bg-card' : 'bg-muted/20'}`}>
                        {/* Frozen name column */}
                        <td className={`${stickyColBase} border-b border-border/30 px-4 py-3 align-middle ${isEven ? 'bg-card' : 'bg-muted'} group-hover:bg-muted`}>
                          <p className="font-medium text-foreground text-sm leading-tight">{emp.full_name}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{emp.job_title || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 align-middle">
                          <span className="inline-flex items-center rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {emp.departments?.name || '—'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 align-middle">
                          {emp.hire_date
                            ? (
                              <div>
                                <p className="text-sm text-muted-foreground leading-tight">
                                  {format(new Date(emp.hire_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                                </p>
                                {emp.date_anciennete && emp.date_anciennete !== emp.hire_date && (
                                  <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-tight mt-0.5">
                                    Anc. {format(new Date(emp.date_anciennete + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                                  </p>
                                )}
                              </div>
                            )
                            : <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/20">Non renseignée</span>
                          }
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                          {seniority.yearsOfService > 0
                            ? (
                              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-500/20">
                                {seniority.yearsOfService.toFixed(1)} an(s)
                              </span>
                            )
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                          <span className="inline-flex items-center rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/20">
                            {seniority.totalEntitlement} j
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                          {canEditBalance ? (
                            <Input
                              type="number"
                              step="0.5"
                              value={balanceEdits.has(emp.id) ? balanceEdits.get(emp.id) : emp.balance_conge}
                              onChange={(e) => handleBalanceChange(emp.id, e.target.value)}
                              className="mx-auto h-8 w-20 border-amber-200 bg-amber-50/50 text-center text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/20">
                              {roundHalf(emp.balance_conge)} j
                            </span>
                          )}
                        </td>
                        {(() => {
                          const accrual = accrualMap.get(emp.id)!
                          return (
                            <>
                              <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/20">
                                  {accrual.monthlyRate} j
                                </span>
                              </td>
                              <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                                <span className="inline-flex items-center rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-600/20 dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-500/20">
                                  {accrual.cumulativeEarned} j
                                </span>
                              </td>
                              <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-center align-middle">
                                <span className="inline-flex items-center rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-600/20 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-500/20">
                                  {accrual.availableNow} j
                                </span>
                              </td>
                            </>
                          )
                        })()}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </div>
    </PageGuard>
  )
}

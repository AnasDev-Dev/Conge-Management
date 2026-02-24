'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Calendar,
  Loader2,
  Save,
  Search,
} from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { calculateSeniority } from '@/lib/leave-utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

type EmployeeWithDept = Pick<
  Utilisateur,
  'id' | 'full_name' | 'job_title' | 'hire_date' | 'balance_conge' | 'department_id'
> & {
  departments: { name: string } | null
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
  const [employees, setEmployees] = useState<EmployeeWithDept[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [editedBalances, setEditedBalances] = useState<Map<string, number>>(new Map())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, hire_date, balance_conge, department_id, departments(name)')
        .eq('is_active', true)
        .order('full_name')

      if (error) throw error
      // Supabase returns joined relation as array; normalize to single object
      const normalized = (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        departments: Array.isArray(row.departments) ? row.departments[0] || null : row.departments,
      })) as EmployeeWithDept[]
      setEmployees(normalized)
    } catch (error) {
      console.error('Error loading employees:', error)
      toast.error('Erreur lors du chargement des employés')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  const seniorityMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateSeniority>>()
    for (const emp of employees) {
      map.set(emp.id, calculateSeniority(emp.hire_date))
    }
    return map
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return employees

    return employees.filter((emp) => {
      const seniority = seniorityMap.get(emp.id)
      const index = normalizeText(
        [
          emp.full_name,
          emp.job_title,
          emp.departments?.name,
          emp.hire_date,
          String(emp.balance_conge),
          String(seniority?.totalEntitlement),
        ].join(' ')
      )
      return tokens.every((t) => index.includes(t))
    })
  }, [employees, searchTerm, seniorityMap])

  const modifiedCount = useMemo(() => {
    let count = 0
    for (const [id, newBalance] of editedBalances) {
      const emp = employees.find((e) => e.id === id)
      if (emp && newBalance !== emp.balance_conge) {
        count++
      }
    }
    return count
  }, [editedBalances, employees])

  const handleBalanceChange = (employeeId: string, value: string) => {
    const parsed = parseFloat(value)
    const next = new Map(editedBalances)
    if (value === '' || isNaN(parsed)) {
      next.delete(employeeId)
    } else {
      next.set(employeeId, parsed)
    }
    setEditedBalances(next)
  }

  const getDisplayBalance = (emp: EmployeeWithDept): string => {
    const edited = editedBalances.get(emp.id)
    if (edited !== undefined) return String(edited)
    return String(emp.balance_conge)
  }

  const isModified = (emp: EmployeeWithDept): boolean => {
    const edited = editedBalances.get(emp.id)
    return edited !== undefined && edited !== emp.balance_conge
  }

  const handleSave = async () => {
    setConfirmOpen(false)
    setSaving(true)

    const currentYear = new Date().getFullYear()
    let successCount = 0
    let errorCount = 0

    for (const [id, newBalance] of editedBalances) {
      const emp = employees.find((e) => e.id === id)
      if (!emp || newBalance === emp.balance_conge) continue

      try {
        const { error } = await supabase.rpc('set_initial_balance', {
          p_user_id: id,
          p_balance: newBalance,
          p_year: currentYear,
          p_reason: `Initialisation solde ${currentYear} par RH`,
        })
        if (error) throw error
        successCount++
      } catch (error) {
        console.error(`Error updating balance for ${emp.full_name}:`, error)
        errorCount++
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} solde(s) mis à jour avec succès`)
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} erreur(s) lors de la mise à jour`)
    }

    // Refresh data and clear edits
    setEditedBalances(new Map())
    setSaving(false)
    setLoading(true)
    await loadEmployees()
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Initialisation des Soldes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Attribuez manuellement le solde de congé de chaque employé pour démarrer l&apos;année {new Date().getFullYear()}.
        </p>
      </div>

      {/* Main card */}
      <Card className="flex min-h-0 flex-col border-border/70 bg-card shadow-none backdrop-blur-none md:flex-1 md:sticky md:top-0 md:h-[calc(100dvh-12.5rem)] lg:h-[calc(100dvh-11rem)]">
        <CardHeader className="shrink-0 border-b border-border/70 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4.5 w-4.5 text-primary" />
              Soldes de congé — {new Date().getFullYear()}
              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
                {filteredEmployees.length} employé(s)
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-[20rem]">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher: nom, département..."
                  className="pl-11"
                />
              </div>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={modifiedCount === 0 || saving}
                className="shrink-0"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                <span className="hidden sm:inline">Enregistrer</span>
                {modifiedCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                    {modifiedCount}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 pt-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Aucun employé trouvé.</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden h-full min-h-0 md:block">
                <div className="h-full overflow-auto rounded-2xl border border-border/70 overscroll-contain">
                  <table className="w-full min-w-[1000px] border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                      <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold">Employé</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold">Département</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold">Embauche</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold">Ancienneté</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold text-center">Droit/an</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold text-center">Solde actuel</th>
                        <th className="whitespace-nowrap border-b border-border/50 px-4 py-3 font-semibold text-center">Nouveau solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp, index) => {
                        const seniority = seniorityMap.get(emp.id)!
                        const modified = isModified(emp)
                        const isEven = index % 2 === 0

                        return (
                          <tr
                            key={emp.id}
                            className={`transition-colors ${
                              modified
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/10'
                                : isEven
                                  ? 'bg-transparent'
                                  : 'bg-muted/20'
                            } hover:bg-muted/40`}
                          >
                            <td className="border-b border-border/30 px-4 py-3.5 align-middle">
                              <p className="font-medium text-foreground">{emp.full_name}</p>
                              <p className="text-xs text-muted-foreground">{emp.job_title || '—'}</p>
                            </td>
                            <td className="whitespace-nowrap border-b border-border/30 px-4 py-3.5 align-middle">
                              <span className="inline-flex items-center rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                {emp.departments?.name || '—'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap border-b border-border/30 px-4 py-3.5 text-sm text-muted-foreground align-middle">
                              {emp.hire_date
                                ? format(new Date(emp.hire_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })
                                : <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/20">Non renseignée</span>
                              }
                            </td>
                            <td className="whitespace-nowrap border-b border-border/30 px-4 py-3.5 text-sm align-middle">
                              {seniority.yearsOfService > 0
                                ? (
                                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-500/20">
                                    {seniority.yearsOfService.toFixed(1)} an(s)
                                  </span>
                                )
                                : <span className="text-muted-foreground">—</span>
                              }
                            </td>
                            <td className="whitespace-nowrap border-b border-border/30 px-4 py-3.5 text-center align-middle">
                              <span className="inline-flex items-center rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/20">
                                {seniority.totalEntitlement} j
                              </span>
                            </td>
                            <td className="whitespace-nowrap border-b border-border/30 px-4 py-3.5 text-center align-middle">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/15 dark:bg-slate-800/40 dark:text-slate-300 dark:ring-slate-500/20">
                                {emp.balance_conge} j
                              </span>
                            </td>
                            <td className="border-b border-border/30 px-4 py-2.5 align-middle">
                              <div className="flex items-center justify-center gap-2">
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={getDisplayBalance(emp)}
                                  onChange={(e) => handleBalanceChange(emp.id, e.target.value)}
                                  className={`h-9 w-24 text-center font-medium transition-all ${
                                    modified
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/30 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/20'
                                      : 'border-border/60'
                                  }`}
                                />
                                {modified && (
                                  <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] px-1.5 dark:bg-emerald-950/40 dark:text-emerald-400">
                                    modifié
                                  </Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden">
                <div className="space-y-3">
                  {filteredEmployees.map((emp) => {
                    const seniority = seniorityMap.get(emp.id)!
                    const modified = isModified(emp)

                    return (
                      <div
                        key={emp.id}
                        className={`rounded-2xl border p-4 transition-colors ${
                          modified
                            ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/10'
                            : 'border-border/70 bg-background/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{emp.full_name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{emp.job_title || '—'}</p>
                            {emp.departments?.name && (
                              <span className="mt-1 inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {emp.departments.name}
                              </span>
                            )}
                          </div>
                          {modified && (
                            <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] dark:bg-emerald-950/40 dark:text-emerald-400">
                              modifié
                            </Badge>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div className="rounded-xl bg-blue-50/60 p-2 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/20 dark:ring-blue-900/30">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400">Ancienneté</p>
                            <p className="font-semibold text-blue-700 dark:text-blue-300">
                              {seniority.yearsOfService > 0 ? `${seniority.yearsOfService.toFixed(1)} an` : '—'}
                            </p>
                          </div>
                          <div className="rounded-xl bg-violet-50/60 p-2 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/20 dark:ring-violet-900/30">
                            <p className="text-[10px] text-violet-600 dark:text-violet-400">Droit/an</p>
                            <p className="font-semibold text-violet-700 dark:text-violet-300">{seniority.totalEntitlement} j</p>
                          </div>
                          <div className="rounded-xl bg-slate-50/80 p-2 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-800/20 dark:ring-slate-700/30">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Solde actuel</p>
                            <p className="font-semibold text-slate-700 dark:text-slate-300">{emp.balance_conge} j</p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="text-xs font-medium text-muted-foreground">Nouveau solde</label>
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={getDisplayBalance(emp)}
                            onChange={(e) => handleBalanceChange(emp.id, e.target.value)}
                            className={`mt-1 h-10 text-center font-medium transition-all ${
                              modified
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/30 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400'
                                : 'border-border/60'
                            }`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sticky save bar on mobile */}
      {modifiedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur-sm md:hidden">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Enregistrer {modifiedCount} solde(s)
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;initialisation des soldes</DialogTitle>
            <DialogDescription>
              Vous allez modifier le solde de congé de <strong>{modifiedCount}</strong> employé(s).
              Cette action sera enregistrée dans l&apos;historique des soldes.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border/70 bg-muted/30">
            {Array.from(editedBalances.entries())
              .filter(([id]) => {
                const emp = employees.find((e) => e.id === id)
                return emp && editedBalances.get(id) !== emp.balance_conge
              })
              .map(([id, newBalance]) => {
                const emp = employees.find((e) => e.id === id)!
                return (
                  <div key={id} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-border/30 last:border-0">
                    <span className="font-medium">{emp.full_name}</span>
                    <span className="text-muted-foreground">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{emp.balance_conge}</span>
                      <span className="mx-2">&rarr;</span>
                      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">{newBalance} j</span>
                    </span>
                  </div>
                )
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="mr-2 h-4 w-4" />
              )}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

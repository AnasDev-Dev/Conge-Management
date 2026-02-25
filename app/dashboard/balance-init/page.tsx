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
        [emp.full_name, emp.job_title, emp.departments?.name, emp.hire_date, String(emp.balance_conge), String(seniority?.totalEntitlement)].join(' ')
      )
      return tokens.every((t) => index.includes(t))
    })
  }, [employees, searchTerm, seniorityMap])

  const modifiedCount = useMemo(() => {
    let count = 0
    for (const [id, newBalance] of editedBalances) {
      const emp = employees.find((e) => e.id === id)
      if (emp && newBalance !== emp.balance_conge) count++
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
        // Update the employee balance
        const { error: updateError } = await supabase
          .from('utilisateurs')
          .update({ balance_conge: newBalance, updated_at: new Date().toISOString() })
          .eq('id', id)

        if (updateError) throw updateError

        // Record in balance history for audit trail
        const { error: historyError } = await supabase
          .from('leave_balance_history')
          .insert({
            user_id: id,
            type: 'CONGE',
            amount: newBalance,
            reason: `Initialisation solde ${currentYear} par RH (ancien solde: ${emp.balance_conge})`,
            year: currentYear,
          })

        if (historyError) console.error('History insert error:', historyError)

        successCount++
      } catch (error) {
        console.error(`Error updating balance for ${emp.full_name}:`, error)
        errorCount++
      }
    }

    if (successCount > 0) toast.success(`${successCount} solde(s) mis à jour avec succès`)
    if (errorCount > 0) toast.error(`${errorCount} erreur(s) lors de la mise à jour`)

    setEditedBalances(new Map())
    setSaving(false)
    setLoading(true)
    await loadEmployees()
  }

  // Shared sticky-column classes
  const stickyColBase = 'sticky left-0 z-[5] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-border/40'

  return (
    <div className="flex min-h-full flex-col gap-3 sm:gap-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
          Initialisation des Soldes
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm md:text-base">
          Attribuez le solde de congé de chaque employé pour {new Date().getFullYear()}.
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
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={modifiedCount === 0 || saving}
            size="sm"
            className="shrink-0"
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Enregistrer</span>
            {modifiedCount > 0 && (
              <Badge variant="secondary" className="ml-1 border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground text-[10px] px-1.5">
                {modifiedCount}
              </Badge>
            )}
          </Button>
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
          <div className="flex flex-col gap-2.5 pb-20 md:hidden">
            {filteredEmployees.map((emp) => {
              const seniority = seniorityMap.get(emp.id)!
              const modified = isModified(emp)

              return (
                <div
                  key={emp.id}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    modified
                      ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/10'
                      : 'border-border/70 bg-background/80'
                  }`}
                >
                  {/* Name row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground text-sm">{emp.full_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{emp.job_title || '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {emp.departments?.name && (
                        <span className="inline-flex max-w-[100px] truncate rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {emp.departments.name}
                        </span>
                      )}
                      {modified && (
                        <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] px-1.5 dark:bg-emerald-950/40 dark:text-emerald-400">
                          modifié
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    <div className="rounded-lg bg-blue-50/60 px-2 py-1.5 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/20 dark:ring-blue-900/30">
                      <p className="text-[9px] uppercase tracking-wide text-blue-500 dark:text-blue-400">Ancienneté</p>
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {seniority.yearsOfService > 0 ? `${seniority.yearsOfService.toFixed(1)} an` : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-violet-50/60 px-2 py-1.5 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/20 dark:ring-violet-900/30">
                      <p className="text-[9px] uppercase tracking-wide text-violet-500 dark:text-violet-400">Droit/an</p>
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{seniority.totalEntitlement} j</p>
                    </div>
                    <div className="rounded-lg bg-slate-50/80 px-2 py-1.5 ring-1 ring-inset ring-slate-200/70 dark:bg-slate-800/20 dark:ring-slate-700/30">
                      <p className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Actuel</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{emp.balance_conge} j</p>
                    </div>
                  </div>

                  {/* Input row */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <label className="shrink-0 text-[11px] font-medium text-muted-foreground">Nouveau solde</label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={getDisplayBalance(emp)}
                      onChange={(e) => handleBalanceChange(emp.id, e.target.value)}
                      className={`h-9 flex-1 text-center text-sm font-medium transition-all ${
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

          {/* ── Desktop table with frozen first column ── */}
          <div className="hidden flex-1 md:block md:min-h-0">
            <div className="h-full overflow-auto rounded-2xl border border-border/70 overscroll-contain">
              <table className="w-full min-w-[900px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className={`${stickyColBase} z-30 w-[220px] min-w-[180px] whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold`}>
                      Employé
                    </th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold">Département</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold">Embauche</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Ancienneté</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Droit/an</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Solde actuel</th>
                    <th className="whitespace-nowrap border-b border-border/50 bg-muted/80 backdrop-blur-sm px-4 py-3 font-semibold text-center">Nouveau solde</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, index) => {
                    const seniority = seniorityMap.get(emp.id)!
                    const modified = isModified(emp)
                    const isEven = index % 2 === 0

                    const rowBg = modified
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/10'
                      : isEven
                        ? 'bg-card'
                        : 'bg-muted/20'

                    return (
                      <tr key={emp.id} className={`transition-colors hover:bg-muted/40 ${rowBg}`}>
                        {/* Frozen name column */}
                        <td className={`${stickyColBase} border-b border-border/30 px-4 py-3 align-middle ${rowBg}`}>
                          <p className="font-medium text-foreground text-sm leading-tight">{emp.full_name}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{emp.job_title || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 align-middle">
                          <span className="inline-flex items-center rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            {emp.departments?.name || '—'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-border/30 px-4 py-3 text-sm text-muted-foreground align-middle">
                          {emp.hire_date
                            ? format(new Date(emp.hire_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })
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
        </>
      )}

      {/* Sticky save bar on mobile */}
      {modifiedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur-sm md:hidden">
          <Button onClick={() => setConfirmOpen(true)} disabled={saving} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

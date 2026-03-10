'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { PageGuard } from '@/components/role-gate'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
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
  Settings,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Save,
  Loader2,
  Pencil,
  Shield,
  Building2,
} from 'lucide-react'
import { Holiday, WorkingDays } from '@/lib/types/database'
import { PermissionsManager } from '@/components/permissions-manager'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { clearCaches } from '@/lib/leave-utils'

type Tab = 'departments' | 'working-days' | 'holidays' | 'permissions'

interface DepartmentWithDays {
  id: number
  name: string
  company_id: number | null
  annual_leave_days: number
}

const DAY_LABELS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
] as const

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('departments')
  const { user } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(user?.role || 'EMPLOYEE')
  const supabase = useMemo(() => createClient(), [])

  // ─── Departments state ──────────────────────────────
  const [depts, setDepts] = useState<DepartmentWithDays[]>([])
  const [deptsLoading, setDeptsLoading] = useState(true)
  const [deptEdits, setDeptEdits] = useState<Map<number, number>>(new Map())
  const [savingDepts, setSavingDepts] = useState(false)
  const [addDeptOpen, setAddDeptOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDays, setNewDeptDays] = useState('18')
  const [savingNewDept, setSavingNewDept] = useState(false)
  const [editDeptId, setEditDeptId] = useState<number | null>(null)
  const [editDeptName, setEditDeptName] = useState('')
  const [deletingDeptId, setDeletingDeptId] = useState<number | null>(null)

  // ─── Working days state ───────────────────────────
  const [workingDays, setWorkingDays] = useState<WorkingDays | null>(null)
  const [workingDaysLoading, setWorkingDaysLoading] = useState(true)
  const [savingWorkingDays, setSavingWorkingDays] = useState(false)

  // Holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidaysLoading, setHolidaysLoading] = useState(true)
  const [addHolidayOpen, setAddHolidayOpen] = useState(false)
  const [newHolidayName, setNewHolidayName] = useState('')
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayRecurring, setNewHolidayRecurring] = useState(false)
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null)

  const companyId = activeCompany?.id ?? user?.company_id ?? undefined

  useEffect(() => {
    if (user) {
      loadDepartments(companyId)
      loadWorkingDays(companyId)
      loadHolidays(companyId)
    }
  }, [user, activeCompany])

  // ─── Departments ────────────────────────────────────
  const loadDepartments = async (companyId?: number) => {
    try {
      let query = supabase.from('departments').select('id, name, company_id, annual_leave_days').order('name')
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query
      if (error) throw error
      setDepts((data || []) as DepartmentWithDays[])
    } catch (error) {
      console.error('Error loading departments:', error)
    } finally {
      setDeptsLoading(false)
    }
  }

  const handleDeptDaysChange = (deptId: number, value: string) => {
    const parsed = parseFloat(value)
    const next = new Map(deptEdits)
    if (value === '' || isNaN(parsed)) {
      next.delete(deptId)
    } else {
      next.set(deptId, Math.max(parsed, 0))
    }
    setDeptEdits(next)
  }

  const deptModifiedCount = useMemo(() => {
    let count = 0
    for (const [id, val] of deptEdits) {
      const dept = depts.find(d => d.id === id)
      if (dept && val !== dept.annual_leave_days) count++
    }
    return count
  }, [deptEdits, depts])

  const saveDeptDays = async () => {
    setSavingDepts(true)
    const updates: { id: number; annual_leave_days: number }[] = []
    for (const [id, val] of deptEdits) {
      const dept = depts.find(d => d.id === id)
      if (!dept || val === dept.annual_leave_days) continue
      updates.push({ id, annual_leave_days: val })
    }
    if (updates.length > 0) {
      const res = await fetch('/api/departments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      const data = await res.json()
      if (res.ok) {
        if (data.ok > 0) toast.success(`${data.ok} département(s) mis à jour`)
        if (data.fail > 0) toast.error(`${data.fail} erreur(s)`)
      } else { toast.error(data.error || 'Erreur') }
    }
    setDeptEdits(new Map())
    setSavingDepts(false)
    setDeptsLoading(true)
    await loadDepartments(companyId)
  }

  const addDepartment = async () => {
    if (!newDeptName.trim()) { toast.error('Le nom est obligatoire'); return }
    setSavingNewDept(true)
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeptName.trim(), annual_leave_days: parseFloat(newDeptDays) || 18, company_id: companyId || null }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur lors de la création'); console.error(data) }
    else {
      toast.success(`Département "${newDeptName.trim()}" créé`)
      setNewDeptName(''); setNewDeptDays('18'); setAddDeptOpen(false)
      setDeptsLoading(true)
      await loadDepartments(companyId)
    }
    setSavingNewDept(false)
  }

  const saveDeptName = async (deptId: number) => {
    if (!editDeptName.trim()) return
    const res = await fetch('/api/departments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deptId, name: editDeptName.trim() }),
    })
    if (!res.ok) toast.error('Erreur')
    else { toast.success('Nom modifié'); setEditDeptId(null); setDeptsLoading(true); await loadDepartments(companyId) }
  }

  const deleteDepartment = async (deptId: number) => {
    const res = await fetch(`/api/departments?id=${deptId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur lors de la suppression') }
    else { toast.success('Département supprimé'); setDeptsLoading(true); await loadDepartments(companyId) }
    setDeletingDeptId(null)
  }

  // ─── Working Days ─────────────────────────────────
  const loadWorkingDays = async (companyId?: number) => {
    setWorkingDaysLoading(true)
    try {
      let query = supabase.from('working_days').select('*')
      if (companyId) query = query.eq('company_id', companyId)
      query = query.is('category_id', null)
      const { data, error } = await query.limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      setWorkingDays(data || {
        id: 0,
        company_id: companyId || null,
        category_id: null,
        monday: true, tuesday: true, wednesday: true, thursday: true,
        friday: true, saturday: true, sunday: false,
        monday_morning: true, monday_afternoon: true,
        tuesday_morning: true, tuesday_afternoon: true,
        wednesday_morning: true, wednesday_afternoon: true,
        thursday_morning: true, thursday_afternoon: true,
        friday_morning: true, friday_afternoon: true,
        saturday_morning: true, saturday_afternoon: true,
        sunday_morning: false, sunday_afternoon: false,
      })
    } catch (error) {
      console.error('Error loading working days:', error)
    } finally {
      setWorkingDaysLoading(false)
    }
  }

  const toggleHalfDay = (dayKey: string, period: 'morning' | 'afternoon') => {
    if (!workingDays) return
    const halfDayKey = `${dayKey}_${period}` as keyof WorkingDays
    const newValue = !workingDays[halfDayKey]
    const otherPeriod = period === 'morning' ? 'afternoon' : 'morning'
    const otherKey = `${dayKey}_${otherPeriod}` as keyof WorkingDays
    const otherValue = workingDays[otherKey] as boolean
    // Derive full-day boolean: both halves must be true
    const fullDayValue = newValue && otherValue
    setWorkingDays({
      ...workingDays,
      [halfDayKey]: newValue,
      [dayKey]: fullDayValue,
    })
  }

  const saveWorkingDays = async () => {
    if (!workingDays || !user) return
    setSavingWorkingDays(true)
    try {
      const payload = {
        company_id: companyId || 1,
        category_id: null,
        monday: workingDays.monday,
        tuesday: workingDays.tuesday,
        wednesday: workingDays.wednesday,
        thursday: workingDays.thursday,
        friday: workingDays.friday,
        saturday: workingDays.saturday,
        sunday: workingDays.sunday,
        monday_morning: workingDays.monday_morning,
        monday_afternoon: workingDays.monday_afternoon,
        tuesday_morning: workingDays.tuesday_morning,
        tuesday_afternoon: workingDays.tuesday_afternoon,
        wednesday_morning: workingDays.wednesday_morning,
        wednesday_afternoon: workingDays.wednesday_afternoon,
        thursday_morning: workingDays.thursday_morning,
        thursday_afternoon: workingDays.thursday_afternoon,
        friday_morning: workingDays.friday_morning,
        friday_afternoon: workingDays.friday_afternoon,
        saturday_morning: workingDays.saturday_morning,
        saturday_afternoon: workingDays.saturday_afternoon,
        sunday_morning: workingDays.sunday_morning,
        sunday_afternoon: workingDays.sunday_afternoon,
      }

      if (workingDays.id && workingDays.id > 0) {
        const { error } = await supabase
          .from('working_days')
          .update(payload)
          .eq('id', workingDays.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('working_days')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        if (data) setWorkingDays(data)
      }
      clearCaches()
      toast.success('Jours ouvrables mis à jour')
    } catch (error) {
      console.error('Error saving working days:', error)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSavingWorkingDays(false)
    }
  }

  // ─── Holidays ─────────────────────────────────────
  const loadHolidays = async (companyId?: number) => {
    try {
      let query = supabase.from('holidays').select('*').order('date', { ascending: true })
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query
      if (error) throw error
      setHolidays(data || [])
    } catch (error) {
      console.error('Error loading holidays:', error)
    } finally {
      setHolidaysLoading(false)
    }
  }

  const addHoliday = async () => {
    if (!newHolidayName.trim() || !newHolidayDate || !user) return
    setSavingHoliday(true)
    try {
      const { data, error } = await supabase
        .from('holidays')
        .insert({
          company_id: companyId || 1,
          name: newHolidayName.trim(),
          date: newHolidayDate,
          is_recurring: newHolidayRecurring,
        })
        .select()
        .single()
      if (error) throw error
      if (data) setHolidays(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
      setNewHolidayName('')
      setNewHolidayDate('')
      setNewHolidayRecurring(false)
      setAddHolidayOpen(false)
      clearCaches()
      toast.success('Jour férié ajouté')
    } catch (error) {
      console.error('Error adding holiday:', error)
      toast.error("Erreur lors de l'ajout")
    } finally {
      setSavingHoliday(false)
    }
  }

  const deleteHoliday = async (id: number) => {
    setDeletingHolidayId(id)
    try {
      const { error } = await supabase.from('holidays').delete().eq('id', id)
      if (error) throw error
      setHolidays(prev => prev.filter(h => h.id !== id))
      clearCaches()
      toast.success('Jour férié supprimé')
    } catch (error) {
      console.error('Error deleting holiday:', error)
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeletingHolidayId(null)
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Settings }[] = [
    { key: 'departments', label: 'Départements', icon: Building2 },
    { key: 'working-days', label: 'Jours ouvrables', icon: Clock },
    { key: 'holidays', label: 'Jours fériés', icon: Calendar },
    { key: 'permissions', label: 'Permissions', icon: Shield },
  ]

  // Group holidays
  const recurringHolidays = holidays.filter(h => h.is_recurring)
  const variableHolidays = holidays.filter(h => !h.is_recurring)

  return (
    <PageGuard userRole={user?.role || 'EMPLOYEE'} page="settings">
    <div className="space-y-5 md:space-y-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:mt-1.5 sm:text-base">
          Configuration des départements, jours ouvrables, fériés et permissions
        </p>
      </div>

      {/* Tabs — sticky below mobile header, at top on desktop */}
      <div className="sticky top-[4.5rem] lg:top-0 z-20 -mx-3 md:-mx-6 px-3 md:px-6 pt-1 pb-3 bg-gradient-to-b from-card from-85% to-transparent">
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card p-1.5 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Departments Tab ─────────────────────────── */}
      {activeTab === 'departments' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Jours de congé par département</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Configurez le nombre de jours de congé annuel pour chaque département. Ce droit est la base du calcul mensuel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {deptModifiedCount > 0 && (
                <Button onClick={saveDeptDays} disabled={savingDepts} size="sm">
                  {savingDepts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Enregistrer
                  <Badge variant="secondary" className="ml-1.5 border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground text-[10px] px-1.5">
                    {deptModifiedCount}
                  </Badge>
                </Button>
              )}
              {can('settings.departments') && (
                <Button onClick={() => setAddDeptOpen(true)} size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Ajouter
                </Button>
              )}
            </div>
          </div>

          {deptsLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : depts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 py-16">
              <Building2 className="h-7 w-7 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">Aucun département trouvé.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-[0.08em] text-foreground/85">
                    <th className="whitespace-nowrap px-5 py-3.5 text-left font-semibold">Département</th>
                    <th className="whitespace-nowrap px-5 py-3.5 text-center font-semibold">Jours congé/an</th>
                    {can('settings.departments') && (
                      <th className="whitespace-nowrap px-5 py-3.5 text-center font-semibold">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {depts.map((dept) => {
                    const edited = deptEdits.get(dept.id)
                    const displayVal = edited !== undefined ? String(edited) : String(dept.annual_leave_days)
                    const isModified = edited !== undefined && edited !== dept.annual_leave_days
                    return (
                      <tr key={dept.id} className="group transition-colors hover:bg-accent/40">
                        <td className="border-b border-border/45 px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            {editDeptId === dept.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editDeptName}
                                  onChange={(e) => setEditDeptName(e.target.value)}
                                  className="h-8 w-48"
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveDeptName(dept.id); if (e.key === 'Escape') setEditDeptId(null) }}
                                  autoFocus
                                />
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => saveDeptName(dept.id)}>
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditDeptId(null)}>
                                  <span className="text-xs">✕</span>
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm font-semibold text-foreground">{dept.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-border/45 px-5 py-3.5">
                          <div className="flex items-center justify-center gap-2">
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="30"
                              value={displayVal}
                              onChange={(e) => handleDeptDaysChange(dept.id, e.target.value)}
                              className={`h-9 w-24 text-center font-medium ${
                                isModified
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/30'
                                  : 'border-border/60'
                              }`}
                            />
                            <span className="text-xs text-muted-foreground">jours</span>
                            {isModified && (
                              <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] px-1.5">
                                modifié
                              </Badge>
                            )}
                          </div>
                        </td>
                        {can('settings.departments') && (
                          <td className="border-b border-border/45 px-5 py-3.5">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => { setEditDeptId(dept.id); setEditDeptName(dept.name) }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeletingDeptId(dept.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Department Dialog */}
          <Dialog open={addDeptOpen} onOpenChange={setAddDeptOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un département</DialogTitle>
                <DialogDescription>Créez un nouveau département avec son droit de congé annuel.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du département</Label>
                  <Input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} placeholder="Ex: Comptabilité" />
                </div>
                <div className="space-y-2">
                  <Label>Jours de congé annuel</Label>
                  <Input type="number" step="0.5" min="0" max="30" value={newDeptDays} onChange={(e) => setNewDeptDays(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDeptOpen(false)}>Annuler</Button>
                <Button onClick={addDepartment} disabled={savingNewDept || !newDeptName.trim()}>
                  {savingNewDept ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Department Confirmation */}
          <Dialog open={deletingDeptId !== null} onOpenChange={(open) => { if (!open) setDeletingDeptId(null) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer le département</DialogTitle>
                <DialogDescription>
                  Voulez-vous vraiment supprimer le département &quot;{depts.find(d => d.id === deletingDeptId)?.name}&quot; ? Cette action est irréversible.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeletingDeptId(null)}>Annuler</Button>
                <Button variant="destructive" onClick={() => deletingDeptId && deleteDepartment(deletingDeptId)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Working Days Tab ──────────────────────── */}
      {activeTab === 'working-days' && (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Jours ouvrables de l&apos;entreprise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {workingDaysLoading ? (
                <div className="py-8 text-center text-muted-foreground">Chargement...</div>
              ) : workingDays ? (
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Configurez les demi-journées travaillées pour chaque jour. Activez Matin et/ou Après-midi selon le planning.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {DAY_LABELS.map(({ key, label }) => {
                      const morningKey = `${key}_morning` as keyof WorkingDays
                      const afternoonKey = `${key}_afternoon` as keyof WorkingDays
                      const isMorning = workingDays[morningKey] as boolean
                      const isAfternoon = workingDays[afternoonKey] as boolean
                      const isFullDay = isMorning && isAfternoon
                      const isPartial = isMorning || isAfternoon
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border-2 p-4 transition-all ${
                            isFullDay
                              ? 'border-primary bg-primary/5'
                              : isPartial
                              ? 'border-primary/50 bg-primary/[0.02]'
                              : 'border-border/70 bg-muted/20'
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold">{label}</p>
                            <Badge
                              variant={isFullDay ? 'default' : isPartial ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {isFullDay ? 'Journée complète' : isPartial ? 'Demi-journée' : 'Repos'}
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleHalfDay(key, 'morning')}
                              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                isMorning
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                              }`}
                            >
                              Matin
                            </button>
                            <button
                              onClick={() => toggleHalfDay(key, 'afternoon')}
                              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                isAfternoon
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                              }`}
                            >
                              Après-midi
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveWorkingDays} disabled={savingWorkingDays}>
                      {savingWorkingDays ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Holidays Tab ──────────────────────────── */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {holidays.length} jour(s) férié(s) configuré(s)
            </p>
            <Button onClick={() => setAddHolidayOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un jour férié
            </Button>
          </div>

          {/* Recurring holidays */}
          {recurringHolidays.length > 0 && (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Jours fériés fixes (récurrents)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {recurringHolidays.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="border border-border/70 text-xs">
                          {format(new Date(h.date + 'T00:00:00'), 'dd MMM', { locale: fr })}
                        </Badge>
                        <span className="text-sm font-medium">{h.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteHoliday(h.id)}
                        disabled={deletingHolidayId === h.id}
                      >
                        {deletingHolidayId === h.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variable holidays by year */}
          {variableHolidays.length > 0 && (() => {
            const byYear: Record<string, Holiday[]> = {}
            variableHolidays.forEach(h => {
              const year = h.date.substring(0, 4)
              if (!byYear[year]) byYear[year] = []
              byYear[year].push(h)
            })
            return Object.entries(byYear)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([year, yearHolidays]) => (
                <Card key={year} className="border-border/70">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Jours fériés religieux — {year}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {yearHolidays.map((h) => (
                        <div key={h.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="border border-border/70 text-xs">
                              {format(new Date(h.date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                            </Badge>
                            <span className="text-sm font-medium">{h.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteHoliday(h.id)}
                            disabled={deletingHolidayId === h.id}
                          >
                            {deletingHolidayId === h.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
          })()}

          {holidaysLoading && (
            <div className="py-8 text-center text-muted-foreground">Chargement...</div>
          )}

          {/* Add Holiday Dialog */}
          <Dialog open={addHolidayOpen} onOpenChange={setAddHolidayOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un jour férié</DialogTitle>
                <DialogDescription>
                  Les jours fériés récurrents se répètent chaque année à la même date.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du jour férié</Label>
                  <Input
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="Ex: Aïd Al-Fitr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <DatePicker
                    value={newHolidayDate}
                    onChange={setNewHolidayDate}
                    placeholder="Selectionnez la date"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNewHolidayRecurring(!newHolidayRecurring)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      newHolidayRecurring ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        newHolidayRecurring ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <Label>Récurrent chaque année</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddHolidayOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={addHoliday}
                  disabled={savingHoliday || !newHolidayName.trim() || !newHolidayDate}
                >
                  {savingHoliday ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Permissions Tab ────────────────────────── */}
      {activeTab === 'permissions' && (
        <PermissionsManager />
      )}
    </div>
    </PageGuard>
  )
}

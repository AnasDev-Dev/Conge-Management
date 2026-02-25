'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Search,
  UserPlus,
  Loader2,
} from 'lucide-react'
import { Holiday, WorkingDays, Utilisateur } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { clearCaches } from '@/lib/leave-utils'

type Tab = 'working-days' | 'holidays' | 'recuperation'

const DAY_LABELS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
] as const

type EmployeeOption = Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('working-days')
  const { user } = useCurrentUser()
  const supabase = useMemo(() => createClient(), [])

  // Working days state
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

  // Recuperation credit state
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [recupDays, setRecupDays] = useState('')
  const [recupDateFrom, setRecupDateFrom] = useState('')
  const [recupDateTo, setRecupDateTo] = useState('')
  const [recupReason, setRecupReason] = useState('')
  const [recupSearch, setRecupSearch] = useState('')
  const [creditingRecup, setCreditingRecup] = useState(false)

  useEffect(() => {
    if (user) {
      loadWorkingDays(user.company_id ?? undefined)
      loadHolidays(user.company_id ?? undefined)
      loadEmployees()
    }
  }, [user])

  // ─── Working Days ───────────────────────────────────
  const loadWorkingDays = async (companyId?: number) => {
    try {
      let query = supabase.from('working_days').select('*')
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query.limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      setWorkingDays(data || {
        id: 0, company_id: companyId || null,
        monday: true, tuesday: true, wednesday: true, thursday: true,
        friday: true, saturday: true, sunday: false,
      })
    } catch (error) {
      console.error('Error loading working days:', error)
    } finally {
      setWorkingDaysLoading(false)
    }
  }

  const toggleDay = (dayKey: string) => {
    if (!workingDays) return
    setWorkingDays({ ...workingDays, [dayKey]: !workingDays[dayKey as keyof WorkingDays] })
  }

  const saveWorkingDays = async () => {
    if (!workingDays || !user) return
    setSavingWorkingDays(true)
    try {
      const companyId = user.company_id || 1
      if (workingDays.id && workingDays.id > 0) {
        const { error } = await supabase
          .from('working_days')
          .update({
            monday: workingDays.monday,
            tuesday: workingDays.tuesday,
            wednesday: workingDays.wednesday,
            thursday: workingDays.thursday,
            friday: workingDays.friday,
            saturday: workingDays.saturday,
            sunday: workingDays.sunday,
          })
          .eq('id', workingDays.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('working_days')
          .insert({
            company_id: companyId,
            monday: workingDays.monday,
            tuesday: workingDays.tuesday,
            wednesday: workingDays.wednesday,
            thursday: workingDays.thursday,
            friday: workingDays.friday,
            saturday: workingDays.saturday,
            sunday: workingDays.sunday,
          })
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

  // ─── Holidays ───────────────────────────────────────
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
          company_id: user.company_id || 1,
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

  // ─── Recuperation Credit ────────────────────────────
  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      setEmployees(data || [])
    } catch (error) {
      console.error('Error loading employees:', error)
    }
  }

  const filteredEmployees = useMemo(() => {
    if (!recupSearch.trim()) return employees
    const term = recupSearch.toLowerCase()
    return employees.filter(e =>
      e.full_name?.toLowerCase().includes(term) ||
      e.job_title?.toLowerCase().includes(term)
    )
  }, [employees, recupSearch])

  const creditRecuperation = async () => {
    if (!selectedEmployee || !recupDays || !recupDateFrom || !recupDateTo) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    const days = parseFloat(recupDays)
    if (isNaN(days) || days <= 0) {
      toast.error('Le nombre de jours doit être positif')
      return
    }
    setCreditingRecup(true)
    try {
      const { data, error } = await supabase.rpc('credit_recuperation', {
        p_user_id: selectedEmployee,
        p_days: days,
        p_date_from: recupDateFrom,
        p_date_to: recupDateTo,
        p_reason: recupReason.trim() || 'Travail jour de repos',
      })
      if (error) throw error
      const empName = employees.find(e => e.id === selectedEmployee)?.full_name || ''
      toast.success(`${days} jour(s) de récupération crédité(s) à ${empName}`)
      setSelectedEmployee('')
      setRecupDays('')
      setRecupDateFrom('')
      setRecupDateTo('')
      setRecupReason('')
      setRecupSearch('')
    } catch (error) {
      console.error('Error crediting recuperation:', error)
      toast.error('Erreur lors du crédit de récupération')
    } finally {
      setCreditingRecup(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Settings }[] = [
    { key: 'working-days', label: 'Jours ouvrables', icon: Clock },
    { key: 'holidays', label: 'Jours fériés', icon: Calendar },
    { key: 'recuperation', label: 'Crédit récupération', icon: UserPlus },
  ]

  // Group holidays
  const recurringHolidays = holidays.filter(h => h.is_recurring)
  const variableHolidays = holidays.filter(h => !h.is_recurring)

  return (
    <div className="space-y-5 md:space-y-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:mt-1.5 sm:text-base">
          Configuration des jours ouvrables, fériés et récupération
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-1.5">
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
            {workingDaysLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement...</div>
            ) : workingDays ? (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Sélectionnez les jours travaillés. Par défaut, le droit marocain prévoit du lundi au samedi (jours ouvrables).
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {DAY_LABELS.map(({ key, label }) => {
                    const isActive = workingDays[key as keyof WorkingDays] as boolean
                    return (
                      <button
                        key={key}
                        onClick={() => toggleDay(key)}
                        className={`rounded-xl border-2 px-4 py-4 text-center transition-all ${
                          isActive
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border/70 bg-muted/20 text-muted-foreground'
                        }`}
                      >
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="mt-1 text-xs">
                          {isActive ? 'Travaillé' : 'Repos'}
                        </p>
                      </button>
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
                  <Input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
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

      {/* ─── Recuperation Credit Tab ───────────────── */}
      {activeTab === 'recuperation' && (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Créditer des jours de récupération
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Lorsqu&apos;un employé travaille un jour de repos (dimanche, jour férié), créditez-lui des jours de récupération.
              </p>

              {/* Employee selector */}
              <div className="space-y-2">
                <Label>Employé *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recupSearch}
                    onChange={(e) => {
                      setRecupSearch(e.target.value)
                      if (selectedEmployee) setSelectedEmployee('')
                    }}
                    placeholder="Rechercher un employé..."
                    className="pl-10"
                  />
                </div>
                {recupSearch && !selectedEmployee && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-border/70 bg-background">
                    {filteredEmployees.slice(0, 10).map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee(emp.id)
                          setRecupSearch(emp.full_name || '')
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="font-medium">{emp.full_name}</span>
                        {emp.job_title && (
                          <span className="ml-2 text-muted-foreground">— {emp.job_title}</span>
                        )}
                      </button>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">Aucun résultat</p>
                    )}
                  </div>
                )}
                {selectedEmployee && (
                  <Badge variant="secondary" className="border border-border/70">
                    {employees.find(e => e.id === selectedEmployee)?.full_name}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Nombre de jours *</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={recupDays}
                    onChange={(e) => setRecupDays(e.target.value)}
                    placeholder="Ex: 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date début (travaillé) *</Label>
                  <Input
                    type="date"
                    value={recupDateFrom}
                    onChange={(e) => setRecupDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date fin (travaillé) *</Label>
                  <Input
                    type="date"
                    value={recupDateTo}
                    onChange={(e) => setRecupDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Motif</Label>
                <Input
                  value={recupReason}
                  onChange={(e) => setRecupReason(e.target.value)}
                  placeholder="Ex: Travail dimanche 15/02 pour événement"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={creditRecuperation}
                  disabled={creditingRecup || !selectedEmployee || !recupDays || !recupDateFrom || !recupDateTo}
                >
                  {creditingRecup ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Créditer la récupération
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

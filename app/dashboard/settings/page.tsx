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
  Users,
  Loader2,
  Pencil,
  Briefcase,
  CalendarDays,
  Layers,
  GraduationCap,
} from 'lucide-react'
import { Holiday, WorkingDays, Utilisateur, PersonnelCategory } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { clearCaches } from '@/lib/leave-utils'

type Tab = 'categories' | 'working-days' | 'holidays' | 'recuperation'

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
  const [activeTab, setActiveTab] = useState<Tab>('categories')
  const { user } = useCurrentUser()
  const supabase = useMemo(() => createClient(), [])

  // ─── Categories state ─────────────────────────────
  const [categories, setCategories] = useState<PersonnelCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [editCategoryOpen, setEditCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<PersonnelCategory | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [categoryAnnualLeaveDays, setCategoryAnnualLeaveDays] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<PersonnelCategory | null>(null)

  // ─── Working days state ───────────────────────────
  const [workingDays, setWorkingDays] = useState<WorkingDays | null>(null)
  const [workingDaysLoading, setWorkingDaysLoading] = useState(true)
  const [savingWorkingDays, setSavingWorkingDays] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

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
      loadCategories(user.company_id ?? undefined)
      loadWorkingDays(user.company_id ?? undefined, null)
      loadHolidays(user.company_id ?? undefined)
      loadEmployees()
    }
  }, [user])

  // ─── Categories ───────────────────────────────────
  const loadCategories = async (companyId?: number) => {
    try {
      let query = supabase.from('personnel_categories').select('*').order('name')
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query
      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setCategoriesLoading(false)
    }
  }

  const openAddCategory = () => {
    setCategoryName('')
    setCategoryDescription('')
    setCategoryAnnualLeaveDays('')
    setAddCategoryOpen(true)
  }

  const openEditCategory = (cat: PersonnelCategory) => {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setCategoryDescription(cat.description || '')
    setCategoryAnnualLeaveDays(String(cat.annual_leave_days))
    setEditCategoryOpen(true)
  }

  const addCategory = async () => {
    if (!categoryName.trim() || !categoryAnnualLeaveDays || !user) return
    const annualDays = parseFloat(categoryAnnualLeaveDays)
    if (isNaN(annualDays) || annualDays < 0) {
      toast.error('Le nombre de jours de congé annuel doit être positif')
      return
    }
    setSavingCategory(true)
    try {
      const { data, error } = await supabase
        .from('personnel_categories')
        .insert({
          company_id: user.company_id || 1,
          name: categoryName.trim(),
          description: categoryDescription.trim() || null,
          annual_leave_days: annualDays,
        })
        .select()
        .single()
      if (error) throw error
      if (data) setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setCategoryName('')
      setCategoryDescription('')
      setCategoryAnnualLeaveDays('')
      setAddCategoryOpen(false)
      toast.success('Catégorie ajoutée')
    } catch (error) {
      console.error('Error adding category:', error)
      toast.error("Erreur lors de l'ajout de la catégorie")
    } finally {
      setSavingCategory(false)
    }
  }

  const updateCategory = async () => {
    if (!editingCategory || !categoryName.trim() || !categoryAnnualLeaveDays || !user) return
    const annualDays = parseFloat(categoryAnnualLeaveDays)
    if (isNaN(annualDays) || annualDays < 0) {
      toast.error('Le nombre de jours de congé annuel doit être positif')
      return
    }
    setSavingCategory(true)
    try {
      const { data, error } = await supabase
        .from('personnel_categories')
        .update({
          name: categoryName.trim(),
          description: categoryDescription.trim() || null,
          annual_leave_days: annualDays,
        })
        .eq('id', editingCategory.id)
        .select()
        .single()
      if (error) throw error
      if (data) {
        setCategories(prev =>
          prev.map(c => (c.id === data.id ? data : c)).sort((a, b) => a.name.localeCompare(b.name))
        )
      }
      setEditCategoryOpen(false)
      setEditingCategory(null)
      toast.success('Catégorie mise à jour')
    } catch (error) {
      console.error('Error updating category:', error)
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setSavingCategory(false)
    }
  }

  const deleteCategory = async (id: number) => {
    setDeletingCategoryId(id)
    try {
      const { error } = await supabase.from('personnel_categories').delete().eq('id', id)
      if (error) throw error
      setCategories(prev => prev.filter(c => c.id !== id))
      toast.success('Catégorie supprimée')
    } catch (error) {
      console.error('Error deleting category:', error)
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeletingCategoryId(null)
    }
  }

  // ─── Working Days ─────────────────────────────────
  const loadWorkingDays = async (companyId?: number, categoryId?: number | null) => {
    setWorkingDaysLoading(true)
    try {
      let query = supabase.from('working_days').select('*')
      if (companyId) query = query.eq('company_id', companyId)
      if (categoryId) {
        query = query.eq('category_id', categoryId)
      } else {
        query = query.is('category_id', null)
      }
      const { data, error } = await query.limit(1).single()
      if (error && error.code !== 'PGRST116') throw error
      setWorkingDays(data || {
        id: 0,
        company_id: companyId || null,
        category_id: categoryId || null,
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

  const handleCategoryFilterChange = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId)
    if (user) {
      loadWorkingDays(user.company_id ?? undefined, categoryId)
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
      const companyId = user.company_id || 1
      const payload = {
        company_id: companyId,
        category_id: selectedCategoryId || null,
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

  // ─── Recuperation Credit ──────────────────────────
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

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories
    const term = categorySearch.toLowerCase()
    return categories.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.description?.toLowerCase().includes(term)
    )
  }, [categories, categorySearch])

  const categoryStats = useMemo(() => {
    if (categories.length === 0) return { total: 0, avgDays: 0, minDays: 0, maxDays: 0 }
    const days = categories.map(c => c.annual_leave_days)
    return {
      total: categories.length,
      avgDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
      minDays: Math.min(...days),
      maxDays: Math.max(...days),
    }
  }, [categories])

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
    { key: 'categories', label: 'Catégories', icon: Users },
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
          Configuration des catégories, jours ouvrables, fériés et récupération
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

      {/* ─── Categories Tab ──────────────────────────── */}
      {activeTab === 'categories' && (
        <div className="space-y-5">
          {/* KPI Stats */}
          {!categoriesLoading && categories.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground sm:text-2xl">{categoryStats.total}</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">Catégories</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 sm:flex">
                  <CalendarDays className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground sm:text-2xl">{categoryStats.avgDays}</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">Moyenne jours/an</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 sm:flex">
                  <GraduationCap className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground sm:text-2xl">{categoryStats.maxDays}</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">Maximum jours/an</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 sm:flex">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground sm:text-2xl">{categoryStats.minDays}</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">Minimum jours/an</p>
                </div>
              </div>
            </div>
          )}

          {/* Search bar + Add button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Rechercher une catégorie..."
                className="pl-10"
              />
            </div>
            <Button onClick={openAddCategory} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une catégorie
            </Button>
          </div>

          {categoriesLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
                <Users className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">Aucune catégorie</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajoutez une catégorie de personnel pour commencer.
              </p>
              <Button onClick={openAddCategory} className="mt-5" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une catégorie
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-secondary text-xs uppercase tracking-[0.08em] text-foreground/85">
                        <th className="whitespace-nowrap px-5 py-3.5 text-left font-semibold">Catégorie</th>
                        <th className="whitespace-nowrap px-5 py-3.5 text-left font-semibold">Description</th>
                        <th className="whitespace-nowrap px-5 py-3.5 text-center font-semibold">Jours congé/an</th>
                        <th className="whitespace-nowrap px-5 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategories.map((cat) => (
                        <tr key={cat.id} className="group transition-colors hover:bg-accent/40">
                          <td className="border-b border-border/45 px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <Users className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm font-semibold text-foreground">{cat.name}</span>
                            </div>
                          </td>
                          <td className="border-b border-border/45 px-5 py-3.5">
                            <span className="text-sm text-muted-foreground">
                              {cat.description || '—'}
                            </span>
                          </td>
                          <td className="border-b border-border/45 px-5 py-3.5 text-center">
                            <Badge variant="secondary" className="border border-border/70 text-xs font-semibold">
                              {cat.annual_leave_days} jour{cat.annual_leave_days !== 1 ? 's' : ''}
                            </Badge>
                          </td>
                          <td className="border-b border-border/45 px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                                onClick={() => openEditCategory(cat)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                onClick={() => setDeleteCategoryConfirm(cat)}
                                disabled={deletingCategoryId === cat.id}
                              >
                                {deletingCategoryId === cat.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredCategories.length === 0 && categorySearch && (
                        <tr>
                          <td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">
                            Aucune catégorie ne correspond à &quot;{categorySearch}&quot;
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="space-y-3 md:hidden">
                {filteredCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="rounded-2xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{cat.name}</p>
                          {cat.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{cat.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditCategory(cat)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteCategoryConfirm(cat)}
                          disabled={deletingCategoryId === cat.id}
                        >
                          {deletingCategoryId === cat.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        {cat.annual_leave_days} jour{cat.annual_leave_days !== 1 ? 's' : ''} de congé / an
                      </span>
                    </div>
                  </div>
                ))}
                {filteredCategories.length === 0 && categorySearch && (
                  <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
                    Aucune catégorie ne correspond à &quot;{categorySearch}&quot;
                  </div>
                )}
              </div>
            </>
          )}

          {/* Delete Confirmation Dialog */}
          <Dialog open={!!deleteCategoryConfirm} onOpenChange={(open) => !open && setDeleteCategoryConfirm(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer la catégorie</DialogTitle>
                <DialogDescription>
                  Êtes-vous sûr de vouloir supprimer la catégorie &quot;{deleteCategoryConfirm?.name}&quot; ?
                  Cette action est irréversible.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteCategoryConfirm(null)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (deleteCategoryConfirm) {
                      deleteCategory(deleteCategoryConfirm.id)
                      setDeleteCategoryConfirm(null)
                    }
                  }}
                  disabled={deletingCategoryId === deleteCategoryConfirm?.id}
                >
                  {deletingCategoryId === deleteCategoryConfirm?.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Supprimer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Category Dialog */}
          <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter une catégorie de personnel</DialogTitle>
                <DialogDescription>
                  Définissez une catégorie avec son nombre de jours de congé annuel.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Ex: Cadre, Technicien, Ouvrier"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={categoryDescription}
                    onChange={(e) => setCategoryDescription(e.target.value)}
                    placeholder="Ex: Personnel d'encadrement"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jours de congé annuel *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={categoryAnnualLeaveDays}
                    onChange={(e) => setCategoryAnnualLeaveDays(e.target.value)}
                    placeholder="Ex: 18"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={addCategory}
                  disabled={savingCategory || !categoryName.trim() || !categoryAnnualLeaveDays}
                >
                  {savingCategory ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Category Dialog */}
          <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifier la catégorie</DialogTitle>
                <DialogDescription>
                  Modifiez les informations de cette catégorie de personnel.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Ex: Cadre, Technicien, Ouvrier"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={categoryDescription}
                    onChange={(e) => setCategoryDescription(e.target.value)}
                    placeholder="Ex: Personnel d'encadrement"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jours de congé annuel *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={categoryAnnualLeaveDays}
                    onChange={(e) => setCategoryAnnualLeaveDays(e.target.value)}
                    placeholder="Ex: 18"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditCategoryOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={updateCategory}
                  disabled={savingCategory || !categoryName.trim() || !categoryAnnualLeaveDays}
                >
                  {savingCategory ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Enregistrer
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
              {/* Category selector */}
              <div className="space-y-2">
                <Label>Configuration pour</Label>
                <select
                  value={selectedCategoryId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    handleCategoryFilterChange(val ? Number(val) : null)
                  }}
                  className="w-full rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Entreprise (par défaut)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {selectedCategoryId
                    ? `Configuration spécifique pour la catégorie "${categories.find(c => c.id === selectedCategoryId)?.name}"`
                    : 'Configuration par défaut applicable à toute l\u2019entreprise'}
                </p>
              </div>

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

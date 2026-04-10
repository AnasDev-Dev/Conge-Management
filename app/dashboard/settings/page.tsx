'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Sun,
  Moon,
  Info,
  ChevronDown,
  ChevronRight,
  Users,
  Briefcase,
} from 'lucide-react'
import { Holiday, WorkingDays } from '@/lib/types/database'
import MissionSettings from '@/components/settings/mission-settings'
import { PermissionsManager } from '@/components/permissions-manager'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { clearCaches } from '@/lib/leave-utils'

type Tab = 'departments' | 'working-days' | 'holidays' | 'missions' | 'permissions'

interface DepartmentWithDays {
  id: number
  name: string
  company_id: number | null
  annual_leave_days: number
}

interface DeptEmployee {
  id: string
  full_name: string
  job_title: string | null
  annual_leave_days: number | null
  department_id: number | null
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

  // ─── Employee leave days per department ────────────
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set())
  const [deptEmployees, setDeptEmployees] = useState<Map<number, DeptEmployee[]>>(new Map())
  const [deptEmpLoading, setDeptEmpLoading] = useState<Set<number>>(new Set())
  const [empEdits, setEmpEdits] = useState<Map<string, number | null>>(new Map()) // userId -> value (null = inherit)
  const [savingEmps, setSavingEmps] = useState(false)

  // ─── Working days state ───────────────────────────
  const [workingDays, setWorkingDays] = useState<WorkingDays | null>(null)
  const [workingDaysLoading, setWorkingDaysLoading] = useState(true)
  const [savingWorkingDays, setSavingWorkingDays] = useState(false)
  const [wdDeptId, setWdDeptId] = useState<number | null>(null) // null = company default

  // Holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidaysLoading, setHolidaysLoading] = useState(true)
  const [addHolidayOpen, setAddHolidayOpen] = useState(false)
  const [newHolidayName, setNewHolidayName] = useState('')
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayRecurring, setNewHolidayRecurring] = useState(true)
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [editHolidayName, setEditHolidayName] = useState('')
  const [editHolidayDate, setEditHolidayDate] = useState('')
  const [editHolidayRecurring, setEditHolidayRecurring] = useState(false)
  const [savingEditHoliday, setSavingEditHoliday] = useState(false)

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

  // ─── Employee leave days per department ────────────
  const toggleDeptExpand = async (deptId: number) => {
    const next = new Set(expandedDepts)
    if (next.has(deptId)) {
      next.delete(deptId)
    } else {
      next.add(deptId)
      if (!deptEmployees.has(deptId)) {
        await loadDeptEmployees(deptId)
      }
    }
    setExpandedDepts(next)
  }

  const loadDeptEmployees = async (deptId: number) => {
    setDeptEmpLoading(prev => new Set(prev).add(deptId))
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, annual_leave_days, department_id')
        .eq('department_id', deptId)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      setDeptEmployees(prev => new Map(prev).set(deptId, (data || []) as DeptEmployee[]))
    } catch (error) {
      console.error('Error loading dept employees:', error)
      toast.error('Erreur lors du chargement des employés')
    } finally {
      setDeptEmpLoading(prev => { const n = new Set(prev); n.delete(deptId); return n })
    }
  }

  const handleEmpDaysChange = (userId: string, value: string) => {
    const next = new Map(empEdits)
    if (value === '') {
      next.set(userId, null) // inherit from department
    } else {
      const parsed = parseFloat(value)
      if (!isNaN(parsed)) {
        next.set(userId, Math.max(parsed, 0))
      }
    }
    setEmpEdits(next)
  }

  const empModifiedCount = useMemo(() => {
    let count = 0
    for (const [userId, val] of empEdits) {
      // Find which department this employee belongs to
      for (const [, emps] of deptEmployees) {
        const emp = emps.find(e => e.id === userId)
        if (emp) {
          if (val !== emp.annual_leave_days) count++
          break
        }
      }
    }
    return count
  }, [empEdits, deptEmployees])

  const saveEmpDays = async () => {
    setSavingEmps(true)
    let ok = 0
    let fail = 0
    for (const [userId, val] of empEdits) {
      // Find the original to compare
      let original: DeptEmployee | undefined
      for (const [, emps] of deptEmployees) {
        original = emps.find(e => e.id === userId)
        if (original) break
      }
      if (!original || val === original.annual_leave_days) continue
      const { error } = await supabase
        .from('utilisateurs')
        .update({ annual_leave_days: val })
        .eq('id', userId)
        .select()
      if (error) { fail++; console.error('Error updating employee:', error) }
      else { ok++ }
    }
    if (ok > 0) toast.success(`${ok} employé(s) mis à jour`)
    if (fail > 0) toast.error(`${fail} erreur(s)`)
    setEmpEdits(new Map())
    // Reload employees for expanded departments
    for (const deptId of expandedDepts) {
      await loadDeptEmployees(deptId)
    }
    setSavingEmps(false)
  }

  // ─── Working Days ─────────────────────────────────
  const loadWorkingDays = async (companyId?: number, departmentId?: number | null) => {
    setWorkingDaysLoading(true)
    try {
      const defaultWd: WorkingDays = {
        id: 0,
        company_id: companyId || null,
        category_id: null,
        department_id: departmentId || null,
        monday: true, tuesday: true, wednesday: true, thursday: true,
        friday: true, saturday: true, sunday: false,
        monday_morning: true, monday_afternoon: true,
        tuesday_morning: true, tuesday_afternoon: true,
        wednesday_morning: true, wednesday_afternoon: true,
        thursday_morning: true, thursday_afternoon: true,
        friday_morning: true, friday_afternoon: true,
        saturday_morning: true, saturday_afternoon: true,
        sunday_morning: false, sunday_afternoon: false,
      }

      // Try department-specific config first
      if (departmentId) {
        let query = supabase.from('working_days').select('*').eq('department_id', departmentId)
        if (companyId) query = query.eq('company_id', companyId)
        const { data, error } = await query.limit(1).single()
        if (data && !error) {
          setWorkingDays(data)
          return
        }
        // Not found — fall through to company default and pre-fill
      }

      // Company default (department_id IS NULL, category_id IS NULL)
      let fallbackQuery = supabase.from('working_days').select('*')
        .is('department_id', null)
        .is('category_id', null)
      if (companyId) fallbackQuery = fallbackQuery.eq('company_id', companyId)
      const { data: fallbackData, error: fallbackError } = await fallbackQuery.limit(1).single()
      if (fallbackError && fallbackError.code !== 'PGRST116') throw fallbackError

      if (departmentId && fallbackData) {
        // Pre-fill department config from company default (new, unsaved)
        setWorkingDays({ ...fallbackData, id: 0, department_id: departmentId })
      } else {
        setWorkingDays(fallbackData || defaultWd)
      }
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
        department_id: wdDeptId || null,
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
      const label = wdDeptId ? depts.find(d => d.id === wdDeptId)?.name : 'entreprise'
      toast.success(`Jours ouvrables mis à jour (${label})`)
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

    // Duplicate check: same date (for recurring, compare month+day only)
    const isDuplicate = holidays.some(h => {
      if (newHolidayRecurring || h.is_recurring) {
        // Compare month+day only
        return h.date.substring(5) === newHolidayDate.substring(5)
      }
      return h.date === newHolidayDate
    })
    if (isDuplicate) {
      toast.error('Un jour férié existe déjà à cette date')
      return
    }

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

      // Recalculate active leave requests that span this holiday
      const { data: recalcResult } = await supabase.rpc('recalculate_leave_for_holiday', {
        p_holiday_date: newHolidayDate,
        p_company_id: companyId || null,
      })
      const updated = recalcResult?.requests_updated ?? 0

      setNewHolidayName('')
      setNewHolidayDate('')
      setNewHolidayRecurring(true)
      setAddHolidayOpen(false)
      clearCaches()
      if (updated > 0) {
        toast.success(`Jour ferie ajoute — ${updated} demande${updated > 1 ? 's' : ''} de conge recalculee${updated > 1 ? 's' : ''}`)
      } else {
        toast.success('Jour ferie ajoute')
      }
    } catch (error) {
      console.error('Error adding holiday:', error)
      toast.error("Erreur lors de l'ajout")
    } finally {
      setSavingHoliday(false)
    }
  }

  const startEditHoliday = (h: Holiday) => {
    setEditingHoliday(h)
    setEditHolidayName(h.name)
    setEditHolidayDate(h.date)
    setEditHolidayRecurring(h.is_recurring)
  }

  const updateHoliday = async () => {
    if (!editingHoliday || !editHolidayName.trim() || !editHolidayDate) return

    // Duplicate check (exclude self)
    const isDuplicate = holidays.some(h => {
      if (h.id === editingHoliday.id) return false
      if (editHolidayRecurring || h.is_recurring) {
        return h.date.substring(5) === editHolidayDate.substring(5)
      }
      return h.date === editHolidayDate
    })
    if (isDuplicate) {
      toast.error('Un jour férié existe déjà à cette date')
      return
    }

    setSavingEditHoliday(true)
    try {
      const { data, error } = await supabase
        .from('holidays')
        .update({
          name: editHolidayName.trim(),
          date: editHolidayDate,
          is_recurring: editHolidayRecurring,
        })
        .eq('id', editingHoliday.id)
        .select()
        .single()
      if (error) throw error
      if (data) {
        setHolidays(prev =>
          prev.map(h => h.id === data.id ? data : h).sort((a, b) => a.date.localeCompare(b.date))
        )
      }

      // Recalculate leave requests for both old and new dates
      const datesToRecalc = new Set([editHolidayDate])
      if (editingHoliday.date !== editHolidayDate) datesToRecalc.add(editingHoliday.date)
      let totalUpdated = 0
      for (const d of datesToRecalc) {
        const { data: r } = await supabase.rpc('recalculate_leave_for_holiday', {
          p_holiday_date: d,
          p_company_id: companyId || null,
        })
        totalUpdated += r?.requests_updated ?? 0
      }

      setEditingHoliday(null)
      clearCaches()
      if (totalUpdated > 0) {
        toast.success(`Jour ferie modifie — ${totalUpdated} demande${totalUpdated > 1 ? 's' : ''} recalculee${totalUpdated > 1 ? 's' : ''}`)
      } else {
        toast.success('Jour ferie modifie')
      }
    } catch (error) {
      console.error('Error updating holiday:', error)
      toast.error('Erreur lors de la modification')
    } finally {
      setSavingEditHoliday(false)
    }
  }

  const deleteHoliday = async (id: number) => {
    const deletedHoliday = holidays.find(h => h.id === id)
    setDeletingHolidayId(id)
    try {
      const { error } = await supabase.from('holidays').delete().eq('id', id).select()
      if (error) throw error
      setHolidays(prev => prev.filter(h => h.id !== id))
      clearCaches()

      // Recalculate leave requests that spanned this holiday (they lose a free day)
      if (deletedHoliday) {
        const { data: r } = await supabase.rpc('recalculate_leave_for_holiday', {
          p_holiday_date: deletedHoliday.date,
          p_company_id: companyId || null,
        })
        const updated = r?.requests_updated ?? 0
        if (updated > 0) {
          toast.success(`Jour ferie supprime — ${updated} demande${updated > 1 ? 's' : ''} recalculee${updated > 1 ? 's' : ''}`)
        } else {
          toast.success('Jour ferie supprime')
        }
      } else {
        toast.success('Jour ferie supprime')
      }
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
    ...(can('settings.missions') ? [{ key: 'missions' as Tab, label: 'Missions', icon: Briefcase }] : []),
    ...(can('settings.permissions') ? [{ key: 'permissions' as Tab, label: 'Permissions', icon: Shield }] : []),
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
              {empModifiedCount > 0 && (
                <Button onClick={saveEmpDays} disabled={savingEmps} size="sm" variant="outline">
                  {savingEmps ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Employés
                  <Badge variant="secondary" className="ml-1.5 border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground text-[10px] px-1.5">
                    {empModifiedCount}
                  </Badge>
                </Button>
              )}
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
                    const isExpanded = expandedDepts.has(dept.id)
                    const employees = deptEmployees.get(dept.id) || []
                    const isLoadingEmps = deptEmpLoading.has(dept.id)
                    const colSpan = can('settings.departments') ? 3 : 2
                    return (
                      <React.Fragment key={dept.id}>
                      <tr className="group transition-colors hover:bg-accent/40">
                        <td className="border-b border-border/45 px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleDeptExpand(dept.id)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors hover:bg-primary/20"
                              title={isExpanded ? 'Masquer les employés' : 'Afficher les employés'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-primary" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-primary" />
                              )}
                            </button>
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
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{dept.name}</span>
                                {employees.length > 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    <Users className="mr-1 h-3 w-3" />
                                    {employees.length}
                                  </Badge>
                                )}
                              </div>
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
                      {/* ─── Employee sub-rows ─────────────────── */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={colSpan} className="border-b border-border/45 bg-muted/15 px-0 py-0">
                            {isLoadingEmps ? (
                              <div className="flex items-center justify-center gap-2 py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Chargement des employés...</span>
                              </div>
                            ) : employees.length === 0 ? (
                              <div className="flex items-center justify-center gap-2 py-6">
                                <Users className="h-4 w-4 text-muted-foreground/40" />
                                <span className="text-xs text-muted-foreground">Aucun employé dans ce département</span>
                              </div>
                            ) : (
                              <div className="px-5 py-3">
                                <div className="mb-2 flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Employés — Jours/an
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {employees.map((emp) => {
                                    const empEdit = empEdits.get(emp.id)
                                    const hasEdit = empEdits.has(emp.id)
                                    const currentVal = hasEdit ? empEdit : emp.annual_leave_days
                                    const isInherited = currentVal === null || currentVal === undefined
                                    const inputVal = hasEdit
                                      ? (empEdit === null ? '' : String(empEdit))
                                      : (emp.annual_leave_days !== null ? String(emp.annual_leave_days) : '')
                                    const isEmpModified = hasEdit && empEdit !== emp.annual_leave_days
                                    return (
                                      <div
                                        key={emp.id}
                                        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-background/60"
                                      >
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-xs font-medium text-primary/70">
                                            {emp.full_name?.charAt(0)?.toUpperCase() || '?'}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{emp.full_name}</p>
                                            {emp.job_title && (
                                              <p className="truncate text-[11px] text-muted-foreground">{emp.job_title}</p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max="60"
                                            value={inputVal}
                                            placeholder={String(dept.annual_leave_days)}
                                            onChange={(e) => handleEmpDaysChange(emp.id, e.target.value)}
                                            className={`h-8 w-20 text-center text-sm ${
                                              isEmpModified
                                                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/30'
                                                : isInherited
                                                ? 'border-border/40 text-muted-foreground italic'
                                                : 'border-border/60'
                                            }`}
                                          />
                                          {isInherited && !isEmpModified && (
                                            <span className="whitespace-nowrap text-[10px] italic text-muted-foreground/70">
                                              Hérite du dept.
                                            </span>
                                          )}
                                          {isEmpModified && (
                                            <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] px-1.5">
                                              modifié
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
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
        <div className="space-y-5">
          {/* Header row: title + department dropdown + save */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Jours ouvrables</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Configurez les demi-journées travaillées pour chaque jour de la semaine.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={wdDeptId === null ? '__default__' : String(wdDeptId)}
                onValueChange={(val) => {
                  const deptId = val === '__default__' ? null : Number(val)
                  setWdDeptId(deptId)
                  loadWorkingDays(companyId, deptId)
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Défaut entreprise</SelectItem>
                  {depts.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={saveWorkingDays} disabled={savingWorkingDays || !workingDays}>
                {savingWorkingDays ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </div>
          </div>

          {/* Info banner for department-specific config */}
          {wdDeptId && workingDays && workingDays.id === 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                Pas encore de configuration pour <span className="font-medium">{depts.find(d => d.id === wdDeptId)?.name}</span>. Les valeurs par défaut de l&apos;entreprise sont affichées. Cliquez &quot;Enregistrer&quot; pour personnaliser.
              </p>
            </div>
          )}

          {/* Day grid */}
          {workingDaysLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted/30" />
              ))}
            </div>
          ) : workingDays ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {DAY_LABELS.map(({ key, label }) => {
                const morningKey = `${key}_morning` as keyof WorkingDays
                const afternoonKey = `${key}_afternoon` as keyof WorkingDays
                const isMorning = workingDays[morningKey] as boolean
                const isAfternoon = workingDays[afternoonKey] as boolean
                const isFullDay = isMorning && isAfternoon
                const isPartial = isMorning || isAfternoon
                const isRest = !isMorning && !isAfternoon
                return (
                  <div
                    key={key}
                    className={`group relative overflow-hidden rounded-2xl border-2 transition-all ${
                      isFullDay
                        ? 'border-primary/60 bg-primary/[0.04] shadow-sm'
                        : isPartial
                        ? 'border-primary/30 bg-primary/[0.02]'
                        : 'border-border/50 bg-muted/10'
                    }`}
                  >
                    {/* Day header */}
                    <div className={`px-3 py-2.5 text-center ${isRest ? 'opacity-50' : ''}`}>
                      <p className="text-sm font-semibold tracking-tight">{label}</p>
                      <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        isFullDay ? 'text-primary' : isPartial ? 'text-primary/70' : 'text-muted-foreground'
                      }`}>
                        {isFullDay ? 'Journée complète' : isPartial ? 'Demi-journée' : 'Repos'}
                      </p>
                    </div>

                    {/* Divider */}
                    <div className="mx-3 border-t border-border/40" />

                    {/* Toggle buttons */}
                    <div className="flex flex-col gap-1.5 p-2.5">
                      <button
                        onClick={() => toggleHalfDay(key, 'morning')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                          isMorning
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                        }`}
                      >
                        <Sun className="h-3 w-3" />
                        Matin
                      </button>
                      <button
                        onClick={() => toggleHalfDay(key, 'afternoon')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                          isAfternoon
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                        }`}
                      >
                        <Moon className="h-3 w-3" />
                        Après-midi
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Summary bar */}
          {workingDays && !workingDaysLoading && (() => {
            const totalDays = DAY_LABELS.reduce((sum, { key }) => {
              const m = workingDays[`${key}_morning` as keyof WorkingDays] as boolean
              const a = workingDays[`${key}_afternoon` as keyof WorkingDays] as boolean
              return sum + (m ? 0.5 : 0) + (a ? 0.5 : 0)
            }, 0)
            const fullDays = DAY_LABELS.filter(({ key }) =>
              (workingDays[`${key}_morning` as keyof WorkingDays] as boolean) &&
              (workingDays[`${key}_afternoon` as keyof WorkingDays] as boolean)
            ).length
            const halfDays = DAY_LABELS.filter(({ key }) => {
              const m = workingDays[`${key}_morning` as keyof WorkingDays] as boolean
              const a = workingDays[`${key}_afternoon` as keyof WorkingDays] as boolean
              return (m || a) && !(m && a)
            }).length
            const restDays = DAY_LABELS.filter(({ key }) =>
              !(workingDays[`${key}_morning` as keyof WorkingDays] as boolean) &&
              !(workingDays[`${key}_afternoon` as keyof WorkingDays] as boolean)
            ).length
            return (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-muted/20 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="text-sm text-foreground"><span className="font-semibold">{fullDays}</span> jour(s) complet(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary/40" />
                  <span className="text-sm text-foreground"><span className="font-semibold">{halfDays}</span> demi-journée(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-sm text-foreground"><span className="font-semibold">{restDays}</span> repos</span>
                </div>
                <div className="ml-auto text-sm font-medium text-muted-foreground">
                  Total : <span className="text-foreground">{totalDays} jour(s)/semaine</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ─── Holidays Tab ──────────────────────────── */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {holidays.length} jour(s) férié(s) configuré(s)
              </p>
            </div>
            <Button onClick={() => setAddHolidayOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un jour férié
            </Button>
          </div>

          {holidaysLoading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement...</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left column: National (fixed) holidays */}
              <Card className="border-border/70">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Nationaux (fixes)</CardTitle>
                  <p className="text-xs text-muted-foreground">Même date chaque année</p>
                </CardHeader>
                <CardContent className="px-2 pb-2 pt-0">
                  {recurringHolidays.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun jour férié fixe</p>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto">
                      {recurringHolidays.map((h) => (
                        <div key={h.id} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                              {format(new Date(h.date + 'T00:00:00'), 'dd MMM', { locale: fr })}
                            </span>
                            <span className="truncate text-sm">{h.name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEditHoliday(h)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteHoliday(h.id)} disabled={deletingHolidayId === h.id}>
                              {deletingHolidayId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right column: Religious/variable holidays */}
              <Card className="border-border/70">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Religieux et variables</CardTitle>
                  <p className="text-xs text-muted-foreground">Date différente selon l&apos;année</p>
                </CardHeader>
                <CardContent className="px-2 pb-2 pt-0">
                  {variableHolidays.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Aucun jour férié variable</p>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto">
                      {(() => {
                        const byYear: Record<string, Holiday[]> = {}
                        variableHolidays.forEach(h => {
                          const year = h.date.substring(0, 4)
                          if (!byYear[year]) byYear[year] = []
                          byYear[year].push(h)
                        })
                        return Object.entries(byYear)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([year, yearHolidays]) => (
                            <div key={year}>
                              <div className="mx-1 mt-2 mb-1 rounded-lg bg-primary/8 px-2.5 py-1.5">
                                <span className="text-xs font-semibold text-primary">{year}</span>
                              </div>
                              {yearHolidays.map((h) => (
                                <div key={h.id} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/30">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                      {format(new Date(h.date + 'T00:00:00'), 'dd MMM', { locale: fr })}
                                    </span>
                                    <span className="truncate text-sm">{h.name}</span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEditHoliday(h)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteHoliday(h.id)} disabled={deletingHolidayId === h.id}>
                                      {deletingHolidayId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Add Holiday Dialog */}
          <Dialog open={addHolidayOpen} onOpenChange={setAddHolidayOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un jour férié</DialogTitle>
                <DialogDescription>
                  Les jours nationaux (fixes) se répètent chaque année à la même date. Les jours religieux/variables changent de date selon l&apos;année.
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
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setNewHolidayRecurring(!newHolidayRecurring)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        newHolidayRecurring ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          newHolidayRecurring ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <Label>Fixe (même date chaque année)</Label>
                  </div>
                  {newHolidayRecurring && (
                    <p className="text-xs text-muted-foreground">
                      Jour national : seuls le jour et le mois comptent. Désactivez pour un jour religieux/variable dont la date change chaque année.
                    </p>
                  )}
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

          {/* Edit Holiday Dialog */}
          <Dialog open={editingHoliday !== null} onOpenChange={(open) => { if (!open) setEditingHoliday(null) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifier le jour férié</DialogTitle>
                <DialogDescription>
                  Modifiez le nom, la date ou le type de récurrence.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du jour férié</Label>
                  <Input
                    value={editHolidayName}
                    onChange={(e) => setEditHolidayName(e.target.value)}
                    placeholder="Ex: Aïd Al-Fitr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <DatePicker
                    value={editHolidayDate}
                    onChange={setEditHolidayDate}
                    placeholder="Selectionnez la date"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditHolidayRecurring(!editHolidayRecurring)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        editHolidayRecurring ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          editHolidayRecurring ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <Label>Fixe (même date chaque année)</Label>
                  </div>
                  {editHolidayRecurring && (
                    <p className="text-xs text-muted-foreground">
                      Jour national : seuls le jour et le mois comptent. Désactivez pour un jour religieux/variable dont la date change chaque année.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingHoliday(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={updateHoliday}
                  disabled={savingEditHoliday || !editHolidayName.trim() || !editHolidayDate}
                >
                  {savingEditHoliday ? (
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

      {/* ─── Missions Tab ────────────────────────── */}
      {activeTab === 'missions' && (
        <MissionSettings companyId={companyId ?? null} />
      )}

      {/* ─── Permissions Tab ────────────────────────── */}
      {activeTab === 'permissions' && (
        <PermissionsManager />
      )}
    </div>
    </PageGuard>
  )
}

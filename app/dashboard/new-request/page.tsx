'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Calendar, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, Sun, RotateCcw, UserRoundSearch, MessageSquareText, ClipboardCheck, Users, Search, Briefcase, MapPin, Car, UserCheck, Globe, Home, FileText } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { Utilisateur, Holiday, WorkingDays, MissionScope } from '@/lib/types/database'
import { MANAGER_ROLES, TRANSPORT_OPTIONS, HALF_DAY_LABELS, MAX_CONSECUTIVE_RECOVERY_DAYS } from '@/lib/constants'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  countWorkingDays as countWorkingDaysUtil,
  fetchHolidays,
  fetchWorkingDays,
  getHolidaysInRange,
  nextWorkingDay,
  calculateMonthlyAccrual,
} from '@/lib/leave-utils'

type EmployeeOption = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'balance_conge' | 'balance_recuperation'>
type Colleague = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'department_id'>
type Tab = 'conge' | 'mission'

const TOTAL_STEPS = 4

const steps = [
  { number: 1, label: 'Type', description: 'Type de demande' },
  { number: 2, label: 'Dates', description: 'Periode du conge' },
  { number: 3, label: 'Details', description: 'Infos complementaires' },
  { number: 4, label: 'Resume', description: 'Verification et envoi' },
]

export default function NewRequestPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('tab') === 'mission' ? 'mission' : 'conge'
  )
  const { user } = useCurrentUser()
  const { activeRole, activeCompany, isHome } = useCompanyContext()
  const effectiveRole = activeRole || user?.role || 'EMPLOYEE'
  const [currentStep, setCurrentStep] = useState(1)
  const [requestType, setRequestType] = useState<'CONGE' | 'RECUPERATION'>('CONGE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startHalfDay, setStartHalfDay] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL')
  const [endHalfDay, setEndHalfDay] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL')
  const [reason, setReason] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // On-behalf-of state
  const [onBehalfOfId, setOnBehalfOfId] = useState<string>('')
  const [employeeSearch, setEmployeeSearch] = useState('')

  // --- Mission form state ---
  const [isAssigning, setIsAssigning] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [missionScope, setMissionScope] = useState<MissionScope>('LOCAL')
  const [departureCity, setDepartureCity] = useState('')
  const [arrivalCity, setArrivalCity] = useState('')
  const [missionObject, setMissionObject] = useState('')
  const [missionStartDate, setMissionStartDate] = useState('')
  const [missionEndDate, setMissionEndDate] = useState('')
  const [transportType, setTransportType] = useState('')
  const [transportDetails, setTransportDetails] = useState('')
  const [missionReplacementId, setMissionReplacementId] = useState('')
  const [missionComments, setMissionComments] = useState('')
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [isSubmittingMission, setIsSubmittingMission] = useState(false)

  // Holiday-aware day counting
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [workingDaysConfig, setWorkingDaysConfig] = useState<WorkingDays>({
    id: 0, company_id: null, category_id: null,
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
    monday_morning: true, monday_afternoon: true,
    tuesday_morning: true, tuesday_afternoon: true,
    wednesday_morning: true, wednesday_afternoon: true,
    thursday_morning: true, thursday_afternoon: true,
    friday_morning: true, friday_afternoon: true,
    saturday_morning: true, saturday_afternoon: true,
    sunday_morning: false, sunday_afternoon: false,
  })

  // Monthly accrual: track used/pending CONGE days for the target employee
  const [congeUsedDays, setCongeUsedDays] = useState(0)
  const [congePendingDays, setCongePendingDays] = useState(0)

  const router = useRouter()
  const supabase = createClient()

  const isManager = MANAGER_ROLES.includes(effectiveRole)

  // The target employee for the request (self or selected employee)
  const targetEmployee = useMemo((): EmployeeOption | null => {
    if (onBehalfOfId) {
      return employees.find(e => e.id === onBehalfOfId) || null
    }
    if (user) {
      return {
        id: user.id,
        full_name: user.full_name,
        job_title: user.job_title,
        balance_conge: user.balance_conge,
        balance_recuperation: user.balance_recuperation,
      }
    }
    return null
  }, [user, onBehalfOfId, employees])

  const isOnBehalf = !!onBehalfOfId && onBehalfOfId !== user?.id

  useEffect(() => {
    if (user) {
      loadEmployees(user)
      loadColleagues(user.department_id)
      // Use active company for holidays/working days (not home company)
      const companyId = activeCompany?.id || user.company_id || undefined
      fetchHolidays(companyId).then(setHolidays)
      fetchWorkingDays(companyId).then(setWorkingDaysConfig)
    }
  }, [user, activeCompany?.id])

  // Auto-select "on behalf" mode when manager is on non-home company
  useEffect(() => {
    if (!isHome && isManager && !onBehalfOfId) {
      setOnBehalfOfId('_selecting')
    }
  }, [isHome, isManager])

  // Fetch used/pending CONGE days for the target employee (for monthly accrual)
  useEffect(() => {
    if (!targetEmployee) return
    const currentYear = new Date().getFullYear()
    const fetchUsage = async () => {
      const [{ data: usedData }, { data: pendingData }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('days_count')
          .eq('user_id', targetEmployee.id)
          .eq('request_type', 'CONGE')
          .eq('status', 'APPROVED')
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`),
        supabase
          .from('leave_requests')
          .select('days_count')
          .eq('user_id', targetEmployee.id)
          .eq('request_type', 'CONGE')
          .in('status', ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC'])
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`),
      ])
      setCongeUsedDays((usedData || []).reduce((sum, r) => sum + (r.days_count || 0), 0))
      setCongePendingDays((pendingData || []).reduce((sum, r) => sum + (r.days_count || 0), 0))
    }
    fetchUsage()
  }, [targetEmployee?.id])

  const loadEmployees = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, balance_conge, balance_recuperation, department_id')
        .eq('is_active', true)
        .order('full_name')

      // Filter by active company
      if (activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id)
      }

      // CHEF_SERVICE can only create on behalf of their department
      if (effectiveRole === 'CHEF_SERVICE' && userData.department_id) {
        query = query.eq('department_id', userData.department_id)
      }

      const { data, error } = await query
      if (error) throw error
      setEmployees(data || [])
    } catch (error) {
      console.error('Error loading employees:', error)
    }
  }

  const loadColleagues = async (departmentId: number | null) => {
    if (!departmentId) return
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, department_id')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      setColleagues(data || [])
    } catch {
      // silent
    }
  }

  const missionWorkingDays = countWorkingDaysUtil(missionStartDate, missionEndDate, workingDaysConfig, holidays)

  const handleMissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!departureCity.trim()) { toast.error('Veuillez indiquer la ville de départ'); return }
    if (!arrivalCity.trim()) { toast.error("Veuillez indiquer la ville d'arrivée"); return }
    if (!missionObject.trim()) { toast.error("Veuillez indiquer l'objet de la mission"); return }
    if (missionWorkingDays <= 0) { toast.error('La date de fin doit être après la date de début'); return }
    if (isAssigning && !selectedEmployeeId) { toast.error("Veuillez sélectionner l'employé"); return }
    setIsSubmittingMission(true)
    try {
      const missionUserId = isAssigning ? selectedEmployeeId : user.id
      const { error } = await supabase
        .from('mission_requests')
        .insert({
          user_id: missionUserId,
          assigned_by: isAssigning ? user.id : null,
          request_origin: isAssigning ? 'ASSIGNED' : 'SELF',
          mission_scope: missionScope,
          departure_city: departureCity.trim(),
          arrival_city: arrivalCity.trim(),
          mission_object: missionObject.trim(),
          start_date: missionStartDate,
          end_date: missionEndDate,
          days_count: missionWorkingDays,
          transport_type: transportType || null,
          transport_details: transportDetails.trim() || null,
          replacement_user_id: missionReplacementId || null,
          comments: missionComments.trim() || null,
          // Status is computed by the DB trigger based on creator's role.
          // Do NOT send status — the trigger overrides it.
        })
        .select()
        .single()
      if (error) throw error
      toast.success(isAssigning ? 'Ordre de mission assigné avec succès !' : 'Demande de mission soumise avec succès !')
      router.push('/dashboard/missions')
    } catch (error) {
      console.error('Error submitting mission:', error)
      toast.error("Erreur lors de la soumission de l'ordre de mission")
    } finally {
      setIsSubmittingMission(false)
    }
  }

  const workingDays = countWorkingDaysUtil(startDate, endDate, workingDaysConfig, holidays, startHalfDay, endHalfDay)

  // Monthly accrual for CONGE: available = (annual / 12 * month) - used - pending
  const congeAccrual = useMemo(() => {
    const annual = targetEmployee?.balance_conge || 0
    return calculateMonthlyAccrual(annual, congeUsedDays, congePendingDays)
  }, [targetEmployee?.balance_conge, congeUsedDays, congePendingDays])

  const availableBalance = requestType === 'CONGE'
    ? congeAccrual.availableNow
    : targetEmployee?.balance_recuperation || 0
  const balanceAfter = availableBalance - workingDays

  const canProceedToNext = (): boolean => {
    switch (currentStep) {
      case 1:
        return true
      case 2:
        return !!startDate && !!endDate && workingDays > 0 && balanceAfter >= 0
      case 3:
        return true
      case 4:
        return balanceAfter >= 0 && workingDays > 0
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canProceedToNext() && currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user || !targetEmployee) return

    if (workingDays <= 0) {
      toast.error('La date de fin doit etre apres la date de debut')
      return
    }

    if (balanceAfter < 0) {
      toast.error(`Solde insuffisant. Il n'y a que ${availableBalance} jours disponibles.`)
      return
    }

    if (requestType === 'RECUPERATION' && workingDays > MAX_CONSECUTIVE_RECOVERY_DAYS) {
      toast.error(`La récupération ne peut pas dépasser ${MAX_CONSECUTIVE_RECOVERY_DAYS} jours consécutifs. Veuillez combiner avec des jours de congé.`)
      return
    }

    setIsSubmitting(true)

    try {
      const returnDate = nextWorkingDay(addDays(new Date(endDate), 1), workingDaysConfig, holidays)
      const targetUserId = targetEmployee.id

      // Status is computed by the DB trigger based on creator's role.
      // Do NOT send status — the trigger overrides it.
      const { data: insertedRequest, error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: targetUserId,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          start_half_day: startHalfDay,
          end_half_day: endHalfDay,
          days_count: workingDays,
          return_date: format(returnDate, 'yyyy-MM-dd'),
          replacement_user_id: replacementId || null,
          reason: reason || null,
          balance_before: availableBalance,
          balance_conge_used: requestType === 'CONGE' ? workingDays : 0,
          balance_recuperation_used: requestType === 'RECUPERATION' ? workingDays : 0,
        })
        .select()
        .single()

      if (error) throw error

      const wasAutoApproved = insertedRequest?.status === 'APPROVED'

      // If created on behalf of someone, notify that employee
      if (isOnBehalf && insertedRequest) {
        const typeLabel = requestType === 'CONGE' ? 'conge' : 'recuperation'
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          title: wasAutoApproved ? 'Demande approuvee automatiquement' : 'Nouvelle demande creee pour vous',
          message: `${user.full_name} a cree une demande de ${typeLabel} du ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')} (${workingDays} jours) en votre nom.${wasAutoApproved ? ' La demande a ete approuvee automatiquement.' : ''}`,
          type: 'LEAVE_CREATED',
          related_request_id: insertedRequest.id,
          is_read: false,
        })
      }

      if (wasAutoApproved) {
        toast.success('Demande approuvee automatiquement !')
      } else {
        toast.success(
          isOnBehalf
            ? `Demande creee pour ${targetEmployee.full_name} avec succes !`
            : 'Demande de conge soumise avec succes !'
        )
      }
      router.push(wasAutoApproved ? '/dashboard/requests' : isOnBehalf ? '/dashboard/validations' : '/dashboard/requests')
    } catch (error) {
      console.error('Error submitting request:', error)
      toast.error('Erreur lors de la soumission de la demande')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter employees for on-behalf selector (exclude current user from search)
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.filter(e => e.id !== user?.id)
    const term = employeeSearch.toLowerCase()
    return employees.filter(e =>
      e.id !== user?.id &&
      (e.full_name?.toLowerCase().includes(term) || e.job_title?.toLowerCase().includes(term))
    )
  }, [employees, employeeSearch, user?.id])

  if (!user) return null

  const replacementName = replacementId
    ? employees.find(c => c.id === replacementId)?.full_name
    : null

  const selectedEmployeeName = onBehalfOfId
    ? employees.find(e => e.id === onBehalfOfId)?.full_name
    : null

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Nouvelle demande
        </h1>
        <p className="mt-2 text-muted-foreground">
          {activeTab === 'conge'
            ? `${steps[currentStep - 1].description} — Etape ${currentStep} sur ${TOTAL_STEPS}`
            : 'Remplissez le formulaire pour soumettre un ordre de mission'}
        </p>

        {/* Tab Bar */}
        <div className="mt-4 flex gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('conge')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'conge'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <FileText className={cn('h-4 w-4 shrink-0', activeTab === 'conge' ? 'text-primary' : '')} />
            <span>Congé / Récupération</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mission')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'mission'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <Briefcase className={cn('h-4 w-4 shrink-0', activeTab === 'mission' ? 'text-primary' : '')} />
            <span>Ordre de Mission</span>
          </button>
        </div>
      </div>

      {/* ========== LEAVE TAB ========== */}
      {activeTab === 'conge' && (<>

      {/* On-behalf banner when an employee is selected */}
      {isOnBehalf && targetEmployee && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {targetEmployee.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Demande pour {targetEmployee.full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {targetEmployee.job_title || 'Employe'} — Acquis: {congeAccrual.availableNow}j/{congeAccrual.annualTotal}j, Recup: {targetEmployee.balance_recuperation}j
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setOnBehalfOfId(''); setEmployeeSearch('') }}
          >
            Changer
          </Button>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="w-full">
        <div className="flex w-full items-center">
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-1 items-center">
              {/* Line before circle (except first) */}
              {index > 0 && (
                <div className={cn(
                  'h-0.5 flex-1 transition-colors duration-300',
                  currentStep >= step.number ? 'bg-primary' : 'bg-border'
                )} />
              )}
              {/* Circle */}
              <button
                type="button"
                onClick={() => { if (step.number < currentStep) setCurrentStep(step.number) }}
                className={cn(
                  'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs sm:text-sm font-semibold transition-all duration-300',
                  currentStep > step.number
                    ? 'border-primary bg-primary text-primary-foreground cursor-pointer'
                    : currentStep === step.number
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground cursor-default'
                )}
              >
                {currentStep > step.number ? <Check className="h-4 w-4" /> : step.number}
              </button>
              {/* Line after circle (except last) */}
              {index < steps.length - 1 && (
                <div className={cn(
                  'h-0.5 flex-1 transition-colors duration-300',
                  currentStep > step.number ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>
        {/* Labels row */}
        <div className="mt-2 flex w-full">
          {steps.map((step) => (
            <div key={step.number} className="flex-1 text-center">
              <span className={cn(
                'text-[11px] sm:text-xs font-medium',
                currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        {/* Step 1: Request Type + On-behalf selector for managers */}
        {currentStep === 1 && (
          <div key="step-1" className="animate-in fade-in duration-300 space-y-6">
            {/* Manager: create on behalf of employee */}
            {isManager && (
              <Card className="border-primary/20 bg-primary/[0.02]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Pour qui est cette demande ?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Toggle: self vs on-behalf */}
                    {/* When on non-home company, manager can only create on behalf of employees */}
                    {!isHome && isManager && activeTab === 'conge' && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Votre solde de conge est sur votre societe d&apos;origine. Vous pouvez creer des demandes pour les employes de {activeCompany?.name || 'cette societe'}.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setOnBehalfOfId(''); setEmployeeSearch('') }}
                        disabled={!isHome && isManager}
                        className={cn(
                          'rounded-2xl border-2 p-3 sm:p-4 text-left transition-all',
                          !onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30',
                          !isHome && isManager && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <p className="font-semibold text-xs sm:text-sm">Pour moi-meme</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Ma propre demande de conge</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnBehalfOfId('_selecting')}
                        className={cn(
                          'rounded-2xl border-2 p-3 sm:p-4 text-left transition-all',
                          onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30'
                        )}
                      >
                        <p className="font-semibold text-xs sm:text-sm">Pour un employe</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Creer au nom d&apos;un collaborateur</p>
                      </button>
                    </div>

                    {/* Employee picker (when "for employee" is selected) */}
                    {onBehalfOfId && (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                          <Input
                            placeholder="Rechercher un employe..."
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            className="pl-10 h-10"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/60 p-2">
                          {filteredEmployees.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">Aucun employe trouve</p>
                          ) : (
                            filteredEmployees.map(emp => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => { setOnBehalfOfId(emp.id); setEmployeeSearch('') }}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                                  onBehalfOfId === emp.id
                                    ? 'bg-primary/10 border border-primary/25'
                                    : 'hover:bg-muted/60'
                                )}
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {emp.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{emp.full_name}</p>
                                  {emp.job_title && (
                                    <p className="text-[11px] text-muted-foreground truncate">{emp.job_title}</p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[10px] text-muted-foreground">C: {emp.balance_conge}j</p>
                                  <p className="text-[10px] text-muted-foreground">R: {emp.balance_recuperation}j</p>
                                </div>
                                {onBehalfOfId === emp.id && (
                                  <Check className="h-4 w-4 shrink-0 text-primary" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-primary" />
                  Quel type de conge {isOnBehalf ? `pour ${selectedEmployeeName}` : 'souhaitez-vous'} ?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setRequestType('CONGE')}
                    className={cn(
                      'group relative rounded-2xl border-2 p-3 sm:p-5 text-left transition-all duration-200',
                      requestType === 'CONGE'
                        ? 'border-primary/50 bg-primary/5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_15%,transparent)]'
                        : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <div className={cn(
                            'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                            requestType === 'CONGE' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            <Sun className="h-4 w-4" />
                          </div>
                          <div className="font-semibold text-sm sm:text-lg">Conge</div>
                        </div>
                        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground">Conge annuel paye</p>
                      </div>
                      <div className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        requestType === 'CONGE' ? 'border-primary bg-primary' : 'border-border'
                      )}>
                        {requestType === 'CONGE' && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </div>
                    <div className={cn(
                      'mt-3 sm:mt-4 rounded-xl border px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm',
                      requestType === 'CONGE'
                        ? 'border-primary/20 bg-primary/5'
                        : 'border-border/50 bg-muted/40'
                    )}>
                      <span className="text-muted-foreground">Acquis ce mois:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {congeAccrual.availableNow}
                      </span>
                      <span className="text-muted-foreground"> / {congeAccrual.annualTotal} jours/an</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestType('RECUPERATION')}
                    className={cn(
                      'group relative rounded-2xl border-2 p-3 sm:p-5 text-left transition-all duration-200',
                      requestType === 'RECUPERATION'
                        ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--status-success-border)_30%,transparent)]'
                        : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <div className={cn(
                            'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                            requestType === 'RECUPERATION' ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-muted text-muted-foreground'
                          )}>
                            <RotateCcw className="h-4 w-4" />
                          </div>
                          <div className="font-semibold text-sm sm:text-lg">Recuperation</div>
                        </div>
                        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground">Jours de recuperation</p>
                      </div>
                      <div className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        requestType === 'RECUPERATION' ? 'border-[var(--status-success-text)] bg-[var(--status-success-text)]' : 'border-border'
                      )}>
                        {requestType === 'RECUPERATION' && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                    <div className={cn(
                      'mt-3 sm:mt-4 rounded-xl border px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm',
                      requestType === 'RECUPERATION'
                        ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]'
                        : 'border-border/50 bg-muted/40'
                    )}>
                      <span className="text-muted-foreground">Solde disponible:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {targetEmployee?.balance_recuperation ?? user.balance_recuperation} jours
                      </span>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Dates */}
        {currentStep === 2 && (
          <div key="step-2" className="animate-in fade-in duration-300 space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Selectionnez la periode
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Date de debut</Label>
                    <DatePicker
                      id="startDate"
                      value={startDate}
                      onChange={setStartDate}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      placeholder="Date de debut"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endDate">Date de fin</Label>
                    <DatePicker
                      id="endDate"
                      value={endDate}
                      onChange={setEndDate}
                      min={startDate || format(new Date(), 'yyyy-MM-dd')}
                      placeholder="Date de fin"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Demi-journée début</Label>
                    <div className="flex gap-2">
                      {(['FULL', 'MORNING', 'AFTERNOON'] as const).map(hd => (
                        <button key={hd} type="button"
                          onClick={() => setStartHalfDay(hd)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            startHalfDay === hd ? 'border-primary bg-primary/5 text-foreground' : 'border-border/70 text-muted-foreground'
                          }`}
                        >{HALF_DAY_LABELS[hd]}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Demi-journée fin</Label>
                    <div className="flex gap-2">
                      {(['FULL', 'MORNING', 'AFTERNOON'] as const).map(hd => (
                        <button key={hd} type="button"
                          onClick={() => setEndHalfDay(hd)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            endHalfDay === hd ? 'border-primary bg-primary/5 text-foreground' : 'border-border/70 text-muted-foreground'
                          }`}
                        >{HALF_DAY_LABELS[hd]}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {startDate && endDate && workingDays > 0 && (() => {
                  const excludedHolidays = getHolidaysInRange(startDate, endDate, workingDaysConfig, holidays)
                  const returnDate = nextWorkingDay(addDays(new Date(endDate), 1), workingDaysConfig, holidays)
                  return (
                    <>
                      <div className="status-progress rounded-2xl border p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              Duree calculee: {workingDays} jours ouvrables
                            </p>
                            <p className="mt-1 text-sm">
                              Date de reprise: {format(returnDate, 'EEEE dd MMMM yyyy', { locale: fr })}
                            </p>
                          </div>
                        </div>
                      </div>
                      {excludedHolidays.length > 0 && (
                        <div className="rounded-2xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3">
                          <p className="text-sm font-medium text-[var(--status-success-text)]">
                            {excludedHolidays.length} jour(s) ferié(s) exclu(s) du décompte :
                          </p>
                          <ul className="mt-1.5 space-y-0.5">
                            {excludedHolidays.map(h => (
                              <li key={h.id} className="text-sm text-[var(--status-success-text)]">
                                • {h.name} ({format(new Date(h.date + 'T00:00:00'), 'dd/MM', { locale: fr })})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )
                })()}

                {startDate && endDate && workingDays > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">{requestType === 'CONGE' ? 'Acquis' : 'Solde'}</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{availableBalance}j</p>
                      {requestType === 'CONGE' && (
                        <p className="text-[10px] text-muted-foreground">/ {congeAccrual.annualTotal}j an</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Demandes</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{workingDays}j</p>
                    </div>
                    <div className={cn(
                      'rounded-xl border p-3 text-center',
                      balanceAfter >= 0
                        ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]'
                        : 'border-[var(--status-alert-border)] bg-[var(--status-alert-bg)]'
                    )}>
                      <p className="text-xs text-muted-foreground">Reste</p>
                      <p className={cn(
                        'mt-1 text-lg font-semibold',
                        balanceAfter >= 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-alert-text)]'
                      )}>{balanceAfter}j</p>
                    </div>
                  </div>
                )}

                {balanceAfter < 0 && startDate && endDate && (
                  <div className="status-rejected rounded-2xl border p-3">
                    <p className="text-sm font-medium">
                      Solde insuffisant ! Veuillez reduire la duree ou changer le type de demande.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Additional Info */}
        {currentStep === 3 && (
          <div key="step-3" className="animate-in fade-in duration-300 space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundSearch className="h-5 w-5 text-primary" />
                  Remplacant (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="replacement">Selectionnez un collaborateur</Label>
                  <select
                    id="replacement"
                    value={replacementId}
                    onChange={(e) => setReplacementId(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">Aucun remplacant</option>
                    {employees
                      .filter(c => c.id !== (targetEmployee?.id || user.id))
                      .map((colleague) => (
                        <option key={colleague.id} value={colleague.id}>
                          {colleague.full_name} {colleague.job_title && `- ${colleague.job_title}`}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Choisissez la personne qui assurera le remplacement pendant l&apos;absence.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-primary" />
                  Motif (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Indiquez le motif de la demande de conge..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={500}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {reason.length}/500 caracteres
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Summary */}
        {currentStep === 4 && (
          <div key="step-4" className="animate-in fade-in duration-300 space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  Verifiez la demande
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="divide-y divide-border/50">
                  {isOnBehalf && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Demande pour</span>
                      <Badge className="bg-primary/10 text-primary border border-primary/25">
                        {selectedEmployeeName}
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Type de demande</span>
                    <span className="text-sm font-medium text-foreground">
                      {requestType === 'CONGE' ? 'Conge annuel' : 'Recuperation'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Date de debut</span>
                    <span className="text-sm font-medium text-foreground">
                      {startDate ? format(new Date(startDate), 'EEEE dd MMMM yyyy', { locale: fr }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Date de fin</span>
                    <span className="text-sm font-medium text-foreground">
                      {endDate ? format(new Date(endDate), 'EEEE dd MMMM yyyy', { locale: fr }) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Jours ouvrables</span>
                    <span className="text-sm font-semibold text-foreground">{workingDays} jours</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Date de reprise</span>
                    <span className="text-sm font-medium text-foreground">
                      {endDate ? format(nextWorkingDay(addDays(new Date(endDate), 1), workingDaysConfig, holidays), 'EEEE dd MMMM yyyy', { locale: fr }) : '—'}
                    </span>
                  </div>
                  {replacementName && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Remplacant</span>
                      <span className="text-sm font-medium text-foreground">{replacementName}</span>
                    </div>
                  )}
                  {reason && (
                    <div className="py-3.5">
                      <span className="text-sm text-muted-foreground">Motif</span>
                      <p className="mt-1.5 text-sm text-foreground">{reason}</p>
                    </div>
                  )}
                  {isOnBehalf && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Cree par</span>
                      <span className="text-sm font-medium text-foreground">{user.full_name}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              'border-border/70',
              balanceAfter >= 0 ? 'bg-[var(--status-success-bg)]/30' : 'bg-[var(--status-alert-bg)]/30'
            )}>
              <CardHeader>
                <CardTitle className="text-base">Impact sur le solde {isOnBehalf ? `de ${selectedEmployeeName}` : ''}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {requestType === 'CONGE' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Solde annuel (RH)</span>
                    <span className="font-medium">{congeAccrual.annualTotal} jours</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{requestType === 'CONGE' ? `Acquis (mois ${congeAccrual.currentMonth}/12)` : 'Solde actuel'}</span>
                  <span className="font-medium">{requestType === 'CONGE' ? congeAccrual.cumulativeEarned : availableBalance} jours</span>
                </div>
                {requestType === 'CONGE' && (congeUsedDays > 0 || congePendingDays > 0) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deja utilise/en cours</span>
                    <span className="font-medium">- {congeUsedDays + congePendingDays} jours</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Disponible</span>
                  <span className="font-medium">{availableBalance} jours</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Jours demandes</span>
                  <span className="font-medium">- {workingDays} jours</span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-3 text-sm">
                  <span className="font-medium text-foreground">Solde apres demande</span>
                  <span className={cn(
                    'font-bold',
                    balanceAfter >= 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-alert-text)]'
                  )}>
                    {balanceAfter} jours
                  </span>
                </div>

                {balanceAfter < 0 && (
                  <div className="status-rejected rounded-2xl border p-3 mt-2">
                    <p className="text-sm font-medium">
                      Solde insuffisant ! Veuillez revenir en arriere et ajuster les dates.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step Navigation */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={handlePrevious}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Precedent
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
          )}

          {currentStep < TOTAL_STEPS ? (
            <Button
              type="button"
              className="h-11 w-full"
              onClick={handleNext}
              disabled={!canProceedToNext()}
            >
              Suivant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmitting || balanceAfter < 0 || workingDays <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : (
                <span className="text-sm">{isOnBehalf ? `Creer pour ${selectedEmployeeName}` : 'Soumettre la demande'}</span>
              )}
            </Button>
          )}
        </div>
      </form>

      </>)}

      {/* ========== MISSION TAB ========== */}
      {activeTab === 'mission' && (
        <form onSubmit={handleMissionSubmit} className="space-y-6">
          {/* Mode: Self or Assign (managers only) */}
          {isManager && (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Type de demande
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => { setIsAssigning(false); setSelectedEmployeeId('') }}
                    className={cn(
                      'rounded-2xl border-2 p-4 text-left transition-all',
                      !isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="text-left">
                      <div className="text-lg font-semibold">Pour moi-même</div>
                      <div className="mt-1 text-sm text-muted-foreground">Je demande à partir en mission</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAssigning(true)}
                    className={cn(
                      'rounded-2xl border-2 p-4 text-left transition-all',
                      isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="text-left">
                      <div className="text-lg font-semibold">Assigner un employé</div>
                      <div className="mt-1 text-sm text-muted-foreground">Envoyer un employé en mission</div>
                    </div>
                  </button>
                </div>
                {isAssigning && (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="missionEmployee">Sélectionner l&apos;employé *</Label>
                    <select
                      id="missionEmployee"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      required={isAssigning}
                      className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                    >
                      <option value="">-- Choisir un employé --</option>
                      {employees
                        .filter((emp) => emp.id !== user.id)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name}{emp.job_title ? ` — ${emp.job_title}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mission Scope */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Portée de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setMissionScope('LOCAL')}
                  className={cn(
                    'rounded-2xl border-2 p-5 text-left transition-all',
                    missionScope === 'LOCAL'
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-accent/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      missionScope === 'LOCAL' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Home className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">Locale</div>
                      <div className="mt-1 text-sm text-muted-foreground">Mission au Maroc</div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMissionScope('INTERNATIONAL')}
                  className={cn(
                    'rounded-2xl border-2 p-5 text-left transition-all',
                    missionScope === 'INTERNATIONAL'
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-accent/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      missionScope === 'INTERNATIONAL' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Globe className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">Internationale</div>
                      <div className="mt-1 text-sm text-muted-foreground">Mission à l&apos;étranger</div>
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Cities */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Itinéraire *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="departureCity">Ville de départ</Label>
                  <div className="relative">
                    <Input
                      id="departureCity"
                      placeholder={missionScope === 'LOCAL' ? 'Ex: Rabat' : 'Ex: Casablanca'}
                      value={departureCity}
                      onChange={(e) => setDepartureCity(e.target.value)}
                      required
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrivalCity">
                    Ville d&apos;arrivée {missionScope === 'INTERNATIONAL' && '(Pays + Ville)'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="arrivalCity"
                      placeholder={missionScope === 'LOCAL' ? 'Ex: Marrakech, Tanger...' : 'Ex: Paris - France, Dubai - EAU...'}
                      value={arrivalCity}
                      onChange={(e) => setArrivalCity(e.target.value)}
                      required
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mission Object */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Objet de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Décrivez l'objectif de la mission..."
                value={missionObject}
                onChange={(e) => setMissionObject(e.target.value)}
                required
                rows={3}
                maxLength={500}
              />
              <p className="mt-2 text-xs text-muted-foreground">{missionObject.length}/500 caractères</p>
            </CardContent>
          </Card>

          {/* Mission Dates */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Période de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="missionStartDate">Date de début</Label>
                  <DatePicker
                    id="missionStartDate"
                    value={missionStartDate}
                    onChange={setMissionStartDate}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    placeholder="Date de début"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="missionEndDate">Date de fin</Label>
                  <DatePicker
                    id="missionEndDate"
                    value={missionEndDate}
                    onChange={setMissionEndDate}
                    min={missionStartDate || format(new Date(), 'yyyy-MM-dd')}
                    placeholder="Date de fin"
                  />
                </div>
              </div>
              {missionStartDate && missionEndDate && missionWorkingDays > 0 && (
                <div className="status-progress rounded-2xl border p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Durée: {missionWorkingDays} jour{missionWorkingDays > 1 ? 's' : ''} ouvrable{missionWorkingDays > 1 ? 's' : ''}
                      </p>
                      <p className="mt-1 text-sm">
                        Du {format(new Date(missionStartDate), 'EEEE dd MMMM yyyy', { locale: fr })} au{' '}
                        {format(new Date(missionEndDate), 'EEEE dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transport */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                Moyen de transport
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transportType">Type de transport</Label>
                <select
                  id="transportType"
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                >
                  <option value="">-- Sélectionner --</option>
                  {TRANSPORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {transportType && (
                <div className="space-y-2">
                  <Label htmlFor="transportDetails">
                    Détails du transport
                    {transportType === 'voiture_personnelle' && ' (Immatriculation)'}
                    {transportType === 'voiture_service' && ' (Immatriculation)'}
                    {transportType === 'avion' && ' (N° de vol)'}
                    {transportType === 'train' && ' (N° de train)'}
                  </Label>
                  <Input
                    id="transportDetails"
                    placeholder={transportType.includes('voiture') ? 'Ex: AB-123-CD' : transportType === 'avion' ? 'Ex: AT-530' : 'Précisez...'}
                    value={transportDetails}
                    onChange={(e) => setTransportDetails(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Replacement */}
          {colleagues.length > 0 && (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Intérimaire (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="missionReplacement">Sélectionnez un collègue intérimaire</Label>
                  <select
                    id="missionReplacement"
                    value={missionReplacementId}
                    onChange={(e) => setMissionReplacementId(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">Aucun intérimaire</option>
                    {colleagues
                      .filter((c) => c.id !== user.id && c.id !== selectedEmployeeId)
                      .map((colleague) => (
                        <option key={colleague.id} value={colleague.id}>
                          {colleague.full_name}{colleague.job_title ? ` — ${colleague.job_title}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
                Commentaires (Optionnel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Commentaires supplémentaires..."
                value={missionComments}
                onChange={(e) => setMissionComments(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="mt-2 text-xs text-muted-foreground">{missionComments.length}/500 caractères</p>
            </CardContent>
          </Card>

          {/* Mission Summary */}
          <Card className="border-border/70 bg-secondary/35">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Récapitulatif
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="divide-y divide-border/50">
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="text-sm font-medium text-foreground">Ordre de Mission</span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Portée</span>
                  <span className="text-sm font-medium text-foreground">
                    {missionScope === 'LOCAL' ? 'Locale (Maroc)' : 'Internationale'}
                  </span>
                </div>
                {isAssigning && selectedEmployeeId && (
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Missionnaire</span>
                    <span className="text-sm font-medium text-foreground">
                      {employees.find((e) => e.id === selectedEmployeeId)?.full_name || '—'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Trajet</span>
                  <span className="text-sm font-medium text-foreground">
                    {departureCity && arrivalCity ? `${departureCity} → ${arrivalCity}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Objet</span>
                  <span className="max-w-[60%] truncate text-right text-sm font-medium text-foreground">{missionObject || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Durée</span>
                  <span className="text-sm font-medium text-foreground">
                    {missionWorkingDays > 0 ? `${missionWorkingDays} jour${missionWorkingDays > 1 ? 's' : ''} ouvrable${missionWorkingDays > 1 ? 's' : ''}` : '—'}
                  </span>
                </div>
                {transportType && (
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Transport</span>
                    <span className="text-sm font-medium text-foreground">
                      {TRANSPORT_OPTIONS.find((t) => t.value === transportType)?.label}
                      {transportDetails ? ` (${transportDetails})` : ''}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => router.back()} disabled={isSubmittingMission}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmittingMission || missionWorkingDays <= 0 || !departureCity || !arrivalCity || !missionObject}
            >
              {isSubmittingMission ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : isAssigning ? (
                <span className="text-sm">Assigner la mission</span>
              ) : (
                <span className="text-sm">Soumettre la demande</span>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

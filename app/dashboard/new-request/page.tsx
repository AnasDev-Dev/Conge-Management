'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Calendar, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, Sun, RotateCcw, UserRoundSearch, MessageSquareText, ClipboardCheck, Users, Search } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { Utilisateur } from '@/lib/types/database'
import { MANAGER_ROLES } from '@/lib/constants'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'

type EmployeeOption = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'balance_conge' | 'balance_recuperation'>

const TOTAL_STEPS = 4

const steps = [
  { number: 1, label: 'Type', description: 'Type de demande' },
  { number: 2, label: 'Dates', description: 'Periode du conge' },
  { number: 3, label: 'Details', description: 'Infos complementaires' },
  { number: 4, label: 'Resume', description: 'Verification et envoi' },
]

export default function NewRequestPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [requestType, setRequestType] = useState<'CONGE' | 'RECUPERATION'>('CONGE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // On-behalf-of state
  const [onBehalfOfId, setOnBehalfOfId] = useState<string>('')
  const [employeeSearch, setEmployeeSearch] = useState('')

  const router = useRouter()
  const supabase = createClient()

  const isManager = user ? MANAGER_ROLES.includes(user.role) : false

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
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr)
      setUser(userData)
      loadEmployees()
    }
  }, [])

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, balance_conge, balance_recuperation')
        .eq('is_active', true)
        .order('full_name')

      if (error) throw error
      setEmployees(data || [])
    } catch (error) {
      console.error('Error loading employees:', error)
    }
  }

  const calculateWorkingDays = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)

    let days = 0
    let currentDate = new Date(start)

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days++
      }
      currentDate = addDays(currentDate, 1)
    }

    return days
  }

  const workingDays = calculateWorkingDays()
  const availableBalance = requestType === 'CONGE'
    ? targetEmployee?.balance_conge || 0
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

    setIsSubmitting(true)

    try {
      const returnDate = addDays(new Date(endDate), 1)
      const targetUserId = targetEmployee.id

      const { data: insertedRequest, error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: targetUserId,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          days_count: workingDays,
          return_date: format(returnDate, 'yyyy-MM-dd'),
          replacement_user_id: replacementId || null,
          status: 'PENDING',
          reason: reason || null,
          balance_before: availableBalance,
          balance_conge_used: requestType === 'CONGE' ? workingDays : 0,
          balance_recuperation_used: requestType === 'RECUPERATION' ? workingDays : 0,
        })
        .select()
        .single()

      if (error) throw error

      // If created on behalf of someone, notify that employee
      if (isOnBehalf && insertedRequest) {
        const typeLabel = requestType === 'CONGE' ? 'conge' : 'recuperation'
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          title: 'Nouvelle demande creee pour vous',
          message: `${user.full_name} a cree une demande de ${typeLabel} du ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')} (${workingDays} jours) en votre nom.`,
          type: 'LEAVE_CREATED',
          related_request_id: insertedRequest.id,
          is_read: false,
        })
      }

      toast.success(
        isOnBehalf
          ? `Demande creee pour ${targetEmployee.full_name} avec succes !`
          : 'Demande de conge soumise avec succes !'
      )
      router.push(isOnBehalf ? '/dashboard/validations' : '/dashboard/requests')
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
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Nouvelle demande de conge
        </h1>
        <p className="mt-2 text-muted-foreground">
          {steps[currentStep - 1].description} — Etape {currentStep} sur {TOTAL_STEPS}
        </p>
      </div>

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
              {targetEmployee.job_title || 'Employe'} — Solde conge: {targetEmployee.balance_conge}j, Recup: {targetEmployee.balance_recuperation}j
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
      <div className="flex items-start gap-0">
        {steps.map((step, index) => (
          <div key={step.number} className="flex flex-1 items-start">
            <div className="flex w-full flex-col items-center">
              <div className="flex w-full items-center">
                {index > 0 && (
                  <div className={cn(
                    'h-0.5 flex-1 rounded-full transition-all duration-300',
                    currentStep > step.number - 1 ? 'bg-primary' : 'bg-border'
                  )} />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (step.number < currentStep) setCurrentStep(step.number)
                  }}
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300',
                    currentStep > step.number
                      ? 'border-primary bg-primary text-primary-foreground cursor-pointer'
                      : currentStep === step.number
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground cursor-default'
                  )}
                >
                  {currentStep > step.number ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </button>
                {index < steps.length - 1 && (
                  <div className={cn(
                    'h-0.5 flex-1 rounded-full transition-all duration-300',
                    currentStep > step.number ? 'bg-primary' : 'bg-border'
                  )} />
                )}
              </div>
              <span className={cn(
                'mt-2.5 text-center text-xs font-medium transition-colors hidden sm:block',
                currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
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
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setOnBehalfOfId(''); setEmployeeSearch('') }}
                        className={cn(
                          'rounded-2xl border-2 p-4 text-left transition-all',
                          !onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30'
                        )}
                      >
                        <p className="font-semibold text-sm">Pour moi-meme</p>
                        <p className="text-xs text-muted-foreground mt-1">Ma propre demande de conge</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnBehalfOfId('_selecting')}
                        className={cn(
                          'rounded-2xl border-2 p-4 text-left transition-all',
                          onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30'
                        )}
                      >
                        <p className="font-semibold text-sm">Pour un employe</p>
                        <p className="text-xs text-muted-foreground mt-1">Creer au nom d&apos;un collaborateur</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setRequestType('CONGE')}
                    className={cn(
                      'group relative rounded-2xl border-2 p-5 text-left transition-all duration-200',
                      requestType === 'CONGE'
                        ? 'border-primary/50 bg-primary/5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_15%,transparent)]'
                        : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                            requestType === 'CONGE' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            <Sun className="h-4.5 w-4.5" />
                          </div>
                          <div className="font-semibold text-lg">Conge</div>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Conge annuel paye</p>
                      </div>
                      <div className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        requestType === 'CONGE' ? 'border-primary bg-primary' : 'border-border'
                      )}>
                        {requestType === 'CONGE' && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </div>
                    <div className={cn(
                      'mt-4 rounded-xl border px-3.5 py-2.5 text-sm',
                      requestType === 'CONGE'
                        ? 'border-primary/20 bg-primary/5'
                        : 'border-border/50 bg-muted/40'
                    )}>
                      <span className="text-muted-foreground">Solde disponible:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {targetEmployee?.balance_conge ?? user.balance_conge} jours
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestType('RECUPERATION')}
                    className={cn(
                      'group relative rounded-2xl border-2 p-5 text-left transition-all duration-200',
                      requestType === 'RECUPERATION'
                        ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--status-success-border)_30%,transparent)]'
                        : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                            requestType === 'RECUPERATION' ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-muted text-muted-foreground'
                          )}>
                            <RotateCcw className="h-4.5 w-4.5" />
                          </div>
                          <div className="font-semibold text-lg">Recuperation</div>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Jours de recuperation</p>
                      </div>
                      <div className={cn(
                        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        requestType === 'RECUPERATION' ? 'border-[var(--status-success-text)] bg-[var(--status-success-text)]' : 'border-border'
                      )}>
                        {requestType === 'RECUPERATION' && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                    <div className={cn(
                      'mt-4 rounded-xl border px-3.5 py-2.5 text-sm',
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {startDate && endDate && workingDays > 0 && (
                  <div className="status-progress rounded-2xl border p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Duree calculee: {workingDays} jours ouvrables
                        </p>
                        <p className="mt-1 text-sm">
                          Date de reprise: {format(addDays(new Date(endDate), 1), 'EEEE dd MMMM yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {startDate && endDate && workingDays > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Solde actuel</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{availableBalance}j</p>
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
                      {endDate ? format(addDays(new Date(endDate), 1), 'EEEE dd MMMM yyyy', { locale: fr }) : '—'}
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Solde actuel</span>
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
        <div className="mt-6 flex gap-4">
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handlePrevious}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Precedent
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
          )}

          {currentStep < TOTAL_STEPS ? (
            <Button
              type="button"
              className="flex-1"
              onClick={handleNext}
              disabled={!canProceedToNext()}
            >
              Suivant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || balanceAfter < 0 || workingDays <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Soumission en cours...
                </>
              ) : (
                isOnBehalf ? `Creer pour ${selectedEmployeeName}` : 'Soumettre la demande'
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

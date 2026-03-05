'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Sun,
  Sunset,
  CalendarDays,
  User as UserIcon,
} from 'lucide-react'
import { RecoveryRequest, Utilisateur } from '@/lib/types/database'
import {
  MANAGER_ROLES,
  RECOVERY_WORK_TYPE_LABELS,
  RECOVERY_PERIOD_OPTIONS,
  getRecoveryStatusLabel,
  getRecoveryStatusClass,
} from '@/lib/constants'
import type { RecoveryPeriod } from '@/lib/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'

interface RecoveryRequestWithUser extends RecoveryRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'department_id'> | null
}

const STATUS_TABS = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'VALIDATED', label: 'Validees' },
  { value: 'REJECTED', label: 'Rejetees' },
] as const

const PERIOD_ICONS: Record<RecoveryPeriod, typeof Sun> = {
  MORNING: Sun,
  AFTERNOON: Sunset,
  FULL: CalendarDays,
}

const PERIOD_DISPLAY_LABELS: Record<string, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  FULL: 'Journée complète',
}

export default function RecoveryRequestsPage() {
  const { user } = useCurrentUser()
  const { activeRole } = useCompanyContext()
  const effectiveRole = activeRole || user?.role || 'EMPLOYEE'
  const [requests, setRequests] = useState<RecoveryRequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const supabase = useMemo(() => createClient(), [])

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [formPeriod, setFormPeriod] = useState<RecoveryPeriod>('FULL')
  const [formDateWorked, setFormDateWorked] = useState<string>('')
  const [formWorkType, setFormWorkType] = useState<string>('')
  const [formReason, setFormReason] = useState<string>('')
  const [formEmployeeId, setFormEmployeeId] = useState<string>('')
  const [employees, setEmployees] = useState<Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>[]>([])

  // Detail dialog state
  const [detailRequest, setDetailRequest] = useState<RecoveryRequestWithUser | null>(null)

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Validating state
  const [validatingId, setValidatingId] = useState<number | null>(null)

  const isManager = MANAGER_ROLES.includes(effectiveRole)
  const isEmployee = effectiveRole === 'EMPLOYEE'

  // Auto-calculate days from period
  const calculatedDays = useMemo(() => {
    const opt = RECOVERY_PERIOD_OPTIONS.find((o) => o.value === formPeriod)
    return opt?.days ?? 1
  }, [formPeriod])

  useEffect(() => {
    if (user) {
      loadRequests()
      if (MANAGER_ROLES.includes(effectiveRole)) {
        loadEmployees()
      }
    }
  }, [user])

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title')
        .eq('is_active', true)
        .order('full_name')
      if (!error && data) setEmployees(data)
    } catch (e) {
      console.error('Error loading employees:', e)
    }
  }

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('recovery_requests')
        .select('*, user:utilisateurs!user_id(id, full_name, job_title, department_id)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading recovery requests:', error)
      toast.error('Erreur lors du chargement des demandes de recuperation')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormPeriod('FULL')
    setFormDateWorked('')
    setFormWorkType('')
    setFormReason('')
    setFormEmployeeId('')
  }

  const openCreateDialog = () => {
    resetForm()
    setCreateDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!formDateWorked || !formWorkType) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    const targetUserId = isManager ? formEmployeeId : user.id
    if (isManager && !targetUserId) {
      toast.error('Veuillez selectionner un employe')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_recovery_request', {
        p_user_id: targetUserId,
        p_days: calculatedDays,
        p_date_worked: formDateWorked,
        p_work_type: formWorkType,
        p_reason: formReason || null,
        p_period: formPeriod,
      })

      if (error) throw error

      toast.success(
        `Credit de ${calculatedDays === 1 ? '1 jour' : '0.5 jour'} soumis avec succes`
      )
      setCreateDialogOpen(false)
      resetForm()
      await loadRequests()
    } catch (error: any) {
      console.error('Error submitting recovery request:', error)
      toast.error(error.message || 'Erreur lors de la soumission de la demande')
    } finally {
      setSubmitting(false)
    }
  }

  const handleValidate = async (requestId: number) => {
    if (!user) return
    setValidatingId(requestId)
    try {
      const { error } = await supabase.rpc('validate_recovery_request', {
        p_request_id: requestId,
        p_validator_id: user.id,
      })

      if (error) throw error

      toast.success('Demande validee avec succes')
      await loadRequests()
    } catch (error: any) {
      console.error('Error validating recovery request:', error)
      toast.error(error.message || 'Erreur lors de la validation')
    } finally {
      setValidatingId(null)
    }
  }

  const openRejectDialog = (requestId: number) => {
    setRejectingRequestId(requestId)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!user || !rejectingRequestId) return
    if (!rejectReason.trim()) {
      toast.error('Veuillez saisir un motif de rejet')
      return
    }

    setRejecting(true)
    try {
      const { error } = await supabase.rpc('reject_recovery_request', {
        p_request_id: rejectingRequestId,
        p_rejector_id: user.id,
        p_reason: rejectReason.trim(),
      })

      if (error) throw error

      toast.success('Demande rejetee')
      setRejectDialogOpen(false)
      setRejectingRequestId(null)
      setRejectReason('')
      await loadRequests()
    } catch (error: any) {
      console.error('Error rejecting recovery request:', error)
      toast.error(error.message || 'Erreur lors du rejet')
    } finally {
      setRejecting(false)
    }
  }

  const filteredRequests = useMemo(() => {
    let filtered = requests

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((r) => r.status === statusFilter)
    }

    return filtered
  }, [requests, statusFilter])

  const stats = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((r) => r.status === 'PENDING').length,
      validated: requests.filter((r) => r.status === 'VALIDATED').length,
      rejected: requests.filter((r) => r.status === 'REJECTED').length,
    }),
    [requests]
  )

  if (!user) return null

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Header with create button */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Credit Recuperation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {isManager
              ? 'Creditez et validez les jours de recuperation des employes.'
              : 'Declarez les jours travailles pendant vos repos.'}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nouveau credit</span>
          <span className="sm:hidden">Crediter</span>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Total</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 sm:flex">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.pending}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">En attente</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 sm:flex">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.validated}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Validees</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 sm:flex">
            <XCircle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.rejected}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Rejetees</p>
          </div>
        </div>
      </div>

      {/* Requests list */}
      <Card className="flex min-h-0 flex-col border-border/70 bg-card shadow-none backdrop-blur-none md:flex-1 md:sticky md:top-0">
        <CardHeader className="shrink-0 border-b border-border/70 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4.5 w-4.5 text-primary" />
              Liste des demandes
              {statusFilter !== 'ALL' && (
                <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-normal text-primary">
                  {filteredRequests.length} resultats
                </span>
              )}
            </CardTitle>
          </div>
          {/* Status tabs */}
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  statusFilter === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 pt-0">
          {loading ? (
            <div className="pt-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-border/50 p-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RotateCcw className="mb-4 h-14 w-14 text-muted-foreground/30" />
              <h3 className="mb-1 text-base font-medium text-foreground">
                {statusFilter !== 'ALL' ? 'Aucune demande trouvee' : 'Aucune demande de recuperation'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {statusFilter !== 'ALL'
                  ? 'Essayez de modifier vos filtres'
                  : isEmployee
                    ? 'Cliquez sur "Nouveau credit" pour soumettre votre premiere demande'
                    : 'Aucune demande de recuperation pour le moment'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRequests.map((request) => {
                const PeriodIcon = PERIOD_ICONS[request.period as RecoveryPeriod] ?? CalendarDays
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setDetailRequest(request)}
                    className="group rounded-2xl border border-border/70 bg-background/80 p-4 text-left transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    {/* Top row: employee/date + status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {isManager && request.user && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <p className="truncate font-medium text-foreground text-sm">
                              {request.user.full_name}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(request.date_worked + 'T00:00:00'), 'dd MMMM yyyy', {
                            locale: fr,
                          })}
                        </p>
                      </div>
                      <Badge className={`shrink-0 ${getRecoveryStatusClass(request.status)}`}>
                        {getRecoveryStatusLabel(request.status)}
                      </Badge>
                    </div>

                    {/* Info chips */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        {request.days} jour{request.days > 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs font-medium text-foreground">
                        <PeriodIcon className="h-3 w-3" />
                        {PERIOD_DISPLAY_LABELS[request.period] ?? 'Journee'}
                      </span>
                      <Badge variant="secondary" className="border border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84] text-[11px]">
                        {RECOVERY_WORK_TYPE_LABELS[request.work_type] ?? request.work_type}
                      </Badge>
                    </div>

                    {/* Reason preview */}
                    {request.reason && (
                      <p className="mt-2.5 line-clamp-1 text-xs text-muted-foreground">
                        {request.reason}
                      </p>
                    )}

                    {/* Submitted date */}
                    <p className="mt-2 text-[11px] text-muted-foreground/70">
                      Soumis le {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Recovery Credit Dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <RotateCcw className="h-4 w-4 text-primary" />
              </div>
              {isManager ? 'Crediter un employe' : 'Declarer un jour travaille'}
            </DialogTitle>
            <DialogDescription>
              {isManager
                ? 'Creditez les jours de recuperation pour un employe ayant travaille un jour de repos.'
                : 'Declarez un jour travaille pendant votre repos pour obtenir un credit de recuperation.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Employee picker — managers only */}
            {isManager && (
              <div className="space-y-2">
                <Label htmlFor="dialog-employee">Employe</Label>
                <Select value={formEmployeeId} onValueChange={setFormEmployeeId} required>
                  <SelectTrigger id="dialog-employee" className="w-full">
                    <SelectValue placeholder="Selectionner un employe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name} {emp.job_title ? `— ${emp.job_title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Period toggle buttons */}
            <div className="space-y-2">
              <Label>Periode travaillee</Label>
              <div className="grid grid-cols-3 gap-2">
                {RECOVERY_PERIOD_OPTIONS.map((opt) => {
                  const Icon = PERIOD_ICONS[opt.value]
                  const isSelected = formPeriod === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormPeriod(opt.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border/70 bg-background text-muted-foreground hover:border-border hover:bg-secondary/50'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground/70'}`} />
                      <span className="text-xs leading-tight">{opt.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {opt.days === 1 ? '1 jour' : '0.5 jour'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Date worked & Work type side by side */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dialog-date-worked">Date travaillee</Label>
                <DatePicker
                  id="dialog-date-worked"
                  value={formDateWorked}
                  onChange={setFormDateWorked}
                  placeholder="Selectionnez la date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dialog-work-type">Type de jour</Label>
                <Select value={formWorkType} onValueChange={setFormWorkType} required>
                  <SelectTrigger id="dialog-work-type" className="w-full">
                    <SelectValue placeholder="Selectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECOVERY_WORK_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="dialog-reason">
                Motif <span className="text-muted-foreground font-normal">(optionnel)</span>
              </Label>
              <Textarea
                id="dialog-reason"
                placeholder="Ex: Tournoi sportif, permanence weekend, inventaire..."
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                className="min-h-20 resize-none"
              />
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-primary">
                Credit total : {calculatedDays === 1 ? '1 jour' : '0.5 jour'}
              </p>
              <p className="mt-0.5 text-xs text-primary/70">
                {formPeriod === 'FULL'
                  ? 'Journee complete travaillee'
                  : formPeriod === 'MORNING'
                    ? 'Matinee travaillee (demi-journee)'
                    : 'Apres-midi travaillee (demi-journee)'}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={submitting || !formWorkType || !formDateWorked || (isManager && !formEmployeeId)}
              >
                {submitting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {isManager ? 'Crediter' : 'Soumettre'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent className="sm:max-w-md">
          {detailRequest && (() => {
            const PeriodIcon = PERIOD_ICONS[detailRequest.period as RecoveryPeriod] ?? CalendarDays
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <RotateCcw className="h-4 w-4 text-primary" />
                    </div>
                    Detail de la demande
                  </DialogTitle>
                  <DialogDescription>
                    Demande #{detailRequest.id} — soumise le{' '}
                    {format(new Date(detailRequest.created_at), 'dd MMMM yyyy', { locale: fr })}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Statut</span>
                    <Badge className={getRecoveryStatusClass(detailRequest.status)}>
                      {getRecoveryStatusLabel(detailRequest.status)}
                    </Badge>
                  </div>

                  {/* Employee */}
                  {isManager && detailRequest.user && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Employe</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{detailRequest.user.full_name}</p>
                        {detailRequest.user.job_title && (
                          <p className="text-xs text-muted-foreground">{detailRequest.user.job_title}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-border/70" />

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-secondary/60 p-3">
                      <p className="text-xs text-muted-foreground">Credit</p>
                      <p className="mt-0.5 text-lg font-bold text-primary">
                        {detailRequest.days} <span className="text-sm font-medium">jour{detailRequest.days > 1 ? 's' : ''}</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-secondary/60 p-3">
                      <p className="text-xs text-muted-foreground">Periode</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <PeriodIcon className="h-4 w-4 text-foreground" />
                        <p className="font-medium text-foreground">
                          {PERIOD_DISPLAY_LABELS[detailRequest.period] ?? 'Journee'}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-secondary/60 p-3">
                      <p className="text-xs text-muted-foreground">Date travaillee</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {format(new Date(detailRequest.date_worked + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    <div className="rounded-xl bg-secondary/60 p-3">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {RECOVERY_WORK_TYPE_LABELS[detailRequest.work_type] ?? detailRequest.work_type}
                      </p>
                    </div>
                  </div>

                  {/* Reason */}
                  {detailRequest.reason && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Motif</p>
                      <p className="rounded-xl bg-secondary/60 p-3 text-sm text-foreground">
                        {detailRequest.reason}
                      </p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {detailRequest.status === 'REJECTED' && detailRequest.rejection_reason && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="mb-1 text-xs font-medium text-red-700">Motif de rejet</p>
                      <p className="text-sm text-red-700">{detailRequest.rejection_reason}</p>
                    </div>
                  )}
                </div>

                {/* Manager actions */}
                {isManager && detailRequest.status === 'PENDING' && (
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                      onClick={() => {
                        setDetailRequest(null)
                        openRejectDialog(detailRequest.id)
                      }}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Rejeter
                    </Button>
                    <Button
                      className="flex-1 border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={async () => {
                        await handleValidate(detailRequest.id)
                        setDetailRequest(null)
                      }}
                      disabled={validatingId === detailRequest.id}
                    >
                      {validatingId === detailRequest.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                      )}
                      Valider
                    </Button>
                  </DialogFooter>
                )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Veuillez saisir le motif du rejet de cette demande de recuperation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Motif du rejet</Label>
            <Input
              id="reject-reason"
              placeholder="Saisissez le motif du rejet..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejecting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectReason.trim()}
            >
              {rejecting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-destructive-foreground/20 border-t-destructive-foreground" />
                  Rejet en cours...
                </>
              ) : (
                <>
                  <XCircle className="mr-1 h-4 w-4" />
                  Confirmer le rejet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

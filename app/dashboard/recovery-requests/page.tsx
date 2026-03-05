'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Send,
  User as UserIcon,
} from 'lucide-react'
import { RecoveryRequest, Utilisateur } from '@/lib/types/database'
import { MANAGER_ROLES, RECOVERY_WORK_TYPE_LABELS, getRecoveryStatusLabel, getRecoveryStatusClass } from '@/lib/constants'
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

export default function RecoveryRequestsPage() {
  const { user } = useCurrentUser()
  const [requests, setRequests] = useState<RecoveryRequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const supabase = useMemo(() => createClient(), [])

  // Form state
  const [formDays, setFormDays] = useState<number>(1)
  const [formDateWorked, setFormDateWorked] = useState<string>('')
  const [formWorkType, setFormWorkType] = useState<string>('')
  const [formReason, setFormReason] = useState<string>('')
  const [formEmployeeId, setFormEmployeeId] = useState<string>('')
  const [employees, setEmployees] = useState<Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>[]>([])

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Validating state
  const [validatingId, setValidatingId] = useState<number | null>(null)

  const isManager = user ? MANAGER_ROLES.includes(user.role) : false
  const isEmployee = user?.role === 'EMPLOYEE'

  useEffect(() => {
    if (user) {
      loadRequests()
      if (MANAGER_ROLES.includes(user.role)) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!formDateWorked || !formWorkType) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    // Managers must select an employee
    const targetUserId = isManager ? formEmployeeId : user.id
    if (isManager && !targetUserId) {
      toast.error('Veuillez selectionner un employe')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_recovery_request', {
        p_user_id: targetUserId,
        p_days: formDays,
        p_date_worked: formDateWorked,
        p_work_type: formWorkType,
        p_reason: formReason || null,
      })

      if (error) throw error

      toast.success('Credit de recuperation soumis avec succes')
      setFormDays(1)
      setFormDateWorked('')
      setFormWorkType('')
      setFormReason('')
      setFormEmployeeId('')
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
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Credit Recuperation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {isManager
            ? 'Creditez et validez les jours de recuperation des employes ayant travaille un jour de repos.'
            : 'Declarez les jours travailles pendant vos repos pour obtenir des credits de recuperation.'}
        </p>
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

      {/* Credit submission form — employees declare their own, managers credit on behalf */}
      <Card className="shrink-0 border-border/70 bg-card shadow-none">
        <CardHeader className="border-b border-border/70 py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4.5 w-4.5 text-primary" />
            {isManager ? 'Crediter un employe' : 'Declarer un jour travaille'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Employee picker — managers only */}
            {isManager && (
              <div className="space-y-2">
                <Label htmlFor="employee">Employe</Label>
                <Select value={formEmployeeId} onValueChange={setFormEmployeeId} required>
                  <SelectTrigger id="employee" className="w-full">
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

            <div className="space-y-2">
              <Label htmlFor="days">Nombre de jours</Label>
              <Input
                id="days"
                type="number"
                step={0.5}
                min={0.5}
                max={5}
                value={formDays}
                onChange={(e) => setFormDays(parseFloat(e.target.value) || 0.5)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-worked">Date travaillee</Label>
              <Input
                id="date-worked"
                type="date"
                value={formDateWorked}
                onChange={(e) => setFormDateWorked(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-type">Type de jour</Label>
              <Select value={formWorkType} onValueChange={setFormWorkType} required>
                <SelectTrigger id="work-type" className="w-full">
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

            <div className="space-y-2">
              <Label htmlFor="reason">Motif</Label>
              <Input
                id="reason"
                type="text"
                placeholder="Motif de la recuperation..."
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
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
                    <Send className="mr-2 h-4 w-4" />
                    {isManager ? 'Crediter la recuperation' : 'Soumettre la demande'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                    ? 'Soumettez votre premiere demande ci-dessus'
                    : 'Aucune demande de recuperation pour le moment'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden h-full min-h-0 md:block">
                <div className="h-full overflow-auto rounded-2xl border border-border/70 overscroll-contain mt-4">
                  <table className="w-full min-w-[800px] border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-secondary">
                      <tr className="text-left text-xs uppercase tracking-[0.08em] text-foreground/85">
                        {isManager && <th className="whitespace-nowrap px-4 py-3 font-semibold">Employe</th>}
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Jours</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Date travaillee</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Type</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Motif</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Statut</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Soumis le</th>
                        {isManager && (
                          <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => (
                        <tr key={request.id} className="soft-row">
                          {isManager && (
                            <td className="border-b border-border/45 px-4 py-3.5 align-top">
                              <p className="font-medium text-foreground">
                                {request.user?.full_name ?? '\u2014'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {request.user?.job_title ?? ''}
                              </p>
                            </td>
                          )}
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <span className="font-semibold text-foreground">{request.days}</span>
                            <span className="ml-1 text-sm text-muted-foreground">
                              jour{request.days > 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 text-sm text-foreground">
                            {format(new Date(request.date_worked + 'T00:00:00'), 'dd MMM yyyy', {
                              locale: fr,
                            })}
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <Badge variant="secondary" className="border border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]">
                              {RECOVERY_WORK_TYPE_LABELS[request.work_type] ?? request.work_type}
                            </Badge>
                          </td>
                          <td className="border-b border-border/45 px-4 py-3.5 text-sm text-muted-foreground max-w-[200px]">
                            <span className="line-clamp-1">{request.reason || '\u2014'}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <Badge className={getRecoveryStatusClass(request.status)}>
                              {getRecoveryStatusLabel(request.status)}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}
                          </td>
                          {isManager && (
                            <td className="border-b border-border/45 px-4 py-3.5 text-right align-top">
                              {request.status === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                    onClick={() => handleValidate(request.id)}
                                    disabled={validatingId === request.id}
                                  >
                                    {validatingId === request.id ? (
                                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600/20 border-t-emerald-600" />
                                    ) : (
                                      <CheckCircle2 className="mr-1 h-4 w-4" />
                                    )}
                                    Valider
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                                    onClick={() => openRejectDialog(request.id)}
                                  >
                                    <XCircle className="mr-1 h-4 w-4" />
                                    Rejeter
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">\u2014</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="pt-4 md:hidden">
                <div className="space-y-3">
                  {filteredRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-border/70 bg-background/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {isManager && request.user && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <p className="font-medium text-foreground">{request.user.full_name}</p>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(request.date_worked + 'T00:00:00'), 'dd MMM yyyy', {
                              locale: fr,
                            })}
                          </p>
                        </div>
                        <Badge className={getRecoveryStatusClass(request.status)}>
                          {getRecoveryStatusLabel(request.status)}
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-secondary/60 p-2.5">
                          <p className="text-xs text-muted-foreground">Jours</p>
                          <p className="font-semibold text-primary">
                            {request.days} jour{request.days > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="rounded-xl bg-secondary/60 p-2.5">
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="font-medium text-foreground">
                            {RECOVERY_WORK_TYPE_LABELS[request.work_type] ?? request.work_type}
                          </p>
                        </div>
                      </div>

                      {request.reason && (
                        <p className="mt-2.5 line-clamp-2 text-xs text-muted-foreground">
                          {request.reason}
                        </p>
                      )}

                      {request.status === 'REJECTED' && request.rejection_reason && (
                        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                          Motif de rejet : {request.rejection_reason}
                        </p>
                      )}

                      {isManager && request.status === 'PENDING' && (
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                            onClick={() => handleValidate(request.id)}
                            disabled={validatingId === request.id}
                          >
                            {validatingId === request.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600/20 border-t-emerald-600" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                            )}
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                            onClick={() => openRejectDialog(request.id)}
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            Rejeter
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
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

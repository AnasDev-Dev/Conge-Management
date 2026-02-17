'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  ClipboardCheck,
  Edit3,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { LeaveRequest, Utilisateur, UserRole } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface RequestWithUser extends LeaveRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'email' | 'balance_conge' | 'balance_recuperation'>
}

const APPROVAL_CHAIN: Record<string, { canActOn: string; setsTo: string; field: string; label: string }> = {
  RESPONSABLE_PERSONNEL: { canActOn: 'PENDING', setsTo: 'VALIDATED_RP', field: 'rp', label: 'Responsable Personnel (RH)' },
  CHEF_SERVICE: { canActOn: 'VALIDATED_RP', setsTo: 'VALIDATED_DC', field: 'dc', label: 'Chef de Service' },
  TRESORIER_GENERAL: { canActOn: 'VALIDATED_DC', setsTo: 'VALIDATED_TG', field: 'tg', label: 'Trésorier Général' },
  DIRECTEUR_EXECUTIF: { canActOn: 'VALIDATED_TG', setsTo: 'APPROVED', field: 'de', label: 'Directeur Exécutif' },
}

const ADMIN_VISIBLE_STATUSES = ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC', 'VALIDATED_TG']

function getStepLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'En attente (RH)'
    case 'VALIDATED_RP': return 'Validé RH → Chef de Service'
    case 'VALIDATED_DC': return 'Validé Chef → Trésorier'
    case 'VALIDATED_TG': return 'Validé Trésorier → Directeur'
    default: return status
  }
}

export default function ValidationsPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [requests, setRequests] = useState<RequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingRequest, setRejectingRequest] = useState<RequestWithUser | null>(null)
  const [expandedDateEdit, setExpandedDateEdit] = useState<number | null>(null)
  const [editedDates, setEditedDates] = useState<Record<number, { start_date: string; end_date: string; days_count: number }>>({})
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr) as Utilisateur
      setUser(userData)
      loadRequests(userData)
    }
  }, [])

  const loadRequests = async (currentUser: Utilisateur) => {
    try {
      const chainEntry = APPROVAL_CHAIN[currentUser.role]
      const isAdmin = currentUser.role === 'ADMIN'

      if (!chainEntry && !isAdmin) {
        setLoading(false)
        return
      }

      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name, job_title, email, balance_conge, balance_recuperation)
        `)
        .order('created_at', { ascending: false })

      if (isAdmin) {
        query = query.in('status', ADMIN_VISIBLE_STATUSES)
      } else {
        query = query.eq('status', chainEntry.canActOn)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (request: RequestWithUser) => {
    if (!user) return
    const chainEntry = APPROVAL_CHAIN[user.role]
    if (!chainEntry && user.role !== 'ADMIN') return

    // For admin, determine which step this request is at
    const effectiveChain = user.role === 'ADMIN'
      ? Object.values(APPROVAL_CHAIN).find(c => c.canActOn === request.status)
      : chainEntry

    if (!effectiveChain) return

    setActionLoading(request.id)
    try {
      const edited = editedDates[request.id]
      const isRhStep = request.status === 'PENDING'

      const updateData: Record<string, unknown> = {
        status: effectiveChain.setsTo,
        [`approved_by_${effectiveChain.field}`]: user.id,
        [`approved_at_${effectiveChain.field}`]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // RH can edit dates
      if (isRhStep && edited) {
        updateData.start_date = edited.start_date
        updateData.end_date = edited.end_date
        updateData.days_count = edited.days_count
      }

      const { error } = await supabase
        .from('leave_requests')
        .update(updateData)
        .eq('id', request.id)

      if (error) throw error

      // On final approval, deduct balance
      if (effectiveChain.setsTo === 'APPROVED' && request.user) {
        const daysCount = edited?.days_count ?? request.days_count
        const balanceField = request.request_type === 'CONGE' ? 'balance_conge' : 'balance_recuperation'
        const currentBalance = request.request_type === 'CONGE'
          ? request.user.balance_conge
          : request.user.balance_recuperation

        await supabase
          .from('utilisateurs')
          .update({ [balanceField]: currentBalance - daysCount })
          .eq('id', request.user_id)
      }

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== request.id))
      setExpandedDateEdit(null)
      delete editedDates[request.id]
    } catch (error) {
      console.error('Error approving request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const openRejectDialog = (request: RequestWithUser) => {
    setRejectingRequest(request)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!user || !rejectingRequest || !rejectReason.trim()) return

    setActionLoading(rejectingRequest.id)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'REJECTED',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rejectingRequest.id)

      if (error) throw error

      setRequests(prev => prev.filter(r => r.id !== rejectingRequest.id))
      setRejectDialogOpen(false)
      setRejectingRequest(null)
      setRejectReason('')
    } catch (error) {
      console.error('Error rejecting request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const toggleDateEdit = (requestId: number, request: RequestWithUser) => {
    if (expandedDateEdit === requestId) {
      setExpandedDateEdit(null)
    } else {
      setExpandedDateEdit(requestId)
      if (!editedDates[requestId]) {
        setEditedDates(prev => ({
          ...prev,
          [requestId]: {
            start_date: request.start_date,
            end_date: request.end_date,
            days_count: request.days_count,
          },
        }))
      }
    }
  }

  const updateEditedDate = (requestId: number, field: 'start_date' | 'end_date', value: string) => {
    setEditedDates(prev => {
      const current = prev[requestId]
      if (!current) return prev
      const updated = { ...current, [field]: value }

      // Recalculate business days (simple: exclude weekends)
      if (updated.start_date && updated.end_date) {
        const start = new Date(updated.start_date)
        const end = new Date(updated.end_date)
        let count = 0
        const current = new Date(start)
        while (current <= end) {
          const day = current.getDay()
          if (day !== 0 && day !== 6) count++
          current.setDate(current.getDate() + 1)
        }
        updated.days_count = count
      }

      return { ...prev, [requestId]: updated }
    })
  }

  if (!user) return null

  const chainEntry = APPROVAL_CHAIN[user.role]
  const isAdmin = user.role === 'ADMIN'
  const isRh = user.role === 'RESPONSABLE_PERSONNEL'
  const canValidate = !!chainEntry || isAdmin

  if (!canValidate) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <ClipboardCheck className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
          <h3 className="mb-2 text-lg font-medium text-foreground">Accès non autorisé</h3>
          <p className="text-muted-foreground">Vous n&apos;avez pas les permissions pour valider des demandes.</p>
        </div>
      </div>
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const stats = {
    pending: requests.length,
    approvedThisMonth: 0, // We'd need a separate query for this; keeping simple
    rejectedThisMonth: 0,
  }

  const getTypeLabel = (type: string) => {
    return type === 'CONGE' ? 'Congé' : 'Récupération'
  }

  const getTypeBadgeClass = (type: string) => {
    return type === 'CONGE'
      ? 'border-[#cde1d8] bg-[#e8f3ee] text-[#3e6756]'
      : 'border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]'
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Validations</h1>
        <p className="mt-2 text-muted-foreground">
          {isAdmin
            ? 'Toutes les demandes en attente de validation'
            : `Demandes en attente de votre validation (${chainEntry?.label})`
          }
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--status-pending-bg)]">
                <Clock className="h-5 w-5 text-[var(--status-pending-text)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--status-pending-text)]">{stats.pending}</div>
                <p className="text-sm text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--status-success-bg)]">
                <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--status-success-text)]">-</div>
                <p className="text-sm text-muted-foreground">Approuvés ce mois</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--status-alert-bg,rgba(239,68,68,0.1))]">
                <XCircle className="h-5 w-5 text-[var(--status-alert-text)]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--status-alert-text)]">-</div>
                <p className="text-sm text-muted-foreground">Rejetés ce mois</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests list */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Demandes à traiter ({requests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="mt-4 text-muted-foreground">Chargement des demandes...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardCheck className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
              <h3 className="mb-2 text-lg font-medium text-foreground">Aucune demande en attente</h3>
              <p className="text-muted-foreground">
                Toutes les demandes ont été traitées.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => {
                const edited = editedDates[request.id]
                const isDateEditExpanded = expandedDateEdit === request.id
                const isProcessing = actionLoading === request.id
                const canEditDates = isRh && request.status === 'PENDING'

                return (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-border/70 bg-background p-5 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      {/* Left: Employee info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                          {request.user?.full_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/dashboard/requests/${request.id}`}
                              className="font-semibold text-foreground hover:underline"
                            >
                              {request.user?.full_name || 'Utilisateur inconnu'}
                            </Link>
                            {isAdmin && (
                              <Badge className="status-progress text-xs">
                                {getStepLabel(request.status)}
                              </Badge>
                            )}
                          </div>
                          {request.user?.job_title && (
                            <p className="text-sm text-muted-foreground">{request.user.job_title}</p>
                          )}

                          {/* Date range & type */}
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-foreground">
                                {format(new Date(request.start_date), 'dd MMM', { locale: fr })} - {format(new Date(request.end_date), 'dd MMM yyyy', { locale: fr })}
                              </span>
                            </div>
                            <Badge className={`text-xs ${getTypeBadgeClass(request.request_type)}`}>
                              {getTypeLabel(request.request_type)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {request.days_count} jour{request.days_count > 1 ? 's' : ''}
                            </span>
                          </div>

                          {request.reason && (
                            <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{request.reason}</p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditDates && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleDateEdit(request.id, request)}
                            className="gap-1.5"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Modifier dates
                            {isDateEditExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                          disabled={isProcessing}
                          className="gap-1.5 bg-[var(--status-success-text)] text-white hover:bg-[var(--status-success-text)]/90"
                        >
                          {isProcessing ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Approuver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRejectDialog(request)}
                          disabled={isProcessing}
                          className="gap-1.5 border-[var(--status-alert-text)]/30 text-[var(--status-alert-text)] hover:bg-[var(--status-alert-text)]/10"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeter
                        </Button>
                      </div>
                    </div>

                    {/* RH Date Edit Section */}
                    {canEditDates && isDateEditExpanded && edited && (
                      <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                        <p className="mb-3 text-sm font-medium text-foreground">Modifier les dates avant approbation</p>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Date de début</label>
                            <Input
                              type="date"
                              value={edited.start_date}
                              onChange={(e) => updateEditedDate(request.id, 'start_date', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Date de fin</label>
                            <Input
                              type="date"
                              value={edited.end_date}
                              onChange={(e) => updateEditedDate(request.id, 'end_date', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Jours ouvrables</label>
                            <Input
                              type="number"
                              value={edited.days_count}
                              readOnly
                              className="bg-muted/50"
                            />
                          </div>
                        </div>
                        {(edited.start_date !== request.start_date || edited.end_date !== request.end_date) && (
                          <p className="mt-2 text-xs text-[var(--status-pending-text)]">
                            Les dates seront modifiées lors de l&apos;approbation.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Demande de {rejectingRequest?.user?.full_name} -{' '}
              {rejectingRequest && format(new Date(rejectingRequest.start_date), 'dd MMM', { locale: fr })} au{' '}
              {rejectingRequest && format(new Date(rejectingRequest.end_date), 'dd MMM yyyy', { locale: fr })}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Raison du rejet <span className="text-[var(--status-alert-text)]">*</span>
            </label>
            <Textarea
              placeholder="Expliquez la raison du rejet..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleReject}
              disabled={!rejectReason.trim() || actionLoading !== null}
              className="bg-[var(--status-alert-text)] text-white hover:bg-[var(--status-alert-text)]/90"
            >
              {actionLoading !== null ? (
                <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

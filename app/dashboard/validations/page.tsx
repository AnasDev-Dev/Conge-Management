'use client'

import { useEffect, useState, useMemo, useCallback, DragEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { PageGuard } from '@/components/role-gate'
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
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  ClipboardCheck,
  Edit3,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Undo2,
  GripVertical,
  MessageSquare,
  RotateCcw,
  User as UserIcon,
  UserRound,
  X,
} from 'lucide-react'
import { LeaveRequest, LeaveRequestDetail, Utilisateur, Holiday, WorkingDays } from '@/lib/types/database'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  countWorkingDays as countWorkingDaysUtil,
  fetchHolidays,
  fetchWorkingDays,
  groupDetailsIntoSegments,
  SegmentSummary,
} from '@/lib/leave-utils'
import { useAllEmployeeBalances } from '@/lib/hooks/use-employee-balance'
import { cn } from '@/lib/utils'
import { SignatureDialog } from '@/components/signature-dialog'

interface RequestWithUser extends LeaveRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'email' | 'balance_conge' | 'balance_recuperation' | 'gender'>
}

// Pipeline stage definitions
const PIPELINE_STAGES = [
  { status: 'PENDING', label: 'RH Personnel', shortLabel: 'RH', role: 'RH', setsTo: 'VALIDATED_RP', field: 'rp', color: 'pending' },
  { status: 'VALIDATED_RP', label: 'Chef de Service', shortLabel: 'Chef', role: 'CHEF_SERVICE', setsTo: 'VALIDATED_DC', field: 'dc', color: 'progress' },
  { status: 'VALIDATED_DC', label: 'Directeur Executif', shortLabel: 'Dir.', role: 'DIRECTEUR_EXECUTIF', setsTo: 'APPROVED', field: 'de', color: 'approved' },
] as const

const ALL_KANBAN_STATUSES = PIPELINE_STAGES.map(s => s.status)

// Map a status to its previous stage (for undo)
function getPreviousStage(status: string) {
  const idx = PIPELINE_STAGES.findIndex(s => s.status === status)
  return idx > 0 ? PIPELINE_STAGES[idx - 1] : null
}

// Infer what status a rejected request was at before rejection
function inferPreRejectStatus(r: RequestWithUser): string {
  if (r.approved_by_dc) return 'VALIDATED_DC'
  if (r.approved_by_rp) return 'VALIDATED_RP'
  return 'PENDING'
}

export default function ValidationsPage() {
  const { user } = useCurrentUser()
  const { activeRole, activeCompany } = useCompanyContext()
  const { effectiveRole } = usePermissions(user?.role || 'EMPLOYEE')
  const [allRequests, setAllRequests] = useState<RequestWithUser[]>([])
  const [rejectedRequests, setRejectedRequests] = useState<RequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingRequest, setRejectingRequest] = useState<RequestWithUser | null>(null)
  const [expandedDateEdit, setExpandedDateEdit] = useState<number | null>(null)
  const [editedDates, setEditedDates] = useState<Record<number, { start_date: string; end_date: string; days_count: number }>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [mobileTab, setMobileTab] = useState(0)
  const [showRejected, setShowRejected] = useState(false)
  const [requestDetails, setRequestDetails] = useState<Record<number, SegmentSummary[]>>({})

  // Signature dialog state
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [pendingApproveRequest, setPendingApproveRequest] = useState<RequestWithUser | null>(null)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [signatureAction, setSignatureAction] = useState<'approve' | 'reject'>('approve')

  // Holiday-aware day counting
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [workingDaysConfig, setWorkingDaysConfig] = useState<WorkingDays>({
    id: 0, company_id: null, category_id: null, department_id: null,
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
    monday_morning: true, monday_afternoon: true,
    tuesday_morning: true, tuesday_afternoon: true,
    wednesday_morning: true, wednesday_afternoon: true,
    thursday_morning: true, thursday_afternoon: true,
    friday_morning: true, friday_afternoon: true,
    saturday_morning: true, saturday_afternoon: true,
    sunday_morning: false, sunday_afternoon: false,
  })

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // Balance info per user (from RPC)
  const { balances: balanceMap } = useAllEmployeeBalances(activeCompany?.id)

  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadAllRequests(user.id)
      loadRejectedRequests(user.id)
      const companyId = user.company_id || undefined
      fetchHolidays(companyId).then(setHolidays)
      fetchWorkingDays(companyId).then(setWorkingDaysConfig)
    }
  }, [user, activeCompany])

  // Balance data now comes from useAllEmployeeBalances hook above

  const loadAllRequests = async (currentUserId?: string) => {
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey!inner(id, full_name, job_title, email, balance_conge, balance_recuperation, gender, company_id)
        `)
        .in('status', ALL_KANBAN_STATUSES)
        .order('created_at', { ascending: false })

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      // Exclude own requests — you can never approve your own leave
      if (currentUserId) {
        query = query.neq('user_id', currentUserId)
      }

      const { data, error } = await query

      if (error) throw error
      setAllRequests(data || [])

      // Batch-fetch leave_request_details for segment display
      const requestIds = (data || []).map((r: RequestWithUser) => r.id)
      if (requestIds.length > 0) {
        const { data: detailRows } = await supabase
          .from('leave_request_details')
          .select('*')
          .in('request_id', requestIds)
          .order('date', { ascending: true })

        if (detailRows && detailRows.length > 0) {
          const grouped: Record<number, LeaveRequestDetail[]> = {}
          for (const row of detailRows as LeaveRequestDetail[]) {
            if (!grouped[row.request_id]) grouped[row.request_id] = []
            grouped[row.request_id].push(row)
          }
          const segments: Record<number, SegmentSummary[]> = {}
          for (const [rid, details] of Object.entries(grouped)) {
            segments[Number(rid)] = groupDetailsIntoSegments(details)
          }
          setRequestDetails(segments)
        }
      }
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRejectedRequests = async (currentUserId?: string) => {
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey!inner(id, full_name, job_title, email, balance_conge, balance_recuperation, gender, company_id)
        `)
        .eq('status', 'REJECTED')
        .order('rejected_at', { ascending: false })
        .limit(20)

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      if (currentUserId) {
        query = query.neq('user_id', currentUserId)
      }

      const { data, error } = await query

      if (error) throw error
      setRejectedRequests(data || [])
    } catch (error) {
      console.error('Error loading rejected requests:', error)
    }
  }

  // Filter requests
  const filteredRequests = useMemo(() => {
    return allRequests.filter(r => {
      if (typeFilter !== 'ALL' && r.request_type !== typeFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchesName = r.user?.full_name?.toLowerCase().includes(term)
        const matchesJob = r.user?.job_title?.toLowerCase().includes(term)
        const matchesReason = r.reason?.toLowerCase().includes(term)
        if (!matchesName && !matchesJob && !matchesReason) return false
      }
      return true
    })
  }, [allRequests, searchTerm, typeFilter])

  // Group requests by pipeline stage
  const requestsByStage = useMemo(() => {
    const grouped: Record<string, RequestWithUser[]> = {}
    for (const stage of PIPELINE_STAGES) {
      grouped[stage.status] = filteredRequests.filter(r => r.status === stage.status)
    }
    return grouped
  }, [filteredRequests])

  // Determine which stage the current user can act on
  const userActiveStage = useMemo(() => {
    if (!user) return null
    if (effectiveRole === 'ADMIN') return 'ALL'
    return PIPELINE_STAGES.find(s => s.role === effectiveRole) || null
  }, [user, effectiveRole])

  const canActOnStage = useCallback((stageStatus: string): boolean => {
    if (!userActiveStage) return false
    if (userActiveStage === 'ALL') return true
    return userActiveStage.status === stageStatus
  }, [userActiveStage])

  const getStageForStatus = (status: string) => {
    return PIPELINE_STAGES.find(s => s.status === status)
  }

  // ──────────────────────────────────────────────
  // Approve
  // ──────────────────────────────────────────────
  const handleApprove = async (request: RequestWithUser) => {
    if (!user) return
    const stage = getStageForStatus(request.status)
    if (!stage) return

    setActionLoading(request.id)
    try {
      const edited = editedDates[request.id]
      const isRhStep = request.status === 'PENDING'

      // Use RPC for all approvals — handles day recalculation, balance deduction, and history
      const rpcParams: Record<string, unknown> = {
        p_request_id: request.id,
        p_approver_id: user.id,
      }

      if (isRhStep && edited) {
        rpcParams.p_new_start_date = edited.start_date
        rpcParams.p_new_end_date = edited.end_date
        rpcParams.p_new_days_count = edited.days_count
      }

      const { error } = await supabase.rpc('approve_leave_request', rpcParams)
      if (error) throw error

      // Move card to next stage or remove if fully approved
      setAllRequests(prev => {
        if (stage.setsTo === 'APPROVED') {
          return prev.filter(r => r.id !== request.id)
        }
        return prev.map(r =>
          r.id === request.id
            ? { ...r, status: stage.setsTo as RequestWithUser['status'], [`approved_by_${stage.field}`]: user.id, [`approved_at_${stage.field}`]: new Date().toISOString() }
            : r
        )
      })
      setExpandedDateEdit(null)
      delete editedDates[request.id]
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erreur lors de l'approbation"
      toast.error(msg)
      console.error('Error approving request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // ──────────────────────────────────────────────
  // Signature-gated approve — opens signature dialog before approving
  // ──────────────────────────────────────────────
  const openApproveWithSignature = (request: RequestWithUser) => {
    setPendingApproveRequest(request)
    setSignatureAction('approve')
    setSignatureDialogOpen(true)
  }

  const handleSignatureConfirm = async (signatureDataUrl: string, saveForFuture: boolean) => {
    if (!pendingApproveRequest || !user) return

    setSignatureLoading(true)
    try {
      // Optionally save signature to user profile for reuse
      if (saveForFuture) {
        const res = await fetch(signatureDataUrl)
        const blob = await res.blob()
        const filePath = `signatures/${user.id}.png`

        const { error: uploadError } = await supabase.storage
          .from('signatures')
          .upload(filePath, blob, { upsert: true, contentType: 'image/png' })

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('signatures')
            .getPublicUrl(filePath)
          if (publicUrlData?.publicUrl) {
            await supabase
              .from('utilisateurs')
              .update({ signature_file: publicUrlData.publicUrl })
              .eq('id', user.id)
          }
        }
      }

      // Proceed with the actual action (approve or reject)
      if (signatureAction === 'reject') {
        await handleReject()
        // Save rejection signature on the request
        await supabase
          .from('leave_requests')
          .update({ signature_rejected_by: signatureDataUrl })
          .eq('id', pendingApproveRequest.id)
      } else {
        // Determine which signature column based on current status
        const sigField =
          pendingApproveRequest.status === 'PENDING' ? 'signature_rp'
          : pendingApproveRequest.status === 'VALIDATED_RP' ? 'signature_dc'
          : pendingApproveRequest.status === 'VALIDATED_DC' ? 'signature_de'
          : null

        await handleApprove(pendingApproveRequest)

        // Save approval signature on the request
        if (sigField) {
          await supabase
            .from('leave_requests')
            .update({ [sigField]: signatureDataUrl })
            .eq('id', pendingApproveRequest.id)
        }
      }
    } finally {
      setSignatureLoading(false)
      setSignatureDialogOpen(false)
      setPendingApproveRequest(null)
    }
  }

  // ──────────────────────────────────────────────
  // Reject
  // ──────────────────────────────────────────────
  const openRejectDialog = (request: RequestWithUser) => {
    setRejectingRequest(request)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!user || !rejectingRequest || !rejectReason.trim()) return

    setActionLoading(rejectingRequest.id)
    try {
      const { error } = await supabase.rpc('reject_leave_request', {
        p_request_id: rejectingRequest.id,
        p_rejector_id: user.id,
        p_reason: rejectReason.trim(),
      })

      if (error) throw error

      const rejected = allRequests.find(r => r.id === rejectingRequest.id)
      setAllRequests(prev => prev.filter(r => r.id !== rejectingRequest.id))
      if (rejected) {
        setRejectedRequests(prev => [
          { ...rejected, status: 'REJECTED' as RequestWithUser['status'], rejected_by: user.id, rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() },
          ...prev,
        ])
      }
      setRejectDialogOpen(false)
      setRejectingRequest(null)
      setRejectReason('')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors du rejet'
      toast.error(msg)
      console.error('Error rejecting request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // ──────────────────────────────────────────────
  // Undo approve — move card back one stage
  // ──────────────────────────────────────────────
  const handleUndoApprove = async (request: RequestWithUser) => {
    if (!user) return

    setActionLoading(request.id)
    try {
      const { data, error } = await supabase.rpc('undo_approve_leave_request', {
        p_request_id: request.id,
        p_user_id: user.id,
      })

      if (error) throw error

      // Update local state with the returned data
      if (data) {
        const updated = data as unknown as RequestWithUser
        setAllRequests(prev =>
          prev.map(r => r.id === request.id ? { ...r, ...updated } : r)
        )
      } else {
        // Fallback: reload
        loadAllRequests(user?.id)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erreur lors de l'annulation"
      toast.error(msg)
      console.error('Error undoing approval:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // ──────────────────────────────────────────────
  // Undo reject — restore card to its pre-rejection status
  // ──────────────────────────────────────────────
  const handleUndoReject = async (request: RequestWithUser) => {
    if (!user) return

    setActionLoading(request.id)
    try {
      const { data, error } = await supabase.rpc('undo_reject_leave_request', {
        p_request_id: request.id,
        p_user_id: user.id,
      })

      if (error) throw error

      setRejectedRequests(prev => prev.filter(r => r.id !== request.id))

      if (data) {
        const restored = data as unknown as RequestWithUser
        // Re-add to active requests if it's in a kanban status
        if (['PENDING', 'VALIDATED_RP', 'VALIDATED_DC'].includes(restored.status)) {
          setAllRequests(prev => [
            { ...request, ...restored, rejected_by: null, rejected_at: null, rejection_reason: null },
            ...prev,
          ])
        }
      } else {
        loadAllRequests(user?.id)
        loadRejectedRequests(user?.id)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors de la restauration'
      toast.error(msg)
      console.error('Error undoing rejection:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // ──────────────────────────────────────────────
  // Date editing
  // ──────────────────────────────────────────────
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

      if (updated.start_date && updated.end_date) {
        updated.days_count = countWorkingDaysUtil(updated.start_date, updated.end_date, workingDaysConfig, holidays)
      }

      return { ...prev, [requestId]: updated }
    })
  }

  // ──────────────────────────────────────────────
  // Drag and drop handlers
  // ──────────────────────────────────────────────
  const handleDragStart = (e: DragEvent<HTMLDivElement>, requestId: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(requestId))
    setDraggedId(requestId)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverStage(null)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>, targetStatus: string) => {
    if (draggedId === null) return

    // Find dragged request
    const draggedRequest = allRequests.find(r => r.id === draggedId)
    if (!draggedRequest) return

    // Only allow forward movement to the NEXT stage
    const currentStage = getStageForStatus(draggedRequest.status)
    if (!currentStage || currentStage.setsTo !== targetStatus) return

    // Check role permission
    if (!canActOnStage(draggedRequest.status)) return

    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(targetStatus)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetStatus: string) => {
    e.preventDefault()
    setDragOverStage(null)
    setDraggedId(null)

    const requestId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (isNaN(requestId)) return

    const request = allRequests.find(r => r.id === requestId)
    if (!request) return

    // Validate: target must be the next stage
    const currentStage = getStageForStatus(request.status)
    if (!currentStage || currentStage.setsTo !== targetStatus) return

    // Validate role
    if (!canActOnStage(request.status)) return

    openApproveWithSignature(request)
  }

  if (!user) return null

  const isAdmin = effectiveRole === 'ADMIN'
  const isRh = effectiveRole === 'RH'
  const canValidate = !!PIPELINE_STAGES.find(s => s.role === effectiveRole) || isAdmin

  if (!canValidate) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <ClipboardCheck className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
          <h3 className="mb-2 text-lg font-medium text-foreground">Acces non autorise</h3>
          <p className="text-muted-foreground">Vous n&apos;avez pas les permissions pour valider des demandes.</p>
        </div>
      </div>
    )
  }

  const getTypeLabel = (type: string) => type === 'CONGE' ? 'Conge' : 'Recuperation'
  const getTypeBadgeClass = (type: string) => type === 'CONGE'
    ? 'border-[#cde1d8] bg-[#e8f3ee] text-[#3e6756]'
    : 'border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]'

  // Check if the current user can undo the approval that put this card in its current column
  const canUndoApprove = (request: RequestWithUser): boolean => {
    // Cannot undo if already at initial_status (auto-promoted stages)
    if (request.initial_status && request.status === request.initial_status) return false
    const prev = getPreviousStage(request.status)
    if (!prev) return false
    const approverField = `approved_by_${prev.field}` as keyof RequestWithUser
    return isAdmin || (request[approverField] as string) === user.id
  }

  const canUndoReject = (request: RequestWithUser): boolean => {
    return isAdmin || request.rejected_by === user.id
  }

  // ──────────────────────────────────────────────
  // Card renderer
  // ──────────────────────────────────────────────
  const renderRequestCard = (request: RequestWithUser, isActive: boolean, options?: { compact?: boolean; rejected?: boolean; draggable?: boolean }) => {
    const { compact, rejected, draggable } = options || {}
    const edited = editedDates[request.id]
    const isDateEditExpanded = expandedDateEdit === request.id
    const isProcessing = actionLoading === request.id
    const canEditDates = (isRh || isAdmin) && request.status === 'PENDING'
    const empBal = balanceMap.get(request.user_id)
    const balance = request.request_type === 'CONGE'
      ? (empBal?.available_now ?? request.user?.balance_conge)
      : (empBal?.available_recup ?? request.user?.balance_recuperation)
    const isDragged = draggedId === request.id
    const showUndo = !rejected && canUndoApprove(request) && !isActive

    return (
      <Link
        key={request.id}
        href={`/dashboard/requests/${request.id}`}
        draggable={draggable && isActive}
        onDragStart={draggable && isActive ? (e) => handleDragStart(e as unknown as DragEvent<HTMLDivElement>, request.id) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        className={`block rounded-xl border bg-card transition-all ${
          isActive ? 'border-border/70 hover:border-primary/30' : 'border-border/50'
        } ${compact ? 'p-3' : 'p-3.5'} ${
          isDragged ? 'opacity-40 scale-95 rotate-1' : 'hover:shadow-md'
        } ${draggable && isActive ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Employee info */}
        <div className={`flex items-start gap-2.5 ${compact ? 'mb-2' : 'mb-3'}`}>
          {draggable && isActive && (
            <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {request.user?.gender === 'F' ? (
              <UserRound className="h-4.5 w-4.5" />
            ) : (
              <UserIcon className="h-4.5 w-4.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground leading-tight block truncate text-left">
              {request.user?.full_name || 'Inconnu'}
            </span>
            {request.user?.job_title && (
              <p className="text-xs text-muted-foreground truncate">{request.user.job_title}</p>
            )}
          </div>
          {compact && !rejected && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {getStageForStatus(request.status)?.shortLabel}
            </Badge>
          )}
        </div>

        {/* Request details */}
        <div className={`space-y-1.5 ${isActive || rejected || showUndo ? 'mb-3' : 'mb-1'}`}>
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground">
              {format(new Date(request.start_date), 'dd MMM', { locale: fr })} – {format(new Date(request.end_date), 'dd MMM', { locale: fr })}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-[10px] px-1.5 py-0 ${getTypeBadgeClass(request.request_type)}`}>
              {getTypeLabel(request.request_type)}
            </Badge>
            {request.is_derogation && (
              <Badge className="text-[10px] px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-700">
                Dérogation · {request.balance_conge_used != null && request.balance_before != null
                  ? `${Math.max(request.balance_conge_used - request.balance_before, 0)}j`
                  : `${request.days_count}j`}
              </Badge>
            )}
            <span className="text-xs font-medium text-foreground">
              {request.days_count}j
            </span>
            {balance !== undefined && (
              <span className={`text-[10px] ${
                balance < request.days_count ? 'text-[var(--status-alert-text)] font-semibold' : 'text-muted-foreground'
              }`}>
                Solde: {balance}j
              </span>
            )}
          </div>

          {requestDetails[request.id] && requestDetails[request.id].length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {requestDetails[request.id].map((seg, i) => (
                <span key={i} className={cn(
                  'text-[10px] px-1.5 py-0 rounded-md font-medium',
                  seg.type === 'RECUPERATION'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-blue-100 text-blue-700'
                )}>
                  {seg.workingDays}{seg.type === 'RECUPERATION' ? 'R' : 'C'}
                </span>
              ))}
            </div>
          )}

          {request.reason && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {request.reason}
            </p>
          )}

          {/* Rejection reason */}
          {rejected && request.rejection_reason && (
            <div className="mt-1.5 flex gap-1.5 rounded-lg border border-[var(--status-alert-text)]/20 bg-[var(--status-alert-text)]/5 px-2 py-1.5">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-[var(--status-alert-text)]" />
              <p className="text-[11px] leading-relaxed text-[var(--status-alert-text)]">
                {request.rejection_reason}
              </p>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground/60">
            <Clock className="inline h-2.5 w-2.5 mr-0.5" />
            {rejected && request.rejected_at
              ? `Rejeté ${formatDistanceToNow(new Date(request.rejected_at), { addSuffix: true, locale: fr })}`
              : formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: fr })
            }
          </div>
        </div>

        {/* RH Date Edit */}
        {canEditDates && isDateEditExpanded && edited && (
          <div className="mb-3 rounded-lg border border-border/70 bg-muted/30 p-2.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <p className="mb-2 text-[11px] font-medium text-foreground">Modifier dates</p>
            <div className="space-y-1.5">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Debut</label>
                <DatePicker
                  value={edited.start_date}
                  onChange={(v) => updateEditedDate(request.id, 'start_date', v)}
                  compact
                  placeholder="Debut"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Fin</label>
                <DatePicker
                  value={edited.end_date}
                  onChange={(v) => updateEditedDate(request.id, 'end_date', v)}
                  compact
                  placeholder="Fin"
                />
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground">Jours:</span>
                <span className="font-semibold text-foreground">{edited.days_count}</span>
              </div>
            </div>
            {(edited.start_date !== request.start_date || edited.end_date !== request.end_date) && (
              <p className="mt-1.5 text-[10px] text-[var(--status-pending-text)]">
                Dates modifiees a l&apos;approbation
              </p>
            )}
          </div>
        )}

        {/* Actions: approve/reject on active stage */}
        {isActive && !rejected && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-border/50" onClick={(e) => e.preventDefault()}>
            {canEditDates && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDateEdit(request.id, request); }}
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <Edit3 className="h-3 w-3" />
                {isDateEditExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openApproveWithSignature(request); }}
              disabled={isProcessing}
              className="h-7 px-3 text-xs gap-1 bg-[var(--status-success-text)] text-white hover:bg-[var(--status-success-text)]/90"
            >
              {isProcessing ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Valider
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openRejectDialog(request); }}
              disabled={isProcessing}
              className="h-7 px-3 text-xs gap-1 border-[var(--status-alert-text)]/30 text-[var(--status-alert-text)] hover:bg-[var(--status-alert-text)]/10"
            >
              <XCircle className="h-3 w-3" />
              Rejeter
            </Button>
          </div>
        )}

        {/* Undo approve — appears on cards the user already validated (now in next column) */}
        {showUndo && (
          <div className="flex items-center pt-2 border-t border-border/50" onClick={(e) => e.preventDefault()}>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoApprove(request); }}
              disabled={isProcessing}
              className="h-8 w-full px-3 text-xs gap-1.5 border-amber-400/50 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
            >
              {isProcessing ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-600" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
              Annuler la validation
            </Button>
          </div>
        )}

        {/* Undo reject */}
        {rejected && canUndoReject(request) && (
          <div className="flex items-center pt-2 border-t border-border/50" onClick={(e) => e.preventDefault()}>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoReject(request); }}
              disabled={isProcessing}
              className="h-8 w-full px-3 text-xs gap-1.5 border-blue-400/50 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-400 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
            >
              {isProcessing ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-600" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Restaurer la demande
            </Button>
          </div>
        )}
      </Link>
    )
  }

  // Mobile: current tab (stages + rejected)
  const MOBILE_TABS = [
    ...PIPELINE_STAGES.map(s => ({ status: s.status, label: s.shortLabel })),
    { status: 'REJECTED', label: 'Rejeté' },
  ]
  const mobileCurrentTab = MOBILE_TABS[mobileTab]
  const mobileRequests = mobileCurrentTab.status === 'REJECTED'
    ? rejectedRequests
    : requestsByStage[mobileCurrentTab.status] || []

  return (
    <PageGuard userRole={user?.role || 'EMPLOYEE'} page="validations">
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Compact header row */}
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Validations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {allRequests.length} demande{allRequests.length > 1 ? 's' : ''} en cours
            {rejectedRequests.length > 0 && (
              <span className="text-[var(--status-alert-text)]"> · {rejectedRequests.length} rejetée{rejectedRequests.length > 1 ? 's' : ''}</span>
            )}
          </p>
        </div>

        {/* Inline pipeline mini-stats — desktop only */}
        <div className="hidden lg:flex items-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 px-1.5 py-1.5">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = requestsByStage[stage.status]?.length || 0
            const isActive = canActOnStage(stage.status)
            return (
              <div key={stage.status} className="flex items-center gap-1.5">
                <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-primary/12 text-primary border border-primary/25'
                    : 'text-muted-foreground'
                }`}>
                  {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                  <span>{stage.shortLabel}</span>
                  <span className={`font-bold ${isActive ? 'text-primary' : ''}`}>{count}</span>
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                )}
              </div>
            )
          })}

          {/* Rejected counter in pill bar */}
          {rejectedRequests.length > 0 && (
            <>
              <div className="mx-1 h-4 w-px bg-border/60" />
              <button
                onClick={() => setShowRejected(!showRejected)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  showRejected
                    ? 'bg-[var(--status-alert-text)]/10 text-[var(--status-alert-text)] border border-[var(--status-alert-text)]/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <XCircle className="h-3 w-3" />
                <span className="font-bold">{rejectedRequests.length}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Rechercher par nom, poste, motif..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 h-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
        >
          <option value="ALL">Tous les types</option>
          <option value="CONGE">Conge</option>
          <option value="RECUPERATION">Recuperation</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, col) => (
            <div key={col} className="rounded-2xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
              {[...Array(2)].map((_, row) => (
                <div key={row} className="rounded-xl border border-border/50 bg-card p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ─── DESKTOP: Kanban columns ─── */}
          <div className={`hidden lg:grid lg:gap-4 lg:flex-1 lg:min-h-0 lg:overflow-hidden ${
            showRejected ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
          }`}>
            {PIPELINE_STAGES.map((stage) => {
              const stageRequests = requestsByStage[stage.status] || []
              const isActive = canActOnStage(stage.status)
              const isDropTarget = dragOverStage === stage.setsTo

              return (
                <div key={stage.status} className="flex flex-col min-h-0">
                  {/* Column header */}
                  <div className={`flex items-center justify-between rounded-t-2xl px-4 py-2.5 ${
                    isActive
                      ? 'bg-primary/10 border-2 border-b-0 border-primary/25'
                      : 'bg-muted/60 border border-b-0 border-border/60'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        isActive ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'
                      }`} />
                      <span className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                        {stage.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className={`text-xs font-bold ${
                      isActive ? 'bg-primary/15 text-primary' : ''
                    }`}>
                      {stageRequests.length}
                    </Badge>
                  </div>

                  {/* Column body — scrollable + drop zone */}
                  <div
                    onDragOver={(e) => handleDragOver(e, stage.status)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.status)}
                    className={`flex-1 overflow-y-auto overscroll-contain rounded-b-2xl p-2.5 space-y-2.5 transition-colors ${
                      isDropTarget
                        ? 'bg-primary/8 border-2 border-t-0 border-primary/40 ring-2 ring-primary/15'
                        : isActive
                          ? 'bg-primary/[0.03] border-2 border-t-0 border-primary/25'
                          : 'bg-muted/20 border border-t-0 border-border/60'
                    }`}
                  >
                    {stageRequests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <ClipboardCheck className="h-7 w-7 text-muted-foreground/25 mb-1.5" />
                        <p className="text-xs text-muted-foreground/60">
                          {isDropTarget ? 'Deposer ici pour valider' : 'Aucune demande'}
                        </p>
                      </div>
                    ) : (
                      stageRequests.map((request) =>
                        renderRequestCard(request, isActive, { draggable: true })
                      )
                    )}
                  </div>
                </div>
              )
            })}

            {/* Rejected column (visible when toggled) */}
            {showRejected && (
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between rounded-t-2xl px-4 py-2.5 bg-[var(--status-alert-text)]/8 border border-b-0 border-[var(--status-alert-text)]/25">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-[var(--status-alert-text)]" />
                    <span className="text-sm font-semibold text-[var(--status-alert-text)]">Rejetees</span>
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold bg-[var(--status-alert-text)]/12 text-[var(--status-alert-text)]">
                    {rejectedRequests.length}
                  </Badge>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain rounded-b-2xl p-2.5 space-y-2.5 bg-[var(--status-alert-text)]/[0.02] border border-t-0 border-[var(--status-alert-text)]/25">
                  {rejectedRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CheckCircle2 className="h-7 w-7 text-muted-foreground/25 mb-1.5" />
                      <p className="text-xs text-muted-foreground/60">Aucune demande rejetee</p>
                    </div>
                  ) : (
                    rejectedRequests.map((request) =>
                      renderRequestCard(request, false, { rejected: true })
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── MOBILE / TABLET: Tabbed list view ─── */}
          <div className="lg:hidden flex flex-col flex-1 min-h-0">
            {/* Stage tabs */}
            <div className="flex gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1 mb-3">
              {MOBILE_TABS.map((tab, idx) => {
                const count = tab.status === 'REJECTED'
                  ? rejectedRequests.length
                  : requestsByStage[tab.status]?.length || 0
                const isActive = tab.status !== 'REJECTED' && canActOnStage(tab.status)
                const isSelected = mobileTab === idx
                const isRejectedTab = tab.status === 'REJECTED'
                return (
                  <button
                    key={tab.status}
                    onClick={() => setMobileTab(idx)}
                    className={`flex-1 flex items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-xs font-medium transition-all ${
                      isSelected
                        ? isRejectedTab
                          ? 'bg-[var(--status-alert-text)]/8 border border-[var(--status-alert-text)]/25 text-[var(--status-alert-text)]'
                          : 'bg-background border border-border/70 shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />}
                    <span>{tab.label}</span>
                    {count > 0 && (
                      <span className={`rounded-md px-1 py-0.5 text-[10px] font-bold ${
                        isSelected
                          ? isRejectedTab
                            ? 'bg-[var(--status-alert-text)]/12 text-[var(--status-alert-text)]'
                            : isActive ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'
                          : 'text-muted-foreground/70'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* List of cards */}
            <div className="flex-1 overflow-y-auto overscroll-contain space-y-2.5 pr-0.5">
              {mobileRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <ClipboardCheck className="h-10 w-10 text-muted-foreground/25 mb-2" />
                  <p className="text-sm text-muted-foreground/60">Aucune demande a cette etape</p>
                </div>
              ) : (
                mobileRequests.map((request) =>
                  mobileCurrentTab.status === 'REJECTED'
                    ? renderRequestCard(request, false, { compact: true, rejected: true })
                    : renderRequestCard(request, canActOnStage(mobileCurrentTab.status), { compact: true })
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Demande de {rejectingRequest?.user?.full_name} —{' '}
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
              onClick={() => {
                setRejectDialogOpen(false)
                setPendingApproveRequest(rejectingRequest)
                setSignatureAction('reject')
                setSignatureDialogOpen(true)
              }}
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

      {/* Signature Dialog for approval */}
      <SignatureDialog
        open={signatureDialogOpen}
        onClose={() => { setSignatureDialogOpen(false); setPendingApproveRequest(null); }}
        onConfirm={handleSignatureConfirm}
        savedSignatureUrl={user?.signature_file}
        mode="approver"
        title={signatureAction === 'reject' ? 'Signature pour rejet' : 'Signature pour approbation'}
        loading={signatureLoading}
      />

    </div>
    </PageGuard>
  )
}

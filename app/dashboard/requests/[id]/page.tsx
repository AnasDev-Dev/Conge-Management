'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Briefcase,
  Hash,
  UserCheck,
  MessageSquare,
  Printer,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { getStatusClass, getStatusLabel } from '@/lib/constants'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { getCompanyLogo } from '@/lib/company-logos'
import { PrintLeaveDocument } from '@/components/print-leave-document'
import { LeaveRequestDetail } from '@/lib/types/database'
import { groupDetailsIntoSegments, SegmentSummary } from '@/lib/leave-utils'

interface RequestDetail {
  id: number
  user_id: string
  request_type: string
  start_date: string
  end_date: string
  days_count: number
  return_date: string | null
  replacement_user_id: string | null
  status: string
  reason: string | null
  comments: string | null
  balance_before: number | null
  balance_conge_used: number | null
  balance_recuperation_used: number | null
  approved_by_dc: string | null
  approved_by_rp: string | null
  approved_by_tg: string | null
  approved_by_de: string | null
  approved_at_dc: string | null
  approved_at_rp: string | null
  approved_at_tg: string | null
  approved_at_de: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  is_derogation: boolean
  signature_employee: string | null
  signature_rp: string | null
  signature_dc: string | null
  signature_de: string | null
  signature_rejected_by: string | null
  created_at: string
  updated_at: string
  user?: { id: string; full_name: string; job_title: string | null; email: string | null } | null
  replacement_user?: { id: string; full_name: string; job_title: string | null } | null
}

interface UserInfo {
  id: string
  full_name: string
  role?: string
}

export default function RequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [approvers, setApprovers] = useState<Record<string, UserInfo>>({})
  const [segments, setSegments] = useState<SegmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const { activeCompany } = useCompanyContext()
  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      loadRequest(params.id as string)
    }
  }, [params.id])

  const loadRequest = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name, job_title, email),
          replacement_user:utilisateurs!leave_requests_replacement_user_id_fkey(id, full_name, job_title)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setRequest(data)

      // Fetch per-day details for segment display
      const { data: details } = await supabase
        .from('leave_request_details')
        .select('*')
        .eq('request_id', data.id)
        .order('date', { ascending: true })
      if (details && details.length > 0) {
        setSegments(groupDetailsIntoSegments(details as LeaveRequestDetail[]))
      }

      // Fetch approver/rejector names separately (no FK constraints for these)
      const approverIds = [
        data.approved_by_rp,
        data.approved_by_dc,
        data.approved_by_tg,
        data.approved_by_de,
        data.rejected_by,
      ].filter(Boolean) as string[]

      if (approverIds.length > 0) {
        const uniqueIds = [...new Set(approverIds)]
        const { data: users } = await supabase
          .from('utilisateurs')
          .select('id, full_name, role')
          .in('id', uniqueIds)

        if (users) {
          const map: Record<string, UserInfo> = {}
          users.forEach(u => { map[u.id] = u })
          setApprovers(map)
        }
      }
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null
      console.error('Error loading request:', err?.message || err?.code || JSON.stringify(error))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="py-16 text-center">
        <FileText className="mx-auto mb-4 h-14 w-14 text-muted-foreground/35" />
        <h3 className="text-lg font-semibold text-foreground">Demande introuvable</h3>
        <p className="mt-1 text-sm text-muted-foreground">Cette demande n&apos;existe pas ou a été supprimée.</p>
        <Link href="/dashboard/requests">
          <Button variant="outline" className="mt-5">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux demandes
          </Button>
        </Link>
      </div>
    )
  }

  // Build dynamic timeline based on initial_status (which stages were skipped)
  const initialStatus = (request as RequestDetail & { initial_status?: string }).initial_status || 'PENDING'
  const isAutoApproved = initialStatus === 'APPROVED'

  const allStages = [
    {
      key: 'submit',
      label: 'Soumission',
      done: true,
      active: false,
      name: request.user?.full_name,
      date: request.created_at,
      minStatus: null, // always shown
    },
    {
      key: 'rp',
      label: 'RH Personnel',
      done: !!request.approved_at_rp,
      active: request.status === 'PENDING',
      name: request.approved_by_rp ? approvers[request.approved_by_rp]?.full_name : null,
      date: request.approved_at_rp,
      minStatus: 'PENDING',
    },
    {
      key: 'dc',
      label: 'Chef de Service',
      done: !!request.approved_at_dc,
      active: request.status === 'VALIDATED_RP',
      name: request.approved_by_dc ? approvers[request.approved_by_dc]?.full_name : null,
      date: request.approved_at_dc,
      minStatus: 'VALIDATED_RP',
    },
    {
      key: 'de',
      label: 'Directeur Exécutif',
      done: !!request.approved_at_de,
      active: request.status === 'VALIDATED_DC',
      name: request.approved_by_de ? approvers[request.approved_by_de]?.full_name : null,
      date: request.approved_at_de,
      minStatus: 'VALIDATED_DC',
    },
  ]

  // Status ordering for filtering skipped stages
  const statusOrder = ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC', 'APPROVED']
  const initialIdx = statusOrder.indexOf(initialStatus)

  // For auto-approved, show simplified timeline
  const approvalTimeline = isAutoApproved
    ? [
        allStages[0], // Soumission
        { key: 'auto', label: 'Approuvé automatiquement', done: true, active: false, name: request.approved_by_de ? approvers[request.approved_by_de]?.full_name : null, date: request.approved_at_de, minStatus: null },
      ]
    : allStages.filter(stage => {
        if (stage.minStatus === null) return true // always show
        const stageIdx = statusOrder.indexOf(stage.minStatus)
        return stageIdx >= initialIdx // only show stages at or after initial_status
      })

  const isRejected = request.status === 'REJECTED'
  const balanceAfter = (request.balance_before || 0) - request.days_count

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Demande #{request.id}
              </h1>
              <Badge className={cn('border text-xs', getStatusClass(request.status))}>
                {getStatusLabel(request.status)}
              </Badge>
              {request.is_derogation && (
                <Badge className="border border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  Dérogation · {request.balance_conge_used != null && request.balance_before != null
                    ? `${Math.max(request.balance_conge_used - request.balance_before, 0)}j`
                    : `${request.days_count}j`}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Soumise le {format(new Date(request.created_at), 'd MMMM yyyy à HH:mm', { locale: fr })}
            </p>
          </div>
          {request.status === 'APPROVED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Main info (big card) ── */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="border-border/70 overflow-hidden">
            {/* Requester header */}
            <div className="flex items-center gap-4 border-b border-border/50 px-5 py-4">
              <div className="relative shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-muted/40">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <Image
                  src={getCompanyLogo(activeCompany?.name)}
                  alt={activeCompany?.name || 'Logo'}
                  width={22}
                  height={22}
                  className="absolute -bottom-0.5 -right-0.5 h-[22px] w-[22px] rounded-full border-2 border-background bg-white object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{request.user?.full_name}</p>
                {request.user?.job_title && (
                  <p className="text-xs text-muted-foreground">{request.user.job_title}</p>
                )}
              </div>
              {request.user?.email && (
                <p className="hidden text-xs text-muted-foreground sm:block">{request.user.email}</p>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 divide-x divide-border/50 border-b border-border/50 sm:grid-cols-4">
              <InfoCell icon={Briefcase} label="Type" value={request.request_type === 'CONGE' ? 'Congé' : 'Récupération'} />
              <InfoCell icon={Hash} label="Durée" value={`${request.days_count} jour${request.days_count > 1 ? 's' : ''}`} />
              <InfoCell icon={Calendar} label="Début" value={format(new Date(request.start_date), 'd MMM yyyy', { locale: fr })} />
              <InfoCell icon={Calendar} label="Fin" value={format(new Date(request.end_date), 'd MMM yyyy', { locale: fr })} />
            </div>

            <CardContent className="space-y-4 p-5">
              {/* Dates details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date de début</p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {format(new Date(request.start_date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date de fin</p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {format(new Date(request.end_date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>

              {request.return_date && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date de reprise</p>
                  <p className="mt-1 text-sm font-medium capitalize text-primary">
                    {format(new Date(request.return_date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              )}

              {/* Replacement */}
              {request.replacement_user && (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <UserCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remplaçant</p>
                    <p className="text-sm font-medium">{request.replacement_user.full_name}</p>
                    {request.replacement_user.job_title && (
                      <p className="text-xs text-muted-foreground">{request.replacement_user.job_title}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Reason */}
              {request.reason && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motif</p>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{request.reason}</p>
                </div>
              )}

              {/* Comments */}
              {request.comments && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Commentaires</p>
                  <p className="text-sm text-foreground leading-relaxed">{request.comments}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rejection reason */}
          {isRejected && request.rejection_reason && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Motif du rejet</p>
                  <p className="mt-1 text-sm text-red-600">{request.rejection_reason}</p>
                  {request.rejected_by && approvers[request.rejected_by] && (
                    <p className="mt-2 text-xs text-red-500">
                      Par {approvers[request.rejected_by].full_name}
                      {request.rejected_at && ` le ${format(new Date(request.rejected_at), 'd MMM yyyy à HH:mm', { locale: fr })}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar: Approval timeline ── */}
        <Card className="border-border/70">
          <div className="border-b border-border/50 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-foreground">Processus de validation</h3>
          </div>
          <CardContent className="p-5">
            <div className="relative">
              {approvalTimeline.map((step, i) => {
                const isLast = i === approvalTimeline.length - 1
                return (
                  <div key={i} className="flex gap-4">
                    {/* Line + dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2',
                          step.done && 'border-emerald-500 bg-emerald-50',
                          step.active && !step.done && 'border-amber-400 bg-amber-50',
                          !step.done && !step.active && 'border-border bg-muted/40',
                        )}
                      >
                        {step.done ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : step.active ? (
                          <Clock className="h-4 w-4 text-amber-500" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={cn(
                          'w-0.5 flex-1 min-h-[32px]',
                          step.done ? 'bg-emerald-300' : 'bg-border',
                        )} />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn('pb-6', isLast && 'pb-0')}>
                      <p className={cn(
                        'text-sm font-medium',
                        step.done && 'text-emerald-700',
                        step.active && !step.done && 'text-amber-600',
                        !step.done && !step.active && 'text-muted-foreground',
                      )}>
                        {step.label}
                      </p>
                      {step.name && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{step.name}</p>
                      )}
                      {step.date && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(new Date(step.date), 'd MMM yyyy à HH:mm', { locale: fr })}
                        </p>
                      )}
                      {step.active && !step.done && (
                        <p className="mt-0.5 text-xs text-amber-500">En attente de validation</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Segments breakdown (mixed requests) ── */}
      {segments.length > 0 && (
        <Card className="border-border/70">
          <div className="border-b border-border/50 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-foreground">Segments de la demande</h3>
          </div>
          <CardContent className="p-5">
            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-medium w-4">{i + 1}.</span>
                    <Badge className={cn(
                      'text-[10px] px-2 py-0',
                      seg.type === 'RECUPERATION'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-blue-100 text-blue-700 border-blue-200'
                    )}>
                      {seg.type === 'RECUPERATION' ? 'Récupération' : 'Congé'}
                    </Badge>
                    <span className="text-sm text-foreground">
                      {format(new Date(seg.startDate + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                      {seg.startDate !== seg.endDate && ` → ${format(new Date(seg.endDate + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}`}
                    </span>
                  </div>
                  <span className="text-sm font-semibold">{seg.workingDays}j</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Bottom row: Balance + Details side by side ── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Balance impact */}
        <Card className="border-border/70">
          <div className="border-b border-border/50 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-foreground">Impact sur le solde</h3>
          </div>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Solde avant</span>
              <span className="font-medium">{request.balance_before ?? '—'} j</span>
            </div>
            {request.balance_conge_used != null && request.balance_conge_used > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Congé utilisé</span>
                <span className="font-medium text-red-500">-{request.balance_conge_used} j</span>
              </div>
            )}
            {request.balance_recuperation_used != null && request.balance_recuperation_used > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Récup. utilisée</span>
                <span className="font-medium text-red-500">-{request.balance_recuperation_used} j</span>
              </div>
            )}
            <div className="border-t border-border/50 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Solde après</span>
                <span className={cn(
                  'text-lg font-bold',
                  balanceAfter >= 0 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {request.balance_before != null ? `${balanceAfter} j` : '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card className="border-border/70">
          <div className="border-b border-border/50 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-foreground">Détails</h3>
          </div>
          <CardContent className="p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono font-medium">#{request.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="secondary" className="text-xs">
                {request.request_type === 'CONGE' ? 'Congé' : 'Récupération'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Soumise</span>
              <span className="font-medium">{format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mise à jour</span>
              <span className="font-medium">{format(new Date(request.updated_at), 'dd/MM/yyyy', { locale: fr })}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print document — rendered in body via portal, hidden on screen */}
      {request.status === 'APPROVED' && createPortal(
        <PrintLeaveDocument request={request} approvers={approvers} companyName={activeCompany?.name} />,
        document.body
      )}
    </div>
  )
}

function InfoCell({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

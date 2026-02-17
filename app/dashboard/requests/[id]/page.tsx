'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface RequestWithUsers extends LeaveRequest {
  user?: Utilisateur
  replacement_user?: Utilisateur
  approver_dc?: Utilisateur
  approver_rp?: Utilisateur
  approver_tg?: Utilisateur
  approver_de?: Utilisateur
  rejector?: Utilisateur
}

export default function RequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<RequestWithUsers | null>(null)
  const [loading, setLoading] = useState(true)
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
          replacement_user:utilisateurs!leave_requests_replacement_user_id_fkey(id, full_name, job_title),
          approver_dc:utilisateurs!leave_requests_approved_by_dc_fkey(id, full_name, role),
          approver_rp:utilisateurs!leave_requests_approved_by_rp_fkey(id, full_name, role),
          approver_tg:utilisateurs!leave_requests_approved_by_tg_fkey(id, full_name, role),
          approver_de:utilisateurs!leave_requests_approved_by_de_fkey(id, full_name, role),
          rejector:utilisateurs!leave_requests_rejected_by_fkey(id, full_name, role)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setRequest(data)
    } catch (error) {
      console.error('Error loading request:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="py-12 text-center">
        <FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
        <h3 className="mb-2 text-lg font-medium text-foreground">Demande non trouvée</h3>
        <Link href="/dashboard/requests">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux demandes
          </Button>
        </Link>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'status-pending'
      case 'VALIDATED_DC':
      case 'VALIDATED_RP':
      case 'VALIDATED_TG':
      case 'VALIDATED_DE':
        return 'status-progress'
      case 'APPROVED':
        return 'status-approved'
      case 'REJECTED':
        return 'status-rejected'
      default:
        return 'status-neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'En attente'
      case 'VALIDATED_DC':
        return 'Approuvé par Chef de Service'
      case 'VALIDATED_RP':
        return 'Approuvé par RH'
      case 'VALIDATED_TG':
        return 'Approuvé par Trésorier'
      case 'VALIDATED_DE':
        return 'Approuvé par Directeur Exécutif'
      case 'APPROVED':
        return 'Approuvé (Final)'
      case 'REJECTED':
        return 'Rejeté'
      default:
        return status
    }
  }

  const approvalSteps = [
    {
      name: 'Soumission',
      status: 'COMPLETED',
      approver: request.user?.full_name,
      date: request.created_at,
      icon: FileText,
    },
    {
      name: 'Chef de Service',
      status: request.approved_at_dc ? 'COMPLETED' : request.status === 'PENDING' ? 'PENDING' : 'SKIPPED',
      approver: request.approver_dc?.full_name,
      date: request.approved_at_dc,
      icon: User,
    },
    {
      name: 'Responsable Personnel (RH)',
      status: request.approved_at_rp ? 'COMPLETED' : ['VALIDATED_DC', 'VALIDATED_RP', 'VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(request.status) ? 'PENDING' : 'SKIPPED',
      approver: request.approver_rp?.full_name,
      date: request.approved_at_rp,
      icon: User,
    },
    {
      name: 'Trésorier Général',
      status: request.approved_at_tg ? 'COMPLETED' : ['VALIDATED_RP', 'VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(request.status) ? 'PENDING' : 'SKIPPED',
      approver: request.approver_tg?.full_name,
      date: request.approved_at_tg,
      icon: User,
    },
    {
      name: 'Directeur Exécutif',
      status: request.approved_at_de ? 'COMPLETED' : ['VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(request.status) ? 'PENDING' : 'SKIPPED',
      approver: request.approver_de?.full_name,
      date: request.approved_at_de,
      icon: User,
    },
  ]

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Détails de la demande</h1>
          <p className="mt-2 text-muted-foreground">Demande #{request.id}</p>
        </div>
        <Badge className={`${getStatusColor(request.status)} border px-4 py-2 text-lg`}>
          {getStatusLabel(request.status)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Informations de la demande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Type de demande</p>
                  <p className="mt-1 text-lg font-medium">{request.request_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Durée</p>
                  <p className="mt-1 text-lg font-medium">{request.days_count} jours ouvrables</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date de début</p>
                    <p className="mt-1 font-medium">
                      {format(new Date(request.start_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date de fin</p>
                    <p className="mt-1 font-medium">
                      {format(new Date(request.end_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
              </div>

              {request.return_date && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date de reprise</p>
                      <p className="mt-1 font-medium text-primary">
                        {format(new Date(request.return_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {request.replacement_user && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Remplaçant</p>
                      <p className="mt-1 font-medium">{request.replacement_user.full_name}</p>
                      {request.replacement_user.job_title && (
                        <p className="text-sm text-muted-foreground">{request.replacement_user.job_title}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {request.reason && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">Motif</p>
                    <p className="text-foreground">{request.reason}</p>
                  </div>
                </>
              )}

              {request.status === 'REJECTED' && request.rejection_reason && (
                <>
                  <Separator />
                  <div className="status-rejected rounded-2xl border p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5" />
                      <div>
                        <p className="font-medium">Raison du rejet</p>
                        <p className="mt-1 text-sm">{request.rejection_reason}</p>
                        {request.rejector && <p className="mt-2 text-sm">Rejeté par: {request.rejector.full_name}</p>}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Processus d&apos;approbation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {approvalSteps.map((step, index) => {
                  const Icon = step.icon
                  const isCompleted = step.status === 'COMPLETED'
                  const isPending = step.status === 'PENDING'

                  return (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            isCompleted ? 'bg-[var(--status-success-bg)]' : isPending ? 'bg-[var(--status-pending-bg)]' : 'bg-secondary/65'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
                          ) : isPending ? (
                            <Clock className="h-5 w-5 text-[var(--status-pending-text)]" />
                          ) : (
                            <Icon className="h-5 w-5 text-muted-foreground/70" />
                          )}
                        </div>
                        {index < approvalSteps.length - 1 && (
                          <div className={`h-12 w-0.5 ${isCompleted ? 'bg-[var(--status-success-border)]' : 'bg-border'}`} />
                        )}
                      </div>
                      <div className="flex-1 pb-8">
                        <h4
                          className={`font-medium ${
                            isCompleted ? 'text-[var(--status-success-text)]' : isPending ? 'text-[var(--status-pending-text)]' : 'text-muted-foreground'
                          }`}
                        >
                          {step.name}
                        </h4>
                        {step.approver && <p className="mt-1 text-sm text-muted-foreground">{step.approver}</p>}
                        {step.date && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {format(new Date(step.date), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                          </p>
                        )}
                        {isPending && !step.date && (
                          <p className="mt-1 text-sm text-[var(--status-pending-text)]">En attente d&apos;approbation</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Impact sur le solde</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Solde avant:</span>
                <span className="font-medium">{request.balance_before || 0} jours</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Jours utilisés:</span>
                <span className="font-medium text-[var(--status-alert-text)]">-{request.days_count} jours</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-medium">Solde après:</span>
                <span className="font-bold text-[var(--status-success-text)]">
                  {(request.balance_before || 0) - request.days_count} jours
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Demandeur</p>
                <p className="mt-1 font-medium">{request.user?.full_name}</p>
                {request.user?.job_title && <p className="text-muted-foreground">{request.user.job_title}</p>}
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground">Date de soumission</p>
                <p className="mt-1 font-medium">
                  {format(new Date(request.created_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground">Dernière mise à jour</p>
                <p className="mt-1 font-medium">
                  {format(new Date(request.updated_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

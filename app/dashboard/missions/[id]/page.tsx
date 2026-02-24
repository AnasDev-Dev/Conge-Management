'use client'

import { useEffect, useState, useRef } from 'react'
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
  Briefcase,
  AlertCircle,
  MapPin,
  Car,
  Printer,
} from 'lucide-react'
import Link from 'next/link'
import { MissionRequestWithRelations, Utilisateur } from '@/lib/types/database'
import { TRANSPORT_LABELS, getStatusClass, getStatusLabel } from '@/lib/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import PrintMissionDocument from '@/components/print-mission-document'

export default function MissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [mission, setMission] = useState<MissionRequestWithRelations | null>(null)
  const [missionUser, setMissionUser] = useState<Utilisateur | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrint, setShowPrint] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      loadMission(params.id as string)
    }
  }, [params.id])

  const loadMission = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('mission_requests')
        .select(`
          *,
          user:utilisateurs!mission_requests_user_id_fkey(id, full_name, job_title, email, phone, department_id, role),
          assigner:utilisateurs!mission_requests_assigned_by_fkey(id, full_name, role),
          replacement_user:utilisateurs!mission_requests_replacement_user_id_fkey(id, full_name, job_title),
          supervisor:utilisateurs!mission_requests_supervisor_id_fkey(id, full_name, role),
          approver_dc:utilisateurs!mission_requests_approved_by_dc_fkey(id, full_name, role),
          approver_rp:utilisateurs!mission_requests_approved_by_rp_fkey(id, full_name, role),
          approver_tg:utilisateurs!mission_requests_approved_by_tg_fkey(id, full_name, role),
          approver_de:utilisateurs!mission_requests_approved_by_de_fkey(id, full_name, role),
          rejector:utilisateurs!mission_requests_rejected_by_fkey(id, full_name, role)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setMission(data)

      // Load full user info for print
      if (data?.user_id) {
        const { data: fullUser } = await supabase
          .from('utilisateurs')
          .select('*, department:departments(name)')
          .eq('id', data.user_id)
          .single()
        if (fullUser) setMissionUser(fullUser)
      }
    } catch (error) {
      console.error('Error loading mission:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    setShowPrint(true)
    setTimeout(() => {
      window.print()
      setTimeout(() => setShowPrint(false), 500)
    }, 300)
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

  if (!mission) {
    return (
      <div className="py-12 text-center">
        <Briefcase className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
        <h3 className="mb-2 text-lg font-medium text-foreground">Mission non trouvée</h3>
        <Link href="/dashboard/missions">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux missions
          </Button>
        </Link>
      </div>
    )
  }

  const approvalSteps = [
    {
      name: 'Soumission',
      status: 'COMPLETED' as const,
      approver: mission.request_origin === 'ASSIGNED'
        ? `${mission.assigner?.full_name} (assigné à ${mission.user?.full_name})`
        : mission.user?.full_name,
      date: mission.created_at,
      icon: Briefcase,
    },
    {
      name: 'Chef de Service',
      status: mission.approved_at_dc ? 'COMPLETED' as const : mission.status === 'PENDING' ? 'PENDING' as const : 'SKIPPED' as const,
      approver: mission.approver_dc?.full_name,
      date: mission.approved_at_dc,
      icon: User,
    },
    {
      name: 'Responsable Personnel (RH)',
      status: mission.approved_at_rp ? 'COMPLETED' as const : ['VALIDATED_DC', 'VALIDATED_RP', 'VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(mission.status) ? 'PENDING' as const : 'SKIPPED' as const,
      approver: mission.approver_rp?.full_name,
      date: mission.approved_at_rp,
      icon: User,
    },
    {
      name: 'Trésorier Général',
      status: mission.approved_at_tg ? 'COMPLETED' as const : ['VALIDATED_RP', 'VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(mission.status) ? 'PENDING' as const : 'SKIPPED' as const,
      approver: mission.approver_tg?.full_name,
      date: mission.approved_at_tg,
      icon: User,
    },
    {
      name: 'Directeur Exécutif',
      status: mission.approved_at_de ? 'COMPLETED' as const : ['VALIDATED_TG', 'VALIDATED_DE', 'APPROVED'].includes(mission.status) ? 'PENDING' as const : 'SKIPPED' as const,
      approver: mission.approver_de?.full_name,
      date: mission.approved_at_de,
      icon: User,
    },
  ]

  return (
    <>
      <div className="space-y-7 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-3">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Ordre de mission
            </h1>
            <p className="mt-2 text-muted-foreground">Mission #{mission.id}</p>
          </div>
          <div className="flex items-center gap-3">
            {mission.status === 'APPROVED' && (
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimer
              </Button>
            )}
            <Badge className={`${getStatusClass(mission.status)} border px-4 py-2 text-lg`}>
              {getStatusLabel(mission.status)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Mission Details */}
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Détails de la mission
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Itinéraire</p>
                      <p className="mt-1 text-lg font-medium">
                        {mission.departure_city} → {mission.arrival_city}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Portée</p>
                    <p className="mt-1">
                      <Badge variant="outline">
                        {mission.mission_scope === 'INTERNATIONAL' ? 'Internationale' : 'Locale (Maroc)'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Durée</p>
                    <p className="mt-1 text-lg font-medium">
                      {mission.days_count} jour{mission.days_count > 1 ? 's' : ''} ouvrable{mission.days_count > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Objet de la mission</p>
                  <p className="text-foreground">{mission.mission_object}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date de début</p>
                      <p className="mt-1 font-medium">
                        {format(new Date(mission.start_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date de fin</p>
                      <p className="mt-1 font-medium">
                        {format(new Date(mission.end_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                </div>

                {mission.transport_type && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <Car className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Moyen de transport</p>
                        <p className="mt-1 font-medium">
                          {TRANSPORT_LABELS[mission.transport_type] || mission.transport_type}
                          {mission.transport_details && (
                            <span className="ml-2 text-muted-foreground">({mission.transport_details})</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {mission.replacement_user && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Intérimaire</p>
                        <p className="mt-1 font-medium">{mission.replacement_user.full_name}</p>
                        {mission.replacement_user.job_title && (
                          <p className="text-sm text-muted-foreground">{mission.replacement_user.job_title}</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {mission.comments && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-sm text-muted-foreground">Commentaires</p>
                      <p className="text-foreground">{mission.comments}</p>
                    </div>
                  </>
                )}

                {mission.status === 'REJECTED' && mission.rejection_reason && (
                  <>
                    <Separator />
                    <div className="status-rejected rounded-2xl border p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5" />
                        <div>
                          <p className="font-medium">Raison du rejet</p>
                          <p className="mt-1 text-sm">{mission.rejection_reason}</p>
                          {mission.rejector && (
                            <p className="mt-2 text-sm">Rejeté par: {mission.rejector.full_name}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Supervisor Opinion */}
            {mission.supervisor_opinion && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Avis du supérieur hiérarchique</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        mission.supervisor_opinion === 'FAVORABLE'
                          ? 'status-approved border'
                          : 'status-rejected border'
                      }
                    >
                      {mission.supervisor_opinion === 'FAVORABLE' ? 'Favorable' : 'Défavorable'}
                    </Badge>
                    {mission.supervisor?.full_name && (
                      <span className="text-sm text-muted-foreground">
                        par {mission.supervisor.full_name}
                      </span>
                    )}
                    {mission.supervisor_at && (
                      <span className="text-xs text-muted-foreground">
                        le {format(new Date(mission.supervisor_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </span>
                    )}
                  </div>
                  {mission.supervisor_comments && (
                    <p className="mt-3 text-sm text-foreground">{mission.supervisor_comments}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Director Decision */}
            {mission.director_decision && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Décision du Directeur Exécutif</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge
                    className={`border px-4 py-2 text-base ${
                      mission.director_decision === 'ACCORDEE'
                        ? 'status-approved'
                        : 'status-rejected'
                    }`}
                  >
                    {mission.director_decision === 'ACCORDEE'
                      ? 'Demande accordée'
                      : 'Demande refusée'}
                  </Badge>
                </CardContent>
              </Card>
            )}

            {/* Approval Timeline */}
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
                              isCompleted
                                ? 'bg-[var(--status-success-bg)]'
                                : isPending
                                  ? 'bg-[var(--status-pending-bg)]'
                                  : 'bg-secondary/65'
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
                            <div
                              className={`h-12 w-0.5 ${isCompleted ? 'bg-[var(--status-success-border)]' : 'bg-border'}`}
                            />
                          )}
                        </div>
                        <div className="flex-1 pb-8">
                          <h4
                            className={`font-medium ${
                              isCompleted
                                ? 'text-[var(--status-success-text)]'
                                : isPending
                                  ? 'text-[var(--status-pending-text)]'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {step.name}
                          </h4>
                          {step.approver && (
                            <p className="mt-1 text-sm text-muted-foreground">{step.approver}</p>
                          )}
                          {step.date && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {format(new Date(step.date), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                            </p>
                          )}
                          {isPending && !step.date && (
                            <p className="mt-1 text-sm text-[var(--status-pending-text)]">
                              En attente d&apos;approbation
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Missionnaire</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Nom</p>
                  <p className="mt-1 font-medium">{mission.user?.full_name}</p>
                </div>
                {mission.user?.job_title && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-muted-foreground">Fonction</p>
                      <p className="mt-1 font-medium">{mission.user.job_title}</p>
                    </div>
                  </>
                )}
                {mission.request_origin === 'ASSIGNED' && mission.assigner && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-muted-foreground">Assigné par</p>
                      <p className="mt-1 font-medium">{mission.assigner.full_name}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Origine</p>
                  <p className="mt-1 font-medium">
                    {mission.request_origin === 'SELF' ? 'Demande personnelle' : 'Assignée'}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-muted-foreground">Date de soumission</p>
                  <p className="mt-1 font-medium">
                    {format(new Date(mission.created_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-muted-foreground">Dernière mise à jour</p>
                  <p className="mt-1 font-medium">
                    {format(new Date(mission.updated_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Print View */}
      {showPrint && mission && missionUser && (
        <div ref={printRef} className="hidden print:block">
          <PrintMissionDocument mission={mission} user={missionUser} />
        </div>
      )}
    </>
  )
}

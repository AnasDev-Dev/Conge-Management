'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  XCircle,
  Undo2,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { MissionRequestWithRelations, Utilisateur } from '@/lib/types/database'
import { TRANSPORT_LABELS, getStatusClass, getStatusLabel } from '@/lib/constants'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import PrintMissionDocument from '@/components/print-mission-document'

// Mission approval chain: RH(rp) → Chef(dc) → Dir(de) — aligned with leave pipeline
const MISSION_PIPELINE = [
  { status: 'PENDING', label: 'RH Personnel', role: 'RH', field: 'rp' },
  { status: 'VALIDATED_RP', label: 'Chef de Service', role: 'CHEF_SERVICE', field: 'dc' },
  { status: 'VALIDATED_DC', label: 'Directeur Exécutif', role: 'DIRECTEUR_EXECUTIF', field: 'de' },
] as const

const STATUS_ORDER = ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC', 'APPROVED']

export default function MissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [mission, setMission] = useState<MissionRequestWithRelations | null>(null)
  const [missionUser, setMissionUser] = useState<Utilisateur | null>(null)
  const { user: currentUser } = useCurrentUser()
  const { isManager } = usePermissions(currentUser?.role || 'EMPLOYEE')
  const { activeCompany } = useCompanyContext()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
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
          rejector:utilisateurs!mission_requests_rejected_by_fkey(id, full_name, role),
          mission_category:mission_personnel_categories(id, name),
          mission_zone:mission_zones(id, name)
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
    window.print()
  }

  // ── Actions ──

  const handleApprove = async () => {
    if (!currentUser || !mission || actionLoading) return
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('approve_mission_request', {
        p_request_id: mission.id,
        p_approver_id: currentUser.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Mission approuvée')
      loadMission(String(mission.id))
    } catch {
      toast.error("Erreur lors de l'approbation")
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!currentUser || !mission || !rejectReason.trim() || actionLoading) return
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('reject_mission_request', {
        p_request_id: mission.id,
        p_rejector_id: currentUser.id,
        p_reason: rejectReason.trim(),
      })
      if (error) {
        toast.error(error.message)
        return
      }
      setRejectDialogOpen(false)
      setRejectReason('')
      toast.success('Mission rejetée')
      loadMission(String(mission.id))
    } catch {
      toast.error('Erreur lors du rejet')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUndoApprove = async () => {
    if (!currentUser || !mission || actionLoading) return
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('undo_approve_mission_request', {
        p_request_id: mission.id,
        p_user_id: currentUser.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Validation annulée')
      loadMission(String(mission.id))
    } catch {
      toast.error("Erreur lors de l'annulation")
    } finally {
      setActionLoading(false)
    }
  }

  const handleUndoReject = async () => {
    if (!currentUser || !mission || actionLoading) return
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('undo_reject_mission_request', {
        p_request_id: mission.id,
        p_user_id: currentUser.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Mission restaurée')
      loadMission(String(mission.id))
    } catch {
      toast.error('Erreur lors de la restauration')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Permission helpers ──

  const getActionInfo = () => {
    if (!currentUser || !mission) return null
    if (!isManager) return null
    // Can't act on own mission
    if (mission.user_id === currentUser.id) return null

    const status = mission.status

    // Can approve: role matches current pipeline stage
    const stage = MISSION_PIPELINE.find(s => s.status === status)
    if (stage && (stage.role === currentUser.role || currentUser.role === 'ADMIN')) {
      return { canApprove: true, canReject: true, stage }
    }

    // Can undo approve: user is the one who approved at the most recent step
    // Find which stage produced the current status
    const prevStageIdx = STATUS_ORDER.indexOf(status) - 1
    if (prevStageIdx >= 0 && prevStageIdx < MISSION_PIPELINE.length) {
      const prevStage = MISSION_PIPELINE[prevStageIdx]
      const approvedByField = `approved_by_${prevStage.field}` as keyof MissionRequestWithRelations
      if (mission[approvedByField] === currentUser.id) {
        // Check we're not at initial_status (can't undo below initial)
        if (!mission.initial_status || mission.status !== mission.initial_status) {
          return { canUndoApprove: true, prevStage }
        }
      }
    }

    // Can undo approve from APPROVED (Director)
    if (status === 'APPROVED' && mission.approved_by_de === currentUser.id) {
      return { canUndoApprove: true, prevStage: MISSION_PIPELINE[2] }
    }

    // Can undo reject
    if (status === 'REJECTED') {
      if (mission.rejected_by === currentUser.id || currentUser.role === 'ADMIN') {
        return { canUndoReject: true }
      }
    }

    return null
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

  const actionInfo = getActionInfo()

  // Build dynamic approval timeline
  const initialStatus = mission.initial_status || 'PENDING'
  const isAutoApproved = initialStatus === 'APPROVED'
  const initialIdx = STATUS_ORDER.indexOf(initialStatus)

  const allSteps = [
    {
      key: 'submit',
      name: 'Soumission',
      done: true,
      active: false,
      approver: mission.request_origin === 'ASSIGNED'
        ? `${mission.assigner?.full_name} (assigné à ${mission.user?.full_name})`
        : mission.user?.full_name,
      date: mission.created_at,
      icon: Briefcase,
      minStatus: null as string | null,
    },
    {
      key: 'rp',
      name: 'RH Personnel',
      done: !!mission.approved_at_rp,
      active: mission.status === 'PENDING',
      approver: mission.approver_rp?.full_name,
      date: mission.approved_at_rp,
      icon: User,
      minStatus: 'PENDING',
    },
    {
      key: 'dc',
      name: 'Chef de Service',
      done: !!mission.approved_at_dc,
      active: mission.status === 'VALIDATED_RP',
      approver: mission.approver_dc?.full_name,
      date: mission.approved_at_dc,
      icon: User,
      minStatus: 'VALIDATED_RP',
    },
    {
      key: 'de',
      name: 'Directeur Exécutif',
      done: !!mission.approved_at_de,
      active: mission.status === 'VALIDATED_DC',
      approver: mission.approver_de?.full_name,
      date: mission.approved_at_de,
      icon: User,
      minStatus: 'VALIDATED_DC',
    },
  ]

  const approvalSteps = isAutoApproved
    ? [
        allSteps[0],
        { key: 'auto', name: 'Approuvé automatiquement', done: true, active: false, approver: mission.approver_de?.full_name || null, date: mission.approved_at_de, icon: CheckCircle2, minStatus: null as string | null },
      ]
    : allSteps.filter(step => {
        if (step.minStatus === null) return true
        const stepIdx = STATUS_ORDER.indexOf(step.minStatus)
        return stepIdx >= initialIdx
      })

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

            {/* Financial Information */}
            {(mission.mission_category_id || mission.daily_allowance > 0 || mission.hotel_amount > 0) && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Informations financières
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {mission.mission_category && (
                      <div>
                        <p className="text-sm text-muted-foreground">Catégorie</p>
                        <p className="mt-1 font-medium">{mission.mission_category.name}</p>
                      </div>
                    )}
                    {mission.mission_zone && (
                      <div>
                        <p className="text-sm text-muted-foreground">Zone géographique</p>
                        <p className="mt-1 font-medium">{mission.mission_zone.name}</p>
                      </div>
                    )}
                    {mission.country && (
                      <div>
                        <p className="text-sm text-muted-foreground">Pays</p>
                        <p className="mt-1 font-medium">{mission.country}</p>
                      </div>
                    )}
                    {mission.venue && (
                      <div>
                        <p className="text-sm text-muted-foreground">Lieu</p>
                        <p className="mt-1 font-medium">{mission.venue}</p>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">PEC</p>
                      <Badge variant={mission.pec ? 'default' : 'secondary'} className="mt-1">
                        {mission.pec ? 'Oui' : 'Non'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Petit-déj inclus</p>
                      <Badge variant={mission.petit_dej_included ? 'default' : 'secondary'} className="mt-1">
                        {mission.petit_dej_included ? 'Oui' : 'Non'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Devise</p>
                      <p className="mt-1 font-medium">{mission.currency || 'MAD'}</p>
                    </div>
                  </div>
                  {(mission.nbr_petit_dej > 0 || mission.nbr_dej > 0 || mission.nbr_diner > 0) && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Petits-déj</p>
                          <p className="mt-1 font-medium">{mission.nbr_petit_dej}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Déjeuners</p>
                          <p className="mt-1 font-medium">{mission.nbr_dej}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Dîners</p>
                          <p className="mt-1 font-medium">{mission.nbr_diner}</p>
                        </div>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Indemnité journalière</p>
                      <p className="mt-1 text-lg font-medium">{mission.daily_allowance} {mission.currency || 'MAD'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hébergement</p>
                      <p className="mt-1 text-lg font-medium">{mission.hotel_amount} {mission.currency || 'MAD'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total indemnité</p>
                      <p className="mt-1 text-lg font-bold text-primary">{mission.total_allowance} {mission.currency || 'MAD'}</p>
                    </div>
                  </div>
                  {mission.extra_expenses && mission.extra_expenses.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-sm font-medium text-muted-foreground">Frais supplémentaires</p>
                        {mission.extra_expenses.map((exp, i) => (
                          <div key={i} className="flex justify-between text-sm py-1">
                            <span>{exp.label}</span>
                            <span className="font-medium">{exp.amount} {mission.currency || 'MAD'}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Vehicle Details */}
            {mission.vehicle_brand && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>Détails du véhicule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Marque</p>
                      <p className="mt-1 font-medium">{mission.vehicle_brand}</p>
                    </div>
                    {mission.vehicle_fiscal_power && (
                      <div>
                        <p className="text-sm text-muted-foreground">Puissance fiscale</p>
                        <p className="mt-1 font-medium">{mission.vehicle_fiscal_power}</p>
                      </div>
                    )}
                    {mission.vehicle_plate_requested && (
                      <div>
                        <p className="text-sm text-muted-foreground">Immatriculation demandée</p>
                        <p className="mt-1 font-medium">{mission.vehicle_plate_requested}</p>
                      </div>
                    )}
                    {mission.vehicle_plate_granted && (
                      <div>
                        <p className="text-sm text-muted-foreground">Immatriculation accordée</p>
                        <p className="mt-1 font-medium">{mission.vehicle_plate_granted}</p>
                      </div>
                    )}
                    {mission.vehicle_date_from && (
                      <div>
                        <p className="text-sm text-muted-foreground">Véhicule du</p>
                        <p className="mt-1 font-medium">{format(new Date(mission.vehicle_date_from), 'dd/MM/yyyy', { locale: fr })}</p>
                      </div>
                    )}
                    {mission.vehicle_date_to && (
                      <div>
                        <p className="text-sm text-muted-foreground">Véhicule au</p>
                        <p className="mt-1 font-medium">{format(new Date(mission.vehicle_date_to), 'dd/MM/yyyy', { locale: fr })}</p>
                      </div>
                    )}
                    {mission.persons_transported && (
                      <div className="md:col-span-2">
                        <p className="text-sm text-muted-foreground">Personnes transportées</p>
                        <p className="mt-1 font-medium">{mission.persons_transported}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

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
                    const isCompleted = step.done
                    const isPending = step.active

                    return (
                      <div key={step.key} className="flex gap-4">
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
            {/* Action bar */}
            {actionInfo && (
              <Card className="border-primary/30 bg-primary/[0.03]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {'canApprove' in actionInfo && actionInfo.canApprove && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Cette mission attend votre validation en tant que <span className="font-medium text-foreground">{actionInfo.stage?.label}</span>.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          disabled={actionLoading}
                          onClick={handleApprove}
                          className="flex-1 gap-2 bg-[var(--status-success-text)] text-white hover:bg-[var(--status-success-text)]/90"
                        >
                          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Valider
                        </Button>
                        <Button
                          variant="outline"
                          disabled={actionLoading}
                          onClick={() => { setRejectReason(''); setRejectDialogOpen(true) }}
                          className="flex-1 gap-2 border-[var(--status-alert-text)]/30 text-[var(--status-alert-text)] hover:bg-[var(--status-alert-text)]/10"
                        >
                          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Rejeter
                        </Button>
                      </div>
                    </>
                  )}

                  {'canUndoApprove' in actionInfo && actionInfo.canUndoApprove && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Vous avez validé cette mission. Vous pouvez annuler votre validation.
                      </p>
                      <Button
                        variant="outline"
                        disabled={actionLoading}
                        onClick={handleUndoApprove}
                        className="w-full gap-2 border-amber-400/50 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                        Annuler la validation
                      </Button>
                    </>
                  )}

                  {'canUndoReject' in actionInfo && actionInfo.canUndoReject && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Cette mission a été rejetée. Vous pouvez la restaurer à son état précédent.
                      </p>
                      <Button
                        variant="outline"
                        disabled={actionLoading}
                        onClick={handleUndoReject}
                        className="w-full gap-2 border-blue-400/50 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restaurer la mission
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

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

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la mission</DialogTitle>
            <DialogDescription>
              {mission?.user?.full_name} — {mission?.departure_city} → {mission?.arrival_city}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motif du rejet (obligatoire)..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!rejectReason.trim() || actionLoading}
              onClick={handleReject}
              className="gap-2 bg-[var(--status-alert-text)] text-white hover:bg-[var(--status-alert-text)]/90"
            >
              {actionLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print View — portal to body so @media print CSS works */}
      {mission && missionUser && mission.status === 'APPROVED' && createPortal(
        <PrintMissionDocument mission={mission} user={missionUser} companyName={activeCompany?.name} />,
        document.body
      )}
    </>
  )
}

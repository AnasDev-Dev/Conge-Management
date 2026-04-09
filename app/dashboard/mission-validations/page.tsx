'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { PageGuard } from '@/components/role-gate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Search,
  ArrowRight,
  Undo2,
  RotateCcw,
  MapPin,
  Globe,
  Building2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Car,
} from 'lucide-react'
import { MissionRequest, Utilisateur } from '@/lib/types/database'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'

interface MissionWithUser extends MissionRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'email' | 'gender'>
  assigner?: Pick<Utilisateur, 'id' | 'full_name'>
}

// Mission approval chain: RH(rp) → Chef(dc) → Dir(de) — aligned with leave pipeline
const MISSION_PIPELINE = [
  { status: 'PENDING', label: 'RH Personnel', shortLabel: 'RH', role: 'RH', setsTo: 'VALIDATED_RP', field: 'rp' },
  { status: 'VALIDATED_RP', label: 'Chef de Service', shortLabel: 'Chef', role: 'CHEF_SERVICE', setsTo: 'VALIDATED_DC', field: 'dc' },
  { status: 'VALIDATED_DC', label: 'Directeur Exécutif', shortLabel: 'Dir.', role: 'DIRECTEUR_EXECUTIF', setsTo: 'APPROVED', field: 'de' },
] as const

const ALL_MISSION_STATUSES: string[] = MISSION_PIPELINE.map(s => s.status)

export default function MissionValidationsPage() {
  const { user } = useCurrentUser()
  const { activeRole, activeCompany } = useCompanyContext()
  const { effectiveRole } = usePermissions(user?.role || 'EMPLOYEE')
  const [allMissions, setAllMissions] = useState<MissionWithUser[]>([])
  const [rejectedMissions, setRejectedMissions] = useState<MissionWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingMission, setRejectingMission] = useState<MissionWithUser | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [scopeFilter, setScopeFilter] = useState<string>('ALL')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadMissions(user.id)
      loadRejectedMissions(user.id)
    }
  }, [user, activeCompany])

  const loadMissions = async (currentUserId: string) => {
    try {
      let query = supabase
        .from('mission_requests')
        .select(`
          *,
          user:utilisateurs!mission_requests_user_id_fkey!inner(id, full_name, job_title, email, gender, company_id),
          assigner:utilisateurs!mission_requests_assigned_by_fkey(id, full_name)
        `)
        .in('status', ALL_MISSION_STATUSES)
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      const { data, error } = await query

      if (error) throw error
      setAllMissions(data || [])
    } catch (error) {
      console.error('Error loading missions:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRejectedMissions = async (currentUserId: string) => {
    try {
      let query = supabase
        .from('mission_requests')
        .select(`
          *,
          user:utilisateurs!mission_requests_user_id_fkey!inner(id, full_name, job_title, email, gender, company_id),
          assigner:utilisateurs!mission_requests_assigned_by_fkey(id, full_name)
        `)
        .eq('status', 'REJECTED')
        .neq('user_id', currentUserId)
        .order('rejected_at', { ascending: false })
        .limit(20)

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      const { data, error } = await query

      if (error) throw error
      setRejectedMissions(data || [])
    } catch (error) {
      console.error('Error loading rejected missions:', error)
    }
  }

  // Filter
  const filteredMissions = useMemo(() => {
    return allMissions.filter(m => {
      if (scopeFilter !== 'ALL' && m.mission_scope !== scopeFilter) return false
      if (activeTab !== 'ALL' && activeTab !== 'REJECTED' && m.status !== activeTab) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const match =
          m.user?.full_name?.toLowerCase().includes(term) ||
          m.departure_city?.toLowerCase().includes(term) ||
          m.arrival_city?.toLowerCase().includes(term) ||
          m.mission_object?.toLowerCase().includes(term)
        if (!match) return false
      }
      return true
    })
  }, [allMissions, searchTerm, scopeFilter, activeTab])

  const displayMissions = activeTab === 'REJECTED' ? rejectedMissions : filteredMissions

  // Counts
  const countByStage = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const stage of MISSION_PIPELINE) {
      counts[stage.status] = allMissions.filter(m => m.status === stage.status).length
    }
    return counts
  }, [allMissions])

  const totalActive = allMissions.length

  // User permissions
  const userActiveStage = useMemo(() => {
    if (!user) return null
    if (effectiveRole === 'ADMIN') return 'ALL'
    return MISSION_PIPELINE.find(s => s.role === effectiveRole) || null
  }, [user])

  const canActOnStage = useCallback((stageStatus: string): boolean => {
    if (!userActiveStage) return false
    if (userActiveStage === 'ALL') return true
    return userActiveStage.status === stageStatus
  }, [userActiveStage])

  // ── Actions ──

  const handleApprove = async (mission: MissionWithUser) => {
    if (!user || actionLoading) return
    setActionLoading(mission.id)
    try {
      const { data, error } = await supabase.rpc('approve_mission_request', {
        p_request_id: mission.id,
        p_approver_id: user.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      const updated = data as MissionWithUser | null
      if (updated) {
        const newStatus = updated.status
        if (newStatus === 'APPROVED' || !ALL_MISSION_STATUSES.includes(newStatus)) {
          setAllMissions(prev => prev.filter(m => m.id !== mission.id))
        } else {
          setAllMissions(prev => prev.map(m => m.id === mission.id ? { ...m, ...updated } : m))
        }
      } else {
        if (user) {
          loadMissions(user.id)
        }
      }
      toast.success('Mission approuvée')
    } catch {
      toast.error('Erreur lors de l\'approbation')
    } finally {
      setActionLoading(null)
    }
  }

  const openRejectDialog = (mission: MissionWithUser) => {
    setRejectingMission(mission)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!user || !rejectingMission || !rejectReason.trim()) return
    setActionLoading(rejectingMission.id)
    try {
      const { data, error } = await supabase.rpc('reject_mission_request', {
        p_request_id: rejectingMission.id,
        p_rejector_id: user.id,
        p_reason: rejectReason.trim(),
      })
      if (error) {
        toast.error(error.message)
        return
      }
      setAllMissions(prev => prev.filter(m => m.id !== rejectingMission.id))
      const rejected = { ...rejectingMission, status: 'REJECTED' as const, rejected_by: user.id, rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() }
      setRejectedMissions(prev => [rejected, ...prev])
      setRejectDialogOpen(false)
      toast.success('Mission rejetée')
    } catch {
      toast.error('Erreur lors du rejet')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUndoApprove = async (mission: MissionWithUser) => {
    if (!user || actionLoading) return
    setActionLoading(mission.id)
    try {
      const { data, error } = await supabase.rpc('undo_approve_mission_request', {
        p_request_id: mission.id,
        p_user_id: user.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      if (data) {
        setAllMissions(prev => prev.map(m => m.id === mission.id ? { ...m, ...(data as MissionWithUser) } : m))
      } else {
        loadMissions(user.id)
      }
      toast.success('Validation annulée')
    } catch {
      toast.error('Erreur lors de l\'annulation')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUndoReject = async (mission: MissionWithUser) => {
    if (!user || actionLoading) return
    setActionLoading(mission.id)
    try {
      const { data, error } = await supabase.rpc('undo_reject_mission_request', {
        p_request_id: mission.id,
        p_user_id: user.id,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      setRejectedMissions(prev => prev.filter(m => m.id !== mission.id))
      if (data) {
        const restored = data as MissionWithUser
        if (ALL_MISSION_STATUSES.includes(restored.status)) {
          setAllMissions(prev => [{ ...mission, ...restored }, ...prev])
        }
      } else {
        loadMissions(user.id)
        loadRejectedMissions(user.id)
      }
      toast.success('Mission restaurée')
    } catch {
      toast.error('Erreur lors de la restauration')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Permission helpers ──

  const canUndoApprove = (mission: MissionWithUser): boolean => {
    if (!user) return false
    if (mission.initial_status && mission.status === mission.initial_status) return false
    if (effectiveRole === 'ADMIN') return true
    const stage = MISSION_PIPELINE.find(s => s.setsTo === mission.status || (mission.status === 'APPROVED' && s.setsTo === 'APPROVED'))
    if (!stage) return false
    const approvedByField = `approved_by_${stage.field}` as keyof MissionWithUser
    return mission[approvedByField] === user.id
  }

  const canUndoReject = (mission: MissionWithUser): boolean => {
    if (!user) return false
    return effectiveRole === 'ADMIN' || mission.rejected_by === user.id
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-4">
        <div className="shrink-0">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="h-10 w-full rounded-2xl" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <PageGuard userRole={user?.role || 'EMPLOYEE'} page="mission-validations">
    <div className="flex min-h-full flex-col gap-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Validation des Missions</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {totalActive} mission{totalActive !== 1 ? 's' : ''} en cours
          {rejectedMissions.length > 0 && (
            <> · <span className="text-[var(--status-alert-text)]">{rejectedMissions.length} rejetée{rejectedMissions.length !== 1 ? 's' : ''}</span></>
          )}
        </p>
      </div>

      {/* Stats cards */}
      <div className="shrink-0 grid grid-cols-3 gap-2 sm:gap-3">
        {MISSION_PIPELINE.map(stage => {
          const count = countByStage[stage.status] || 0
          const isActive = canActOnStage(stage.status)
          return (
            <button
              key={stage.status}
              onClick={() => setActiveTab(activeTab === stage.status ? 'ALL' : stage.status)}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all sm:gap-3 sm:px-4 sm:py-3 ${
                activeTab === stage.status
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border/70 bg-card hover:border-border'
              }`}
            >
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
                {isActive && <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
                {!isActive && <Briefcase className="h-5 w-5 text-primary/60" />}
              </div>
              <div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{count}</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">{stage.shortLabel}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Main card */}
      <Card className="flex min-h-0 flex-col border-border/70 bg-card shadow-none md:flex-1 md:sticky md:top-0 md:h-[calc(100dvh-16rem)] lg:h-[calc(100dvh-14.5rem)]">
        {/* Tabs + search bar */}
        <div className="shrink-0 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-1">
              {[
                { key: 'ALL', label: 'Tous', count: totalActive },
                ...MISSION_PIPELINE.map(s => ({
                  key: s.status,
                  label: s.shortLabel,
                  count: countByStage[s.status] || 0,
                })),
                { key: 'REJECTED', label: 'Rejetées', count: rejectedMissions.length },
              ].map(tab => {
                const isActiveTab = activeTab === tab.key
                const isRejected = tab.key === 'REJECTED'
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isActiveTab
                        ? isRejected
                          ? 'border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] text-[var(--status-alert-text)]'
                          : 'border border-border bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {canActOnStage(tab.key) && !isActiveTab && (
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    )}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        isActiveTab
                          ? isRejected ? 'bg-[var(--status-alert-text)]/15' : 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Search + filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:w-72">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nom, destination, objet..."
                  className="pl-11"
                />
              </div>
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="ALL">Tous</option>
                <option value="LOCAL">Local</option>
                <option value="INTERNATIONAL">International</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mission list */}
        <CardContent className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {displayMissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm">
                {activeTab === 'REJECTED' ? 'Aucune mission rejetée' : 'Aucune mission en attente'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayMissions.map(mission => {
                const isRejected = activeTab === 'REJECTED' || mission.status === 'REJECTED'
                const stageForAction = MISSION_PIPELINE.find(s => s.status === mission.status)
                const isActive = stageForAction ? canActOnStage(stageForAction.status) : false
                const isExpanded = expandedId === mission.id
                const isLoading = actionLoading === mission.id
                const showUndo = !isRejected && canUndoApprove(mission)
                const showUndoReject = isRejected && canUndoReject(mission)

                return (
                  <div
                    key={mission.id}
                    className={`rounded-2xl border transition-all ${
                      isRejected
                        ? 'border-[var(--status-alert-border)]/50 bg-[var(--status-alert-bg)]/30'
                        : isActive
                          ? 'border-primary/25 bg-card hover:border-primary/40 hover:shadow-sm'
                          : 'border-border/70 bg-card'
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: employee + route */}
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {/* Avatar */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-sm font-medium text-muted-foreground">
                          {mission.user?.full_name?.charAt(0) || '?'}
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Name + badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/dashboard/missions/${mission.id}`} className="font-medium text-foreground hover:underline">
                              {mission.user?.full_name}
                            </Link>
                            <Badge
                              variant="secondary"
                              className={`border text-[10px] ${
                                mission.mission_scope === 'INTERNATIONAL'
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {mission.mission_scope === 'INTERNATIONAL' ? (
                                <><Globe className="mr-1 h-3 w-3" />International</>
                              ) : (
                                <><Building2 className="mr-1 h-3 w-3" />Local</>
                              )}
                            </Badge>
                            {mission.request_origin === 'ASSIGNED' && (
                              <Badge variant="secondary" className="border border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                                Assignée
                              </Badge>
                            )}
                          </div>

                          {/* Job title */}
                          {mission.user?.job_title && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{mission.user.job_title}</p>
                          )}

                          {/* Route */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              {mission.departure_city}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                            <span className="font-medium text-foreground">{mission.arrival_city}</span>
                          </div>

                          {/* Dates + duration */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {format(new Date(mission.start_date), 'dd MMM', { locale: fr })} – {format(new Date(mission.end_date), 'dd MMM yyyy', { locale: fr })}
                            </span>
                            <span className="font-medium text-foreground">{mission.days_count}j</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDistanceToNow(new Date(mission.created_at), { locale: fr, addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
                        {/* Status badge (only show if not on filtered tab) */}
                        {activeTab === 'ALL' && !isRejected && (
                          <Badge variant="secondary" className="border border-border/70 text-[10px]">
                            {stageForAction?.label || mission.status}
                          </Badge>
                        )}

                        {/* Approve + Reject */}
                        {isActive && !isRejected && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleApprove(mission)}
                              className="h-8 gap-1 bg-[var(--status-success-text)] px-3 text-xs text-white hover:bg-[var(--status-success-text)]/90"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Valider
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isLoading}
                              onClick={() => openRejectDialog(mission)}
                              className="h-8 gap-1 border-[var(--status-alert-text)]/30 px-3 text-xs text-[var(--status-alert-text)] hover:bg-[var(--status-alert-text)]/10"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Rejeter
                            </Button>
                          </div>
                        )}

                        {/* Undo approve */}
                        {showUndo && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => handleUndoApprove(mission)}
                            className="h-8 gap-1.5 border-amber-400/50 bg-amber-50 px-3 text-xs text-amber-700 hover:bg-amber-100"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Annuler la validation
                          </Button>
                        )}

                        {/* Undo reject */}
                        {showUndoReject && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => handleUndoReject(mission)}
                            className="h-8 gap-1.5 border-blue-400/50 bg-blue-50 px-3 text-xs text-blue-700 hover:bg-blue-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurer
                          </Button>
                        )}

                        {/* View detail link */}
                        <Link href={`/dashboard/missions/${mission.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                            Détails →
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Rejection reason */}
                    {isRejected && mission.rejection_reason && (
                      <div className="border-t border-[var(--status-alert-border)]/30 px-4 py-2.5">
                        <div className="flex items-start gap-2 text-xs">
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-alert-text)]/60" />
                          <p className="text-[var(--status-alert-text)]/80">{mission.rejection_reason}</p>
                        </div>
                      </div>
                    )}

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : mission.id)}
                      className="flex w-full items-center justify-center gap-1 border-t border-border/50 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/30"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? 'Moins' : 'Plus'}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Objet de la mission</p>
                            <p className="mt-0.5 text-foreground">{mission.mission_object}</p>
                          </div>
                          {mission.transport_type && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Transport</p>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-foreground">
                                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                                {mission.transport_type}
                                {mission.transport_details && ` — ${mission.transport_details}`}
                              </p>
                            </div>
                          )}
                          {mission.comments && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Commentaires</p>
                              <p className="mt-0.5 text-foreground">{mission.comments}</p>
                            </div>
                          )}
                          {mission.assigner && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assignée par</p>
                              <p className="mt-0.5 text-foreground">{mission.assigner.full_name}</p>
                            </div>
                          )}
                          {(mission.daily_allowance > 0 || mission.total_allowance > 0) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Indemnité</p>
                              <p className="mt-0.5 text-foreground font-medium">
                                {mission.daily_allowance}/j — Total: {mission.total_allowance} {mission.currency || 'MAD'}
                                {mission.pec && <Badge variant="secondary" className="ml-1.5 text-[9px]">PEC</Badge>}
                              </p>
                            </div>
                          )}
                          {mission.hotel_amount > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hébergement</p>
                              <p className="mt-0.5 text-foreground">{mission.hotel_amount} {mission.currency || 'MAD'}</p>
                            </div>
                          )}
                          {mission.extra_expenses && mission.extra_expenses.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Frais supp.</p>
                              <p className="mt-0.5 text-foreground font-medium">
                                {mission.extra_expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0)} {mission.currency || 'MAD'}
                              </p>
                            </div>
                          )}
                          {mission.vehicle_brand && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Véhicule</p>
                              <p className="mt-0.5 text-foreground">{mission.vehicle_brand} {mission.vehicle_plate_requested && `(${mission.vehicle_plate_requested})`}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la mission</DialogTitle>
            <DialogDescription>
              {rejectingMission?.user?.full_name} — {rejectingMission?.departure_city} → {rejectingMission?.arrival_city}
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
              disabled={!rejectReason.trim() || actionLoading !== null}
              onClick={handleReject}
              className="bg-[var(--status-alert-text)] text-white hover:bg-[var(--status-alert-text)]/90"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageGuard>
  )
}

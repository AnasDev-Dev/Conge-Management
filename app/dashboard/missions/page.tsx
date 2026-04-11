'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import {
  Briefcase,
  PlusCircle,
  Search,
  MapPin,
  ArrowRight,
  Globe,
  Building2,
  Car,
  Plane,
  Train,
  Clock,
  CheckCircle2,
  XCircle,
  Circle,
  UserCircle,
} from 'lucide-react'
import { MissionRequest, Utilisateur } from '@/lib/types/database'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface MissionWithUser extends MissionRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>
  assigner?: Pick<Utilisateur, 'id' | 'full_name'>
}

// Pipeline stages: Resp.Admin → Dir (2-stage)
const PIPELINE_STAGES = [
  { key: 'dc', label: 'R.A.', status: 'VALIDATED_DC' },
  { key: 'de', label: 'Dir.', status: 'APPROVED' },
] as const

const STATUS_ORDER = ['PENDING', 'VALIDATED_DC', 'APPROVED']

function getPipelineProgress(status: string): number {
  const idx = STATUS_ORDER.indexOf(status)
  return idx >= 0 ? idx : 0
}

function getTransportIcon(type?: string | null) {
  if (!type) return Car
  const t = type.toLowerCase()
  if (t.includes('avion') || t.includes('air') || t.includes('vol')) return Plane
  if (t.includes('train')) return Train
  return Car
}

const TAB_FILTERS = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'IN_PROGRESS', label: 'En cours' },
  { key: 'APPROVED', label: 'Approuvées' },
  { key: 'REJECTED', label: 'Rejetées' },
] as const

export default function MissionsPage() {
  const { user } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const [missions, setMissions] = useState<MissionWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [scopeFilter, setScopeFilter] = useState<string>('ALL')
  const supabase = createClient()
  const { can } = usePermissions(user?.role || 'EMPLOYEE')

  useEffect(() => {
    if (user) loadMissions(user)
  }, [user, activeCompany])

  const loadMissions = async (currentUser: Utilisateur) => {
    try {
      const isManager = can('missions.viewAll')
      let query = supabase
        .from('mission_requests')
        .select(`
          *,
          user:utilisateurs!mission_requests_user_id_fkey!inner(id, full_name, job_title, company_id),
          assigner:utilisateurs!mission_requests_assigned_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false })

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }
      if (!isManager) {
        query = query.or(`user_id.eq.${currentUser.id},assigned_by.eq.${currentUser.id}`)
      }

      const { data, error } = await query
      if (error) throw error
      setMissions(data || [])
    } catch (error) {
      console.error('Error loading missions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Stats
  const stats = useMemo(() => ({
    total: missions.length,
    pending: missions.filter(m => m.status === 'PENDING' || m.status.startsWith('VALIDATED_')).length,
    approved: missions.filter(m => m.status === 'APPROVED').length,
    rejected: missions.filter(m => m.status === 'REJECTED').length,
  }), [missions])

  // Filtered missions
  const filteredMissions = useMemo(() => {
    return missions.filter(m => {
      // Tab filter
      if (activeTab === 'IN_PROGRESS') {
        if (m.status !== 'PENDING' && !m.status.startsWith('VALIDATED_')) return false
      } else if (activeTab !== 'ALL' && m.status !== activeTab) {
        return false
      }
      // Scope filter
      if (scopeFilter !== 'ALL' && m.mission_scope !== scopeFilter) return false
      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const match =
          m.departure_city?.toLowerCase().includes(term) ||
          m.arrival_city?.toLowerCase().includes(term) ||
          m.mission_object?.toLowerCase().includes(term) ||
          m.user?.full_name?.toLowerCase().includes(term)
        if (!match) return false
      }
      return true
    })
  }, [missions, activeTab, scopeFilter, searchTerm])

  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups: { key: string; label: string; missions: MissionWithUser[] }[] = []
    const map = new Map<string, MissionWithUser[]>()

    for (const m of filteredMissions) {
      const date = new Date(m.created_at)
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }

    for (const [key, items] of map) {
      const [year, month] = key.split('-').map(Number)
      const label = format(new Date(year, month, 1), 'MMMM yyyy', { locale: fr })
      groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), missions: items })
    }

    return groups
  }, [filteredMissions])

  if (!user) return null

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Ordres de mission</h1>
          <p className="mt-1 text-sm text-muted-foreground">Consultez et gérez vos ordres de mission</p>
        </div>
        <Link href="/dashboard/new-mission">
          <Button size="sm" className="sm:h-10 sm:px-4 sm:text-sm">
            <PlusCircle className="mr-1.5 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nouvelle mission</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </Link>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-1">
          {TAB_FILTERS.map(tab => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'ALL' ? stats.total
              : tab.key === 'IN_PROGRESS' ? stats.pending
              : tab.key === 'APPROVED' ? stats.approved
              : stats.rejected
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? tab.key === 'REJECTED'
                      ? 'border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] text-[var(--status-alert-text)]'
                      : 'border border-border bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? tab.key === 'REJECTED' ? 'bg-[var(--status-alert-text)]/15' : 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search + scope */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Destination, objet, employé..."
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

      {/* Timeline */}
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-5 w-32" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <Skeleton className="h-32 flex-1 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : filteredMissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 py-16">
          <Briefcase className="mb-3 h-12 w-12 text-muted-foreground/30" />
          <h3 className="mb-1 text-base font-medium text-foreground">
            {searchTerm || activeTab !== 'ALL' || scopeFilter !== 'ALL' ? 'Aucune mission trouvée' : 'Aucun ordre de mission'}
          </h3>
          <p className="mb-5 text-sm text-muted-foreground">
            {searchTerm || activeTab !== 'ALL' || scopeFilter !== 'ALL'
              ? 'Essayez de modifier vos filtres'
              : 'Commencez par créer votre premier ordre de mission'}
          </p>
          {!searchTerm && activeTab === 'ALL' && scopeFilter === 'ALL' && (
            <Link href="/dashboard/new-mission">
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                Créer un ordre de mission
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByMonth.map(group => (
            <div key={group.key}>
              {/* Month separator */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{group.label}</span>
                <div className="h-px flex-1 bg-border/70" />
                <span className="text-xs text-muted-foreground">{group.missions.length} mission{group.missions.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Timeline items */}
              <div className="space-y-3">
                {group.missions.map((mission) => {
                  const progress = getPipelineProgress(mission.status)
                  const isRejected = mission.status === 'REJECTED'
                  const isApproved = mission.status === 'APPROVED'
                  const isAutoApproved = isApproved && mission.initial_status === 'APPROVED'
                  const TransportIcon = getTransportIcon(mission.transport_type)
                  const createdDate = new Date(mission.created_at)

                  return (
                    <Link key={mission.id} href={`/dashboard/missions/${mission.id}`} className="group block">
                      <div className={`flex gap-3 sm:gap-4 ${isRejected ? '' : ''}`}>
                        {/* Date column */}
                        <div className="hidden w-14 shrink-0 pt-3 text-right sm:block">
                          <p className="text-sm font-bold text-foreground">{format(createdDate, 'dd MMM', { locale: fr })}</p>
                          <p className="text-[10px] text-muted-foreground">{format(createdDate, 'EEEE', { locale: fr })}</p>
                        </div>

                        {/* Timeline line */}
                        <div className="hidden flex-col items-center sm:flex">
                          <div className={`mt-3 h-3 w-3 rounded-full border-2 ${
                            isRejected
                              ? 'border-[var(--status-alert-text)] bg-[var(--status-alert-bg)]'
                              : isApproved
                                ? 'border-[var(--status-success-text)] bg-[var(--status-success-bg)]'
                                : 'border-[var(--status-pending-text)] bg-[var(--status-pending-bg)]'
                          }`} />
                          <div className="w-px flex-1 bg-border/50" />
                        </div>

                        {/* Card */}
                        <div className={`flex-1 rounded-2xl border transition-all group-hover:shadow-sm ${
                          isRejected
                            ? 'border-[var(--status-alert-border)]/50 bg-[var(--status-alert-bg)]/20'
                            : isApproved
                              ? 'border-[var(--status-success-border)]/50 bg-card'
                              : 'border-border/70 bg-card'
                        } group-hover:border-primary/30`}>
                          <div className="p-4">
                            {/* Top row: route + scope badge */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <TransportIcon className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-base font-semibold text-foreground">{mission.departure_city}</span>
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                                  <span className="text-base font-semibold text-foreground">{mission.arrival_city}</span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className={`border text-[10px] ${
                                    mission.mission_scope === 'INTERNATIONAL'
                                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {mission.mission_scope === 'INTERNATIONAL'
                                    ? <><Globe className="mr-1 h-3 w-3" />International</>
                                    : <><Building2 className="mr-1 h-3 w-3" />Local</>
                                  }
                                </Badge>
                                {mission.request_origin === 'ASSIGNED' && (
                                  <Badge variant="secondary" className="border border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                                    Assignée
                                  </Badge>
                                )}
                              </div>
                              {/* Mobile date */}
                              <span className="shrink-0 text-[10px] text-muted-foreground sm:hidden">
                                {format(createdDate, 'dd MMM', { locale: fr })}
                              </span>
                            </div>

                            {/* Object */}
                            <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">{mission.mission_object}</p>

                            {/* Details row */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <UserCircle className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">{mission.user?.full_name}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {format(new Date(mission.start_date), 'dd MMM', { locale: fr })} – {format(new Date(mission.end_date), 'dd MMM', { locale: fr })}
                              </span>
                              <span className="font-medium text-foreground">{mission.days_count}j</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDistanceToNow(createdDate, { locale: fr, addSuffix: true })}
                              </span>
                              {(mission.total_allowance > 0) && (
                                <span className="font-medium text-foreground">
                                  {mission.total_allowance} {mission.currency || 'MAD'}
                                </span>
                              )}
                            </div>

                            {/* Pipeline progress bar */}
                            <div className="mt-3 flex items-center gap-1.5">
                              {isRejected ? (
                                <div className="flex items-center gap-2 rounded-lg bg-[var(--status-alert-bg)] px-2.5 py-1.5">
                                  <XCircle className="h-3.5 w-3.5 text-[var(--status-alert-text)]" />
                                  <span className="text-[11px] font-medium text-[var(--status-alert-text)]">
                                    Rejetée{mission.rejection_reason ? ` — ${mission.rejection_reason.substring(0, 60)}${mission.rejection_reason.length > 60 ? '...' : ''}` : ''}
                                  </span>
                                </div>
                              ) : isAutoApproved ? (
                                <div className="flex items-center gap-2 rounded-lg bg-[var(--status-success-bg)] px-2.5 py-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text)]" />
                                  <span className="text-[11px] font-medium text-[var(--status-success-text)]">Approuvée automatiquement</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-0">
                                  {PIPELINE_STAGES.map((stage, i) => {
                                    const stageIdx = i + 1 // VALIDATED_RP=1, VALIDATED_DC=2, APPROVED=3
                                    const isDone = progress >= stageIdx
                                    const isCurrent = progress === i // stage waiting to be approved
                                    return (
                                      <div key={stage.key} className="flex items-center">
                                        {i > 0 && (
                                          <div className={`h-0.5 w-5 sm:w-8 ${isDone ? 'bg-[var(--status-success-text)]' : 'bg-border'}`} />
                                        )}
                                        <div className="flex items-center gap-1" title={stage.label}>
                                          {isDone ? (
                                            <CheckCircle2 className="h-4 w-4 text-[var(--status-success-text)]" />
                                          ) : isCurrent ? (
                                            <div className="relative">
                                              <Circle className="h-4 w-4 text-[var(--status-pending-text)]" />
                                              <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--status-pending-text)]" />
                                              </div>
                                            </div>
                                          ) : (
                                            <Circle className="h-4 w-4 text-border" />
                                          )}
                                          <span className={`text-[10px] font-medium ${
                                            isDone ? 'text-[var(--status-success-text)]'
                                              : isCurrent ? 'text-[var(--status-pending-text)]'
                                              : 'text-muted-foreground/50'
                                          }`}>
                                            {stage.label}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

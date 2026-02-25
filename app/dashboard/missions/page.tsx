'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { Briefcase, PlusCircle, Search, Calendar, MapPin } from 'lucide-react'
import { MissionRequest, Utilisateur } from '@/lib/types/database'
import { MANAGER_ROLES, getStatusClass, getStatusLabel } from '@/lib/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface MissionWithUser extends MissionRequest {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>
  assigner?: Pick<Utilisateur, 'id' | 'full_name'>
}

export default function MissionsPage() {
  const { user } = useCurrentUser()
  const [missions, setMissions] = useState<MissionWithUser[]>([])
  const [filteredMissions, setFilteredMissions] = useState<MissionWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadMissions(user)
    }
  }, [user])

  useEffect(() => {
    filterMissions()
  }, [missions, searchTerm, statusFilter])

  const loadMissions = async (currentUser: Utilisateur) => {
    try {
      const isManager = MANAGER_ROLES.includes(currentUser.role)

      let query = supabase
        .from('mission_requests')
        .select(`
          *,
          user:utilisateurs!mission_requests_user_id_fkey(id, full_name, job_title),
          assigner:utilisateurs!mission_requests_assigned_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false })

      if (!isManager) {
        query = query.or(`user_id.eq.${currentUser.id},assigned_by.eq.${currentUser.id}`)
      }

      const { data, error } = await query

      if (error) throw error
      setMissions(data || [])
      setFilteredMissions(data || [])
    } catch (error) {
      console.error('Error loading missions:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterMissions = () => {
    let filtered = missions

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((m) => m.status === statusFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.departure_city.toLowerCase().includes(term) ||
          m.arrival_city.toLowerCase().includes(term) ||
          m.mission_object.toLowerCase().includes(term) ||
          m.user?.full_name?.toLowerCase().includes(term) ||
          m.status.toLowerCase().includes(term)
      )
    }

    setFilteredMissions(filtered)
  }

  if (!user) return null

  const stats = {
    total: missions.length,
    pending: missions.filter((m) => m.status === 'PENDING' || m.status.startsWith('VALIDATED_')).length,
    approved: missions.filter((m) => m.status === 'APPROVED').length,
    rejected: missions.filter((m) => m.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-4 md:space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Ordres de mission</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">Consultez et gérez vos ordres de mission</p>
        </div>
        <Link href="/dashboard/new-mission">
          <Button size="sm" className="sm:h-10 sm:px-4 sm:text-sm">
            <PlusCircle className="mr-1.5 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nouvelle mission</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="text-xl font-bold text-foreground sm:text-2xl">{stats.total}</div>
            <p className="text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">Total</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="text-xl font-bold text-[var(--status-pending-text)] sm:text-2xl">{stats.pending}</div>
            <p className="text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">En cours</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="text-xl font-bold text-[var(--status-success-text)] sm:text-2xl">{stats.approved}</div>
            <p className="text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">Approuvées</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3 sm:pt-6 sm:px-6">
            <div className="text-xl font-bold text-[var(--status-alert-text)] sm:text-2xl">{stats.rejected}</div>
            <p className="text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">Rejetées</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="p-3 sm:pt-6 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  placeholder="Rechercher par destination, objet, employé..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="VALIDATED_DC">Validé par Chef</option>
              <option value="VALIDATED_RP">Validé par RH</option>
              <option value="APPROVED">Approuvé</option>
              <option value="REJECTED">Rejeté</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Missions List */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Liste des missions ({filteredMissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="mt-4 text-muted-foreground">Chargement des missions...</p>
            </div>
          ) : filteredMissions.length === 0 ? (
            <div className="py-12 text-center">
              <Briefcase className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {searchTerm || statusFilter !== 'ALL' ? 'Aucune mission trouvée' : 'Aucun ordre de mission'}
              </h3>
              <p className="mb-6 text-muted-foreground">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'Essayez de modifier vos filtres de recherche'
                  : 'Commencez par créer votre premier ordre de mission'}
              </p>
              {!searchTerm && statusFilter === 'ALL' && (
                <Link href="/dashboard/new-mission">
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Créer un ordre de mission
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMissions.map((mission) => (
                <Link key={mission.id} href={`/dashboard/missions/${mission.id}`} className="block">
                  <div className="soft-row cursor-pointer rounded-2xl px-3 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-3 sm:gap-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
                            <span className="text-sm font-semibold text-foreground truncate sm:text-lg">
                              {mission.departure_city} → {mission.arrival_city}
                            </span>
                          </div>
                          <Badge className={getStatusClass(mission.status)}>
                            {getStatusLabel(mission.status)}
                          </Badge>
                          {mission.mission_scope === 'INTERNATIONAL' && (
                            <Badge variant="outline" className="text-xs">
                              International
                            </Badge>
                          )}
                          {mission.request_origin === 'ASSIGNED' && (
                            <Badge variant="outline" className="text-xs">
                              Assignée
                            </Badge>
                          )}
                        </div>

                        <p className="mb-2 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
                          {mission.mission_object}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-xs sm:gap-3 sm:text-sm md:grid-cols-4">
                          <div>
                            <span className="text-muted-foreground">Missionnaire:</span>
                            <span className="ml-1 font-medium text-foreground sm:ml-2">
                              {mission.user?.full_name || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
                            <span className="font-medium text-foreground">
                              {format(new Date(mission.start_date), 'dd MMM', { locale: fr })} -{' '}
                              {format(new Date(mission.end_date), 'dd MMM yyyy', { locale: fr })}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Durée:</span>
                            <span className="ml-1 font-medium text-foreground sm:ml-2">
                              {mission.days_count} jour{mission.days_count > 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="hidden sm:block">
                            <span className="text-muted-foreground">Soumis le:</span>
                            <span className="ml-2 font-medium text-foreground">
                              {format(new Date(mission.created_at), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button variant="ghost" size="sm" className="hidden sm:flex">
                        Voir détails →
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { FileText, Search, Calendar, Clock, ChevronRight, Users } from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { MANAGER_ROLES, getStatusClass, getStatusLabel } from '@/lib/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface RequestWithUser {
  id: number
  user_id: string
  request_type: string
  start_date: string
  end_date: string
  days_count: number
  return_date: string | null
  status: string
  reason: string | null
  created_at: string
  user?: { id: string; full_name: string; job_title: string | null } | null
}

const STATUS_TABS = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'APPROVED', label: 'Approuvées' },
  { value: 'REJECTED', label: 'Rejetées' },
] as const

export default function RequestsPage() {
  const { user } = useCurrentUser()
  const [requests, setRequests] = useState<RequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (user) {
      loadRequests(user)
    }
  }, [user])

  const loadRequests = async (userData: Utilisateur) => {
    try {
      // RLS handles visibility: employees see own, CHEF sees dept, RH/DIR/ADMIN see all
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name, job_title)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const isManagerView = user ? MANAGER_ROLES.includes(user.role) : false

  const filteredRequests = useMemo(() => {
    let filtered = requests

    if (statusFilter === 'IN_PROGRESS') {
      filtered = filtered.filter(r => r.status.startsWith('VALIDATED_'))
    } else if (statusFilter !== 'ALL') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(r =>
        r.reason?.toLowerCase().includes(term) ||
        r.request_type.toLowerCase().includes(term) ||
        r.user?.full_name?.toLowerCase().includes(term) ||
        r.user?.job_title?.toLowerCase().includes(term)
      )
    }

    return filtered
  }, [requests, searchTerm, statusFilter])

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'PENDING').length,
    inProgress: requests.filter(r => r.status.startsWith('VALIDATED_')).length,
    approved: requests.filter(r => r.status === 'APPROVED').length,
    rejected: requests.filter(r => r.status === 'REJECTED').length,
  }), [requests])

  const typeLabel = (type: string) => type === 'CONGE' ? 'Congé' : 'Récupération'

  if (!user) return null

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Demandes</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {isManagerView ? 'Toutes les demandes de congé' : 'Consultez et gérez vos demandes de congé.'}
        </p>
      </div>

      {/* KPI cards */}
      <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
            <FileText className="h-5 w-5 text-primary" />
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
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.pending + stats.inProgress}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">En attente</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 sm:flex">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.approved}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Approuvées</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 sm:flex">
            <Users className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.rejected}</p>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Rejetées</p>
          </div>
        </div>
      </div>

      {/* Main table card */}
      <Card className="flex min-h-0 flex-col border-border/70 bg-card shadow-none backdrop-blur-none md:flex-1 md:sticky md:top-0 md:h-[calc(100dvh-12.5rem)] lg:h-[calc(100dvh-11rem)]">
        <CardHeader className="shrink-0 border-b border-border/70 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4.5 w-4.5 text-primary" />
              Liste des demandes
              {(searchTerm || statusFilter !== 'ALL') && (
                <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-normal text-primary">
                  {filteredRequests.length} résultats
                </span>
              )}
            </CardTitle>
            <div className="relative w-full md:w-[24rem]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher: nom, type, motif..."
                className="pl-11"
              />
            </div>
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
              {[...Array(6)].map((_, i) => (
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
              <FileText className="mb-4 h-14 w-14 text-muted-foreground/30" />
              <h3 className="mb-1 text-base font-medium text-foreground">
                {searchTerm || statusFilter !== 'ALL' ? 'Aucune demande trouvée' : 'Aucune demande'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'Essayez de modifier vos filtres'
                  : 'Commencez par créer votre première demande'}
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
                        {isManagerView && <th className="whitespace-nowrap px-4 py-3 font-semibold">Employé</th>}
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Type</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Période</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Durée</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Statut</th>
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">Soumis le</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => (
                        <tr key={request.id} className="soft-row">
                          {isManagerView && (
                            <td className="border-b border-border/45 px-4 py-3.5 align-top">
                              <p className="font-medium text-foreground">{request.user?.full_name ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">{request.user?.job_title ?? ''}</p>
                            </td>
                          )}
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <Badge variant="secondary" className={`border ${request.request_type === 'CONGE' ? 'border-[#cfdacb] bg-[#ecf3e8] text-[#46604a]' : 'border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]'}`}>
                              {typeLabel(request.request_type)}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 text-sm text-foreground">
                            {format(new Date(request.start_date + 'T00:00:00'), 'dd MMM', { locale: fr })} – {format(new Date(request.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <span className="font-semibold text-foreground">{request.days_count}</span>
                            <span className="ml-1 text-sm text-muted-foreground">jour{request.days_count > 1 ? 's' : ''}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 align-top">
                            <Badge className={getStatusClass(request.status)}>
                              {getStatusLabel(request.status)}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap border-b border-border/45 px-4 py-3.5 text-sm text-muted-foreground">
                            {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}
                          </td>
                          <td className="border-b border-border/45 px-4 py-3.5 text-right align-top">
                            <Link href={`/dashboard/requests/${request.id}`}>
                              <Button variant="outline" size="sm">
                                Voir détails
                                <ChevronRight className="ml-1 h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
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
                    <Link key={request.id} href={`/dashboard/requests/${request.id}`} className="block">
                      <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            {isManagerView && request.user && (
                              <p className="font-medium text-foreground">{request.user.full_name}</p>
                            )}
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {format(new Date(request.start_date + 'T00:00:00'), 'dd MMM', { locale: fr })} – {format(new Date(request.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                            </p>
                          </div>
                          <Badge className={getStatusClass(request.status)}>
                            {getStatusLabel(request.status)}
                          </Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-secondary/60 p-2.5">
                            <p className="text-xs text-muted-foreground">Type</p>
                            <p className="font-medium text-foreground">{typeLabel(request.request_type)}</p>
                          </div>
                          <div className="rounded-xl bg-secondary/60 p-2.5">
                            <p className="text-xs text-muted-foreground">Durée</p>
                            <p className="font-semibold text-primary">{request.days_count} jour{request.days_count > 1 ? 's' : ''}</p>
                          </div>
                        </div>

                        {request.reason && (
                          <p className="mt-2.5 line-clamp-1 text-xs text-muted-foreground">{request.reason}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

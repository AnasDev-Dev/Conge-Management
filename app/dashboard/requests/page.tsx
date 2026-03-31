'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Search, Calendar, Clock, ChevronRight, Users, Gift, Heart, X, ExternalLink, User } from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { getStatusClass, getStatusLabel } from '@/lib/constants'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'

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
  is_derogation: boolean
  balance_before: number | null
  balance_conge_used: number | null
  created_at: string
  user?: { id: string; full_name: string; job_title: string | null } | null
}

interface ExceptionalClaimRow {
  id: number
  user_id: string
  exceptional_leave_type_id: number | null
  autre_type_name: string | null
  start_date: string | null
  end_date: string | null
  days_count: number | null
  days_granted: number
  notes: string | null
  claim_date: string
  created_at: string
  user?: { id: string; full_name: string; job_title: string | null } | null
  exceptional_leave_type?: { id: number; name: string } | null
}

interface SickLeaveRow {
  id: number
  user_id: string
  start_date: string
  end_date: string
  days_count: number
  reason: string | null
  certificate_url: string | null
  year: number
  created_at: string
  user?: { id: string; full_name: string; job_title: string | null } | null
}

type MainTab = 'conge' | 'exceptionnel' | 'maladie'

const STATUS_TABS = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'APPROVED', label: 'Approuvées' },
  { value: 'REJECTED', label: 'Rejetées' },
] as const


export default function RequestsPage() {
  const { user } = useCurrentUser()
  const { activeRole, activeCompany } = useCompanyContext()
  const { can } = usePermissions(user?.role || 'EMPLOYEE')
  const supabase = useMemo(() => createClient(), [])

  const [mainTab, setMainTab] = useState<MainTab>('conge')

  // --- Congé/Récup state ---
  const [requests, setRequests] = useState<RequestWithUser[]>([])
  const [loadingConge, setLoadingConge] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // --- Exceptionnel state ---
  const [exceptionalClaims, setExceptionalClaims] = useState<ExceptionalClaimRow[]>([])
  const [loadingExceptionnel, setLoadingExceptionnel] = useState(true)
  const [exceptionnelSearch, setExceptionnelSearch] = useState('')

  // --- Maladie state ---
  const [sickLeaves, setSickLeaves] = useState<SickLeaveRow[]>([])
  const [loadingMaladie, setLoadingMaladie] = useState(true)
  const [maladieSearch, setMaladieSearch] = useState('')

  // --- Detail dialog ---
  const [selectedExceptional, setSelectedExceptional] = useState<ExceptionalClaimRow | null>(null)
  const [selectedSickLeave, setSelectedSickLeave] = useState<SickLeaveRow | null>(null)

  // Load all data when user/company changes
  useEffect(() => {
    if (user) {
      loadRequests(user)
      loadExceptionalClaims(user)
      loadSickLeaves(user)
    }
  }, [user, activeCompany])

  const loadRequests = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey!inner(id, full_name, job_title, company_id)
        `)
        .order('created_at', { ascending: false })

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoadingConge(false)
    }
  }

  const loadExceptionalClaims = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('exceptional_leave_claims')
        .select(`
          *,
          user:utilisateurs!exceptional_leave_claims_user_id_fkey(id, full_name, job_title, company_id),
          exceptional_leave_type:exceptional_leave_types(id, name)
        `)
        .order('created_at', { ascending: false })

      if (!canViewAllExceptional) {
        query = query.eq('user_id', userData.id)
      }

      const { data, error } = await query
      if (error) throw error
      setExceptionalClaims((data || []) as ExceptionalClaimRow[])
    } catch (error) {
      console.error('Error loading exceptional claims:', error)
    } finally {
      setLoadingExceptionnel(false)
    }
  }

  const loadSickLeaves = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('sick_leaves')
        .select(`
          *,
          user:utilisateurs!sick_leaves_user_id_fkey(id, full_name, job_title, company_id)
        `)
        .order('created_at', { ascending: false })

      if (!canViewAllMaladie) {
        query = query.eq('user_id', userData.id)
      }

      const { data, error } = await query
      if (error) throw error
      setSickLeaves((data || []) as SickLeaveRow[])
    } catch (error) {
      console.error('Error loading sick leaves:', error)
    } finally {
      setLoadingMaladie(false)
    }
  }

  const isManagerView = can('requests.viewAll')
  const canViewAllExceptional = can('exceptional.viewAll')
  const canViewAllMaladie = can('maladie.viewAll')

  // --- Congé filters ---
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

  // --- Exceptionnel filters ---
  const filteredExceptional = useMemo(() => {
    if (!exceptionnelSearch) return exceptionalClaims
    const term = exceptionnelSearch.toLowerCase()
    return exceptionalClaims.filter(r =>
      r.exceptional_leave_type?.name?.toLowerCase().includes(term) ||
      r.autre_type_name?.toLowerCase().includes(term) ||
      r.notes?.toLowerCase().includes(term) ||
      r.user?.full_name?.toLowerCase().includes(term)
    )
  }, [exceptionalClaims, exceptionnelSearch])

  // --- Maladie filters ---
  const filteredSickLeaves = useMemo(() => {
    if (!maladieSearch) return sickLeaves
    const term = maladieSearch.toLowerCase()
    return sickLeaves.filter(r =>
      r.reason?.toLowerCase().includes(term) ||
      r.user?.full_name?.toLowerCase().includes(term)
    )
  }, [sickLeaves, maladieSearch])

  const congeStats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'PENDING').length,
    inProgress: requests.filter(r => r.status.startsWith('VALIDATED_')).length,
    approved: requests.filter(r => r.status === 'APPROVED').length,
    rejected: requests.filter(r => r.status === 'REJECTED').length,
  }), [requests])

  const typeLabel = (type: string) => type === 'CONGE' ? 'Congé' : 'Récupération'

  const getExceptionalTypeName = (claim: ExceptionalClaimRow) =>
    claim.exceptional_leave_type?.name || claim.autre_type_name || 'Autre'

  if (!user) return null

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Demandes</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {isManagerView ? 'Toutes les demandes' : 'Consultez et gérez vos demandes.'}
        </p>
      </div>

      {/* Main tabs: Congé | Exceptionnel | Maladie */}
      <div className="shrink-0 flex gap-1 rounded-2xl bg-secondary/50 p-1.5">
        <button
          onClick={() => setMainTab('conge')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
            mainTab === 'conge'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className={cn('h-4 w-4', mainTab === 'conge' ? 'text-primary' : '')} />
          Congé / Récup
          {requests.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{requests.length}</span>
          )}
        </button>
        <button
          onClick={() => setMainTab('exceptionnel')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
            mainTab === 'exceptionnel'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Gift className={cn('h-4 w-4', mainTab === 'exceptionnel' ? 'text-primary' : '')} />
          Exceptionnel
          {exceptionalClaims.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{exceptionalClaims.length}</span>
          )}
        </button>
        <button
          onClick={() => setMainTab('maladie')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
            mainTab === 'maladie'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Heart className={cn('h-4 w-4', mainTab === 'maladie' ? 'text-primary' : '')} />
          Maladie
          {sickLeaves.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{sickLeaves.length}</span>
          )}
        </button>
      </div>

      {/* ============ CONGÉ / RÉCUP TAB ============ */}
      {mainTab === 'conge' && (
        <>
          {/* KPI cards */}
          <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 sm:flex">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{congeStats.total}</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Total</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 sm:flex">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{congeStats.pending + congeStats.inProgress}</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">En attente</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 sm:flex">
                <Calendar className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{congeStats.approved}</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Approuvées</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 sm:flex">
                <Users className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{congeStats.rejected}</p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Rejetées</p>
              </div>
            </div>
          </div>

          {/* Search + filters */}
          <div className="shrink-0 flex flex-col gap-3">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher: nom, type, motif..." className="pl-11" />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${statusFilter === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loadingConge ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <div className="flex gap-2"><Skeleton className="h-8 w-20 rounded-xl" /><Skeleton className="h-8 w-20 rounded-xl" /></div>
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="mb-4 h-14 w-14 text-muted-foreground/30" />
              <h3 className="mb-1 text-base font-medium text-foreground">Aucune demande</h3>
              <p className="text-sm text-muted-foreground">{searchTerm || statusFilter !== 'ALL' ? 'Essayez de modifier vos filtres' : 'Aucune demande de congé trouvée'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredRequests.map((request) => (
                <Link key={request.id} href={`/dashboard/requests/${request.id}`} className="block">
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {isManagerView && request.user && (
                          <p className="font-medium text-foreground">{request.user.full_name}</p>
                        )}
                        {isManagerView && request.user?.job_title && (
                          <p className="text-xs text-muted-foreground">{request.user.job_title}</p>
                        )}
                        <p className={cn('text-sm text-muted-foreground', isManagerView && 'mt-1')}>
                          {format(new Date(request.start_date + 'T00:00:00'), 'dd MMM', { locale: fr })} – {format(new Date(request.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                        </p>
                      </div>
                      <Badge className={getStatusClass(request.status)}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`border ${request.request_type === 'CONGE' ? 'border-[#cfdacb] bg-[#ecf3e8] text-[#46604a]' : 'border-[#d9d0e9] bg-[#f2ecfa] text-[#5f4a84]'}`}>
                        {typeLabel(request.request_type)}
                      </Badge>
                      <span className="text-sm font-semibold text-foreground">{request.days_count} jour{request.days_count > 1 ? 's' : ''}</span>
                      {request.is_derogation && (
                        <Badge variant="secondary" className="border border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
                          Dérogation · {request.balance_conge_used != null && request.balance_before != null
                            ? `${Math.max(request.balance_conge_used - request.balance_before, 0)}j`
                            : `${request.days_count}j`}
                        </Badge>
                      )}
                    </div>
                    {request.reason && (
                      <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{request.reason}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground/70">Soumis le {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}</p>
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        Voir détails <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ EXCEPTIONNEL TAB ============ */}
      {mainTab === 'exceptionnel' && (
        <>
          <div className="shrink-0">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input value={exceptionnelSearch} onChange={(e) => setExceptionnelSearch(e.target.value)} placeholder="Rechercher: type, nom, notes..." className="pl-11" />
            </div>
          </div>

          {loadingExceptionnel ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-3">
                  <Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredExceptional.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Gift className="mb-4 h-14 w-14 text-muted-foreground/30" />
              <h3 className="mb-1 text-base font-medium text-foreground">Aucune demande exceptionnelle</h3>
              <p className="text-sm text-muted-foreground">Les demandes de congé exceptionnel apparaitront ici</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredExceptional.map((claim) => (
                <div key={claim.id} onClick={() => setSelectedExceptional(claim)} className="cursor-pointer rounded-2xl border border-border/70 bg-background/80 p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                  <div>
                    {canViewAllExceptional && claim.user && (
                      <p className="font-medium text-foreground">{claim.user.full_name}</p>
                    )}
                    {canViewAllExceptional && claim.user?.job_title && (
                      <p className="text-xs text-muted-foreground">{claim.user.job_title}</p>
                    )}
                    <p className={cn('text-sm text-muted-foreground', canViewAllExceptional && 'mt-1')}>
                      {claim.start_date && claim.end_date
                        ? `${format(new Date(claim.start_date + 'T00:00:00'), 'dd MMM', { locale: fr })} – ${format(new Date(claim.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}`
                        : format(new Date(claim.claim_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="border border-[#d4c5a0] bg-[#faf5e8] text-[#7a6832]">
                      {getExceptionalTypeName(claim)}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">{claim.days_count ?? claim.days_granted} jour{(claim.days_count ?? claim.days_granted) > 1 ? 's' : ''}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground/70">Soumis le {format(new Date(claim.created_at), 'dd/MM/yyyy', { locale: fr })}</p>
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">Voir détails <ChevronRight className="h-3.5 w-3.5" /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ MALADIE TAB ============ */}
      {mainTab === 'maladie' && (
        <>
          <div className="shrink-0">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input value={maladieSearch} onChange={(e) => setMaladieSearch(e.target.value)} placeholder="Rechercher: nom, motif..." className="pl-11" />
            </div>
          </div>

          {loadingMaladie ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-3">
                  <Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredSickLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Heart className="mb-4 h-14 w-14 text-muted-foreground/30" />
              <h3 className="mb-1 text-base font-medium text-foreground">Aucune absence maladie</h3>
              <p className="text-sm text-muted-foreground">Les declarations de maladie apparaitront ici</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredSickLeaves.map((sl) => (
                <div key={sl.id} onClick={() => setSelectedSickLeave(sl)} className="cursor-pointer rounded-2xl border border-border/70 bg-background/80 p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                  <div>
                    {canViewAllMaladie && sl.user && (
                      <p className="font-medium text-foreground">{sl.user.full_name}</p>
                    )}
                    {canViewAllMaladie && sl.user?.job_title && (
                      <p className="text-xs text-muted-foreground">{sl.user.job_title}</p>
                    )}
                    <p className={cn('text-sm text-muted-foreground', canViewAllMaladie && 'mt-1')}>
                      {format(new Date(sl.start_date + 'T00:00:00'), 'dd MMM', { locale: fr })} – {format(new Date(sl.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: fr })}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="border border-rose-200 bg-rose-50 text-rose-700">
                      Maladie
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">{sl.days_count} jour{sl.days_count > 1 ? 's' : ''}</span>
                    {sl.certificate_url && (
                      <Badge variant="secondary" className="border border-blue-200 bg-blue-50 text-blue-700">
                        Certificat
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground/70">Soumis le {format(new Date(sl.created_at), 'dd/MM/yyyy', { locale: fr })}</p>
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">Voir détails <ChevronRight className="h-3.5 w-3.5" /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {/* ============ EXCEPTIONAL DETAIL DIALOG ============ */}
      <Dialog open={!!selectedExceptional} onOpenChange={() => setSelectedExceptional(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Congé exceptionnel
            </DialogTitle>
          </DialogHeader>
          {selectedExceptional && (
            <div className="space-y-4">
              {/* Employee info */}
              {selectedExceptional.user && (
                <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedExceptional.user.full_name}</p>
                    {selectedExceptional.user.job_title && (
                      <p className="text-xs text-muted-foreground">{selectedExceptional.user.job_title}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Type */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</p>
                <Badge variant="secondary" className="border border-[#d4c5a0] bg-[#faf5e8] text-[#7a6832]">
                  {getExceptionalTypeName(selectedExceptional)}
                </Badge>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date debut</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedExceptional.start_date
                      ? format(new Date(selectedExceptional.start_date + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr })
                      : format(new Date(selectedExceptional.claim_date + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date fin</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedExceptional.end_date
                      ? format(new Date(selectedExceptional.end_date + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Days */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duree</p>
                <p className="text-lg font-bold text-foreground">
                  {selectedExceptional.days_count ?? selectedExceptional.days_granted} jour{(selectedExceptional.days_count ?? selectedExceptional.days_granted) > 1 ? 's' : ''}
                </p>
              </div>

              {/* Notes */}
              {selectedExceptional.notes && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                  <div className="rounded-xl bg-secondary/40 p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedExceptional.notes}</p>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Soumis le {format(new Date(selectedExceptional.created_at), 'd MMMM yyyy a HH:mm', { locale: fr })}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ SICK LEAVE DETAIL DIALOG ============ */}
      <Dialog open={!!selectedSickLeave} onOpenChange={() => setSelectedSickLeave(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Congé maladie
            </DialogTitle>
          </DialogHeader>
          {selectedSickLeave && (
            <div className="space-y-4">
              {/* Employee info */}
              {selectedSickLeave.user && (
                <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedSickLeave.user.full_name}</p>
                    {selectedSickLeave.user.job_title && (
                      <p className="text-xs text-muted-foreground">{selectedSickLeave.user.job_title}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date debut</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(selectedSickLeave.start_date + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date fin</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(selectedSickLeave.end_date + 'T00:00:00'), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>

              {/* Days */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duree</p>
                <p className="text-lg font-bold text-foreground">
                  {selectedSickLeave.days_count} jour{selectedSickLeave.days_count > 1 ? 's' : ''}
                </p>
              </div>

              {/* Reason */}
              {selectedSickLeave.reason && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motif</p>
                  <div className="rounded-xl bg-secondary/40 p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedSickLeave.reason}</p>
                  </div>
                </div>
              )}

              {/* Certificate */}
              {selectedSickLeave.certificate_url && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Certificat medical</p>
                  <a
                    href={selectedSickLeave.certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <FileText className="h-5 w-5" />
                    <span className="text-sm font-medium">Voir le certificat</span>
                    <ExternalLink className="h-4 w-4 ml-auto" />
                  </a>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Soumis le {format(new Date(selectedSickLeave.created_at), 'd MMMM yyyy a HH:mm', { locale: fr })}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

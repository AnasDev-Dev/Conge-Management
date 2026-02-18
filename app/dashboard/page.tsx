'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  TrendingUp,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { Utilisateur } from '@/lib/types/database'
import { MANAGER_ROLES, PENDING_STATUSES, getStatusClass, getStatusLabel } from '@/lib/constants'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isToday, isSameDay, isWithinInterval, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardRequest {
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

type Tab = 'all' | 'pending' | 'approved' | 'rejected'

const STATUS_DOT_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-400',
  VALIDATED_DC: 'bg-purple-400',
  VALIDATED_RP: 'bg-purple-500',
  VALIDATED_TG: 'bg-purple-400',
  VALIDATED_DE: 'bg-purple-500',
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-red-400',
  CANCELLED: 'bg-gray-400',
}

const STATUS_BAR_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-400/80 text-amber-950',
  VALIDATED_DC: 'bg-purple-400/80 text-purple-950',
  VALIDATED_RP: 'bg-purple-500/80 text-white',
  VALIDATED_TG: 'bg-purple-400/80 text-purple-950',
  VALIDATED_DE: 'bg-purple-500/80 text-white',
  APPROVED: 'bg-emerald-500/80 text-white',
  REJECTED: 'bg-red-400/80 text-white',
  CANCELLED: 'bg-gray-400/70 text-gray-800',
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function DashboardPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [requests, setRequests] = useState<DashboardRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr)
      setUser(userData)
      loadRequests(userData)
    }
  }, [])

  const managerRoles = MANAGER_ROLES

  const loadRequests = async (userData: Utilisateur) => {
    try {
      const isManager = managerRoles.includes(userData.role)

      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name, job_title)
        `)
        .order('created_at', { ascending: false })

      if (!isManager) {
        query = query.eq('user_id', userData.id)
      }

      const { data, error } = await query

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const days: Date[] = []
    let day = gridStart
    while (day <= gridEnd) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [calendarMonth])

  // Requests overlapping each calendar day
  const requestsByDay = useMemo(() => {
    const map = new Map<string, DashboardRequest[]>()
    for (const day of calendarDays) {
      const key = format(day, 'yyyy-MM-dd')
      const matching = requests.filter(r => {
        if (r.status === 'CANCELLED') return false
        const start = parseISO(r.start_date)
        const end = parseISO(r.end_date)
        return isWithinInterval(day, { start, end })
      })
      if (matching.length > 0) {
        map.set(key, matching)
      }
    }
    return map
  }, [calendarDays, requests])

  if (!user) return null

  const isManagerView = managerRoles.includes(user.role)

  const pendingStatuses = PENDING_STATUSES
  const pendingCount = requests.filter(r => pendingStatuses.includes(r.status)).length
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'all') return true
    if (activeTab === 'pending') return pendingStatuses.includes(r.status)
    if (activeTab === 'approved') return r.status === 'APPROVED'
    if (activeTab === 'rejected') return r.status === 'REJECTED'
    return true
  })

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'Toutes', count: requests.length },
    { key: 'pending', label: 'En attente', count: pendingCount },
    { key: 'approved', label: 'Approuvées', count: approvedCount },
    { key: 'rejected', label: 'Rejetées', count: rejectedCount },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bienvenue, {user.full_name.split(' ')[0]}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Voici un aperçu de votre gestion des congés
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Solde Congé</p>
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{user.balance_conge}<span className="ml-1 text-sm font-normal text-muted-foreground">jours</span></p>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-foreground/75 transition-all" style={{ width: `${Math.min((user.balance_conge / 30) * 100, 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Récupération</p>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{user.balance_recuperation}<span className="ml-1 text-sm font-normal text-muted-foreground">jours</span></p>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-foreground/60 transition-all" style={{ width: `${Math.min((user.balance_recuperation / 10) * 100, 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">En attente</p>
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{pendingCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">En cours de validation</p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approuvées</p>
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{approvedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Cette année</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Calendar ─── */}
      <Card className="border-border/70 overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <h2 className="text-base font-semibold text-foreground">Calendrier des congés</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalendarMonth(new Date())}
              className="rounded-lg border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}
              className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-foreground">
              {format(calendarMonth, 'MMMM yyyy', { locale: fr })}
            </span>
            <button
              onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}
              className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/40 px-5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> En attente
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> En validation
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Approuvé
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Rejeté
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const key = format(day, 'yyyy-MM-dd')
            const inMonth = isSameMonth(day, calendarMonth)
            const today = isToday(day)
            const dayRequests = requestsByDay.get(key) || []
            const isWeekend = day.getDay() === 0 || day.getDay() === 6

            return (
              <div
                key={key}
                className={cn(
                  'relative min-h-[80px] border-b border-r border-border/30 p-1.5 transition-colors',
                  !inMonth && 'bg-muted/20',
                  isWeekend && inMonth && 'bg-muted/10',
                  idx % 7 === 0 && 'border-l-0',
                )}
              >
                {/* Day number */}
                <div className="mb-0.5 flex items-start justify-between">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      !inMonth && 'text-muted-foreground/40',
                      inMonth && !today && 'text-foreground',
                      today && 'bg-foreground text-background',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayRequests.length > 2 && (
                    <span className="text-[10px] font-medium text-muted-foreground">+{dayRequests.length - 2}</span>
                  )}
                </div>

                {/* Request bars (max 2 visible) */}
                <div className="space-y-0.5">
                  {dayRequests.slice(0, 2).map((req) => {
                    const isStart = isSameDay(day, parseISO(req.start_date))
                    const isEnd = isSameDay(day, parseISO(req.end_date))
                    const barColor = STATUS_BAR_COLORS[req.status] || 'bg-gray-300 text-gray-800'
                    const name = req.user?.full_name?.split(' ')[0] || ''

                    return (
                      <Link
                        key={req.id}
                        href={`/dashboard/requests/${req.id}`}
                        className={cn(
                          'block truncate px-1 py-px text-[10px] font-medium leading-tight transition-opacity hover:opacity-80',
                          barColor,
                          isStart && isEnd && 'rounded',
                          isStart && !isEnd && 'rounded-l',
                          !isStart && isEnd && 'rounded-r',
                          !isStart && !isEnd && 'rounded-none',
                        )}
                        title={`${req.user?.full_name || ''} — ${format(parseISO(req.start_date), 'd MMM', { locale: fr })} au ${format(parseISO(req.end_date), 'd MMM', { locale: fr })} (${getStatusLabel(req.status)})`}
                      >
                        {isStart ? name : '\u00A0'}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ─── Requests with Tab Bar ─── */}
      <Card className="border-border/70">
        <div className="border-b border-border/60 px-5 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Demandes</h2>
            <Link href="/dashboard/requests" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              Tout voir
            </Link>
          </div>

          <div className="mt-3 flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative px-3 pb-2.5 text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground/70'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium',
                    activeTab === tab.key
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-border/50">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-2.5 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {activeTab === 'all' ? 'Aucune demande pour le moment' : 'Aucune demande dans cette catégorie'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredRequests.slice(0, 10).map((request) => (
                <Link
                  key={request.id}
                  href={`/dashboard/requests/${request.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      {isManagerView && request.user && (
                        <span className="text-sm font-semibold text-foreground">{request.user.full_name}</span>
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {format(new Date(request.start_date), 'd MMM', { locale: fr })} – {format(new Date(request.end_date), 'd MMM yyyy', { locale: fr })}
                      </span>
                      <Badge className={cn('text-[11px]', getStatusClass(request.status))}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{request.request_type === 'CONGE' ? 'Congé' : 'Récupération'}</span>
                      <span className="text-border">·</span>
                      <span>{request.days_count} jours</span>
                      {isManagerView && request.user?.job_title && (
                        <>
                          <span className="text-border">·</span>
                          <span>{request.user.job_title}</span>
                        </>
                      )}
                      {request.reason && (
                        <>
                          <span className="text-border">·</span>
                          <span className="truncate max-w-[200px]">{request.reason}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </Link>
              ))}

              {filteredRequests.length > 10 && (
                <div className="px-5 py-3 text-center">
                  <Link href="/dashboard/requests" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    Voir les {filteredRequests.length - 10} demandes restantes
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

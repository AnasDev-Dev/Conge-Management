'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { LeaveRequestWithRelations, Utilisateur, Holiday } from '@/lib/types/database'
import { CALENDAR_STATUS_FILTERS } from '@/lib/constants'
import { usePermissions } from '@/lib/hooks/use-permissions'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isToday,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  parseISO,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Users,
  UserRound,
  Palmtree,
  Briefcase,
  RotateCcw,
  ExternalLink,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type CalendarLeave = LeaveRequestWithRelations & {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'role' | 'department_id'>
}

const STATUS_CONFIG: Record<string, { label: string; class: string; dotClass: string }> = {
  PENDING: { label: 'En attente', class: 'status-pending', dotClass: 'bg-[var(--status-pending-text)]' },
  VALIDATED_DC: { label: 'Valid. Chef', class: 'status-progress', dotClass: 'bg-[var(--status-progress-text)]' },
  VALIDATED_RP: { label: 'Valid. RH', class: 'status-progress', dotClass: 'bg-[var(--status-progress-text)]' },
  APPROVED: { label: 'Approuvé', class: 'status-approved', dotClass: 'bg-[var(--status-success-text)]' },
  REJECTED: { label: 'Rejeté', class: 'status-rejected', dotClass: 'bg-[var(--status-alert-text)]' },
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  CONGE: {
    bg: 'bg-[var(--status-success-bg)]',
    border: 'border-[var(--status-success-border)]',
    text: 'text-[var(--status-success-text)]',
    dot: 'bg-[var(--status-success-text)]',
  },
  RECUPERATION: {
    bg: 'bg-[var(--status-progress-bg)]',
    border: 'border-[var(--status-progress-border)]',
    text: 'text-[var(--status-progress-text)]',
    dot: 'bg-[var(--status-progress-text)]',
  },
}

export default function CalendarPage() {
  const [requests, setRequests] = useState<CalendarLeave[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(['PENDING', 'VALIDATED_DC', 'VALIDATED_RP', 'APPROVED', 'REJECTED']))
  const [allFilters, setAllFilters] = useState(true)
  const { user } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(user?.role || 'EMPLOYEE')
  const router = useRouter()

  const supabase = createClient()

  const isManager = can('calendar.viewTeam')

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)
      const startStr = format(start, 'yyyy-MM-dd')
      const endStr = format(end, 'yyyy-MM-dd')

      // Fix: use overlapping range query to catch leaves spanning months
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey!inner(id, full_name, role, department_id, company_id)
        `)
        .lte('start_date', endStr)
        .gte('end_date', startStr)

      if (activeCompany) {
        query = query.eq('user.company_id', activeCompany.id)
      }

      // Role-based filtering: employees see only their own
      if (!isManager) {
        query = query.eq('user_id', user.id)
      }

      // Fetch leaves and holidays in parallel
      const [leavesResult, holidaysResult] = await Promise.all([
        query,
        supabase
          .from('holidays')
          .select('*')
          .or(`date.gte.${startStr},is_recurring.eq.true`),
      ])

      if (leavesResult.error) throw leavesResult.error
      setRequests(leavesResult.data || [])
      setHolidays(holidaysResult.data || [])
    } catch (error) {
      console.error('Error loading calendar data:', error)
    } finally {
      setLoading(false)
    }
  }, [currentMonth, user, isManager, activeCompany])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  // Build the calendar grid with proper weekday alignment
  const calendarGrid = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // getDay returns 0=Sunday, we need Monday=0 for French calendar
    const startDayOfWeek = (getDay(monthStart) + 6) % 7
    const paddingBefore = Array.from({ length: startDayOfWeek }, (_, i) => null)
    const totalCells = paddingBefore.length + days.length
    const paddingAfter = Array.from({ length: (7 - (totalCells % 7)) % 7 }, () => null)

    return [...paddingBefore, ...days, ...paddingAfter]
  }, [currentMonth])

  // Filter requests by status filters
  const filteredRequests = useMemo(() => {
    return requests.filter(req => statusFilters.has(req.status))
  }, [requests, statusFilters])

  const toggleStatusFilter = (status: string) => {
    const next = new Set(statusFilters)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setStatusFilters(next)
    setAllFilters(next.size === CALENDAR_STATUS_FILTERS.length)
  }

  const toggleAllFilters = () => {
    if (allFilters) {
      setStatusFilters(new Set())
      setAllFilters(false)
    } else {
      setStatusFilters(new Set(CALENDAR_STATUS_FILTERS.map(f => f.key)))
      setAllFilters(true)
    }
  }

  // Get leaves for a specific day
  const getDayRequests = useCallback(
    (day: Date): CalendarLeave[] => {
      return filteredRequests.filter((req) => {
        const start = parseISO(req.start_date)
        const end = parseISO(req.end_date)
        return day >= start && day <= end
      })
    },
    [filteredRequests]
  )

  // Check if a day is a holiday
  const getDayHoliday = useCallback(
    (day: Date): Holiday | undefined => {
      const dayStr = format(day, 'MM-dd')
      return holidays.find((h) => {
        if (h.is_recurring) {
          return format(parseISO(h.date), 'MM-dd') === dayStr
        }
        return isSameDay(parseISO(h.date), day)
      })
    },
    [holidays]
  )

  // Navigation
  const goToPreviousMonth = () => setCurrentMonth((prev) => subMonths(prev, 1))
  const goToNextMonth = () => setCurrentMonth((prev) => addMonths(prev, 1))
  const goToToday = () => setCurrentMonth(new Date())

  // Selected day data
  const selectedDayRequests = selectedDay ? getDayRequests(selectedDay) : []
  const selectedDayHoliday = selectedDay ? getDayHoliday(selectedDay) : undefined

  if (!user) return null

  const FILTER_PILL_STYLES: Record<string, { active: string; dot: string }> = {
    PENDING: { active: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
    VALIDATED_DC: { active: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700', dot: 'bg-purple-500' },
    VALIDATED_RP: { active: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700', dot: 'bg-purple-500' },
    APPROVED: { active: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
    REJECTED: { active: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700', dot: 'bg-red-500' },
  }

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-5rem)]">
      {/* Page title */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isManager ? "Calendrier d\u2019\u00e9quipe" : 'Mon calendrier'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? 'Vue globale des absences de tous les collaborateurs'
            : 'Visualisez vos cong\u00e9s et r\u00e9cup\u00e9rations'}
        </p>
      </div>

      {/* Calendar Card — fills remaining height */}
      <Card className="border-border/70 flex-1 flex flex-col overflow-hidden">
        {/* Calendar header: month nav + stats */}
        <CardHeader className="pb-2">
          {/* Row 1: Month navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={goToPreviousMonth}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Mois pr\u00e9c\u00e9dent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <CardTitle className="min-w-[10rem] text-center text-xl capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </CardTitle>
              <button
                onClick={goToNextMonth}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={goToToday}
                className="ml-1 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Aujourd&apos;hui
              </button>
            </div>
            <div className="flex items-center gap-3" />
          </div>

          {/* Row 2: Filter pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
            <button
              onClick={toggleAllFilters}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                allFilters
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border/70 hover:bg-accent'
              }`}
            >
              Tous
            </button>
            {CALENDAR_STATUS_FILTERS.map((filter) => {
              const isActive = statusFilters.has(filter.key)
              const pill = FILTER_PILL_STYLES[filter.key]
              return (
                <button
                  key={filter.key}
                  onClick={() => toggleStatusFilter(filter.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? pill?.active || 'bg-accent text-foreground border-border'
                      : 'bg-background text-muted-foreground/60 border-border/50 hover:bg-accent/50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isActive ? (pill?.dot || 'bg-gray-400') : 'bg-gray-300'}`} />
                  {filter.label}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden pb-2">
          {loading ? (
            <div className="space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-8 w-32" />
              </div>
              <div className="grid grid-cols-7 gap-1">
                {[...Array(35)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr">
              {/* Weekday headers */}
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, i) => (
                <div
                  key={day}
                  className={`py-2.5 text-center text-xs font-semibold uppercase tracking-wider ${
                    i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground'
                  }`}
                >
                  {day}
                </div>
              ))}

              {/* Calendar cells */}
              {calendarGrid.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="min-h-[3.5rem]" />
                }

                const dayRequests = getDayRequests(day)
                const isWeekendDay = isWeekend(day)
                const isTodayDay = isToday(day)
                const holiday = getDayHoliday(day)
                const hasLeaves = dayRequests.length > 0

                // Determine day background based on content
                const approvedLeaves = dayRequests.filter((r) => r.status === 'APPROVED')
                const pendingLeaves = dayRequests.filter(
                  (r) => r.status === 'PENDING' || r.status.startsWith('VALIDATED_')
                )
                const hasConge = approvedLeaves.some((r) => r.request_type === 'CONGE')
                const hasRecup = approvedLeaves.some((r) => r.request_type === 'RECUPERATION')

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => hasLeaves || holiday ? setSelectedDay(day) : undefined}
                    className={`group relative min-h-[3.5rem] rounded-2xl border p-2 text-left transition-all ${
                      hasLeaves || holiday ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isTodayDay
                        ? 'border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20'
                        : isWeekendDay
                        ? 'border-border/40 bg-secondary/40'
                        : holiday
                        ? 'border-[var(--status-alert-border)]/40 bg-[var(--status-alert-bg)]/40'
                        : hasLeaves
                        ? 'border-border/60 bg-background hover:border-border hover:shadow-sm'
                        : 'border-border/40 bg-background/60'
                    }`}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium ${
                          isTodayDay
                            ? 'bg-primary text-primary-foreground'
                            : isWeekendDay
                            ? 'text-muted-foreground/60'
                            : 'text-foreground'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      {/* Leave type dots */}
                      {hasLeaves && (
                        <div className="flex gap-1">
                          {hasConge && <span className={`h-2 w-2 rounded-full ${TYPE_COLORS.CONGE.dot}`} />}
                          {hasRecup && <span className={`h-2 w-2 rounded-full ${TYPE_COLORS.RECUPERATION.dot}`} />}
                          {pendingLeaves.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-[var(--status-pending-text)]" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Holiday indicator */}
                    {holiday && (
                      <div className="mt-1">
                        <div className="flex items-center gap-1 rounded-lg bg-[var(--status-alert-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--status-alert-text)]">
                          <Palmtree className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{holiday.name}</span>
                        </div>
                      </div>
                    )}

                    {/* Leave entries */}
                    {hasLeaves && (
                      <div className="mt-1 space-y-0.5">
                        {dayRequests.slice(0, 2).map((req) => {
                          const typeColor = TYPE_COLORS[req.request_type] || TYPE_COLORS.CONGE
                          const isApproved = req.status === 'APPROVED'
                          return (
                            <div
                              key={req.id}
                              className={`flex items-center gap-1 truncate rounded-lg border px-1.5 py-0.5 text-[10px] font-medium leading-tight ${
                                isApproved
                                  ? `${typeColor.bg} ${typeColor.border} ${typeColor.text}`
                                  : 'bg-[var(--status-pending-bg)] border-[var(--status-pending-border)] text-[var(--status-pending-text)]'
                              }`}
                              title={`${req.user?.full_name} - ${req.request_type}`}
                            >
                              {req.request_type === 'CONGE' ? (
                                <Briefcase className="h-2.5 w-2.5 shrink-0" />
                              ) : (
                                <RotateCcw className="h-2.5 w-2.5 shrink-0" />
                              )}
                              <span className="truncate">
                                {isManager
                                  ? req.user?.full_name?.split(' ')[0] || '?'
                                  : req.request_type === 'CONGE'
                                  ? 'Cong\u00e9'
                                  : 'R\u00e9cup.'}
                              </span>
                            </div>
                          )
                        })}
                        {dayRequests.length > 2 && (
                          <div className="pl-1 text-[10px] font-medium text-muted-foreground">
                            +{dayRequests.length - 2} autre{dayRequests.length - 2 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {/* Legend (inside calendar card) */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS.CONGE.dot}`} />
              <span>Cong\u00e9</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS.RECUPERATION.dot}`} />
              <span>R\u00e9cup\u00e9ration</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-pending-text)]" />
              <span>En attente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded border border-primary/40 bg-primary/10" />
              <span>Aujourd&apos;hui</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-secondary/60" />
              <span>Week-end</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Palmtree className="h-2.5 w-2.5 text-[var(--status-alert-text)]" />
              <span>Jour f\u00e9ri\u00e9</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDay && format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr })}
            </DialogTitle>
            <DialogDescription>
              {selectedDayRequests.length > 0
                ? `${selectedDayRequests.length} absence${selectedDayRequests.length > 1 ? 's' : ''} ce jour`
                : selectedDayHoliday
                ? 'Jour f\u00e9ri\u00e9'
                : 'Aucune absence'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {/* Holiday info */}
            {selectedDayHoliday && (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] p-3">
                <Palmtree className="h-5 w-5 shrink-0 text-[var(--status-alert-text)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--status-alert-text)]">{selectedDayHoliday.name}</p>
                  <p className="text-xs text-[var(--status-alert-text)]/70">
                    {selectedDayHoliday.is_recurring ? 'Jour férié récurrent' : 'Jour férié'}
                  </p>
                </div>
              </div>
            )}

            {/* Leave requests */}
            {selectedDayRequests.map((req) => {
              const statusConfig = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING
              const typeColor = TYPE_COLORS[req.request_type] || TYPE_COLORS.CONGE

              return (
                <div key={req.id} className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${typeColor.bg}`}
                      >
                        {req.request_type === 'CONGE' ? (
                          <Briefcase className={`h-4 w-4 ${typeColor.text}`} />
                        ) : (
                          <RotateCcw className={`h-4 w-4 ${typeColor.text}`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{req.user?.full_name || 'Inconnu'}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.request_type === 'CONGE' ? 'Congé annuel' : 'Récupération'}
                        </p>
                      </div>
                    </div>
                    <Badge className={`${statusConfig.class} text-[10px]`}>{statusConfig.label}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-muted-foreground">Du</span>
                      <p className="font-medium">{format(parseISO(req.start_date), 'dd MMM yyyy', { locale: fr })}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <span className="text-muted-foreground">Au</span>
                      <p className="font-medium">{format(parseISO(req.end_date), 'dd MMM yyyy', { locale: fr })}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{req.days_count} jour{req.days_count > 1 ? 's' : ''}</span>
                    {req.reason && <span className="truncate ml-2 max-w-[60%]">{req.reason}</span>}
                  </div>
                </div>
              )
            })}

            {selectedDayRequests.length === 0 && !selectedDayHoliday && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Aucune absence enregistrée pour cette journée
              </div>
            )}
          </div>

          {/* See details link */}
          {selectedDayRequests.length > 0 && (
            <button
              onClick={() => {
                setSelectedDay(null)
                router.push('/dashboard/requests')
              }}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              Voir détails
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

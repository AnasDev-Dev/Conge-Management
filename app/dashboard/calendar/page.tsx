'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { MANAGER_ROLES } from '@/lib/constants'
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
  Clock,
  CheckCircle2,
  XCircle,
  Palmtree,
  Briefcase,
  RotateCcw,
} from 'lucide-react'

type CalendarLeave = LeaveRequestWithRelations & {
  user?: Pick<Utilisateur, 'id' | 'full_name' | 'role' | 'department_id'>
}

const STATUS_CONFIG: Record<string, { label: string; class: string; dotClass: string }> = {
  PENDING: { label: 'En attente', class: 'status-pending', dotClass: 'bg-[var(--status-pending-text)]' },
  VALIDATED_DC: { label: 'Valid. Chef', class: 'status-progress', dotClass: 'bg-[var(--status-progress-text)]' },
  VALIDATED_RP: { label: 'Valid. RH', class: 'status-progress', dotClass: 'bg-[var(--status-progress-text)]' },
  VALIDATED_DE: { label: 'Valid. Dir.', class: 'status-progress', dotClass: 'bg-[var(--status-progress-text)]' },
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
  const [user, setUser] = useState<Utilisateur | null>(null)

  const supabase = createClient()

  const isManager = user ? MANAGER_ROLES.includes(user.role) : false

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr) as Utilisateur)
    }
  }, [])

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
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name, role, department_id)
        `)
        .lte('start_date', endStr)
        .gte('end_date', startStr)

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
  }, [currentMonth, user, isManager])

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

  // Get leaves for a specific day
  const getDayRequests = useCallback(
    (day: Date): CalendarLeave[] => {
      return requests.filter((req) => {
        const start = parseISO(req.start_date)
        const end = parseISO(req.end_date)
        return day >= start && day <= end
      })
    },
    [requests]
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

  // Monthly statistics
  const monthStats = useMemo(() => {
    const approved = requests.filter((r) => r.status === 'APPROVED')
    const inProgress = requests.filter((r) =>
      ['PENDING', 'VALIDATED_DC', 'VALIDATED_RP', 'VALIDATED_DE'].includes(r.status)
    )
    const uniqueEmployees = new Set(requests.map((r) => r.user_id))
    const totalDays = approved.reduce((sum, r) => sum + r.days_count, 0)

    return {
      approved: approved.length,
      inProgress: inProgress.length,
      uniqueEmployees: uniqueEmployees.size,
      totalDays,
    }
  }, [requests])

  // Navigation
  const goToPreviousMonth = () => setCurrentMonth((prev) => subMonths(prev, 1))
  const goToNextMonth = () => setCurrentMonth((prev) => addMonths(prev, 1))
  const goToToday = () => setCurrentMonth(new Date())

  // Selected day data
  const selectedDayRequests = selectedDay ? getDayRequests(selectedDay) : []
  const selectedDayHoliday = selectedDay ? getDayHoliday(selectedDay) : undefined

  if (!user) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {isManager ? "Calendrier d\u2019\u00e9quipe" : 'Mon calendrier'}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {isManager
              ? 'Vue globale des absences de tous les collaborateurs'
              : 'Visualisez vos cong\u00e9s et r\u00e9cup\u00e9rations'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToPreviousMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Mois pr\u00e9c\u00e9dent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-xl border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={goToNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-success-bg)]">
              <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{monthStats.approved}</p>
              <p className="mt-1 text-xs text-muted-foreground">Approuv\u00e9s</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-pending-bg)]">
              <Clock className="h-5 w-5 text-[var(--status-pending-text)]" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{monthStats.inProgress}</p>
              <p className="mt-1 text-xs text-muted-foreground">En cours</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-progress-bg)]">
              <CalendarDays className="h-5 w-5 text-[var(--status-progress-text)]" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{monthStats.totalDays}</p>
              <p className="mt-1 text-xs text-muted-foreground">Jours pris</p>
            </div>
          </CardContent>
        </Card>
        {isManager && (
          <Card className="border-border/70">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{monthStats.uniqueEmployees}</p>
                <p className="mt-1 text-xs text-muted-foreground">Employ\u00e9s concern\u00e9s</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Calendar */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isManager ? (
                <Badge variant="secondary" className="border border-border gap-1.5">
                  <Users className="h-3 w-3" />
                  Vue \u00e9quipe
                </Badge>
              ) : (
                <Badge variant="secondary" className="border border-border gap-1.5">
                  <UserRound className="h-3 w-3" />
                  Vue personnelle
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
            <div className="grid grid-cols-7 gap-1.5">
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
                  return <div key={`empty-${index}`} className="min-h-[5.5rem]" />
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
                    className={`group relative min-h-[5.5rem] rounded-2xl border p-2 text-left transition-all ${
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
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider">L\u00e9gende</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${TYPE_COLORS.CONGE.dot}`} />
              <span className="text-muted-foreground">Cong\u00e9</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${TYPE_COLORS.RECUPERATION.dot}`} />
              <span className="text-muted-foreground">R\u00e9cup\u00e9ration</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[var(--status-pending-text)]" />
              <span className="text-muted-foreground">En attente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-primary/40 bg-primary/10" />
              <span className="text-muted-foreground">Aujourd&apos;hui</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-secondary/60" />
              <span className="text-muted-foreground">Week-end</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Palmtree className="h-3 w-3 text-[var(--status-alert-text)]" />
              <span className="text-muted-foreground">Jour f\u00e9ri\u00e9</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
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

          <div className="space-y-3">
            {/* Holiday info */}
            {selectedDayHoliday && (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] p-3">
                <Palmtree className="h-5 w-5 shrink-0 text-[var(--status-alert-text)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--status-alert-text)]">{selectedDayHoliday.name}</p>
                  <p className="text-xs text-[var(--status-alert-text)]/70">
                    {selectedDayHoliday.is_recurring ? 'Jour f\u00e9ri\u00e9 r\u00e9current' : 'Jour f\u00e9ri\u00e9'}
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
                          {req.request_type === 'CONGE' ? 'Cong\u00e9 annuel' : 'R\u00e9cup\u00e9ration'}
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
                Aucune absence enregistr\u00e9e pour cette journ\u00e9e
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

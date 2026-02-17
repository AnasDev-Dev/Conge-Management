'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeaveRequestWithRelations } from '@/lib/types/database'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isWeekend } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function CalendarPage() {
  const [requests, setRequests] = useState<LeaveRequestWithRelations[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadRequests()
  }, [currentMonth])

  const loadRequests = async () => {
    try {
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)

      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:utilisateurs!leave_requests_user_id_fkey(id, full_name)
        `)
        .gte('start_date', format(start, 'yyyy-MM-dd'))
        .lte('end_date', format(end, 'yyyy-MM-dd'))
        .in('status', ['APPROVED', 'VALIDATED_DC', 'VALIDATED_RP', 'VALIDATED_TG', 'VALIDATED_DE'])

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  })

  const getDayRequests = (day: Date) => {
    return requests.filter(req => {
      const start = new Date(req.start_date)
      const end = new Date(req.end_date)
      return day >= start && day <= end
    })
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Calendrier d&apos;équipe</h1>
        <p className="mt-2 text-muted-foreground">Visualisez les absences de votre équipe</p>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </CardTitle>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
                className="rounded-full border border-border/70 bg-background/80 px-4 py-1.5 text-sm hover:bg-accent"
              >
                ← Précédent
              </button>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="rounded-full border border-border/70 bg-background/80 px-4 py-1.5 text-sm hover:bg-accent"
              >
                Aujourd&apos;hui
              </button>
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
                className="rounded-full border border-border/70 bg-background/80 px-4 py-1.5 text-sm hover:bg-accent"
              >
                Suivant →
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="mt-4 text-muted-foreground">Chargement...</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
                <div key={day} className="py-2 text-center text-sm font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {days.map((day) => {
                const dayRequests = getDayRequests(day)
                const isWeekendDay = isWeekend(day)
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-24 rounded-2xl border p-2 ${
                      !isSameMonth(day, currentMonth)
                        ? 'bg-secondary/30 text-muted-foreground/55'
                        : isWeekendDay
                        ? 'bg-secondary/55'
                        : 'bg-background/80 hover:bg-accent'
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">
                      {format(day, 'd')}
                    </div>
                    {dayRequests.length > 0 && (
                      <div className="space-y-1">
                        {dayRequests.slice(0, 2).map((req) => (
                          <div
                            key={req.id}
                            className="status-progress truncate rounded-xl border p-1 text-xs"
                            title={req.user?.full_name}
                          >
                            {req.user?.full_name.split(' ')[0]}
                          </div>
                        ))}
                        {dayRequests.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayRequests.length - 2}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Légende</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="status-progress h-4 w-4 rounded"></div>
              <span>Congé approuvé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-secondary/75"></div>
              <span>Week-end</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

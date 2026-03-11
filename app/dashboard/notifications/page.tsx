'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  CheckCircle2,
  XCircle,
  Info,
  AlertCircle,
  FileText,
  Briefcase,
  RotateCcw,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react'
import { Notification } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function getNotificationIcon(type: string | null) {
  switch (type) {
    // Leave — approved stages
    case 'LEAVE_VALIDATED_RP':
    case 'LEAVE_VALIDATED_DC':
      return <CheckCircle2 className="h-5 w-5 text-blue-500" />
    case 'LEAVE_APPROVED':
      return <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
    case 'LEAVE_REJECTED':
      return <XCircle className="h-5 w-5 text-[var(--status-alert-text)]" />
    case 'LEAVE_UNDO':
    case 'LEAVE_RESTORED':
      return <RotateCcw className="h-5 w-5 text-[var(--status-pending-text)]" />
    case 'LEAVE_CREATED':
    case 'NEW_LEAVE_TO_VALIDATE':
    case 'LEAVE_TO_VALIDATE':
      return <FileText className="h-5 w-5 text-primary" />

    // Mission
    case 'MISSION_VALIDATED_DC':
    case 'MISSION_VALIDATED_RP':
      return <CheckCircle2 className="h-5 w-5 text-blue-500" />
    case 'MISSION_APPROVED':
      return <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
    case 'MISSION_REJECTED':
      return <XCircle className="h-5 w-5 text-[var(--status-alert-text)]" />
    case 'MISSION_UNDO':
    case 'MISSION_RESTORED':
      return <RotateCcw className="h-5 w-5 text-[var(--status-pending-text)]" />
    case 'NEW_MISSION_TO_VALIDATE':
    case 'MISSION_TO_VALIDATE':
      return <Briefcase className="h-5 w-5 text-primary" />

    // Recovery
    case 'RECOVERY_VALIDATED':
      return <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
    case 'RECOVERY_REJECTED':
      return <XCircle className="h-5 w-5 text-[var(--status-alert-text)]" />
    case 'NEW_RECOVERY_TO_VALIDATE':
      return <ClipboardCheck className="h-5 w-5 text-primary" />

    // Legacy types
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" />
    case 'error':
      return <XCircle className="h-5 w-5 text-[var(--status-alert-text)]" />
    case 'warning':
      return <AlertCircle className="h-5 w-5 text-[var(--status-pending-text)]" />

    default:
      return <Info className="h-5 w-5 text-primary" />
  }
}

function getNotificationLink(notification: Notification): string | null {
  const t = notification.type

  // Validator notifications → go to validation boards
  if (t === 'NEW_LEAVE_TO_VALIDATE' || t === 'LEAVE_TO_VALIDATE') {
    return '/dashboard/validations'
  }
  if (t === 'NEW_MISSION_TO_VALIDATE' || t === 'MISSION_TO_VALIDATE') {
    return '/dashboard/mission-validations'
  }
  if (t === 'NEW_RECOVERY_TO_VALIDATE') {
    return '/dashboard/recovery-requests'
  }

  // Leave notifications → request detail
  if (notification.related_request_id) {
    return `/dashboard/requests/${notification.related_request_id}`
  }

  // Mission notifications → mission detail
  if (notification.related_mission_id) {
    return `/dashboard/missions/${notification.related_mission_id}`
  }

  // Recovery → recovery page
  if (notification.related_recovery_id) {
    return '/dashboard/recovery-requests'
  }

  return null
}

export default function NotificationsPage() {
  const { user } = useCurrentUser()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  const loadNotifications = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabaseRef.current
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    loadNotifications(user.id)

    // Realtime subscription for live updates
    const channel = supabaseRef.current
      .channel('notifications-page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabaseRef.current.removeChannel(channel)
    }
  }, [user, loadNotifications])

  const markAsRead = async (id: number) => {
    try {
      const { error } = await supabaseRef.current
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)

      if (error) throw error

      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      if (!user) return

      const { error } = await supabaseRef.current
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) throw error

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id)
    }

    const link = getNotificationLink(notification)
    if (link) {
      router.push(link)
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notifications</h1>
          <p className="mt-2 text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
              : 'Aucune nouvelle notification'
            }
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm font-medium text-primary transition-colors hover:text-primary/85"
          >
            Tout marquer comme lu
          </button>
        )}
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Toutes les notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl px-5 py-4 flex items-start gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
              <h3 className="mb-2 text-lg font-medium text-foreground">Aucune notification</h3>
              <p className="text-muted-foreground">Vous n&apos;avez recu aucune notification pour le moment</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const link = getNotificationLink(notification)
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      notification.is_read
                        ? 'bg-background/85 border-border/70'
                        : 'status-progress border hover:brightness-[0.98]'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h4 className={`font-medium ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {notification.title}
                            </h4>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {notification.message}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!notification.is_read && (
                              <div className="h-2 w-2 rounded-full bg-primary" />
                            )}
                            {link && (
                              <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {format(new Date(notification.created_at), "'Le' dd MMMM yyyy 'a' HH:mm", { locale: fr })}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

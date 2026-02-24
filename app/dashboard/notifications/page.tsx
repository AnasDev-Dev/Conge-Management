'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Bell, CheckCircle2, XCircle, Info, AlertCircle } from 'lucide-react'
import { Notification } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const userId = localStorage.getItem('userId')
    if (userId) {
      loadNotifications(userId)
    }
  }, [])

  const loadNotifications = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: number) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)

      if (error) throw error
      
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, is_read: true } : n
      ))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const userId = localStorage.getItem('userId')
      if (!userId) return

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (error) throw error
      
      setNotifications(notifications.map(n => ({ ...n, is_read: true })))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const getIcon = (type: string | null) => {
    switch (type) {
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
              <p className="text-muted-foreground">Vous n&apos;avez reçu aucune notification pour le moment</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    notification.is_read
                      ? 'bg-background/85 border-border/70'
                      : 'status-progress border hover:brightness-[0.98]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5">
                      {getIcon(notification.type)}
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
                        {!notification.is_read && (
                          <div className="mt-2 h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {format(new Date(notification.created_at), "'Le' dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

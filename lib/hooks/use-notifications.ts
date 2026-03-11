'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useNotifications(userId: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0)
  const supabaseRef = useRef(createClient())

  const fetchCount = useCallback(async () => {
    if (!userId) return
    const { count } = await supabaseRef.current
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    setUnreadCount(count || 0)
  }, [userId])

  useEffect(() => {
    if (!userId) return

    fetchCount()

    const channel = supabaseRef.current
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchCount()
        }
      )
      .subscribe()

    return () => {
      supabaseRef.current.removeChannel(channel)
    }
  }, [userId, fetchCount])

  return { unreadCount, refresh: fetchCount }
}

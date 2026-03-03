'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Utilisateur } from '@/lib/types/database'

/**
 * Hook that returns the current user with fresh data from the database.
 * Reads localStorage for an instant initial render, then immediately
 * fetches the latest user record from Supabase and updates both
 * the in-memory state and localStorage.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      setLoading(false)
      return
    }

    const cached = JSON.parse(userStr) as Utilisateur
    setUser(cached)

    supabase
      .from('utilisateurs')
      .select('*')
      .eq('id', cached.id)
      .single()
      .then(({ data, error }) => {
        if (data && !error) {
          setUser(data as Utilisateur)
          localStorage.setItem('user', JSON.stringify(data))
        }
        setLoading(false)
      })
  }, [supabase])

  return { user, loading }
}

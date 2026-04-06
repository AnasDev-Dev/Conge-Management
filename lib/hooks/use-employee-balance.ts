'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EmployeeBalance } from '@/lib/types/database'

const supabase = createClient()

/**
 * Fetch balance for a single employee via the unified RPC.
 * Returns seniority, accrual, recovery — everything any page needs.
 */
export function useEmployeeBalance(userId: string | null | undefined) {
  const [balance, setBalance] = useState<EmployeeBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshRef = useRef(0)

  useEffect(() => {
    if (!userId) { setBalance(null); setLoading(false); return }
    let cancelled = false
    const token = ++refreshRef.current
    setLoading(true)
    supabase.rpc('get_employee_balance', { p_user_id: userId })
      .then(({ data, error }) => {
        if (cancelled || refreshRef.current !== token) return
        if (error) {
          console.error('get_employee_balance error:', error)
          setBalance(null)
        } else {
          setBalance(data as unknown as EmployeeBalance)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const refresh = useCallback(() => {
    if (!userId) return
    setLoading(true)
    supabase.rpc('get_employee_balance', { p_user_id: userId })
      .then(({ data, error }) => {
        if (error) {
          console.error('get_employee_balance error:', error)
          setBalance(null)
        } else {
          setBalance(data as unknown as EmployeeBalance)
        }
        setLoading(false)
      })
  }, [userId])

  return { balance, loading, refresh }
}

/**
 * Fetch balances for all active employees in a company via bulk RPC.
 * Returns a Map keyed by user_id for O(1) lookup.
 */
export function useAllEmployeeBalances(companyId: number | null | undefined) {
  const [balances, setBalances] = useState<Map<string, EmployeeBalance>>(new Map())
  const [loading, setLoading] = useState(true)
  const refreshRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const token = ++refreshRef.current
    setLoading(true)
    supabase.rpc('get_all_employee_balances', { p_company_id: companyId ?? null })
      .then(({ data, error }) => {
        if (cancelled || refreshRef.current !== token) return
        if (error) {
          console.error('get_all_employee_balances error:', error)
          setBalances(new Map())
        } else {
          const arr = (data || []) as unknown as EmployeeBalance[]
          setBalances(new Map(arr.map(b => [b.user_id, b])))
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [companyId])

  const refresh = useCallback(() => {
    setLoading(true)
    supabase.rpc('get_all_employee_balances', { p_company_id: companyId ?? null })
      .then(({ data, error }) => {
        if (error) {
          console.error('get_all_employee_balances error:', error)
          setBalances(new Map())
        } else {
          const arr = (data || []) as unknown as EmployeeBalance[]
          setBalances(new Map(arr.map(b => [b.user_id, b])))
        }
        setLoading(false)
      })
  }, [companyId])

  return { balances, loading, refresh }
}

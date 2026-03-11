'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { UserRole } from '@/lib/types/database'

const MANAGER_ROLES: UserRole[] = ['RH', 'CHEF_SERVICE', 'DIRECTEUR_EXECUTIF', 'ADMIN']

interface ReminderConfig {
  userId: string
  role: UserRole
  departmentId?: number | null
  companyId?: number | null
}

export function useLoginReminders(config: ReminderConfig) {
  const hasRun = useRef(false)
  // Always keep latest config in a ref so the timer reads fresh values
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    if (hasRun.current || !config.userId) return

    // Only run once per browser session
    const key = `reminders-shown-${config.userId}`
    if (sessionStorage.getItem(key)) return

    hasRun.current = true
    sessionStorage.setItem(key, '1')

    // Wait for the login success toast to clear before showing reminders
    const timer = setTimeout(() => {
      // Read latest config (company context will be loaded by now)
      runReminders(configRef.current)
    }, 3500)

    return () => clearTimeout(timer)
  // Only depend on userId — stable after login, won't cause re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.userId])
}

async function runReminders({ userId, role }: ReminderConfig) {
  const supabase = createClient()
  const isManager = MANAGER_ROLES.includes(role)

  // 1. Unread notifications — all roles
  const checkNotifications = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (count && count > 0) {
      toast.info(`${count} notification${count > 1 ? 's' : ''} non lue${count > 1 ? 's' : ''}`, {
        description: 'Consultez vos notifications pour rester informe.',
        action: {
          label: 'Voir',
          onClick: () => { window.location.href = '/dashboard/notifications' },
        },
        duration: 15000,
      })
    }
  }

  // 2. Leave requests awaiting validation
  const checkLeaveValidations = async () => {
    let status: string | null = null
    let label = ''
    let actionLabel = 'Valider'

    if (role === 'RH' || role === 'ADMIN') {
      status = 'PENDING'
      label = 'Des demandes de conge attendent votre validation RH.'
    } else if (role === 'CHEF_SERVICE') {
      status = 'VALIDATED_RP'
      label = 'Des demandes attendent votre validation Chef de Service.'
    } else if (role === 'DIRECTEUR_EXECUTIF') {
      status = 'VALIDATED_DC'
      label = 'Des demandes attendent votre approbation finale.'
      actionLabel = 'Approuver'
    }

    if (!status) return

    const { count } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)

    if (count && count > 0) {
      toast.warning(`${count} demande${count > 1 ? 's' : ''} de conge en attente`, {
        description: label,
        action: {
          label: actionLabel,
          onClick: () => { window.location.href = '/dashboard/validations' },
        },
        duration: 15000,
      })
    }
  }

  // 3. Mission requests awaiting validation
  const checkMissionValidations = async () => {
    let status: string | null = null
    let label = ''

    if (role === 'CHEF_SERVICE' || role === 'ADMIN') {
      status = 'PENDING'
      label = 'Des ordres de mission attendent votre validation.'
    } else if (role === 'RH') {
      status = 'VALIDATED_DC'
      label = 'Des ordres de mission attendent votre validation RH.'
    } else if (role === 'DIRECTEUR_EXECUTIF') {
      status = 'VALIDATED_RP'
      label = 'Des ordres de mission attendent votre approbation finale.'
    }

    if (!status) return

    const { count } = await supabase
      .from('mission_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)

    if (count && count > 0) {
      toast.info(`${count} ordre${count > 1 ? 's' : ''} de mission en attente`, {
        description: label,
        action: {
          label: 'Voir',
          onClick: () => { window.location.href = '/dashboard/mission-validations' },
        },
        duration: 15000,
      })
    }
  }

  // 4. Pending recovery requests — managers only
  const checkRecoveryRequests = async () => {
    if (!isManager) return

    const { count } = await supabase
      .from('recovery_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING')

    if (count && count > 0) {
      toast.info(`${count} demande${count > 1 ? 's' : ''} de recuperation en attente`, {
        description: 'Des demandes de recuperation attendent votre validation.',
        action: {
          label: 'Voir',
          onClick: () => { window.location.href = '/dashboard/recovery-requests' },
        },
        duration: 15000,
      })
    }
  }

  await Promise.allSettled([
    checkNotifications(),
    checkLeaveValidations(),
    checkMissionValidations(),
    checkRecoveryRequests(),
  ])
}

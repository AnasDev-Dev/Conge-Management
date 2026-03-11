import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test: SQL trigger logic (pure function simulation) ──────────────

/**
 * These tests verify the notification generation logic that mirrors
 * the SQL trigger functions in 15_notifications_system.sql.
 * We test the decision logic: given old/new status, what notification
 * type, title, and recipients should be generated.
 */

// Simulate the leave status change notification logic from the SQL trigger
function getLeaveNotification(
  oldStatus: string,
  newStatus: string,
  requestType: 'CONGE' | 'RECUPERATION'
): { type: string; title: string; notifyRequester: boolean; notifyNextValidators: string | null } | null {
  const typeLabel = requestType === 'CONGE' ? 'conge' : 'recuperation'

  // Forward approval flow
  if (newStatus === 'VALIDATED_RP' && oldStatus === 'PENDING') {
    return {
      type: 'LEAVE_VALIDATED_RP',
      title: 'Demande validee par RH',
      notifyRequester: true,
      notifyNextValidators: 'CHEF_SERVICE',
    }
  }
  if (newStatus === 'VALIDATED_DC' && oldStatus === 'VALIDATED_RP') {
    return {
      type: 'LEAVE_VALIDATED_DC',
      title: 'Demande validee par Chef de Service',
      notifyRequester: true,
      notifyNextValidators: 'DIRECTEUR_EXECUTIF',
    }
  }
  if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
    return {
      type: 'LEAVE_APPROVED',
      title: 'Demande approuvee',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'REJECTED' && oldStatus !== 'REJECTED') {
    return {
      type: 'LEAVE_REJECTED',
      title: 'Demande rejetee',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }

  // Undo cases
  if (newStatus === 'PENDING' && oldStatus === 'REJECTED') {
    return {
      type: 'LEAVE_RESTORED',
      title: 'Demande restauree',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'PENDING' && oldStatus === 'VALIDATED_RP') {
    return {
      type: 'LEAVE_UNDO',
      title: 'Validation RH annulee',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'VALIDATED_RP' && oldStatus === 'VALIDATED_DC') {
    return {
      type: 'LEAVE_UNDO',
      title: 'Validation Chef de Service annulee',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'VALIDATED_RP' && oldStatus === 'REJECTED') {
    return {
      type: 'LEAVE_RESTORED',
      title: 'Demande restauree',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'VALIDATED_DC' && oldStatus === 'APPROVED') {
    return {
      type: 'LEAVE_UNDO',
      title: 'Approbation annulee',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }
  if (newStatus === 'VALIDATED_DC' && oldStatus === 'REJECTED') {
    return {
      type: 'LEAVE_RESTORED',
      title: 'Demande restauree',
      notifyRequester: true,
      notifyNextValidators: null,
    }
  }

  // No status change or unhandled transition
  if (oldStatus === newStatus) return null
  return null
}

// Simulate the mission status change notification logic
function getMissionNotification(
  oldStatus: string,
  newStatus: string
): { type: string; title: string; notifyNextValidators: string | null } | null {
  // Mission chain: PENDING -> Chef(dc) -> VALIDATED_DC -> RH(rp) -> VALIDATED_RP -> Dir(de) -> APPROVED
  if (newStatus === 'VALIDATED_DC' && oldStatus === 'PENDING') {
    return { type: 'MISSION_VALIDATED_DC', title: 'Mission validee par Chef de Service', notifyNextValidators: 'RH' }
  }
  if (newStatus === 'VALIDATED_RP' && oldStatus === 'VALIDATED_DC') {
    return { type: 'MISSION_VALIDATED_RP', title: 'Mission validee par RH', notifyNextValidators: 'DIRECTEUR_EXECUTIF' }
  }
  if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
    return { type: 'MISSION_APPROVED', title: 'Mission approuvee', notifyNextValidators: null }
  }
  if (newStatus === 'REJECTED' && oldStatus !== 'REJECTED') {
    return { type: 'MISSION_REJECTED', title: 'Mission rejetee', notifyNextValidators: null }
  }
  if (newStatus === 'PENDING' && oldStatus === 'VALIDATED_DC') {
    return { type: 'MISSION_UNDO', title: 'Validation Chef de Service annulee', notifyNextValidators: null }
  }
  if (newStatus === 'VALIDATED_DC' && oldStatus === 'VALIDATED_RP') {
    return { type: 'MISSION_UNDO', title: 'Validation RH annulee', notifyNextValidators: null }
  }
  if (newStatus === 'VALIDATED_RP' && oldStatus === 'APPROVED') {
    return { type: 'MISSION_UNDO', title: 'Approbation mission annulee', notifyNextValidators: null }
  }
  if (oldStatus === newStatus) return null
  return null
}

// Simulate recovery notification logic
function getRecoveryNotification(
  oldStatus: string,
  newStatus: string
): { type: string; title: string } | null {
  if (newStatus === 'VALIDATED' && oldStatus === 'PENDING') {
    return { type: 'RECOVERY_VALIDATED', title: 'Recuperation validee' }
  }
  if (newStatus === 'REJECTED' && oldStatus === 'PENDING') {
    return { type: 'RECOVERY_REJECTED', title: 'Recuperation rejetee' }
  }
  if (oldStatus === newStatus) return null
  return null
}

// Simulate which role should see pending validations (login reminder logic)
function getReminderStatus(role: string): {
  leaveStatus: string | null
  missionStatus: string | null
} {
  switch (role) {
    case 'RH':
      return { leaveStatus: 'PENDING', missionStatus: 'VALIDATED_DC' }
    case 'ADMIN':
      return { leaveStatus: 'PENDING', missionStatus: 'PENDING' }
    case 'CHEF_SERVICE':
      return { leaveStatus: 'VALIDATED_RP', missionStatus: 'PENDING' }
    case 'DIRECTEUR_EXECUTIF':
      return { leaveStatus: 'VALIDATED_DC', missionStatus: 'VALIDATED_RP' }
    case 'EMPLOYEE':
      return { leaveStatus: null, missionStatus: null }
    default:
      return { leaveStatus: null, missionStatus: null }
  }
}


// ─── Leave notification trigger tests ─────────────────────────────────

describe('Leave notification trigger logic', () => {
  it('generates LEAVE_VALIDATED_RP on PENDING → VALIDATED_RP', () => {
    const result = getLeaveNotification('PENDING', 'VALIDATED_RP', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_VALIDATED_RP')
    expect(result!.notifyRequester).toBe(true)
    expect(result!.notifyNextValidators).toBe('CHEF_SERVICE')
  })

  it('generates LEAVE_VALIDATED_DC on VALIDATED_RP → VALIDATED_DC', () => {
    const result = getLeaveNotification('VALIDATED_RP', 'VALIDATED_DC', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_VALIDATED_DC')
    expect(result!.notifyNextValidators).toBe('DIRECTEUR_EXECUTIF')
  })

  it('generates LEAVE_APPROVED on VALIDATED_DC → APPROVED', () => {
    const result = getLeaveNotification('VALIDATED_DC', 'APPROVED', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_APPROVED')
    expect(result!.notifyNextValidators).toBeNull()
  })

  it('generates LEAVE_REJECTED on any status → REJECTED', () => {
    for (const from of ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC']) {
      const result = getLeaveNotification(from, 'REJECTED', 'CONGE')
      expect(result).not.toBeNull()
      expect(result!.type).toBe('LEAVE_REJECTED')
    }
  })

  it('generates LEAVE_RESTORED on REJECTED → PENDING', () => {
    const result = getLeaveNotification('REJECTED', 'PENDING', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_RESTORED')
  })

  it('generates LEAVE_UNDO on VALIDATED_RP → PENDING (undo RH)', () => {
    const result = getLeaveNotification('VALIDATED_RP', 'PENDING', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_UNDO')
    expect(result!.title).toBe('Validation RH annulee')
  })

  it('generates LEAVE_UNDO on VALIDATED_DC → VALIDATED_RP (undo Chef)', () => {
    const result = getLeaveNotification('VALIDATED_DC', 'VALIDATED_RP', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_UNDO')
    expect(result!.title).toBe('Validation Chef de Service annulee')
  })

  it('generates LEAVE_UNDO on APPROVED → VALIDATED_DC (undo Directeur)', () => {
    const result = getLeaveNotification('APPROVED', 'VALIDATED_DC', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_UNDO')
    expect(result!.title).toBe('Approbation annulee')
  })

  it('generates LEAVE_RESTORED on REJECTED → VALIDATED_RP', () => {
    const result = getLeaveNotification('REJECTED', 'VALIDATED_RP', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_RESTORED')
  })

  it('generates LEAVE_RESTORED on REJECTED → VALIDATED_DC', () => {
    const result = getLeaveNotification('REJECTED', 'VALIDATED_DC', 'CONGE')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_RESTORED')
  })

  it('returns null when status does not change', () => {
    expect(getLeaveNotification('PENDING', 'PENDING', 'CONGE')).toBeNull()
    expect(getLeaveNotification('APPROVED', 'APPROVED', 'CONGE')).toBeNull()
  })

  it('works for RECUPERATION type the same way', () => {
    const result = getLeaveNotification('PENDING', 'VALIDATED_RP', 'RECUPERATION')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LEAVE_VALIDATED_RP')
  })
})


// ─── Mission notification trigger tests ─────────────────────────────

describe('Mission notification trigger logic', () => {
  it('generates MISSION_VALIDATED_DC on PENDING → VALIDATED_DC', () => {
    const result = getMissionNotification('PENDING', 'VALIDATED_DC')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_VALIDATED_DC')
    expect(result!.notifyNextValidators).toBe('RH')
  })

  it('generates MISSION_VALIDATED_RP on VALIDATED_DC → VALIDATED_RP', () => {
    const result = getMissionNotification('VALIDATED_DC', 'VALIDATED_RP')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_VALIDATED_RP')
    expect(result!.notifyNextValidators).toBe('DIRECTEUR_EXECUTIF')
  })

  it('generates MISSION_APPROVED on VALIDATED_RP → APPROVED', () => {
    const result = getMissionNotification('VALIDATED_RP', 'APPROVED')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_APPROVED')
    expect(result!.notifyNextValidators).toBeNull()
  })

  it('generates MISSION_REJECTED on any → REJECTED', () => {
    for (const from of ['PENDING', 'VALIDATED_DC', 'VALIDATED_RP']) {
      const result = getMissionNotification(from, 'REJECTED')
      expect(result).not.toBeNull()
      expect(result!.type).toBe('MISSION_REJECTED')
    }
  })

  it('generates MISSION_UNDO on VALIDATED_DC → PENDING', () => {
    const result = getMissionNotification('VALIDATED_DC', 'PENDING')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_UNDO')
  })

  it('generates MISSION_UNDO on VALIDATED_RP → VALIDATED_DC', () => {
    const result = getMissionNotification('VALIDATED_RP', 'VALIDATED_DC')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_UNDO')
  })

  it('generates MISSION_UNDO on APPROVED → VALIDATED_RP', () => {
    const result = getMissionNotification('APPROVED', 'VALIDATED_RP')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('MISSION_UNDO')
  })

  it('returns null when status does not change', () => {
    expect(getMissionNotification('PENDING', 'PENDING')).toBeNull()
  })
})


// ─── Recovery notification trigger tests ────────────────────────────

describe('Recovery notification trigger logic', () => {
  it('generates RECOVERY_VALIDATED on PENDING → VALIDATED', () => {
    const result = getRecoveryNotification('PENDING', 'VALIDATED')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('RECOVERY_VALIDATED')
  })

  it('generates RECOVERY_REJECTED on PENDING → REJECTED', () => {
    const result = getRecoveryNotification('PENDING', 'REJECTED')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('RECOVERY_REJECTED')
  })

  it('returns null when status does not change', () => {
    expect(getRecoveryNotification('PENDING', 'PENDING')).toBeNull()
    expect(getRecoveryNotification('VALIDATED', 'VALIDATED')).toBeNull()
  })
})


// ─── Notification link routing tests ────────────────────────────────

describe('Notification link routing', () => {
  // Simulates getNotificationLink from the notifications page
  function getNotificationLink(type: string | null, requestId: number | null, missionId: number | null, recoveryId: number | null): string | null {
    if (type === 'NEW_LEAVE_TO_VALIDATE' || type === 'LEAVE_TO_VALIDATE') {
      return '/dashboard/validations'
    }
    if (type === 'NEW_MISSION_TO_VALIDATE' || type === 'MISSION_TO_VALIDATE') {
      return '/dashboard/mission-validations'
    }
    if (type === 'NEW_RECOVERY_TO_VALIDATE') {
      return '/dashboard/recovery-requests'
    }
    if (requestId) {
      return `/dashboard/requests/${requestId}`
    }
    if (missionId) {
      return `/dashboard/missions/${missionId}`
    }
    if (recoveryId) {
      return '/dashboard/recovery-requests'
    }
    return null
  }

  it('routes leave validation notifications to validation board', () => {
    expect(getNotificationLink('LEAVE_TO_VALIDATE', 42, null, null)).toBe('/dashboard/validations')
    expect(getNotificationLink('NEW_LEAVE_TO_VALIDATE', 42, null, null)).toBe('/dashboard/validations')
  })

  it('routes mission validation notifications to mission validation board', () => {
    expect(getNotificationLink('MISSION_TO_VALIDATE', null, 7, null)).toBe('/dashboard/mission-validations')
    expect(getNotificationLink('NEW_MISSION_TO_VALIDATE', null, 7, null)).toBe('/dashboard/mission-validations')
  })

  it('routes recovery validation notifications to recovery page', () => {
    expect(getNotificationLink('NEW_RECOVERY_TO_VALIDATE', null, null, 5)).toBe('/dashboard/recovery-requests')
  })

  it('routes leave status notifications to request detail', () => {
    expect(getNotificationLink('LEAVE_APPROVED', 42, null, null)).toBe('/dashboard/requests/42')
    expect(getNotificationLink('LEAVE_REJECTED', 99, null, null)).toBe('/dashboard/requests/99')
    expect(getNotificationLink('LEAVE_VALIDATED_RP', 10, null, null)).toBe('/dashboard/requests/10')
  })

  it('routes mission status notifications to mission detail', () => {
    expect(getNotificationLink('MISSION_APPROVED', null, 7, null)).toBe('/dashboard/missions/7')
    expect(getNotificationLink('MISSION_REJECTED', null, 3, null)).toBe('/dashboard/missions/3')
  })

  it('routes recovery status notifications to recovery page', () => {
    expect(getNotificationLink('RECOVERY_VALIDATED', null, null, 5)).toBe('/dashboard/recovery-requests')
  })

  it('returns null for unknown notification with no related IDs', () => {
    expect(getNotificationLink('UNKNOWN', null, null, null)).toBeNull()
  })
})


// ─── Login reminder role-status mapping tests ───────────────────────

describe('Login reminder role-status mapping', () => {
  it('RH sees PENDING leave requests and VALIDATED_DC missions', () => {
    const r = getReminderStatus('RH')
    expect(r.leaveStatus).toBe('PENDING')
    expect(r.missionStatus).toBe('VALIDATED_DC')
  })

  it('CHEF_SERVICE sees VALIDATED_RP leaves and PENDING missions', () => {
    const r = getReminderStatus('CHEF_SERVICE')
    expect(r.leaveStatus).toBe('VALIDATED_RP')
    expect(r.missionStatus).toBe('PENDING')
  })

  it('DIRECTEUR sees VALIDATED_DC leaves and VALIDATED_RP missions', () => {
    const r = getReminderStatus('DIRECTEUR_EXECUTIF')
    expect(r.leaveStatus).toBe('VALIDATED_DC')
    expect(r.missionStatus).toBe('VALIDATED_RP')
  })

  it('ADMIN sees PENDING leave requests and PENDING missions', () => {
    const r = getReminderStatus('ADMIN')
    expect(r.leaveStatus).toBe('PENDING')
    expect(r.missionStatus).toBe('PENDING')
  })

  it('EMPLOYEE sees no validation reminders', () => {
    const r = getReminderStatus('EMPLOYEE')
    expect(r.leaveStatus).toBeNull()
    expect(r.missionStatus).toBeNull()
  })
})


// ─── Notification type coverage tests ───────────────────────────────

describe('Full pipeline coverage', () => {
  const LEAVE_FORWARD_TRANSITIONS = [
    ['PENDING', 'VALIDATED_RP'],
    ['VALIDATED_RP', 'VALIDATED_DC'],
    ['VALIDATED_DC', 'APPROVED'],
  ]

  const LEAVE_REJECT_TRANSITIONS = [
    ['PENDING', 'REJECTED'],
    ['VALIDATED_RP', 'REJECTED'],
    ['VALIDATED_DC', 'REJECTED'],
  ]

  const LEAVE_UNDO_TRANSITIONS = [
    ['VALIDATED_RP', 'PENDING'],
    ['VALIDATED_DC', 'VALIDATED_RP'],
    ['APPROVED', 'VALIDATED_DC'],
  ]

  const LEAVE_RESTORE_TRANSITIONS = [
    ['REJECTED', 'PENDING'],
    ['REJECTED', 'VALIDATED_RP'],
    ['REJECTED', 'VALIDATED_DC'],
  ]

  it('covers every forward leave transition', () => {
    for (const [from, to] of LEAVE_FORWARD_TRANSITIONS) {
      const result = getLeaveNotification(from, to, 'CONGE')
      expect(result, `${from} → ${to} should generate a notification`).not.toBeNull()
      expect(result!.notifyRequester).toBe(true)
    }
  })

  it('covers every reject leave transition', () => {
    for (const [from, to] of LEAVE_REJECT_TRANSITIONS) {
      const result = getLeaveNotification(from, to, 'CONGE')
      expect(result, `${from} → ${to} should generate LEAVE_REJECTED`).not.toBeNull()
      expect(result!.type).toBe('LEAVE_REJECTED')
    }
  })

  it('covers every undo leave transition', () => {
    for (const [from, to] of LEAVE_UNDO_TRANSITIONS) {
      const result = getLeaveNotification(from, to, 'CONGE')
      expect(result, `${from} → ${to} should generate LEAVE_UNDO`).not.toBeNull()
      expect(result!.type).toBe('LEAVE_UNDO')
    }
  })

  it('covers every restore leave transition', () => {
    for (const [from, to] of LEAVE_RESTORE_TRANSITIONS) {
      const result = getLeaveNotification(from, to, 'CONGE')
      expect(result, `${from} → ${to} should generate LEAVE_RESTORED`).not.toBeNull()
      expect(result!.type).toBe('LEAVE_RESTORED')
    }
  })

  it('covers every forward mission transition', () => {
    const transitions = [
      ['PENDING', 'VALIDATED_DC'],
      ['VALIDATED_DC', 'VALIDATED_RP'],
      ['VALIDATED_RP', 'APPROVED'],
    ]
    for (const [from, to] of transitions) {
      const result = getMissionNotification(from, to)
      expect(result, `${from} → ${to}`).not.toBeNull()
    }
  })

  it('next-validator chain is correct for leaves', () => {
    // PENDING → VALIDATED_RP: next is CHEF_SERVICE
    expect(getLeaveNotification('PENDING', 'VALIDATED_RP', 'CONGE')!.notifyNextValidators).toBe('CHEF_SERVICE')
    // VALIDATED_RP → VALIDATED_DC: next is DIRECTEUR_EXECUTIF
    expect(getLeaveNotification('VALIDATED_RP', 'VALIDATED_DC', 'CONGE')!.notifyNextValidators).toBe('DIRECTEUR_EXECUTIF')
    // VALIDATED_DC → APPROVED: no next (final)
    expect(getLeaveNotification('VALIDATED_DC', 'APPROVED', 'CONGE')!.notifyNextValidators).toBeNull()
  })

  it('next-validator chain is correct for missions', () => {
    // PENDING → VALIDATED_DC: next is RH
    expect(getMissionNotification('PENDING', 'VALIDATED_DC')!.notifyNextValidators).toBe('RH')
    // VALIDATED_DC → VALIDATED_RP: next is DIRECTEUR_EXECUTIF
    expect(getMissionNotification('VALIDATED_DC', 'VALIDATED_RP')!.notifyNextValidators).toBe('DIRECTEUR_EXECUTIF')
    // VALIDATED_RP → APPROVED: no next (final)
    expect(getMissionNotification('VALIDATED_RP', 'APPROVED')!.notifyNextValidators).toBeNull()
  })
})

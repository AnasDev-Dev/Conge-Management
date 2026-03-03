import { describe, it, expect } from 'vitest'
import {
  MANAGER_ROLES,
  isManagerRole,
  PENDING_STATUSES,
  getStatusLabel,
  getStatusClass,
  getRoleLabel,
  getRecoveryStatusLabel,
  getRecoveryStatusClass,
  TRANSPORT_LABELS,
  TRANSPORT_OPTIONS,
  MAX_LEAVE_BALANCE,
  MAX_CONSECUTIVE_RECOVERY_DAYS,
  RECOVERY_WORK_TYPE_LABELS,
  CALENDAR_STATUS_FILTERS,
  HALF_DAY_LABELS,
} from '@/lib/constants'

// ─── MANAGER_ROLES ───────────────────────────────────────

describe('MANAGER_ROLES', () => {
  it('contains the expected manager roles', () => {
    expect(MANAGER_ROLES).toContain('CHEF_SERVICE')
    expect(MANAGER_ROLES).toContain('RH')
    expect(MANAGER_ROLES).toContain('DIRECTEUR_EXECUTIF')
    expect(MANAGER_ROLES).toContain('ADMIN')
  })

  it('does not contain EMPLOYEE', () => {
    expect(MANAGER_ROLES).not.toContain('EMPLOYEE')
  })

  it('does not contain TRESORIER_GENERAL', () => {
    expect(MANAGER_ROLES).not.toContain('TRESORIER_GENERAL')
  })

  it('has exactly 4 roles', () => {
    expect(MANAGER_ROLES.length).toBe(4)
  })
})

// ─── isManagerRole ───────────────────────────────────────

describe('isManagerRole', () => {
  it('returns true for CHEF_SERVICE', () => {
    expect(isManagerRole('CHEF_SERVICE')).toBe(true)
  })

  it('returns true for RH', () => {
    expect(isManagerRole('RH')).toBe(true)
  })

  it('returns true for DIRECTEUR_EXECUTIF', () => {
    expect(isManagerRole('DIRECTEUR_EXECUTIF')).toBe(true)
  })

  it('returns true for ADMIN', () => {
    expect(isManagerRole('ADMIN')).toBe(true)
  })

  it('returns false for EMPLOYEE', () => {
    expect(isManagerRole('EMPLOYEE')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isManagerRole('')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(isManagerRole('SUPER_ADMIN')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(isManagerRole('admin')).toBe(false)
    expect(isManagerRole('Rh')).toBe(false)
  })
})

// ─── PENDING_STATUSES ────────────────────────────────────

describe('PENDING_STATUSES', () => {
  it('contains all in-progress statuses', () => {
    expect(PENDING_STATUSES).toContain('PENDING')
    expect(PENDING_STATUSES).toContain('VALIDATED_RP')
    expect(PENDING_STATUSES).toContain('VALIDATED_DC')
  })

  it('does not contain final statuses', () => {
    expect(PENDING_STATUSES).not.toContain('APPROVED')
    expect(PENDING_STATUSES).not.toContain('REJECTED')
    expect(PENDING_STATUSES).not.toContain('CANCELLED')
    expect(PENDING_STATUSES).not.toContain('ARCHIVED')
  })
})

// ─── getStatusLabel ──────────────────────────────────────

describe('getStatusLabel', () => {
  const cases: [string, string][] = [
    ['PENDING', 'En attente'],
    ['VALIDATED_RP', 'Validé RH'],
    ['VALIDATED_DC', 'Validé Chef'],
    ['APPROVED', 'Approuvé'],
    ['REJECTED', 'Rejeté'],
    ['CANCELLED', 'Annulé'],
    ['ARCHIVED', 'Archivé'],
  ]

  it.each(cases)('returns "%s" → "%s"', (status, label) => {
    expect(getStatusLabel(status)).toBe(label)
  })

  it('returns the raw status for unknown values', () => {
    expect(getStatusLabel('UNKNOWN')).toBe('UNKNOWN')
  })
})

// ─── getStatusClass ──────────────────────────────────────

describe('getStatusClass', () => {
  it('returns status-pending for PENDING', () => {
    expect(getStatusClass('PENDING')).toBe('status-pending')
  })

  it('returns status-progress for VALIDATED_RP', () => {
    expect(getStatusClass('VALIDATED_RP')).toBe('status-progress')
  })

  it('returns status-progress for VALIDATED_DC', () => {
    expect(getStatusClass('VALIDATED_DC')).toBe('status-progress')
  })

  it('returns status-approved for APPROVED', () => {
    expect(getStatusClass('APPROVED')).toBe('status-approved')
  })

  it('returns status-rejected for REJECTED', () => {
    expect(getStatusClass('REJECTED')).toBe('status-rejected')
  })

  it('returns status-neutral for CANCELLED', () => {
    expect(getStatusClass('CANCELLED')).toBe('status-neutral')
  })

  it('returns status-neutral for ARCHIVED', () => {
    expect(getStatusClass('ARCHIVED')).toBe('status-neutral')
  })

  it('returns status-neutral for unknown status', () => {
    expect(getStatusClass('WHATEVER')).toBe('status-neutral')
  })
})

// ─── getRoleLabel ────────────────────────────────────────

describe('getRoleLabel', () => {
  const roleCases: [string, string][] = [
    ['EMPLOYEE', 'Employé'],
    ['RH', 'Ressources Humaines'],
    ['CHEF_SERVICE', 'Chef de Service'],
    ['DIRECTEUR_EXECUTIF', 'Directeur Exécutif'],
    ['ADMIN', 'Administrateur'],
  ]

  it.each(roleCases)('returns "%s" → "%s"', (role, label) => {
    expect(getRoleLabel(role)).toBe(label)
  })

  it('returns raw role for unknown values', () => {
    expect(getRoleLabel('TRESORIER_GENERAL')).toBe('TRESORIER_GENERAL')
  })
})

// ─── getRecoveryStatusLabel ──────────────────────────────

describe('getRecoveryStatusLabel', () => {
  it('returns "En attente" for PENDING', () => {
    expect(getRecoveryStatusLabel('PENDING')).toBe('En attente')
  })

  it('returns "Validée" for VALIDATED', () => {
    expect(getRecoveryStatusLabel('VALIDATED')).toBe('Validée')
  })

  it('returns "Rejetée" for REJECTED', () => {
    expect(getRecoveryStatusLabel('REJECTED')).toBe('Rejetée')
  })

  it('returns raw status for unknown', () => {
    expect(getRecoveryStatusLabel('UNKNOWN')).toBe('UNKNOWN')
  })
})

// ─── getRecoveryStatusClass ──────────────────────────────

describe('getRecoveryStatusClass', () => {
  it('returns status-pending for PENDING', () => {
    expect(getRecoveryStatusClass('PENDING')).toBe('status-pending')
  })

  it('returns status-approved for VALIDATED', () => {
    expect(getRecoveryStatusClass('VALIDATED')).toBe('status-approved')
  })

  it('returns status-rejected for REJECTED', () => {
    expect(getRecoveryStatusClass('REJECTED')).toBe('status-rejected')
  })

  it('returns status-neutral for unknown', () => {
    expect(getRecoveryStatusClass('UNKNOWN')).toBe('status-neutral')
  })
})

// ─── Constants values ────────────────────────────────────

describe('Constants', () => {
  it('MAX_LEAVE_BALANCE is 52', () => {
    expect(MAX_LEAVE_BALANCE).toBe(52)
  })

  it('MAX_CONSECUTIVE_RECOVERY_DAYS is 5', () => {
    expect(MAX_CONSECUTIVE_RECOVERY_DAYS).toBe(5)
  })

  it('TRANSPORT_LABELS has all transport types', () => {
    expect(TRANSPORT_LABELS).toHaveProperty('voiture_personnelle')
    expect(TRANSPORT_LABELS).toHaveProperty('voiture_service')
    expect(TRANSPORT_LABELS).toHaveProperty('avion')
    expect(TRANSPORT_LABELS).toHaveProperty('train')
    expect(TRANSPORT_LABELS).toHaveProperty('bus')
    expect(TRANSPORT_LABELS).toHaveProperty('autre')
  })

  it('TRANSPORT_OPTIONS has correct structure', () => {
    expect(TRANSPORT_OPTIONS.length).toBe(6)
    TRANSPORT_OPTIONS.forEach(opt => {
      expect(opt).toHaveProperty('value')
      expect(opt).toHaveProperty('label')
    })
  })

  it('RECOVERY_WORK_TYPE_LABELS has all types', () => {
    expect(RECOVERY_WORK_TYPE_LABELS).toHaveProperty('JOUR_FERIE')
    expect(RECOVERY_WORK_TYPE_LABELS).toHaveProperty('JOUR_REPOS')
    expect(RECOVERY_WORK_TYPE_LABELS).toHaveProperty('SAMEDI')
    expect(RECOVERY_WORK_TYPE_LABELS).toHaveProperty('DIMANCHE')
  })

  it('CALENDAR_STATUS_FILTERS has correct entries', () => {
    expect(CALENDAR_STATUS_FILTERS.length).toBe(5)
    const keys = CALENDAR_STATUS_FILTERS.map(f => f.key)
    expect(keys).toContain('PENDING')
    expect(keys).toContain('REJECTED')
    expect(keys).toContain('VALIDATED_DC')
    expect(keys).toContain('VALIDATED_RP')
    expect(keys).toContain('APPROVED')
  })

  it('HALF_DAY_LABELS has all options', () => {
    expect(HALF_DAY_LABELS.FULL).toBe('Journée complète')
    expect(HALF_DAY_LABELS.MORNING).toBe('Matin')
    expect(HALF_DAY_LABELS.AFTERNOON).toBe('Après-midi')
  })
})

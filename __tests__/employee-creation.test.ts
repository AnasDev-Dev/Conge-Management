import { describe, it, expect } from 'vitest'
import { canPerformAction, ROLE_PERMISSIONS } from '@/lib/permissions'
import { UserRole } from '@/lib/types/database'

// ─── Permission tests ────────────────────────────────────────────

describe('Employee creation permissions', () => {
  const rolesAllowedToCreate: UserRole[] = ['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF']
  const rolesNotAllowedToCreate: UserRole[] = ['EMPLOYEE', 'CHEF_SERVICE']

  it.each(rolesAllowedToCreate)('%s should have employees.create permission', (role) => {
    expect(canPerformAction(role, 'employees.create')).toBe(true)
  })

  it.each(rolesNotAllowedToCreate)('%s should NOT have employees.create permission', (role) => {
    expect(canPerformAction(role, 'employees.create')).toBe(false)
  })

  it('DIRECTEUR_EXECUTIF should have employees.edit permission', () => {
    expect(canPerformAction('DIRECTEUR_EXECUTIF', 'employees.edit')).toBe(true)
  })

  it('DIRECTEUR_EXECUTIF should have employees.viewBalances permission', () => {
    expect(canPerformAction('DIRECTEUR_EXECUTIF', 'employees.viewBalances')).toBe(true)
  })
})

// ─── Validation logic tests ──────────────────────────────────────

describe('Employee creation validation', () => {
  function validateEmployeePayload(payload: Record<string, unknown>): string | null {
    if (!payload.full_name || !(payload.full_name as string).trim()) {
      return 'Le nom complet est obligatoire'
    }
    if (!payload.email || !(payload.email as string).trim()) {
      return "L'email est obligatoire"
    }
    if (!payload.password || (payload.password as string).length < 6) {
      return 'Le mot de passe doit contenir au moins 6 caractères'
    }
    if (!payload.company_id) {
      return 'La société est obligatoire'
    }
    if (!payload.department_id) {
      return 'Le département est obligatoire'
    }
    if (!payload.hire_date) {
      return "La date d'embauche est obligatoire"
    }
    return null
  }

  it('should reject empty full_name', () => {
    const err = validateEmployeePayload({ full_name: '', email: 'a@b.c', password: '123456', company_id: 1, department_id: 1, hire_date: '2025-01-01' })
    expect(err).toBe('Le nom complet est obligatoire')
  })

  it('should reject missing email', () => {
    const err = validateEmployeePayload({ full_name: 'Test', email: '', password: '123456', company_id: 1, department_id: 1, hire_date: '2025-01-01' })
    expect(err).toBe("L'email est obligatoire")
  })

  it('should reject short password', () => {
    const err = validateEmployeePayload({ full_name: 'Test', email: 'a@b.c', password: '12345', company_id: 1, department_id: 1, hire_date: '2025-01-01' })
    expect(err).toBe('Le mot de passe doit contenir au moins 6 caractères')
  })

  it('should reject missing company_id', () => {
    const err = validateEmployeePayload({ full_name: 'Test', email: 'a@b.c', password: '123456', company_id: null, department_id: 1, hire_date: '2025-01-01' })
    expect(err).toBe('La société est obligatoire')
  })

  it('should reject missing department_id', () => {
    const err = validateEmployeePayload({ full_name: 'Test', email: 'a@b.c', password: '123456', company_id: 1, department_id: null, hire_date: '2025-01-01' })
    expect(err).toBe('Le département est obligatoire')
  })

  it('should reject missing hire_date', () => {
    const err = validateEmployeePayload({ full_name: 'Test', email: 'a@b.c', password: '123456', company_id: 1, department_id: 1, hire_date: '' })
    expect(err).toBe("La date d'embauche est obligatoire")
  })

  it('should accept a valid payload', () => {
    const err = validateEmployeePayload({ full_name: 'Test User', email: 'test@example.com', password: 'secure123', company_id: 1, department_id: 1, hire_date: '2025-01-01' })
    expect(err).toBeNull()
  })
})

// ─── RLS policy alignment check ──────────────────────────────────

describe('RLS and permissions alignment', () => {
  const RLS_ALLOWED_ROLES = ['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF']

  it('every role with employees.create in permissions should be in the RLS allowed list', () => {
    const allRoles = Object.keys(ROLE_PERMISSIONS) as UserRole[]
    const rolesWithCreatePermission = allRoles.filter((role) =>
      ROLE_PERMISSIONS[role].actions.includes('employees.create')
    )

    for (const role of rolesWithCreatePermission) {
      expect(RLS_ALLOWED_ROLES).toContain(role)
    }
  })

  it('RLS allowed list should match permissions employees.create roles', () => {
    const allRoles = Object.keys(ROLE_PERMISSIONS) as UserRole[]
    const rolesWithCreatePermission = allRoles.filter((role) =>
      ROLE_PERMISSIONS[role].actions.includes('employees.create')
    )

    expect(rolesWithCreatePermission.sort()).toEqual(RLS_ALLOWED_ROLES.sort())
  })
})

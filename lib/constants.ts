// Roles that have manager-level access (can validate, see all requests, etc.)
export const MANAGER_ROLES: readonly string[] = ['CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN']

export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.includes(role)
}

// Statuses that mean a request is still in-progress (not finalized)
export const PENDING_STATUSES: readonly string[] = ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC', 'VALIDATED_TG', 'VALIDATED_DE']

// Status display labels (French)
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'En attente'
    case 'VALIDATED_RP': return 'Valide RH'
    case 'VALIDATED_DC': return 'Valide Chef'
    case 'VALIDATED_TG': return 'Valide Tresorier'
    case 'VALIDATED_DE': return 'Valide Directeur'
    case 'APPROVED': return 'Approuve'
    case 'REJECTED': return 'Rejete'
    case 'CANCELLED': return 'Annule'
    case 'ARCHIVED': return 'Archive'
    default: return status
  }
}

// Status CSS class (maps to utility classes in globals.css)
export function getStatusClass(status: string): string {
  switch (status) {
    case 'PENDING': return 'status-pending'
    case 'VALIDATED_RP':
    case 'VALIDATED_DC':
    case 'VALIDATED_TG':
    case 'VALIDATED_DE': return 'status-progress'
    case 'APPROVED': return 'status-approved'
    case 'REJECTED': return 'status-rejected'
    case 'CANCELLED':
    case 'ARCHIVED': return 'status-neutral'
    default: return 'status-neutral'
  }
}

// Role display labels (French)
export function getRoleLabel(role: string): string {
  switch (role) {
    case 'EMPLOYEE': return 'Employe'
    case 'RH': return 'Ressources Humaines'
    case 'CHEF_SERVICE': return 'Chef de Service'
    case 'TRESORIER_GENERAL': return 'Tresorier General'
    case 'DIRECTEUR_EXECUTIF': return 'Directeur Executif'
    case 'ADMIN': return 'Administrateur'
    default: return role
  }
}

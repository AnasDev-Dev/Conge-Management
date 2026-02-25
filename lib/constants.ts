// Roles that have manager-level access (can validate, see all requests, etc.)
export const MANAGER_ROLES: readonly string[] = ['CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN']

export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.includes(role)
}

// Statuses that mean a request is still in-progress (not finalized)
export const PENDING_STATUSES: readonly string[] = ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC']

// Status display labels (French)
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'En attente'
    case 'VALIDATED_RP': return 'Validé RH'
    case 'VALIDATED_DC': return 'Validé Chef'
    case 'APPROVED': return 'Approuvé'
    case 'REJECTED': return 'Rejeté'
    case 'CANCELLED': return 'Annulé'
    case 'ARCHIVED': return 'Archivé'
    default: return status
  }
}

// Status CSS class (maps to utility classes in globals.css)
export function getStatusClass(status: string): string {
  switch (status) {
    case 'PENDING': return 'status-pending'
    case 'VALIDATED_RP':
    case 'VALIDATED_DC': return 'status-progress'
    case 'APPROVED': return 'status-approved'
    case 'REJECTED': return 'status-rejected'
    case 'CANCELLED':
    case 'ARCHIVED': return 'status-neutral'
    default: return 'status-neutral'
  }
}

// Transport type labels (shared across mission pages & print)
export const TRANSPORT_LABELS: Record<string, string> = {
  voiture_personnelle: 'Voiture personnelle',
  voiture_service: 'Voiture de service',
  avion: 'Avion',
  train: 'Train',
  bus: 'Bus',
  autre: 'Autre',
}

export const TRANSPORT_OPTIONS = Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Role display labels (French)
export function getRoleLabel(role: string): string {
  switch (role) {
    case 'EMPLOYEE': return 'Employé'
    case 'RH': return 'Ressources Humaines'
    case 'CHEF_SERVICE': return 'Chef de Service'
    case 'DIRECTEUR_EXECUTIF': return 'Directeur Exécutif'
    case 'ADMIN': return 'Administrateur'
    default: return role
  }
}

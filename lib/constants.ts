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
  covoiturage: 'Covoiturage',
  avion: 'Avion',
  train: 'Train',
  bus: 'Bus',
  autre: 'Autre',
}

export const TRANSPORT_OPTIONS = Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Currency options for mission orders
export const CURRENCY_OPTIONS = [
  { value: 'MAD', label: 'MAD (Dirham)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'USD', label: 'USD (Dollar)' },
  { value: 'GBP', label: 'GBP (Livre)' },
  { value: 'CHF', label: 'CHF (Franc Suisse)' },
] as const

// Maximum leave balance (Req #7)
export const MAX_LEAVE_BALANCE = 52

// Maximum consecutive recovery days (Req #9)
export const MAX_CONSECUTIVE_RECOVERY_DAYS = 5

// Recovery work type labels (Req #8)
export const RECOVERY_WORK_TYPE_LABELS: Record<string, string> = {
  MISSION: 'Mission',
  JOUR_FERIE: 'Jour férié',
  JOUR_REPOS: 'Jour de repos',
  SAMEDI: 'Samedi',
  DIMANCHE: 'Dimanche',
  AUTRE: 'Autre',
}

// Recovery request status labels (Req #8)
export function getRecoveryStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'En attente'
    case 'VALIDATED': return 'Validée'
    case 'REJECTED': return 'Rejetée'
    default: return status
  }
}

export function getRecoveryStatusClass(status: string): string {
  switch (status) {
    case 'PENDING': return 'status-pending'
    case 'VALIDATED': return 'status-approved'
    case 'REJECTED': return 'status-rejected'
    default: return 'status-neutral'
  }
}

// Calendar status filters (Req #11)
export const CALENDAR_STATUS_FILTERS = [
  { key: 'PENDING', label: 'En cours' },
  { key: 'REJECTED', label: 'Refusé' },
  { key: 'VALIDATED_DC', label: 'Validé Chef' },
  { key: 'VALIDATED_RP', label: 'Validé RH' },
  { key: 'APPROVED', label: 'Approuvé' },
] as const

// Half-day labels (Req #2)
export const HALF_DAY_LABELS: Record<string, string> = {
  FULL: 'Journée complète',
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
}

// Recovery period options with credit values (Req #8)
export type RecoveryPeriod = 'MORNING' | 'AFTERNOON' | 'FULL'
export const RECOVERY_PERIOD_OPTIONS: { value: RecoveryPeriod; label: string; days: number }[] = [
  { value: 'FULL', label: 'Journée complète', days: 1 },
  { value: 'MORNING', label: 'Matin', days: 0.5 },
  { value: 'AFTERNOON', label: 'Après-midi', days: 0.5 },
]

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

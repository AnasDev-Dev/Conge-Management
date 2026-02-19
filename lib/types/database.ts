export type UserRole =
  | 'EMPLOYEE'
  | 'CHEF_SERVICE'
  | 'RH'
  | 'TRESORIER_GENERAL'
  | 'DIRECTEUR_EXECUTIF'
  | 'ADMIN'

export type LeaveStatus =
  | 'PENDING'
  | 'VALIDATED_DC'
  | 'VALIDATED_RP'
  | 'VALIDATED_TG'
  | 'VALIDATED_DE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ARCHIVED'

export type LeaveRequestType = 'CONGE' | 'RECUPERATION'

export type MissionRequestOrigin = 'SELF' | 'ASSIGNED'
export type MissionScope = 'LOCAL' | 'INTERNATIONAL'
export type SupervisorOpinion = 'FAVORABLE' | 'DEFAVORABLE'
export type DirectorDecision = 'ACCORDEE' | 'REFUSEE'

export interface Company {
  id: number
  legacy_id: string | null
  name: string
  created_at: string
  updated_at: string
}

export interface Department {
  id: number
  legacy_id: number | null
  name: string
  company_id: number | null
  filter_budget: string | null
  filter_article: string | null
  created_at: string
  updated_at: string
}

export interface Utilisateur {
  id: string
  legacy_id: number | null
  email: string | null
  password_hash: string | null
  full_name: string
  username: string | null
  company_id: number | null
  department_id: number | null
  job_title: string | null
  role: UserRole
  is_active: boolean
  balance_conge: number
  balance_recuperation: number
  phone: string | null
  avatar_url: string | null
  hire_date: string | null
  birth_date: string | null
  matricule: string | null
  cin: string | null
  cnss: string | null
  rib: string | null
  address: string | null
  city: string | null
  gender: string | null
  legacy_profile_id: number | null
  is_signatory: boolean
  signatory_type: string | null
  signature_file: string | null
  last_login: string | null
  created_at: string
  updated_at: string
}

export interface LeaveRequest {
  id: number
  legacy_id: number | null
  user_id: string
  request_type: LeaveRequestType
  start_date: string
  end_date: string
  days_count: number
  return_date: string | null
  replacement_user_id: string | null
  status: LeaveStatus
  reason: string | null
  comments: string | null
  balance_before: number | null
  balance_conge_used: number | null
  balance_recuperation_used: number | null
  approved_by_dc: string | null
  approved_by_rp: string | null
  approved_by_tg: string | null
  approved_by_de: string | null
  approved_at_dc: string | null
  approved_at_rp: string | null
  approved_at_tg: string | null
  approved_at_de: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface LeaveBalanceHistory {
  id: number
  user_id: string
  type: LeaveRequestType
  amount: number
  reason: string | null
  year: number | null
  date_from: string | null
  date_to: string | null
  created_at: string
}

export interface Notification {
  id: number
  user_id: string
  title: string
  message: string
  type: string | null
  related_request_id: number | null
  is_read: boolean
  created_at: string
}

export interface Holiday {
  id: number
  company_id: number | null
  name: string
  date: string
  is_recurring: boolean
  created_at: string
}

export interface WorkingDays {
  id: number
  company_id: number | null
  monday: boolean
  tuesday: boolean
  wednesday: boolean
  thursday: boolean
  friday: boolean
  saturday: boolean
  sunday: boolean
}

export interface MissionRequest {
  id: number
  user_id: string
  assigned_by: string | null
  request_origin: MissionRequestOrigin
  mission_scope: MissionScope
  departure_city: string
  arrival_city: string
  mission_object: string
  start_date: string
  end_date: string
  days_count: number
  transport_type: string | null
  transport_details: string | null
  replacement_user_id: string | null
  comments: string | null
  status: LeaveStatus
  supervisor_opinion: SupervisorOpinion | null
  supervisor_comments: string | null
  supervisor_id: string | null
  supervisor_at: string | null
  approved_by_dc: string | null
  approved_by_rp: string | null
  approved_by_tg: string | null
  approved_by_de: string | null
  approved_at_dc: string | null
  approved_at_rp: string | null
  approved_at_tg: string | null
  approved_at_de: string | null
  director_decision: DirectorDecision | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface MissionRequestWithRelations extends MissionRequest {
  user?: Utilisateur
  assigner?: Utilisateur
  replacement_user?: Utilisateur
  supervisor?: Utilisateur
  approver_dc?: Utilisateur
  approver_rp?: Utilisateur
  approver_tg?: Utilisateur
  approver_de?: Utilisateur
  rejector?: Utilisateur
}

// Extended types with relations
export interface UtilisateurWithRelations extends Utilisateur {
  company?: Company
  department?: Department
}

export interface LeaveRequestWithRelations extends LeaveRequest {
  user?: Utilisateur
  replacement_user?: Utilisateur
  approver_dc?: Utilisateur
  approver_rp?: Utilisateur
  approver_tg?: Utilisateur
  approver_de?: Utilisateur
  rejector?: Utilisateur
}

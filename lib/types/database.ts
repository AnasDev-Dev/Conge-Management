export type UserRole =
  | 'EMPLOYEE'
  | 'CHEF_SERVICE'
  | 'RH'
  | 'RESPONSABLE_ADMIN'
  | 'DIRECTEUR_EXECUTIF'
  | 'ADMIN'

export type LeaveStatus =
  | 'PENDING'
  | 'VALIDATED_RP'
  | 'VALIDATED_DC'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ARCHIVED'

export type LeaveRequestType = 'CONGE' | 'RECUPERATION'

export type MissionRequestOrigin = 'SELF' | 'ASSIGNED' | 'EXTERNAL'
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
  category_id: number | null
  mission_category_id: number | null
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
  superior_id: string | null
  date_anciennete: string | null
  annual_leave_days: number | null
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
  start_half_day: 'FULL' | 'MORNING' | 'AFTERNOON'
  end_half_day: 'FULL' | 'MORNING' | 'AFTERNOON'
  is_mixed: boolean
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
  is_derogation: boolean
  derogation_approved_by: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_by: string | null
  initial_status: string | null
  signature_employee: string | null
  signature_rp: string | null
  signature_dc: string | null
  signature_de: string | null
  signature_rejected_by: string | null
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
  related_mission_id: number | null
  related_recovery_id: number | null
  related_exceptional_claim_id: number | null
  related_sick_leave_id: number | null
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
  category_id: number | null
  department_id: number | null
  monday: boolean
  tuesday: boolean
  wednesday: boolean
  thursday: boolean
  friday: boolean
  saturday: boolean
  sunday: boolean
  // Half-day columns (Req #2)
  monday_morning: boolean
  monday_afternoon: boolean
  tuesday_morning: boolean
  tuesday_afternoon: boolean
  wednesday_morning: boolean
  wednesday_afternoon: boolean
  thursday_morning: boolean
  thursday_afternoon: boolean
  friday_morning: boolean
  friday_afternoon: boolean
  saturday_morning: boolean
  saturday_afternoon: boolean
  sunday_morning: boolean
  sunday_afternoon: boolean
}

// Req #5: Monthly Balance Accrual
export interface MonthlyBalanceAccrual {
  id: number
  user_id: string
  year: number
  month: number
  accrued_days: number
  cumulative_days: number
  annual_entitlement: number
  created_at: string
}

// Req #8: Recovery Requests
export type RecoveryWorkType = 'MISSION' | 'JOUR_FERIE' | 'JOUR_REPOS' | 'SAMEDI' | 'DIMANCHE' | 'AUTRE'

export type RecoveryPeriod = 'MORNING' | 'AFTERNOON' | 'FULL'

export interface RecoveryRequest {
  id: number
  user_id: string
  days: number
  date_worked: string
  date_end: string | null
  work_type: RecoveryWorkType
  period: RecoveryPeriod
  start_half_day: string
  end_half_day: string
  reason: string | null
  mission_request_id: number | null
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  validated_by: string | null
  validated_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface RecoveryRequestWithRelations extends RecoveryRequest {
  user?: Utilisateur
  validator?: Utilisateur
}

// Req #9: Leave Request Details (combined requests)
export interface LeaveRequestDetail {
  id: number
  request_id: number
  date: string
  type: 'CONGE' | 'RECUPERATION'
  half_day: 'FULL' | 'MORNING' | 'AFTERNOON'
}

// Req #9: Segment for the segment builder UI
export interface LeaveSegment {
  id: string                  // crypto.randomUUID() for React keys
  type: 'CONGE' | 'RECUPERATION'
  startDate: string           // yyyy-MM-dd
  endDate: string             // yyyy-MM-dd
  startHalfDay: 'FULL' | 'MORNING' | 'AFTERNOON'
  endHalfDay: 'FULL' | 'MORNING' | 'AFTERNOON'
  workingDays: number         // computed via countWorkingDays()
}

// Req #10: Recovery Balance Lots
export interface RecoveryBalanceLot {
  id: number
  user_id: string
  days: number
  remaining_days: number
  year_acquired: number
  expires_at: string
  expired: boolean
  source_request_id: number | null
  created_at: string
}

// Req #12: User Company Roles
export interface UserCompanyRole {
  id: number
  user_id: string
  company_id: number
  role: UserRole
  is_active: boolean
  is_home: boolean
  department_id: number | null
  created_at: string
}

// Mission configuration types
export interface MissionPersonnelCategory {
  id: number
  company_id: number | null
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MissionZone {
  id: number
  company_id: number | null
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MissionTariffGridEntry {
  category_id: number
  zone_id: number
  petit_dej: number
  dej: number
  diner: number
  indem_avec_pec: number
  indem_sans_pec: number
  created_at: string
  updated_at: string
}

export interface MissionExtraExpense {
  label: string
  amount: number
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
  created_by: string | null
  initial_status: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  // Mission expansion fields
  mission_category_id: number | null
  mission_zone_id: number | null
  country: string | null
  venue: string | null
  currency: string | null
  pec: boolean
  petit_dej_included: boolean
  nbr_petit_dej: number
  nbr_dej: number
  nbr_diner: number
  daily_allowance: number
  total_allowance: number
  hotel_amount: number
  extra_expenses: MissionExtraExpense[]
  vehicle_brand: string | null
  vehicle_fiscal_power: string | null
  vehicle_plate_requested: string | null
  vehicle_plate_granted: string | null
  vehicle_date_from: string | null
  vehicle_date_to: string | null
  persons_transported: string | null
  persons_other: string | null
  external_person_name: string | null
  // Per-stage signatures (data URLs or storage URLs)
  signature_employee: string | null
  signature_rp: string | null
  signature_dc: string | null
  signature_de: string | null
  signature_rejected_by: string | null
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
  mission_category?: MissionPersonnelCategory
  mission_zone?: MissionZone
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

// New Requirements — Exceptional Leave Types
export interface ExceptionalLeaveType {
  id: number
  company_id: number | null
  name: string
  description: string | null
  days_granted: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ExceptionalLeaveClaim {
  id: number
  user_id: string
  exceptional_leave_type_id: number | null
  autre_type_name: string | null
  claim_date: string
  start_date: string | null
  end_date: string | null
  days_count: number | null
  days_granted: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ExceptionalLeaveClaimWithRelations extends ExceptionalLeaveClaim {
  user?: Utilisateur
  exceptional_leave_type?: ExceptionalLeaveType
}

export interface SickLeave {
  id: number
  user_id: string
  start_date: string
  end_date: string
  days_count: number
  reason: string | null
  certificate_url: string | null
  year: number
  created_at: string
  updated_at: string
}

export interface SickLeaveWithRelations extends SickLeave {
  user?: Utilisateur
}

// ─── Unified Balance (from get_employee_balance RPC) ─────────

export interface EmployeeBalanceLot {
  id: number
  remaining_days: number
  days: number
  year_acquired: number
  expires_at: string
  is_expiring_soon: boolean
}

export interface EmployeeBalance {
  user_id: string
  full_name: string
  hire_date: string | null
  date_anciennete: string | null
  department_id: number | null
  // Seniority
  seniority_date: string
  years_of_service: number
  seniority_periods: number
  base_days: number
  bonus_days: number
  annual_entitlement: number
  entitlement_source: 'employee' | 'department' | 'default'
  // Accrual
  carry_over: number
  current_month: number
  monthly_rate: number
  cumulative_earned: number
  days_used: number
  days_pending: number
  available_now: number
  is_max_reached: boolean
  max_balance: number
  // Recovery
  balance_recuperation: number
  recup_used: number
  recup_pending: number
  available_recup: number
  recovery_lots: EmployeeBalanceLot[]
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Calendar, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, Sun, RotateCcw, UserRoundSearch, MessageSquareText, ClipboardCheck, Users, Search, Briefcase, MapPin, Car, UserCheck, Globe, Home, FileText, Clock, Minus, Plus, Heart, Gift } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Utilisateur, Holiday, WorkingDays, MissionScope, RecoveryBalanceLot, LeaveSegment } from '@/lib/types/database'
import { TRANSPORT_OPTIONS, HALF_DAY_LABELS, MAX_CONSECUTIVE_RECOVERY_DAYS } from '@/lib/constants'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  countWorkingDays as countWorkingDaysUtil,
  enumerateWorkingDays,
  fetchHolidays,
  fetchWorkingDays,
  getHolidaysInRange,
  nextWorkingDay,
  calculateMonthlyAccrual,
  calculateSeniority,
  roundHalf,
  validateSegments,
} from '@/lib/leave-utils'
import { SignatureDialog } from '@/components/signature-dialog'

type EmployeeOption = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'balance_conge' | 'balance_recuperation' | 'hire_date' | 'department_id'> & {
  dept_annual_leave_days?: number
}
type Colleague = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'department_id'>
type Tab = 'conge' | 'exceptionnel' | 'maladie' | 'mission'

type ExceptionalLeaveType = {
  id: string
  name: string
  days_granted: number
}

const TOTAL_STEPS = 4

const steps = [
  { number: 1, label: 'Demande', description: 'Employe et soldes' },
  { number: 2, label: 'Segments', description: 'Periodes et types' },
  { number: 3, label: 'Details', description: 'Infos complementaires' },
  { number: 4, label: 'Resume', description: 'Verification et envoi' },
]

export default function NewRequestPage() {
  const searchParams = useSearchParams()
  const { user } = useCurrentUser()
  const { activeCompany, isHome } = useCompanyContext()
  const { can, canSee, effectiveRole } = usePermissions(user?.role || 'EMPLOYEE')
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('tab') === 'mission' && canSee('missions') ? 'mission' : 'conge'
  )
  const [currentStep, setCurrentStep] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startHalfDay, setStartHalfDay] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL')
  const [endHalfDay, setEndHalfDay] = useState<'FULL' | 'MORNING' | 'AFTERNOON'>('FULL')
  const [reason, setReason] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Signature dialog state
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [pendingSignatureDataUrl, setPendingSignatureDataUrl] = useState<string | null>(null)

  // On-behalf-of state
  const [onBehalfOfId, setOnBehalfOfId] = useState<string>('')
  const [employeeSearch, setEmployeeSearch] = useState('')

  // --- Mission form state ---
  const [isAssigning, setIsAssigning] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [missionScope, setMissionScope] = useState<MissionScope>('LOCAL')
  const [departureCity, setDepartureCity] = useState('')
  const [arrivalCity, setArrivalCity] = useState('')
  const [missionObject, setMissionObject] = useState('')
  const [missionStartDate, setMissionStartDate] = useState('')
  const [missionEndDate, setMissionEndDate] = useState('')
  const [transportType, setTransportType] = useState('')
  const [transportDetails, setTransportDetails] = useState('')
  const [missionReplacementId, setMissionReplacementId] = useState('')
  const [missionComments, setMissionComments] = useState('')
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [isSubmittingMission, setIsSubmittingMission] = useState(false)

  // --- Conge Exceptionnel form state ---
  const [exceptionalTypes, setExceptionalTypes] = useState<ExceptionalLeaveType[]>([])
  const [selectedExceptionalTypeId, setSelectedExceptionalTypeId] = useState('')
  const [isAutreType, setIsAutreType] = useState(false)
  const [autreTypeName, setAutreTypeName] = useState('')
  const [exceptionalStartDate, setExceptionalStartDate] = useState('')
  const [exceptionalEndDate, setExceptionalEndDate] = useState('')
  const [exceptionalNotes, setExceptionalNotes] = useState('')
  const [isSubmittingExceptionnel, setIsSubmittingExceptionnel] = useState(false)

  // --- Maladie form state ---
  const [maladieStartDate, setMaladieStartDate] = useState('')
  const [maladieEndDate, setMaladieEndDate] = useState('')
  const [maladieReason, setMaladieReason] = useState('')
  const [maladieCertificateUrl, setMaladieCertificateUrl] = useState('')
  const [maladieCertificateFile, setMaladieCertificateFile] = useState<File | null>(null)
  const [isUploadingCertificate, setIsUploadingCertificate] = useState(false)
  const [maladieSickDaysUsed, setMaladieSickDaysUsed] = useState(0)
  const [isSubmittingMaladie, setIsSubmittingMaladie] = useState(false)

  // Holiday-aware day counting
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [workingDaysConfig, setWorkingDaysConfig] = useState<WorkingDays>({
    id: 0, company_id: null, category_id: null, department_id: null,
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
    monday_morning: true, monday_afternoon: true,
    tuesday_morning: true, tuesday_afternoon: true,
    wednesday_morning: true, wednesday_afternoon: true,
    thursday_morning: true, thursday_afternoon: true,
    friday_morning: true, friday_afternoon: true,
    saturday_morning: true, saturday_afternoon: true,
    sunday_morning: false, sunday_afternoon: false,
  })

  // Monthly accrual: track used/pending days for the target employee
  const [congeUsedDays, setCongeUsedDays] = useState(0)
  const [congePendingDays, setCongePendingDays] = useState(0)
  const [recupUsedDays, setRecupUsedDays] = useState(0)
  const [recupPendingDays, setRecupPendingDays] = useState(0)

  // Recovery/Congé split (legacy — now derived from segments)
  const [recupDaysToUse, setRecupDaysToUse] = useState(0)
  const [recoveryLots, setRecoveryLots] = useState<RecoveryBalanceLot[]>([])

  // Segment builder state
  const [segments, setSegments] = useState<LeaveSegment[]>([])

  // Derogation: allow submit when balance is insufficient (CPA override)
  const [isDerogation, setIsDerogation] = useState(false)
  const [showDerogationDialog, setShowDerogationDialog] = useState(false)

  // Department annual leave days for current user (for self-service requests)
  const [userDeptDays, setUserDeptDays] = useState<number | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const isManager = can('requests.createOnBehalf')

  // The target employee for the request (self or selected employee)
  const targetEmployee = useMemo((): EmployeeOption | null => {
    if (onBehalfOfId) {
      return employees.find(e => e.id === onBehalfOfId) || null
    }
    if (user) {
      return {
        id: user.id,
        full_name: user.full_name,
        job_title: user.job_title,
        balance_conge: user.balance_conge,
        balance_recuperation: user.balance_recuperation,
        hire_date: user.hire_date,
        department_id: user.department_id,
        dept_annual_leave_days: userDeptDays ?? undefined,
      }
    }
    return null
  }, [user, onBehalfOfId, employees])

  const isOnBehalf = !!onBehalfOfId && onBehalfOfId !== user?.id

  useEffect(() => {
    if (user) {
      loadEmployees(user)
      loadColleagues(user.department_id)
      // Use active company for holidays/working days (not home company)
      const companyId = activeCompany?.id || user.company_id || undefined
      fetchHolidays(companyId).then(setHolidays)
      // Fetch working days for user's department (re-fetched when on-behalf target changes)
      fetchWorkingDays(companyId, user.department_id ?? undefined).then(setWorkingDaysConfig)
      // Fetch dept annual_leave_days for self-service
      if (user.department_id) {
        supabase.from('departments').select('annual_leave_days').eq('id', user.department_id).single()
          .then(({ data }) => { if (data) setUserDeptDays(data.annual_leave_days) })
      }
    }
  }, [user, activeCompany?.id])

  // Block self-service when on a non-home company (balances live at home company only)
  useEffect(() => {
    if (!isHome && !onBehalfOfId) {
      setOnBehalfOfId('_selecting')
    }
  }, [isHome])

  // Re-fetch working days when target employee changes (on-behalf selection)
  useEffect(() => {
    if (!user) return
    const companyId = activeCompany?.id || user.company_id || undefined
    const deptId = targetEmployee?.department_id ?? user.department_id ?? undefined
    fetchWorkingDays(companyId, deptId).then(setWorkingDaysConfig)
  }, [targetEmployee?.department_id])

  // Fetch exceptional leave types for current company
  useEffect(() => {
    if (!activeCompany?.id) return
    const fetchExceptionalTypes = async () => {
      const { data, error } = await supabase
        .from('exceptional_leave_types')
        .select('id, name, days_granted')
        .eq('company_id', activeCompany.id)
        .order('name')
      if (!error && data) setExceptionalTypes(data as ExceptionalLeaveType[])
    }
    fetchExceptionalTypes()
  }, [activeCompany?.id])

  // Fetch sick days used this year for current user
  useEffect(() => {
    if (!user) return
    const currentYear = new Date().getFullYear()
    const fetchSickDays = async () => {
      const { data, error } = await supabase
        .from('sick_leaves')
        .select('days_count')
        .eq('user_id', user.id)
        .eq('year', currentYear)
      if (!error && data) {
        setMaladieSickDaysUsed(data.reduce((sum, r) => sum + (r.days_count || 0), 0))
      }
    }
    fetchSickDays()
  }, [user?.id])

  // Fetch used/pending CONGE days + recovery lots for the target employee
  useEffect(() => {
    if (!targetEmployee) return
    const currentYear = new Date().getFullYear()
    const fetchUsage = async () => {
      const [{ data: usedData }, { data: pendingData }, { data: lotsData }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('days_count, balance_conge_used, balance_recuperation_used, request_type')
          .eq('user_id', targetEmployee.id)
          .eq('status', 'APPROVED')
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`),
        supabase
          .from('leave_requests')
          .select('days_count, balance_conge_used, balance_recuperation_used, request_type')
          .eq('user_id', targetEmployee.id)
          .in('status', ['PENDING', 'VALIDATED_RP', 'VALIDATED_DC'])
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`),
        supabase
          .from('recovery_balance_lots')
          .select('*')
          .eq('user_id', targetEmployee.id)
          .eq('expired', false)
          .gt('remaining_days', 0)
          .order('expires_at', { ascending: true }),
      ])
      // Use balance_conge_used / balance_recuperation_used (the actual split) for mixed requests
      setCongeUsedDays((usedData || []).reduce((sum, r) => sum + (r.balance_conge_used ?? (r.request_type === 'CONGE' ? r.days_count : 0) ?? 0), 0))
      setCongePendingDays((pendingData || []).reduce((sum, r) => sum + (r.balance_conge_used ?? (r.request_type === 'CONGE' ? r.days_count : 0) ?? 0), 0))
      setRecupUsedDays((usedData || []).reduce((sum, r) => sum + (r.balance_recuperation_used ?? (r.request_type === 'RECUPERATION' ? r.days_count : 0) ?? 0), 0))
      setRecupPendingDays((pendingData || []).reduce((sum, r) => sum + (r.balance_recuperation_used ?? (r.request_type === 'RECUPERATION' ? r.days_count : 0) ?? 0), 0))
      setRecoveryLots((lotsData || []) as RecoveryBalanceLot[])
    }
    fetchUsage()
  }, [targetEmployee?.id])

  const loadEmployees = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, balance_conge, balance_recuperation, department_id, hire_date, departments(annual_leave_days)')
        .eq('is_active', true)
        .order('full_name')

      // Filter by active company
      if (activeCompany?.id) {
        query = query.eq('company_id', activeCompany.id)
      }

      // CHEF_SERVICE can only create on behalf of their department
      if (effectiveRole === 'CHEF_SERVICE' && userData.department_id) {
        query = query.eq('department_id', userData.department_id)
      }

      const { data, error } = await query
      if (error) throw error
      const normalized = (data || []).map((row: Record<string, unknown>) => {
        const dept = Array.isArray(row.departments) ? row.departments[0] : row.departments
        return { ...row, dept_annual_leave_days: (dept as { annual_leave_days?: number })?.annual_leave_days ?? undefined }
      }) as EmployeeOption[]
      setEmployees(normalized)
    } catch (error) {
      console.error('Error loading employees:', error)
    }
  }

  const loadColleagues = async (departmentId: number | null) => {
    if (!departmentId) return
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, department_id')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      setColleagues(data || [])
    } catch {
      // silent
    }
  }

  // Computed values for new tabs
  const selectedExceptionalType = exceptionalTypes.find(t => String(t.id) === selectedExceptionalTypeId)
  const exceptionalWorkingDays = countWorkingDaysUtil(exceptionalStartDate, exceptionalEndDate, workingDaysConfig, holidays)
  const exceptionalGrantedDays = selectedExceptionalType?.days_granted ?? 3
  const maladieWorkingDays = countWorkingDaysUtil(maladieStartDate, maladieEndDate, workingDaysConfig, holidays)
  const maladieSickDaysRemaining = 3 - maladieSickDaysUsed
  const maladieWouldExceed = maladieWorkingDays + maladieSickDaysUsed > 3

  const handleExceptionnelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!isAutreType && (!selectedExceptionalTypeId || !selectedExceptionalType)) return
    if (isAutreType && !autreTypeName.trim()) { toast.error('Veuillez preciser le type de conge'); return }
    if (!exceptionalStartDate || !exceptionalEndDate) { toast.error('Veuillez selectionner les dates'); return }
    if (exceptionalWorkingDays <= 0) { toast.error('La periode selectionnee ne contient aucun jour ouvre'); return }
    if (exceptionalWorkingDays > exceptionalGrantedDays) { toast.error(`Le conge exceptionnel est limite a ${exceptionalGrantedDays} jours maximum`); return }
    setIsSubmittingExceptionnel(true)
    try {
      const notesParts: string[] = []
      if (exceptionalNotes.trim()) notesParts.push(exceptionalNotes.trim())

      const { error } = await supabase
        .from('exceptional_leave_claims')
        .insert({
          user_id: user.id,
          exceptional_leave_type_id: isAutreType ? null : Number(selectedExceptionalTypeId),
          autre_type_name: isAutreType ? autreTypeName.trim() : null,
          start_date: exceptionalStartDate,
          end_date: exceptionalEndDate,
          days_count: exceptionalWorkingDays,
          days_granted: Math.min(exceptionalWorkingDays, exceptionalGrantedDays),
          notes: notesParts.join(' | ') || null,
          claim_date: exceptionalStartDate,
        })
      if (error) throw error

      toast.success('Demande de conge exceptionnel soumise avec succes !')
      setSelectedExceptionalTypeId('')
      setIsAutreType(false)
      setAutreTypeName('')
      setExceptionalStartDate('')
      setExceptionalEndDate('')
      setExceptionalNotes('')
    } catch (error) {
      console.error('Error submitting exceptional leave:', error)
      toast.error('Erreur lors de la soumission de la demande')
    } finally {
      setIsSubmittingExceptionnel(false)
    }
  }

  const handleCertificateUpload = async (file: File): Promise<string | null> => {
    if (!user) return null
    setIsUploadingCertificate(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'webp']
      if (!allowed.includes(ext)) {
        toast.error('Format non supporte. Utilisez PDF, PNG, JPG ou WEBP.')
        return null
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Le fichier ne doit pas depasser 5 Mo.')
        return null
      }
      const fileName = `sick-certificates/${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: false })
      if (error) throw error
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      return `${supabaseUrl}/storage/v1/object/public/documents/${fileName}`
    } catch (err) {
      console.error('Certificate upload error:', err)
      toast.error('Erreur lors du telechargement du certificat')
      return null
    } finally {
      setIsUploadingCertificate(false)
    }
  }

  const handleMaladieSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (maladieWorkingDays <= 0) { toast.error('La date de fin doit etre apres la date de debut'); return }
    if (maladieWouldExceed) { toast.error('Vous depasseriez le quota de 3 jours maladie par an'); return }
    setIsSubmittingMaladie(true)
    try {
      // Upload certificate file if provided
      let certificateUrl = maladieCertificateUrl.trim() || null
      if (maladieCertificateFile) {
        const uploadedUrl = await handleCertificateUpload(maladieCertificateFile)
        if (uploadedUrl) certificateUrl = uploadedUrl
      }

      const currentYear = new Date().getFullYear()
      const { error } = await supabase
        .from('sick_leaves')
        .insert({
          user_id: user.id,
          start_date: maladieStartDate,
          end_date: maladieEndDate,
          days_count: maladieWorkingDays,
          reason: maladieReason.trim() || null,
          certificate_url: certificateUrl,
          year: currentYear,
        })
      if (error) throw error
      toast.success('Demande de conge maladie soumise avec succes !')
      setMaladieStartDate('')
      setMaladieEndDate('')
      setMaladieReason('')
      setMaladieCertificateUrl('')
      setMaladieCertificateFile(null)
      setMaladieSickDaysUsed(prev => prev + maladieWorkingDays)
    } catch (error) {
      console.error('Error submitting sick leave:', error)
      toast.error('Erreur lors de la soumission de la demande')
    } finally {
      setIsSubmittingMaladie(false)
    }
  }

  const missionWorkingDays = countWorkingDaysUtil(missionStartDate, missionEndDate, workingDaysConfig, holidays)

  const handleMissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!departureCity.trim()) { toast.error('Veuillez indiquer la ville de départ'); return }
    if (!arrivalCity.trim()) { toast.error("Veuillez indiquer la ville d'arrivée"); return }
    if (!missionObject.trim()) { toast.error("Veuillez indiquer l'objet de la mission"); return }
    if (missionWorkingDays <= 0) { toast.error('La date de fin doit être après la date de début'); return }
    if (isAssigning && !selectedEmployeeId) { toast.error("Veuillez sélectionner l'employé"); return }
    setIsSubmittingMission(true)
    try {
      const missionUserId = isAssigning ? selectedEmployeeId : user.id
      const { error } = await supabase
        .from('mission_requests')
        .insert({
          user_id: missionUserId,
          assigned_by: isAssigning ? user.id : null,
          request_origin: isAssigning ? 'ASSIGNED' : 'SELF',
          mission_scope: missionScope,
          departure_city: departureCity.trim(),
          arrival_city: arrivalCity.trim(),
          mission_object: missionObject.trim(),
          start_date: missionStartDate,
          end_date: missionEndDate,
          days_count: missionWorkingDays,
          transport_type: transportType || null,
          transport_details: transportDetails.trim() || null,
          replacement_user_id: missionReplacementId || null,
          comments: missionComments.trim() || null,
          // Status is computed by the DB trigger based on creator's role.
          // Do NOT send status — the trigger overrides it.
        })
        .select()
        .single()
      if (error) throw error
      toast.success(isAssigning ? 'Ordre de mission assigné avec succès !' : 'Demande de mission soumise avec succès !')
      router.push('/dashboard/missions')
    } catch (error) {
      console.error('Error submitting mission:', error)
      toast.error("Erreur lors de la soumission de l'ordre de mission")
    } finally {
      setIsSubmittingMission(false)
    }
  }

  const workingDays = countWorkingDaysUtil(startDate, endDate, workingDaysConfig, holidays, startHalfDay, endHalfDay)

  // Segment-derived computed values
  const totalWorkingDays = useMemo(() => segments.reduce((s, seg) => s + seg.workingDays, 0), [segments])
  const totalRecupDays = useMemo(() => segments.filter(s => s.type === 'RECUPERATION').reduce((s, seg) => s + seg.workingDays, 0), [segments])
  const totalCongeDays = useMemo(() => segments.filter(s => s.type === 'CONGE').reduce((s, seg) => s + seg.workingDays, 0), [segments])
  const segmentErrors = useMemo(() => validateSegments(segments), [segments])
  const allSegmentsValid = segments.length > 0 && segments.every(s => s.workingDays > 0 && s.startDate && s.endDate) && segmentErrors.length === 0

  // Monthly accrual for CONGE: available = carry_over + (entitlement/12 * month) - used - pending
  const congeAccrual = useMemo(() => {
    const deptDays = targetEmployee?.dept_annual_leave_days
    const seniority = calculateSeniority(targetEmployee?.hire_date ?? null, deptDays)
    const annualEntitlement = seniority.totalEntitlement
    const carryOver = targetEmployee?.balance_conge || 0
    return calculateMonthlyAccrual(annualEntitlement, carryOver, congeUsedDays, congePendingDays)
  }, [targetEmployee?.balance_conge, targetEmployee?.hire_date, targetEmployee?.dept_annual_leave_days, congeUsedDays, congePendingDays])

  // Available récup = stored balance - pending récup requests (mirrors congé behavior)
  const availableRecup = roundHalf(Math.max((targetEmployee?.balance_recuperation || 0) - recupPendingDays, 0))
  const availableConge = congeAccrual.availableNow

  // Max recovery days in a single request: 5 or available, whichever is less
  const maxRecupForRequest = Math.min(MAX_CONSECUTIVE_RECOVERY_DAYS, availableRecup, workingDays)

  // Auto-suggest: use recovery first (they expire), then congé
  useEffect(() => {
    if (workingDays > 0) {
      setRecupDaysToUse(Math.min(maxRecupForRequest, workingDays))
    } else {
      setRecupDaysToUse(0)
    }
  }, [workingDays, maxRecupForRequest])

  const congeDaysToUse = Math.max(workingDays - recupDaysToUse, 0)
  const totalAvailable = availableConge + Math.min(availableRecup, MAX_CONSECUTIVE_RECOVERY_DAYS)
  const balanceOkNatural = congeDaysToUse <= availableConge && recupDaysToUse <= availableRecup
  const balanceOk = balanceOkNatural || isDerogation
  const congeInsufficient = congeDaysToUse > availableConge
  const balanceAfterConge = roundHalf(availableConge - congeDaysToUse)
  const balanceAfterRecup = roundHalf(availableRecup - recupDaysToUse)

  // Nearest recovery expiration
  const nearestExpiration = recoveryLots.length > 0 ? recoveryLots[0].expires_at : null

  // Balance checks derived from segments
  const segBalanceOkNatural = totalCongeDays <= availableConge && totalRecupDays <= availableRecup
  const segBalanceOk = segBalanceOkNatural || isDerogation
  const segCongeInsufficient = totalCongeDays > availableConge
  const segBalanceAfterConge = roundHalf(availableConge - totalCongeDays)
  const segBalanceAfterRecup = roundHalf(availableRecup - totalRecupDays)

  const canProceedToNext = (): boolean => {
    switch (currentStep) {
      case 1:
        // Step 1: just needs a target employee (self or on-behalf selected)
        if (onBehalfOfId === '_selecting') return false
        return true
      case 2:
        // Step 2 (segments): at least 1 valid segment, balance ok, no validation errors
        if (!allSegmentsValid) return false
        if (!segBalanceOkNatural && !isDerogation && segCongeInsufficient) return false
        return segBalanceOk
      case 3:
        return true
      case 4:
        return segBalanceOk && totalWorkingDays > 0
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canProceedToNext() && currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSubmit = async (e?: React.FormEvent, employeeSignature?: string) => {
    if (e) e.preventDefault()

    if (!user || !targetEmployee) return
    if (segments.length === 0 || totalWorkingDays <= 0) {
      toast.error('Ajoutez au moins un segment de dates')
      return
    }
    if (!segBalanceOk && !isDerogation) {
      toast.error('Solde insuffisant. Veuillez ajuster la repartition ou les dates.')
      return
    }
    if (segmentErrors.length > 0) {
      toast.error(segmentErrors[0])
      return
    }

    setIsSubmitting(true)

    try {
      const firstSeg = segments[0]
      const lastSeg = segments[segments.length - 1]
      const overallStart = firstSeg.startDate
      const overallEnd = lastSeg.endDate
      const returnDate = nextWorkingDay(addDays(new Date(overallEnd), 1), workingDaysConfig, holidays)
      const targetUserId = targetEmployee.id
      const isMixed = totalRecupDays > 0 && totalCongeDays > 0
      const requestType = totalCongeDays > 0 ? 'CONGE' : 'RECUPERATION'

      const { data: insertedRequest, error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: targetUserId,
          request_type: requestType,
          start_date: overallStart,
          end_date: overallEnd,
          start_half_day: firstSeg.startHalfDay,
          end_half_day: lastSeg.endHalfDay,
          days_count: totalWorkingDays,
          return_date: format(returnDate, 'yyyy-MM-dd'),
          replacement_user_id: replacementId || null,
          reason: reason || null,
          is_mixed: isMixed,
          balance_before: availableConge,
          balance_conge_used: totalCongeDays,
          balance_recuperation_used: totalRecupDays,
          is_derogation: isDerogation,
          signature_employee: employeeSignature || pendingSignatureDataUrl || null,
        })
        .select()
        .single()

      if (error) throw error

      // Insert leave_request_details (per-day breakdown)
      if (insertedRequest) {
        const detailRows = segments.flatMap(seg => {
          const days = enumerateWorkingDays(seg.startDate, seg.endDate, workingDaysConfig, holidays, seg.startHalfDay, seg.endHalfDay)
          return days.map(d => ({
            request_id: insertedRequest.id,
            date: d.date,
            type: seg.type,
            half_day: 'FULL' as const,
          }))
        })
        if (detailRows.length > 0) {
          await supabase.from('leave_request_details').insert(detailRows)
        }
      }

      const wasAutoApproved = insertedRequest?.status === 'APPROVED'

      // If created on behalf of someone, notify that employee
      if (isOnBehalf && insertedRequest) {
        const parts = []
        if (totalCongeDays > 0) parts.push(`${totalCongeDays}j conge`)
        if (totalRecupDays > 0) parts.push(`${totalRecupDays}j recuperation`)
        const typeLabel = parts.join(' + ')
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          title: wasAutoApproved ? 'Demande approuvee automatiquement' : 'Nouvelle demande creee pour vous',
          message: `${user.full_name} a cree une demande de ${typeLabel} du ${format(new Date(overallStart), 'dd/MM/yyyy')} au ${format(new Date(overallEnd), 'dd/MM/yyyy')} (${totalWorkingDays} jours) en votre nom.${wasAutoApproved ? ' La demande a ete approuvee automatiquement.' : ''}`,
          type: 'LEAVE_CREATED',
          related_request_id: insertedRequest.id,
          is_read: false,
        })
      }

      if (wasAutoApproved) {
        toast.success('Demande approuvee automatiquement !')
      } else {
        toast.success(
          isOnBehalf
            ? `Demande creee pour ${targetEmployee.full_name} avec succes !`
            : 'Demande de conge soumise avec succes !'
        )
      }
      router.push(wasAutoApproved ? '/dashboard/requests' : isOnBehalf ? '/dashboard/validations' : '/dashboard/requests')
    } catch (error) {
      console.error('Error submitting request:', error)
      toast.error('Erreur lors de la soumission de la demande')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Signature dialog confirm handler (congé tab only)
  const handleSignatureConfirm = async (signatureDataUrl: string, saveForFuture: boolean) => {
    if (!user) return
    setSignatureLoading(true)
    try {
      // If user wants to save signature for future use, upload to storage
      if (saveForFuture) {
        // Convert data URL to blob for upload
        const res = await fetch(signatureDataUrl)
        const blob = await res.blob()
        const filePath = `signatures/${user.id}.png`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, blob, { upsert: true, contentType: 'image/png' })

        if (uploadError) {
          console.error('Signature upload error:', uploadError)
          toast.error('Erreur lors de la sauvegarde de la signature')
        } else {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/documents/${filePath}`
          // Update user record with saved signature URL
          await supabase
            .from('utilisateurs')
            .update({ signature_file: publicUrl })
            .eq('id', user.id)
        }
      }

      // Store signature and proceed with actual form submission
      setPendingSignatureDataUrl(signatureDataUrl)
      setSignatureDialogOpen(false)
      await handleSubmit(undefined, signatureDataUrl)
    } catch (err) {
      console.error('Signature confirm error:', err)
      toast.error('Erreur lors du traitement de la signature')
    } finally {
      setSignatureLoading(false)
    }
  }

  // Filter employees for on-behalf selector (exclude current user from search)
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.filter(e => e.id !== user?.id)
    const term = employeeSearch.toLowerCase()
    return employees.filter(e =>
      e.id !== user?.id &&
      (e.full_name?.toLowerCase().includes(term) || e.job_title?.toLowerCase().includes(term))
    )
  }, [employees, employeeSearch, user?.id])

  if (!user) return null

  const replacementName = replacementId
    ? employees.find(c => c.id === replacementId)?.full_name
    : null

  const selectedEmployeeName = onBehalfOfId
    ? employees.find(e => e.id === onBehalfOfId)?.full_name
    : null

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Nouvelle demande
        </h1>
        <p className="mt-2 text-muted-foreground">
          {activeTab === 'conge'
            ? `${steps[currentStep - 1].description} — Etape ${currentStep} sur ${TOTAL_STEPS}`
            : activeTab === 'exceptionnel'
            ? 'Demande de conge exceptionnel (naissance, mariage, deces...)'
            : activeTab === 'maladie'
            ? 'Declaration de conge maladie (3 jours/an)'
            : 'Remplissez le formulaire pour soumettre un ordre de mission'}
        </p>

        {/* Tab Bar */}
        <div className="mt-4 flex gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('conge')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'conge'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <FileText className={cn('h-4 w-4 shrink-0', activeTab === 'conge' ? 'text-primary' : '')} />
            <span>Congé / Récupération</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('exceptionnel')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'exceptionnel'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <Gift className={cn('h-4 w-4 shrink-0', activeTab === 'exceptionnel' ? 'text-primary' : '')} />
            <span>Congé Exceptionnel</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('maladie')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'maladie'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <Heart className={cn('h-4 w-4 shrink-0', activeTab === 'maladie' ? 'text-primary' : '')} />
            <span>Maladie</span>
          </button>
          {canSee('missions') && (
          <button
            type="button"
            onClick={() => setActiveTab('mission')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all',
              activeTab === 'mission'
                ? 'bg-background text-foreground shadow-sm border border-border/80'
                : 'text-muted-foreground/70 hover:text-muted-foreground border border-transparent'
            )}
          >
            <Briefcase className={cn('h-4 w-4 shrink-0', activeTab === 'mission' ? 'text-primary' : '')} />
            <span>Ordre de Mission</span>
          </button>
          )}
        </div>
      </div>

      {/* ========== LEAVE TAB ========== */}
      {activeTab === 'conge' && (<>

      {/* On-behalf banner when an employee is selected */}
      {isOnBehalf && targetEmployee && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {targetEmployee.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Demande pour {targetEmployee.full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {targetEmployee.job_title || 'Employe'} — Conge: {congeAccrual.availableNow}j/{congeAccrual.annualEntitlement}j, Recup: {roundHalf(targetEmployee.balance_recuperation)}j
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setOnBehalfOfId(''); setEmployeeSearch('') }}
          >
            Changer
          </Button>
        </div>
      )}

      {/* Progress Stepper */}
      <div className="w-full">
        <div className="flex w-full items-center">
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-1 items-center">
              {/* Line before circle (except first) */}
              {index > 0 && (
                <div className={cn(
                  'h-0.5 flex-1 transition-colors duration-300',
                  currentStep >= step.number ? 'bg-primary' : 'bg-border'
                )} />
              )}
              {/* Circle */}
              <button
                type="button"
                onClick={() => { if (step.number < currentStep) setCurrentStep(step.number) }}
                className={cn(
                  'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs sm:text-sm font-semibold transition-all duration-300',
                  currentStep > step.number
                    ? 'border-primary bg-primary text-primary-foreground cursor-pointer'
                    : currentStep === step.number
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground cursor-default'
                )}
              >
                {currentStep > step.number ? <Check className="h-4 w-4" /> : step.number}
              </button>
              {/* Line after circle (except last) */}
              {index < steps.length - 1 && (
                <div className={cn(
                  'h-0.5 flex-1 transition-colors duration-300',
                  currentStep > step.number ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>
        {/* Labels row */}
        <div className="mt-2 flex w-full">
          {steps.map((step) => (
            <div key={step.number} className="flex-1 text-center">
              <span className={cn(
                'text-[11px] sm:text-xs font-medium',
                currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        {/* Step 1: Period + Balances + On-behalf */}
        {currentStep === 1 && (
          <div key="step-1" className="animate-in fade-in duration-300 space-y-6">
            {/* Non-home, non-manager: show blocking message */}
            {!isHome && !isManager && activeTab === 'conge' && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Votre solde de congé est sur votre société d&apos;origine.</p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Basculez vers votre société d&apos;origine pour créer une demande de congé pour vous-même.</p>
                </div>
              </div>
            )}
            {/* Manager: create on behalf of employee */}
            {isManager && (
              <Card className="border-primary/20 bg-primary/[0.02]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Pour qui est cette demande ?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {!isHome && activeTab === 'conge' && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Votre solde de conge est sur votre societe d&apos;origine. Vous pouvez creer des demandes pour les employes de {activeCompany?.name || 'cette societe'}.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setOnBehalfOfId(''); setEmployeeSearch('') }}
                        disabled={!isHome}
                        className={cn(
                          'rounded-2xl border-2 p-3 sm:p-4 text-left transition-all',
                          !onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30',
                          !isHome && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <p className="font-semibold text-xs sm:text-sm">Pour moi-meme</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Ma propre demande de conge</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnBehalfOfId('_selecting')}
                        className={cn(
                          'rounded-2xl border-2 p-3 sm:p-4 text-left transition-all',
                          onBehalfOfId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/70 hover:border-border hover:bg-accent/30'
                        )}
                      >
                        <p className="font-semibold text-xs sm:text-sm">Pour un employe</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Creer au nom d&apos;un collaborateur</p>
                      </button>
                    </div>

                    {onBehalfOfId && (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                          <Input
                            placeholder="Rechercher un employe..."
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            className="pl-10 h-10"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/60 p-2">
                          {filteredEmployees.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">Aucun employe trouve</p>
                          ) : (
                            filteredEmployees.map(emp => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => { setOnBehalfOfId(emp.id); setEmployeeSearch('') }}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                                  onBehalfOfId === emp.id
                                    ? 'bg-primary/10 border border-primary/25'
                                    : 'hover:bg-muted/60'
                                )}
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {emp.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{emp.full_name}</p>
                                  {emp.job_title && (
                                    <p className="text-[11px] text-muted-foreground truncate">{emp.job_title}</p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[10px] text-muted-foreground">C: {roundHalf(emp.balance_conge)}j</p>
                                  <p className="text-[10px] text-muted-foreground">R: {roundHalf(emp.balance_recuperation)}j</p>
                                </div>
                                {onBehalfOfId === emp.id && (
                                  <Check className="h-4 w-4 shrink-0 text-primary" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Compact balance bar */}
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-foreground">
                  Soldes {isOnBehalf ? `de ${selectedEmployeeName}` : 'disponibles'}
                </p>
              </div>
              <div className="flex gap-3">
                {/* Congé pill — expanded with breakdown */}
                <div className="flex-1 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sun className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs text-muted-foreground">Congé</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">{congeAccrual.availableNow}<span className="text-xs font-normal text-muted-foreground ml-0.5">j disponibles</span></p>
                  {(congeUsedDays > 0 || congePendingDays > 0) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Consommé: {roundHalf(congeUsedDays + congePendingDays)}j
                    </p>
                  )}
                </div>
                {/* Récupération pill */}
                <div className="flex-1 flex items-center gap-2.5 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2.5">
                  <RotateCcw className="h-4 w-4 shrink-0 text-[var(--status-success-text)]" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Recuperation</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-sm font-semibold text-foreground">{availableRecup}j</p>
                      {nearestExpiration && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          exp. {format(new Date(nearestExpiration + 'T00:00:00'), 'dd/MM/yy')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {recoveryLots.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 pl-1">
                  {recoveryLots.map(lot => (
                    <span key={lot.id} className="text-[10px] text-muted-foreground">
                      {roundHalf(lot.remaining_days)}j (acquis {lot.year_acquired}) — exp. {format(new Date(lot.expires_at + 'T00:00:00'), 'dd/MM/yy')}
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Step 2: Segment Builder */}
        {currentStep === 2 && (
          <div key="step-2" className="animate-in fade-in duration-300 space-y-6">
            {/* Balance reminder bar */}
            <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Congé:</span>
                <span className="text-sm font-semibold">{availableConge}j</span>
              </div>
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[var(--status-success-text)]" />
                <span className="text-xs text-muted-foreground">Récup:</span>
                <span className="text-sm font-semibold">{availableRecup}j</span>
              </div>
            </div>

            {/* Segment cards */}
            <div className="space-y-4">
              {segments.map((seg, index) => {
                const segDays = seg.workingDays
                const isRecup = seg.type === 'RECUPERATION'
                const hasError = isRecup && segDays > MAX_CONSECUTIVE_RECOVERY_DAYS
                const prevIsRecup = index > 0 && segments[index - 1].type === 'RECUPERATION'
                const consecutiveError = isRecup && prevIsRecup

                return (
                  <Card key={seg.id} className={cn(
                    'border-border/70 transition-all',
                    hasError || consecutiveError ? 'border-red-300 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20' : ''
                  )}>
                    <CardContent className="pt-5 pb-4 space-y-4">
                      {/* Header: segment number + type toggle + delete */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-muted-foreground">Segment {index + 1}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex rounded-xl border border-border overflow-hidden">
                            {availableRecup > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...segments]
                                updated[index] = { ...seg, type: 'RECUPERATION' }
                                setSegments(updated)
                              }}
                              className={cn(
                                'px-3 py-1.5 text-xs font-medium transition-all',
                                seg.type === 'RECUPERATION'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : 'bg-background text-muted-foreground hover:bg-muted/50'
                              )}
                            >
                              Récup
                            </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...segments]
                                updated[index] = { ...seg, type: 'CONGE' }
                                setSegments(updated)
                              }}
                              className={cn(
                                'px-3 py-1.5 text-xs font-medium transition-all',
                                seg.type === 'CONGE'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-background text-muted-foreground hover:bg-muted/50'
                              )}
                            >
                              Congé
                            </button>
                          </div>
                          {segments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSegments(segments.filter((_, i) => i !== index))}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Date pickers */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Date de début</Label>
                          <DatePicker
                            value={seg.startDate}
                            onChange={(val) => {
                              const updated = [...segments]
                              updated[index] = {
                                ...seg,
                                startDate: val,
                                endDate: seg.endDate && val > seg.endDate ? val : seg.endDate,
                                workingDays: countWorkingDaysUtil(val, seg.endDate && val <= seg.endDate ? seg.endDate : val, workingDaysConfig, holidays, seg.startHalfDay, seg.endHalfDay)
                              }
                              setSegments(updated)
                            }}
                            min={index > 0 && segments[index - 1].endDate
                              ? format(nextWorkingDay(addDays(new Date(segments[index - 1].endDate), 1), workingDaysConfig, holidays), 'yyyy-MM-dd')
                              : format(new Date(), 'yyyy-MM-dd')}
                            placeholder="Début"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Date de fin</Label>
                          <DatePicker
                            value={seg.endDate}
                            onChange={(val) => {
                              const updated = [...segments]
                              updated[index] = {
                                ...seg,
                                endDate: val,
                                workingDays: countWorkingDaysUtil(seg.startDate, val, workingDaysConfig, holidays, seg.startHalfDay, seg.endHalfDay)
                              }
                              setSegments(updated)
                            }}
                            min={seg.startDate || format(new Date(), 'yyyy-MM-dd')}
                            placeholder="Fin"
                          />
                        </div>
                      </div>

                      {/* Half-day selectors */}
                      {seg.startDate && seg.endDate && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Demi-journée début</Label>
                            <div className="flex gap-1">
                              {(['FULL', 'MORNING', 'AFTERNOON'] as const).map(hd => (
                                <button key={hd} type="button"
                                  onClick={() => {
                                    const updated = [...segments]
                                    updated[index] = {
                                      ...seg,
                                      startHalfDay: hd,
                                      workingDays: countWorkingDaysUtil(seg.startDate, seg.endDate, workingDaysConfig, holidays, hd, seg.endHalfDay)
                                    }
                                    setSegments(updated)
                                  }}
                                  className={cn(
                                    'rounded-lg border px-2 py-1 text-[10px] font-medium transition-all',
                                    seg.startHalfDay === hd ? 'border-primary bg-primary/5 text-foreground' : 'border-border/70 text-muted-foreground'
                                  )}
                                >{HALF_DAY_LABELS[hd]}</button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Demi-journée fin</Label>
                            <div className="flex gap-1">
                              {(['FULL', 'MORNING', 'AFTERNOON'] as const).map(hd => (
                                <button key={hd} type="button"
                                  onClick={() => {
                                    const updated = [...segments]
                                    updated[index] = {
                                      ...seg,
                                      endHalfDay: hd,
                                      workingDays: countWorkingDaysUtil(seg.startDate, seg.endDate, workingDaysConfig, holidays, seg.startHalfDay, hd)
                                    }
                                    setSegments(updated)
                                  }}
                                  className={cn(
                                    'rounded-lg border px-2 py-1 text-[10px] font-medium transition-all',
                                    seg.endHalfDay === hd ? 'border-primary bg-primary/5 text-foreground' : 'border-border/70 text-muted-foreground'
                                  )}
                                >{HALF_DAY_LABELS[hd]}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Working days count */}
                      {segDays > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Jours ouvrables</span>
                          <Badge className={cn(
                            'text-xs',
                            isRecup
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700'
                              : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                          )}>
                            {segDays}j {isRecup ? 'récupération' : 'congé'}
                          </Badge>
                        </div>
                      )}

                      {/* Error messages */}
                      {hasError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Maximum {MAX_CONSECUTIVE_RECOVERY_DAYS} jours consécutifs de récupération
                        </div>
                      )}
                      {consecutiveError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Insérez au moins 1 jour de congé entre deux blocs de récupération
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* Add segment button */}
              <button
                type="button"
                onClick={() => {
                  const lastSeg = segments[segments.length - 1]
                  const defaultType: 'CONGE' | 'RECUPERATION' =
                    availableRecup <= 0 ? 'CONGE'
                    : !lastSeg ? 'RECUPERATION'
                    : lastSeg.type === 'RECUPERATION' && lastSeg.workingDays >= MAX_CONSECUTIVE_RECOVERY_DAYS ? 'CONGE'
                    : lastSeg.type === 'CONGE' ? 'RECUPERATION'
                    : 'RECUPERATION'

                  const defaultStart = lastSeg?.endDate
                    ? format(nextWorkingDay(addDays(new Date(lastSeg.endDate), 1), workingDaysConfig, holidays), 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd')

                  setSegments([...segments, {
                    id: crypto.randomUUID(),
                    type: defaultType,
                    startDate: defaultStart,
                    endDate: '',
                    startHalfDay: 'FULL',
                    endHalfDay: 'FULL',
                    workingDays: 0,
                  }])
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 px-4 py-4 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
              >
                <Plus className="h-4 w-4" />
                Ajouter un segment
              </button>
            </div>

            {/* Totals bar */}
            {segments.length > 0 && totalWorkingDays > 0 && (
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Total</span>
                  <span className="text-sm font-bold text-foreground">{totalWorkingDays}j</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Récupération</span>
                    <span className={cn('font-semibold', totalRecupDays > availableRecup ? 'text-red-600' : 'text-emerald-600')}>
                      {totalRecupDays}j (reste {segBalanceAfterRecup}j)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Congé</span>
                    <span className={cn('font-semibold', totalCongeDays > availableConge ? 'text-red-600' : 'text-blue-600')}>
                      {totalCongeDays}j (reste {segBalanceAfterConge}j)
                    </span>
                  </div>
                </div>

                {/* Derogation */}
                {!segBalanceOkNatural && segCongeInsufficient && !isDerogation && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-amber-800">
                          Solde congé insuffisant ({roundHalf(totalCongeDays - availableConge)}j en dépassement)
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Vous pouvez demander une dérogation.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-amber-400 text-amber-800 hover:bg-amber-100 text-xs h-8"
                      onClick={() => setIsDerogation(true)}
                    >
                      Demander une dérogation
                    </Button>
                  </div>
                )}
                {isDerogation && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/50 p-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <p className="text-xs font-medium text-amber-800">Dérogation demandée</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-amber-700" onClick={() => setIsDerogation(false)}>
                      Annuler
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* Step 3: Additional Info */}
        {currentStep === 3 && (
          <div key="step-3" className="animate-in fade-in duration-300 space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundSearch className="h-5 w-5 text-primary" />
                  Remplacant (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="replacement">Selectionnez un collaborateur</Label>
                  <select
                    id="replacement"
                    value={replacementId}
                    onChange={(e) => setReplacementId(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">Aucun remplacant</option>
                    {employees
                      .filter(c => c.id !== (targetEmployee?.id || user.id))
                      .map((colleague) => (
                        <option key={colleague.id} value={colleague.id}>
                          {colleague.full_name} {colleague.job_title && `- ${colleague.job_title}`}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Choisissez la personne qui assurera le remplacement pendant l&apos;absence.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-primary" />
                  Motif (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Indiquez le motif de la demande de conge..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={500}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {reason.length}/500 caracteres
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Summary */}
        {currentStep === 4 && (
          <div key="step-4" className="animate-in fade-in duration-300 space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  Verifiez la demande
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="divide-y divide-border/50">
                  {isOnBehalf && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Demande pour</span>
                      <Badge className="bg-primary/10 text-primary border border-primary/25">
                        {selectedEmployeeName}
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Type de demande</span>
                    <span className="text-sm font-medium text-foreground">
                      {totalRecupDays > 0 && totalCongeDays > 0
                        ? 'Combiné (Congé + Récupération)'
                        : totalRecupDays > 0 ? 'Récupération' : 'Congé annuel'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Période</span>
                    <span className="text-sm font-medium text-foreground">
                      {segments.length > 0
                        ? `${format(new Date(segments[0].startDate), 'dd MMM yyyy', { locale: fr })} → ${format(new Date(segments[segments.length - 1].endDate), 'dd MMM yyyy', { locale: fr })}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Jours ouvrables</span>
                    <span className="text-sm font-semibold text-foreground">{totalWorkingDays} jours</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Date de reprise</span>
                    <span className="text-sm font-medium text-foreground">
                      {segments.length > 0 ? format(nextWorkingDay(addDays(new Date(segments[segments.length - 1].endDate), 1), workingDaysConfig, holidays), 'EEEE dd MMMM yyyy', { locale: fr }) : '—'}
                    </span>
                  </div>

                  {/* Segment breakdown */}
                  <div className="py-3.5 space-y-2">
                    <span className="text-sm text-muted-foreground">Segments</span>
                    <div className="mt-2 space-y-1.5">
                      {segments.map((seg, i) => (
                        <div key={seg.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                            <Badge className={cn(
                              'text-[10px] px-2 py-0',
                              seg.type === 'RECUPERATION'
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-blue-100 text-blue-700 border-blue-200'
                            )}>
                              {seg.type === 'RECUPERATION' ? 'Récup' : 'Congé'}
                            </Badge>
                            <span className="text-xs text-foreground">
                              {format(new Date(seg.startDate), 'dd MMM', { locale: fr })}
                              {seg.startDate !== seg.endDate && ` → ${format(new Date(seg.endDate), 'dd MMM', { locale: fr })}`}
                            </span>
                          </div>
                          <span className="text-xs font-medium">{seg.workingDays}j</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {replacementName && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Remplaçant</span>
                      <span className="text-sm font-medium text-foreground">{replacementName}</span>
                    </div>
                  )}
                  {reason && (
                    <div className="py-3.5">
                      <span className="text-sm text-muted-foreground">Motif</span>
                      <p className="mt-1.5 text-sm text-foreground">{reason}</p>
                    </div>
                  )}
                  {isOnBehalf && (
                    <div className="flex items-center justify-between py-3.5">
                      <span className="text-sm text-muted-foreground">Créé par</span>
                      <span className="text-sm font-medium text-foreground">{user.full_name}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              'border-border/70',
              segBalanceOk ? 'bg-[var(--status-success-bg)]/30' : 'bg-[var(--status-alert-bg)]/30'
            )}>
              <CardHeader>
                <CardTitle className="text-base">Impact sur les soldes {isOnBehalf ? `de ${selectedEmployeeName}` : ''}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Congé section */}
                {totalCongeDays > 0 && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sun className="h-3.5 w-3.5 text-primary" />
                      Congé annuel
                    </div>
                    <div className="flex justify-between text-sm pl-5">
                      <span className="text-muted-foreground">Disponible</span>
                      <span className="font-medium">{availableConge}j</span>
                    </div>
                    <div className="flex justify-between text-sm pl-5">
                      <span className="text-muted-foreground">Jours congé demandés</span>
                      <span className="font-medium">- {totalCongeDays}j</span>
                    </div>
                    <div className="flex justify-between text-sm pl-5 border-t border-border/30 pt-1">
                      <span className="font-medium">Solde congé après</span>
                      <span className={cn('font-bold', segBalanceAfterConge >= 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-alert-text)]')}>
                        {segBalanceAfterConge}j
                      </span>
                    </div>
                  </>
                )}

                {/* Récupération section */}
                {totalRecupDays > 0 && (
                  <>
                    <div className={cn('flex items-center gap-2 text-sm font-medium text-foreground', totalCongeDays > 0 && 'mt-2 pt-3 border-t border-border/50')}>
                      <RotateCcw className="h-3.5 w-3.5 text-[var(--status-success-text)]" />
                      Récupération
                    </div>
                    <div className="flex justify-between text-sm pl-5">
                      <span className="text-muted-foreground">Disponible</span>
                      <span className="font-medium">{availableRecup}j</span>
                    </div>
                    <div className="flex justify-between text-sm pl-5">
                      <span className="text-muted-foreground">Jours récup. demandés</span>
                      <span className="font-medium">- {totalRecupDays}j</span>
                    </div>
                    <div className="flex justify-between text-sm pl-5 border-t border-border/30 pt-1">
                      <span className="font-medium">Solde récup. après</span>
                      <span className={cn('font-bold', segBalanceAfterRecup >= 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-alert-text)]')}>
                        {segBalanceAfterRecup}j
                      </span>
                    </div>
                  </>
                )}

                {/* Total */}
                <div className="flex justify-between border-t border-border/50 pt-3 text-sm">
                  <span className="font-medium text-foreground">Total jours demandés</span>
                  <span className="font-bold text-foreground">{totalWorkingDays}j</span>
                </div>

                {!segBalanceOk && (
                  <div className="status-rejected rounded-2xl border p-3 mt-2">
                    <p className="text-sm font-medium">
                      Solde insuffisant ! Veuillez revenir en arrière et ajuster la répartition.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step Navigation */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={handlePrevious}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Precedent
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
          )}

          {currentStep < TOTAL_STEPS ? (
            <Button
              type="button"
              className="h-11 w-full"
              onClick={handleNext}
              disabled={!canProceedToNext()}
            >
              Suivant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 w-full"
              disabled={isSubmitting || (!segBalanceOkNatural && !isDerogation) || totalWorkingDays <= 0}
              onClick={() => setSignatureDialogOpen(true)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : (
                <span className="text-sm">{isOnBehalf ? `Creer pour ${selectedEmployeeName}` : 'Soumettre la demande'}</span>
              )}
            </Button>
          )}
        </div>
      </form>

      <SignatureDialog
        open={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        onConfirm={handleSignatureConfirm}
        savedSignatureUrl={user.signature_file}
        mode="employee"
        title="Votre signature"
        loading={signatureLoading}
      />

      </>)}

      {/* ========== CONGE EXCEPTIONNEL TAB ========== */}
      {activeTab === 'exceptionnel' && (
        <form onSubmit={handleExceptionnelSubmit} className="space-y-6">
          {/* Type selection */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Type de conge exceptionnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Selectionnez le type *</Label>
                <Select
                  value={isAutreType ? '__autre__' : selectedExceptionalTypeId}
                  onValueChange={(val) => {
                    if (val === '__autre__') {
                      setIsAutreType(true)
                      setSelectedExceptionalTypeId('')
                    } else {
                      setIsAutreType(false)
                      setAutreTypeName('')
                      setSelectedExceptionalTypeId(val)
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="-- Choisir un type --" />
                  </SelectTrigger>
                  <SelectContent>
                    {exceptionalTypes.map(type => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__autre__">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAutreType && (
                <div className="space-y-2">
                  <Label>Precisez le type *</Label>
                  <Input
                    placeholder="Ex: Demenagement, Examen..."
                    value={autreTypeName}
                    onChange={(e) => setAutreTypeName(e.target.value)}
                    maxLength={100}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Date selection */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Periode du conge
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de debut *</Label>
                  <DatePicker
                    value={exceptionalStartDate}
                    onChange={setExceptionalStartDate}
                    placeholder="Date de debut"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin *</Label>
                  <DatePicker
                    value={exceptionalEndDate}
                    onChange={setExceptionalEndDate}
                    min={exceptionalStartDate || undefined}
                    placeholder="Date de fin"
                  />
                </div>
              </div>

              {exceptionalWorkingDays > 0 && (
                <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Jours ouvres demandes</span>
                    <span className={cn('text-sm font-semibold', exceptionalWorkingDays > exceptionalGrantedDays ? 'text-[var(--status-alert-text)]' : 'text-foreground')}>{exceptionalWorkingDays}j</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Maximum autorise</span>
                    <Badge className="bg-primary/10 text-primary border border-primary/25">
                      {exceptionalGrantedDays}j
                    </Badge>
                  </div>
                  {exceptionalWorkingDays > exceptionalGrantedDays && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-700">
                        La duree depasse le maximum de {exceptionalGrantedDays} jours. Reduisez la periode ou soumettez une demande de conge separee pour les jours supplementaires.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
                Notes (Optionnel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Ajoutez des precisions si necessaire..."
                value={exceptionalNotes}
                onChange={(e) => setExceptionalNotes(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {exceptionalNotes.length}/500 caracteres
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => router.back()}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmittingExceptionnel || (!isAutreType && !selectedExceptionalTypeId) || (isAutreType && !autreTypeName.trim()) || !exceptionalStartDate || !exceptionalEndDate || exceptionalWorkingDays <= 0 || exceptionalWorkingDays > exceptionalGrantedDays}
            >
              {isSubmittingExceptionnel ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : (
                <span className="text-sm">Soumettre la demande</span>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* ========== MALADIE TAB ========== */}
      {activeTab === 'maladie' && (
        <form onSubmit={handleMaladieSubmit} className="space-y-6">
          {/* Sick days balance */}
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Solde maladie annuel</p>
              </div>
              <Badge variant={maladieSickDaysRemaining <= 0 ? 'destructive' : 'secondary'}>
                {maladieSickDaysUsed}/3 jours utilises
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  maladieSickDaysUsed >= 3 ? 'bg-destructive' : maladieSickDaysUsed >= 2 ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${Math.min((maladieSickDaysUsed / 3) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {maladieSickDaysRemaining > 0
                ? `${maladieSickDaysRemaining} jour${maladieSickDaysRemaining > 1 ? 's' : ''} restant${maladieSickDaysRemaining > 1 ? 's' : ''}`
                : 'Quota annuel atteint'}
            </p>
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Periode de maladie *
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maladieStartDate">Date de debut</Label>
                  <DatePicker
                    id="maladieStartDate"
                    value={maladieStartDate}
                    onChange={setMaladieStartDate}
                    placeholder="Date de debut"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maladieEndDate">Date de fin</Label>
                  <DatePicker
                    id="maladieEndDate"
                    value={maladieEndDate}
                    onChange={setMaladieEndDate}
                    min={maladieStartDate || undefined}
                    placeholder="Date de fin"
                  />
                </div>
              </div>

              {maladieStartDate && maladieEndDate && maladieWorkingDays > 0 && (
                <div className={cn(
                  'rounded-2xl border p-4',
                  maladieWouldExceed ? 'border-destructive/50 bg-destructive/5' : 'status-progress'
                )}>
                  <div className="flex items-start gap-3">
                    <AlertCircle className={cn('mt-0.5 h-5 w-5 shrink-0', maladieWouldExceed && 'text-destructive')} />
                    <div className="flex-1">
                      <p className={cn('text-sm font-medium', maladieWouldExceed && 'text-destructive')}>
                        Duree: {maladieWorkingDays} jour{maladieWorkingDays > 1 ? 's' : ''} ouvrable{maladieWorkingDays > 1 ? 's' : ''}
                      </p>
                      {maladieWouldExceed && (
                        <p className="mt-1 text-sm text-destructive">
                          Depassement du quota ! ({maladieSickDaysUsed + maladieWorkingDays}/3 jours)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maladieReason">Motif (Optionnel)</Label>
                <Textarea
                  id="maladieReason"
                  placeholder="Decrivez le motif de l'arret maladie..."
                  value={maladieReason}
                  onChange={(e) => setMaladieReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">{maladieReason.length}/500 caracteres</p>
              </div>
              <div className="space-y-2">
                <Label>Certificat medical (Optionnel)</Label>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="maladieCertificateFile"
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors',
                      maladieCertificateFile
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : 'border-border/70 hover:border-foreground/30 hover:bg-secondary/30'
                    )}
                  >
                    {isUploadingCertificate ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : maladieCertificateFile ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700 truncate max-w-[200px]">
                          {maladieCertificateFile.name}
                        </span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.preventDefault(); setMaladieCertificateFile(null) }}
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Cliquez pour joindre un fichier (PDF, PNG, JPG)
                        </span>
                      </>
                    )}
                  </label>
                  <input
                    id="maladieCertificateFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setMaladieCertificateFile(file)
                      e.target.value = ''
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF, PNG, JPG — 5 Mo maximum
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => router.back()}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmittingMaladie || maladieWorkingDays <= 0 || maladieWouldExceed}
            >
              {isSubmittingMaladie ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : (
                <span className="text-sm">Soumettre la demande</span>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* ========== MISSION TAB ========== */}
      {activeTab === 'mission' && (
        <form onSubmit={handleMissionSubmit} className="space-y-6">
          {/* Mode: Self or Assign (managers only) */}
          {isManager && (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Type de demande
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => { setIsAssigning(false); setSelectedEmployeeId('') }}
                    className={cn(
                      'rounded-2xl border-2 p-4 text-left transition-all',
                      !isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="text-left">
                      <div className="text-lg font-semibold">Pour moi-même</div>
                      <div className="mt-1 text-sm text-muted-foreground">Je demande à partir en mission</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAssigning(true)}
                    className={cn(
                      'rounded-2xl border-2 p-4 text-left transition-all',
                      isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30'
                    )}
                  >
                    <div className="text-left">
                      <div className="text-lg font-semibold">Assigner un employé</div>
                      <div className="mt-1 text-sm text-muted-foreground">Envoyer un employé en mission</div>
                    </div>
                  </button>
                </div>
                {isAssigning && (
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="missionEmployee">Sélectionner l&apos;employé *</Label>
                    <select
                      id="missionEmployee"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      required={isAssigning}
                      className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                    >
                      <option value="">-- Choisir un employé --</option>
                      {employees
                        .filter((emp) => emp.id !== user.id)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name}{emp.job_title ? ` — ${emp.job_title}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mission Scope */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Portée de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setMissionScope('LOCAL')}
                  className={cn(
                    'rounded-2xl border-2 p-5 text-left transition-all',
                    missionScope === 'LOCAL'
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-accent/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      missionScope === 'LOCAL' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Home className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">Locale</div>
                      <div className="mt-1 text-sm text-muted-foreground">Mission au Maroc</div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMissionScope('INTERNATIONAL')}
                  className={cn(
                    'rounded-2xl border-2 p-5 text-left transition-all',
                    missionScope === 'INTERNATIONAL'
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-accent/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      missionScope === 'INTERNATIONAL' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Globe className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">Internationale</div>
                      <div className="mt-1 text-sm text-muted-foreground">Mission à l&apos;étranger</div>
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Cities */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Itinéraire *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="departureCity">Ville de départ</Label>
                  <div className="relative">
                    <Input
                      id="departureCity"
                      placeholder={missionScope === 'LOCAL' ? 'Ex: Rabat' : 'Ex: Casablanca'}
                      value={departureCity}
                      onChange={(e) => setDepartureCity(e.target.value)}
                      required
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrivalCity">
                    Ville d&apos;arrivée {missionScope === 'INTERNATIONAL' && '(Pays + Ville)'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="arrivalCity"
                      placeholder={missionScope === 'LOCAL' ? 'Ex: Marrakech, Tanger...' : 'Ex: Paris - France, Dubai - EAU...'}
                      value={arrivalCity}
                      onChange={(e) => setArrivalCity(e.target.value)}
                      required
                      className="pl-10"
                    />
                    <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mission Object */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Objet de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Décrivez l'objectif de la mission..."
                value={missionObject}
                onChange={(e) => setMissionObject(e.target.value)}
                required
                rows={3}
                maxLength={500}
              />
              <p className="mt-2 text-xs text-muted-foreground">{missionObject.length}/500 caractères</p>
            </CardContent>
          </Card>

          {/* Mission Dates */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Période de la mission *
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="missionStartDate">Date de début</Label>
                  <DatePicker
                    id="missionStartDate"
                    value={missionStartDate}
                    onChange={setMissionStartDate}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    placeholder="Date de début"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="missionEndDate">Date de fin</Label>
                  <DatePicker
                    id="missionEndDate"
                    value={missionEndDate}
                    onChange={setMissionEndDate}
                    min={missionStartDate || format(new Date(), 'yyyy-MM-dd')}
                    placeholder="Date de fin"
                  />
                </div>
              </div>
              {missionStartDate && missionEndDate && missionWorkingDays > 0 && (
                <div className="status-progress rounded-2xl border p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Durée: {missionWorkingDays} jour{missionWorkingDays > 1 ? 's' : ''} ouvrable{missionWorkingDays > 1 ? 's' : ''}
                      </p>
                      <p className="mt-1 text-sm">
                        Du {format(new Date(missionStartDate), 'EEEE dd MMMM yyyy', { locale: fr })} au{' '}
                        {format(new Date(missionEndDate), 'EEEE dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transport */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                Moyen de transport
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transportType">Type de transport</Label>
                <select
                  id="transportType"
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                >
                  <option value="">-- Sélectionner --</option>
                  {TRANSPORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {transportType && (
                <div className="space-y-2">
                  <Label htmlFor="transportDetails">
                    Détails du transport
                    {transportType === 'voiture_personnelle' && ' (Immatriculation)'}
                    {transportType === 'voiture_service' && ' (Immatriculation)'}
                    {transportType === 'avion' && ' (N° de vol)'}
                    {transportType === 'train' && ' (N° de train)'}
                  </Label>
                  <Input
                    id="transportDetails"
                    placeholder={transportType.includes('voiture') ? 'Ex: AB-123-CD' : transportType === 'avion' ? 'Ex: AT-530' : 'Précisez...'}
                    value={transportDetails}
                    onChange={(e) => setTransportDetails(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Replacement */}
          {colleagues.length > 0 && (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Intérimaire (Optionnel)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="missionReplacement">Sélectionnez un collègue intérimaire</Label>
                  <select
                    id="missionReplacement"
                    value={missionReplacementId}
                    onChange={(e) => setMissionReplacementId(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">Aucun intérimaire</option>
                    {colleagues
                      .filter((c) => c.id !== user.id && c.id !== selectedEmployeeId)
                      .map((colleague) => (
                        <option key={colleague.id} value={colleague.id}>
                          {colleague.full_name}{colleague.job_title ? ` — ${colleague.job_title}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
                Commentaires (Optionnel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Commentaires supplémentaires..."
                value={missionComments}
                onChange={(e) => setMissionComments(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="mt-2 text-xs text-muted-foreground">{missionComments.length}/500 caractères</p>
            </CardContent>
          </Card>

          {/* Mission Summary */}
          <Card className="border-border/70 bg-secondary/35">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Récapitulatif
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="divide-y divide-border/50">
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="text-sm font-medium text-foreground">Ordre de Mission</span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Portée</span>
                  <span className="text-sm font-medium text-foreground">
                    {missionScope === 'LOCAL' ? 'Locale (Maroc)' : 'Internationale'}
                  </span>
                </div>
                {isAssigning && selectedEmployeeId && (
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Missionnaire</span>
                    <span className="text-sm font-medium text-foreground">
                      {employees.find((e) => e.id === selectedEmployeeId)?.full_name || '—'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Trajet</span>
                  <span className="text-sm font-medium text-foreground">
                    {departureCity && arrivalCity ? `${departureCity} → ${arrivalCity}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Objet</span>
                  <span className="max-w-[60%] truncate text-right text-sm font-medium text-foreground">{missionObject || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm text-muted-foreground">Durée</span>
                  <span className="text-sm font-medium text-foreground">
                    {missionWorkingDays > 0 ? `${missionWorkingDays} jour${missionWorkingDays > 1 ? 's' : ''} ouvrable${missionWorkingDays > 1 ? 's' : ''}` : '—'}
                  </span>
                </div>
                {transportType && (
                  <div className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">Transport</span>
                    <span className="text-sm font-medium text-foreground">
                      {TRANSPORT_OPTIONS.find((t) => t.value === transportType)?.label}
                      {transportDetails ? ` (${transportDetails})` : ''}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => router.back()} disabled={isSubmittingMission}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmittingMission || missionWorkingDays <= 0 || !departureCity || !arrivalCity || !missionObject}
            >
              {isSubmittingMission ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm">Soumission...</span>
                </>
              ) : isAssigning ? (
                <span className="text-sm">Assigner la mission</span>
              ) : (
                <span className="text-sm">Soumettre la demande</span>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

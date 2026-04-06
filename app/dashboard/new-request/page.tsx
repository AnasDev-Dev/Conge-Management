'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import SignaturePadLib from 'signature_pad'
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
import { Utilisateur, Holiday, WorkingDays, MissionScope, RecoveryBalanceLot, LeaveSegment, MissionPersonnelCategory, MissionZone, MissionTariffGridEntry } from '@/lib/types/database'
import { TRANSPORT_OPTIONS, HALF_DAY_LABELS, MAX_CONSECUTIVE_RECOVERY_DAYS, CURRENCY_OPTIONS } from '@/lib/constants'
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
  roundHalf,
  validateSegments,
  MAX_CONGE_BALANCE,
} from '@/lib/leave-utils'
import { SignatureDialog } from '@/components/signature-dialog'
import { useEmployeeBalance, useAllEmployeeBalances } from '@/lib/hooks/use-employee-balance'

type EmployeeOption = Pick<Utilisateur, 'id' | 'full_name' | 'job_title' | 'balance_conge' | 'balance_recuperation' | 'hire_date' | 'department_id' | 'date_anciennete' | 'annual_leave_days'> & {
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
  const [externalPersonName, setExternalPersonName] = useState('')
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
  const [missionStep, setMissionStep] = useState(1)

  // --- Mission expansion state ---
  const [missionCategoryId, setMissionCategoryId] = useState('')
  const [missionZoneId, setMissionZoneId] = useState('')
  const [missionCountry, setMissionCountry] = useState('')
  const [missionVenue, setMissionVenue] = useState('')
  const [missionCurrency, setMissionCurrency] = useState('MAD')
  const [missionPec, setMissionPec] = useState(false)
  const [missionPetitDejIncl, setMissionPetitDejIncl] = useState(false)
  const [nbrPetitDej, setNbrPetitDej] = useState(0)
  const [nbrDej, setNbrDej] = useState(0)
  const [nbrDiner, setNbrDiner] = useState(0)
  const [hotelAmount, setHotelAmount] = useState('')
  const [extraExpenses, setExtraExpenses] = useState<{ label: string; amount: string }[]>([])
  const [missionCategories, setMissionCategories] = useState<MissionPersonnelCategory[]>([])
  const [missionZones, setMissionZones] = useState<MissionZone[]>([])
  const [tariffGrid, setTariffGrid] = useState<MissionTariffGridEntry[]>([])
  // Vehicle details (voiture_personnelle only)
  const [vehicleBrand, setVehicleBrand] = useState('')
  const [vehicleFiscalPower, setVehicleFiscalPower] = useState('')
  const [vehiclePlateRequested, setVehiclePlateRequested] = useState('')
  const [vehicleDateFrom, setVehicleDateFrom] = useState('')
  const [vehicleDateTo, setVehicleDateTo] = useState('')
  const [personsTransported, setPersonsTransported] = useState('')
  const [personsOther, setPersonsOther] = useState('')
  // Mission signature
  const missionCanvasRef = useRef<HTMLCanvasElement>(null)
  const missionPadRef = useRef<SignaturePadLib | null>(null)
  const [missionSignatureEmpty, setMissionSignatureEmpty] = useState(true)

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

  // Recovery/Congé split (legacy — now derived from segments)
  const [recupDaysToUse, setRecupDaysToUse] = useState(0)

  // Segment builder state
  const [segments, setSegments] = useState<LeaveSegment[]>([])

  // Derogation: allow submit when balance is insufficient (CPA override)
  const [isDerogation, setIsDerogation] = useState(false)
  const [showDerogationDialog, setShowDerogationDialog] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  const isManager = can('requests.createOnBehalf')
  const canCreateExceptionalOnBehalf = can('exceptional.createOnBehalf')
  const canCreateMaladieOnBehalf = can('maladie.createOnBehalf')

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
        date_anciennete: user.date_anciennete,
        annual_leave_days: user.annual_leave_days,
        department_id: user.department_id,
      }
    }
    return null
  }, [user, onBehalfOfId, employees])

  const isOnBehalf = !!onBehalfOfId && onBehalfOfId !== user?.id

  // Unified balance from RPC (single source of truth)
  const { balance: bal, refresh: refreshBalance } = useEmployeeBalance(targetEmployee?.id)
  const { balances: allBalances } = useAllEmployeeBalances(activeCompany?.id)

  // Derived values from RPC balance (replaces congeAccrual, availableRecup, recoveryLots)
  const congeAccrual = useMemo(() => ({
    availableNow: bal?.available_now ?? 0,
    annualEntitlement: bal?.annual_entitlement ?? 0,
    carryOver: bal?.carry_over ?? 0,
    cumulativeEarned: bal?.cumulative_earned ?? 0,
    monthlyRate: bal?.monthly_rate ?? 0,
    currentMonth: bal?.current_month ?? (new Date().getMonth() + 1),
    daysUsed: bal?.days_used ?? 0,
    daysPending: bal?.days_pending ?? 0,
    isMaxReached: bal?.is_max_reached ?? false,
  }), [bal])
  const availableRecup = bal?.available_recup ?? 0
  const recoveryLots = bal?.recovery_lots ?? []
  const congeUsedDays = bal?.days_used ?? 0
  const congePendingDays = bal?.days_pending ?? 0
  const recupPendingDays = bal?.recup_pending ?? 0

  useEffect(() => {
    if (user) {
      loadEmployees(user)
      loadColleagues(user.department_id)
      const companyId = activeCompany?.id || user.company_id || undefined
      fetchHolidays(companyId).then(setHolidays)
      fetchWorkingDays(companyId, user.department_id ?? undefined).then(setWorkingDaysConfig)
    }
  }, [user, activeCompany?.id])

  // Load mission config (categories, zones, tariff grid) and auto-resolve user's category
  useEffect(() => {
    if (!user) return
    const cId = activeCompany?.id || user.company_id
    if (!cId) return
    supabase.from('mission_personnel_categories').select('*').eq('company_id', cId).eq('is_active', true).order('sort_order')
      .then(({ data }) => setMissionCategories(data || []))
    supabase.from('mission_zones').select('*').eq('company_id', cId).eq('is_active', true).order('sort_order')
      .then(({ data }) => setMissionZones(data || []))
    supabase.from('mission_tariff_grid').select('*')
      .then(({ data }) => setTariffGrid(data || []))
    // Auto-set category from user's profile
    if (user.mission_category_id) {
      setMissionCategoryId(String(user.mission_category_id))
    }
  }, [user, activeCompany?.id])

  // When creating on-behalf, resolve the target employee's category (skip for external)
  useEffect(() => {
    if (!isAssigning || !selectedEmployeeId || selectedEmployeeId === '_external') return
    supabase.from('utilisateurs').select('mission_category_id').eq('id', selectedEmployeeId).single()
      .then(({ data }) => {
        if (data?.mission_category_id) setMissionCategoryId(String(data.mission_category_id))
        else setMissionCategoryId('')
      })
  }, [isAssigning, selectedEmployeeId])

  // Mission working days + allowance calculation
  const missionWorkingDays = countWorkingDaysUtil(missionStartDate, missionEndDate, workingDaysConfig, holidays)
  // Client formula: duration + 0.5 (travel day half-day bonus)
  // Tariff lookup: try exact match (category+zone), fallback to zone-only (first match for that zone)
  const missionTariff = useMemo(() => {
    if (!missionZoneId) return null
    const zid = parseInt(missionZoneId)
    if (missionCategoryId) {
      const exact = tariffGrid.find(g => g.category_id === parseInt(missionCategoryId) && g.zone_id === zid)
      if (exact) return exact
    }
    // Fallback: first tariff entry for this zone
    return tariffGrid.find(g => g.zone_id === zid) || null
  }, [missionCategoryId, missionZoneId, tariffGrid])

  const { computedDailyAllowance, computedTotalAllowance } = useMemo(() => {
    const dwt = missionWorkingDays > 0 ? missionWorkingDays + 0.5 : 0
    const hn = parseFloat(hotelAmount) || 0
    if (missionScope === 'LOCAL') {
      // LOCAL: dotation = hotel × days (no tariff grid, no PEC)
      const total = hn * dwt
      return { computedDailyAllowance: Math.round(hn * 100) / 100, computedTotalAllowance: Math.round(total * 100) / 100 }
    }
    // Use tariff rates if available, otherwise 0
    const t = missionTariff || { petit_dej: 0, dej: 0, diner: 0, indem_avec_pec: 0, indem_sans_pec: 0 }
    if (!missionPec) {
      // Sans PEC: daily = indem_sans_pec + hotel/night, total = daily × (days + 0.5)
      const daily = t.indem_sans_pec + hn
      const total = daily * dwt
      return { computedDailyAllowance: Math.round(daily * 100) / 100, computedTotalAllowance: Math.round(total * 100) / 100 }
    } else {
      // Avec PEC: total = meals + (hotel + indem_avec_pec) × (days + 0.5)
      const mealsTotal = (t.petit_dej * nbrPetitDej) + (t.dej * nbrDej) + (t.diner * nbrDiner)
      const lodgingTotal = (hn + t.indem_avec_pec) * dwt
      const total = mealsTotal + lodgingTotal
      const daily = dwt > 0 ? total / dwt : 0
      return { computedDailyAllowance: Math.round(daily * 100) / 100, computedTotalAllowance: Math.round(total * 100) / 100 }
    }
  }, [missionTariff, missionPec, missionScope, hotelAmount, nbrPetitDej, nbrDej, nbrDiner, missionWorkingDays])

  const hotelPerNight = parseFloat(hotelAmount) || 0
  const missionDurationWithTravel = missionWorkingDays > 0 ? missionWorkingDays + 0.5 : 0

  // Initialize mission signature pad when step 3 renders
  const initMissionSignaturePad = useCallback(() => {
    if (!missionCanvasRef.current) return
    const canvas = missionCanvasRef.current
    const container = canvas.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 150
    if (missionPadRef.current) {
      missionPadRef.current.off()
      missionPadRef.current.clear()
    }
    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgba(255, 255, 255, 0)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 1.5,
      maxWidth: 3,
    })
    pad.addEventListener('endStroke', () => setMissionSignatureEmpty(pad.isEmpty()))
    missionPadRef.current = pad
    setMissionSignatureEmpty(true)
  }, [])

  useEffect(() => {
    if (activeTab === 'mission' && missionStep === 3) {
      // Small delay to let the canvas render in the DOM
      const t = setTimeout(initMissionSignaturePad, 100)
      return () => clearTimeout(t)
    }
  }, [activeTab, missionStep, initMissionSignaturePad])

  const clearMissionSignature = () => {
    if (missionPadRef.current) {
      missionPadRef.current.clear()
      setMissionSignatureEmpty(true)
    }
  }

  const getMissionSignatureDataUrl = (): string | null => {
    if (!missionPadRef.current || missionPadRef.current.isEmpty()) return null
    return missionPadRef.current.toDataURL('image/png')
  }

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

  // Fetch sick days used this year for target employee
  useEffect(() => {
    if (!targetEmployee) return
    const currentYear = new Date().getFullYear()
    const fetchSickDays = async () => {
      const { data, error } = await supabase
        .from('sick_leaves')
        .select('days_count')
        .eq('user_id', targetEmployee.id)
        .eq('year', currentYear)
      if (!error && data) {
        setMaladieSickDaysUsed(data.reduce((sum, r) => sum + (r.days_count || 0), 0))
      }
    }
    fetchSickDays()
  }, [targetEmployee?.id])

  // Balance is now fetched via useEmployeeBalance(targetEmployee?.id) above

  const loadEmployees = async (userData: Utilisateur) => {
    try {
      let query = supabase
        .from('utilisateurs')
        .select('id, full_name, job_title, balance_conge, balance_recuperation, department_id, hire_date, date_anciennete, annual_leave_days, departments(annual_leave_days)')
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
  const exceptionalGrantedDays = selectedExceptionalType?.days_granted ?? null
  const maladieWorkingDays = countWorkingDaysUtil(maladieStartDate, maladieEndDate, workingDaysConfig, holidays)
  const maladieSickDaysRemaining = 3 - maladieSickDaysUsed
  const maladieWouldExceed = maladieWorkingDays + maladieSickDaysUsed > 3

  const handleExceptionnelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !targetEmployee) return
    if (!isAutreType && (!selectedExceptionalTypeId || !selectedExceptionalType)) return
    if (isAutreType && !autreTypeName.trim()) { toast.error('Veuillez preciser le type de conge'); return }
    if (!exceptionalStartDate || !exceptionalEndDate) { toast.error('Veuillez selectionner les dates'); return }
    if (exceptionalWorkingDays <= 0) { toast.error('La periode selectionnee ne contient aucun jour ouvre'); return }
    setIsSubmittingExceptionnel(true)
    try {
      const notesParts: string[] = []
      if (isOnBehalf) notesParts.push(`Cree par ${user.full_name}`)
      if (exceptionalNotes.trim()) notesParts.push(exceptionalNotes.trim())

      const { error } = await supabase
        .from('exceptional_leave_claims')
        .insert({
          user_id: targetEmployee.id,
          exceptional_leave_type_id: isAutreType ? null : Number(selectedExceptionalTypeId),
          autre_type_name: isAutreType ? autreTypeName.trim() : null,
          start_date: exceptionalStartDate,
          end_date: exceptionalEndDate,
          days_count: exceptionalWorkingDays,
          days_granted: exceptionalWorkingDays,
          notes: notesParts.join(' | ') || null,
          claim_date: exceptionalStartDate,
        })
      if (error) throw error

      toast.success(
        isOnBehalf
          ? `Demande de conge exceptionnel creee pour ${targetEmployee.full_name} avec succes !`
          : 'Demande de conge exceptionnel soumise avec succes !'
      )
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
    if (!user || !targetEmployee) return
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
          user_id: targetEmployee.id,
          start_date: maladieStartDate,
          end_date: maladieEndDate,
          days_count: maladieWorkingDays,
          reason: isOnBehalf
            ? `[Cree par ${user.full_name}] ${maladieReason.trim() || ''}`
            : maladieReason.trim() || null,
          certificate_url: certificateUrl,
          year: currentYear,
        })
      if (error) throw error
      toast.success(
        isOnBehalf
          ? `Demande de conge maladie creee pour ${targetEmployee.full_name} avec succes !`
          : 'Demande de conge maladie soumise avec succes !'
      )
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

  const handleMissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!departureCity.trim()) { toast.error('Veuillez indiquer la ville de départ'); return }
    if (!arrivalCity.trim()) { toast.error("Veuillez indiquer la ville d'arrivée"); return }
    if (!missionObject.trim()) { toast.error("Veuillez indiquer l'objet de la mission"); return }
    if (missionWorkingDays <= 0) { toast.error('La date de fin doit être après la date de début'); return }
    if (isAssigning && !selectedEmployeeId) { toast.error("Veuillez sélectionner l'employé"); return }
    if (isAssigning && selectedEmployeeId === '_external' && !externalPersonName.trim()) { toast.error("Veuillez saisir le nom de la personne"); return }
    setIsSubmittingMission(true)
    try {
      const isExternal = isAssigning && selectedEmployeeId === '_external'
      const missionUserId = isExternal ? user.id : (isAssigning ? selectedEmployeeId : user.id)
      const { error } = await supabase
        .from('mission_requests')
        .insert({
          user_id: missionUserId,
          assigned_by: isAssigning ? user.id : null,
          request_origin: isExternal ? 'EXTERNAL' : (isAssigning ? 'ASSIGNED' : 'SELF'),
          external_person_name: isExternal ? externalPersonName.trim() : null,
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
          // Mission expansion fields
          mission_category_id: missionCategoryId ? parseInt(missionCategoryId) : null,
          mission_zone_id: missionZoneId ? parseInt(missionZoneId) : null,
          country: missionCountry.trim() || null,
          venue: missionVenue.trim() || null,
          currency: missionCurrency || 'MAD',
          pec: missionPec,
          petit_dej_included: missionPetitDejIncl,
          nbr_petit_dej: nbrPetitDej,
          nbr_dej: nbrDej,
          nbr_diner: nbrDiner,
          daily_allowance: computedDailyAllowance,
          total_allowance: computedTotalAllowance,
          hotel_amount: parseFloat(hotelAmount) || 0,
          extra_expenses: extraExpenses.filter(e => e.label.trim() && e.amount).map(e => ({
            label: e.label.trim(), amount: parseFloat(e.amount) || 0,
          })),
          vehicle_brand: transportType === 'voiture_personnelle' ? vehicleBrand.trim() || null : null,
          vehicle_fiscal_power: transportType === 'voiture_personnelle' ? vehicleFiscalPower.trim() || null : null,
          vehicle_plate_requested: transportType === 'voiture_personnelle' ? vehiclePlateRequested.trim() || null : null,
          vehicle_date_from: transportType === 'voiture_personnelle' && vehicleDateFrom ? vehicleDateFrom : null,
          vehicle_date_to: transportType === 'voiture_personnelle' && vehicleDateTo ? vehicleDateTo : null,
          persons_transported: transportType === 'voiture_personnelle' ? personsTransported.trim() || null : null,
          persons_other: personsOther.trim() || null,
          signature_employee: getMissionSignatureDataUrl(),
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
              {targetEmployee.job_title || 'Employe'} — Conge: {congeAccrual.availableNow}j, Recup: {availableRecup}j
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
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {(() => { const eb = allBalances.get(emp.id); return (<>
                                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                      Congé {eb?.available_now ?? 0}j
                                    </span>
                                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                      Récup {eb?.available_recup ?? 0}j
                                    </span>
                                  </>)})()}
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

          {/* On-behalf banner */}
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
                  {targetEmployee.job_title || 'Employe'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => { setOnBehalfOfId('_selecting'); setEmployeeSearch('') }}
              >
                Changer
              </Button>
            </div>
          )}

          {/* Manager: create on behalf of employee */}
          {canCreateExceptionalOnBehalf && !(isOnBehalf && targetEmployee) && (
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Pour qui est cette demande ?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Ma propre demande</p>
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
                              <div className="shrink-0 flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                  Congé {roundHalf(emp.balance_conge)}j
                                </span>
                                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                  Récup {roundHalf(emp.balance_recuperation)}j
                                </span>
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

          {/* Non-home, non-manager: show blocking message */}
          {!isHome && !canCreateExceptionalOnBehalf && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Votre societe d&apos;origine est requise.</p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Basculez vers votre societe d&apos;origine pour creer une demande pour vous-meme.</p>
              </div>
            </div>
          )}

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
                <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Jours ouvres demandes</span>
                    <span className="text-sm font-semibold text-foreground">{exceptionalWorkingDays}j</span>
                  </div>
                  {exceptionalGrantedDays != null && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-muted-foreground">Jours accordes (type)</span>
                      <Badge className="bg-primary/10 text-primary border border-primary/25">
                        {exceptionalGrantedDays}j
                      </Badge>
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
              disabled={isSubmittingExceptionnel || (!isAutreType && !selectedExceptionalTypeId) || (isAutreType && !autreTypeName.trim()) || !exceptionalStartDate || !exceptionalEndDate || exceptionalWorkingDays <= 0}
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

          {/* On-behalf banner */}
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
                  {targetEmployee.job_title || 'Employe'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => { setOnBehalfOfId('_selecting'); setEmployeeSearch('') }}
              >
                Changer
              </Button>
            </div>
          )}

          {/* Manager: create on behalf of employee */}
          {canCreateMaladieOnBehalf && !(isOnBehalf && targetEmployee) && (
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Pour qui est cette demande ?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">Ma propre demande</p>
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
                              <div className="shrink-0 flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                  Congé {roundHalf(emp.balance_conge)}j
                                </span>
                                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                  Récup {roundHalf(emp.balance_recuperation)}j
                                </span>
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

          {/* Non-home, non-manager: show blocking message */}
          {!isHome && !canCreateMaladieOnBehalf && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Votre societe d&apos;origine est requise.</p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Basculez vers votre societe d&apos;origine pour creer une demande pour vous-meme.</p>
              </div>
            </div>
          )}

          {/* Sick days balance */}
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  Solde maladie annuel{isOnBehalf && targetEmployee ? ` de ${targetEmployee.full_name}` : ''}
                </p>
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

      {/* ========== MISSION TAB — 3-Step Wizard ========== */}
      {activeTab === 'mission' && (
        <form onSubmit={handleMissionSubmit} className="space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {[
              { n: 1, label: 'Mission' },
              { n: 2, label: 'Détails' },
              { n: 3, label: 'Résumé' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => s.n < missionStep && setMissionStep(s.n)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all',
                    missionStep === s.n
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : missionStep > s.n
                        ? 'bg-primary/20 text-primary cursor-pointer'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {missionStep > s.n ? <Check className="h-4 w-4" /> : s.n}
                </button>
                <span className={cn('hidden text-sm sm:inline', missionStep === s.n ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
                {i < 2 && <div className={cn('h-px w-8 sm:w-12', missionStep > s.n ? 'bg-primary/40' : 'bg-border')} />}
              </div>
            ))}
          </div>

          {/* ═══ STEP 1: Mission info ═══ */}
          {missionStep === 1 && (
            <div className="space-y-5">
              {/* Self or Assign */}
              {isManager && (
                <Card className="border-border/70">
                  <CardContent className="pt-5">
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => { setIsAssigning(false); setSelectedEmployeeId('') }}
                        className={cn('rounded-2xl border-2 p-3 text-left transition-all', !isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30')}>
                        <div className="font-semibold">Pour moi-même</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Je pars en mission</div>
                      </button>
                      <button type="button" onClick={() => setIsAssigning(true)}
                        className={cn('rounded-2xl border-2 p-3 text-left transition-all', isAssigning ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border hover:bg-accent/30')}>
                        <div className="font-semibold">Assigner un employé</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Envoyer un employé en mission</div>
                      </button>
                    </div>
                    {isAssigning && (
                      <div className="mt-3 space-y-2">
                        <select value={selectedEmployeeId} onChange={(e) => { setSelectedEmployeeId(e.target.value); if (e.target.value !== '_external') setExternalPersonName('') }} required={isAssigning}
                          className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60">
                          <option value="">-- Choisir --</option>
                          {employees.filter((emp) => emp.id !== user.id).map((emp) => (
                            <option key={emp.id} value={emp.id}>{emp.full_name}{emp.job_title ? ` — ${emp.job_title}` : ''}</option>
                          ))}
                          <option value="_external">Autre (personne externe)</option>
                        </select>
                        {selectedEmployeeId === '_external' && (
                          <>
                            <Input placeholder="Nom complet de la personne" value={externalPersonName} onChange={e => setExternalPersonName(e.target.value)} required />
                            {missionCategories.length > 0 && (
                              <select
                                value={missionCategoryId}
                                onChange={e => setMissionCategoryId(e.target.value)}
                                className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                              >
                                <option value="">-- Catégorie mission --</option>
                                {missionCategories.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Scope + Cities + Object + Dates + Transport — compact layout */}
              <Card className="border-border/70">
                <CardContent className="space-y-5 pt-5">
                  {/* Scope */}
                  <div>
                    <Label className="mb-2 block text-sm font-medium">Portée de la mission *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setMissionScope('LOCAL')}
                        className={cn('flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all', missionScope === 'LOCAL' ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border')}>
                        <Home className={cn('h-4 w-4', missionScope === 'LOCAL' ? 'text-primary' : 'text-muted-foreground')} />
                        <div><div className="font-semibold text-sm">Locale</div><div className="text-[10px] text-muted-foreground">Mission au Maroc</div></div>
                      </button>
                      <button type="button" onClick={() => setMissionScope('INTERNATIONAL')}
                        className={cn('flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all', missionScope === 'INTERNATIONAL' ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-border')}>
                        <Globe className={cn('h-4 w-4', missionScope === 'INTERNATIONAL' ? 'text-primary' : 'text-muted-foreground')} />
                        <div><div className="font-semibold text-sm">Internationale</div><div className="text-[10px] text-muted-foreground">Mission à l&apos;étranger</div></div>
                      </button>
                    </div>
                  </div>

                  {/* Cities */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Ville de départ *</Label>
                      <div className="relative">
                        <Input placeholder={missionScope === 'LOCAL' ? 'Ex: Rabat' : 'Ex: Casablanca'} value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} required className="pl-9" />
                        <MapPin className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Ville d&apos;arrivée *</Label>
                      <div className="relative">
                        <Input placeholder={missionScope === 'LOCAL' ? 'Ex: Marrakech' : 'Ex: Paris'} value={arrivalCity} onChange={(e) => setArrivalCity(e.target.value)} required className="pl-9" />
                        <MapPin className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
                      </div>
                    </div>
                  </div>

                  {/* Object */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Objet de la mission *</Label>
                    <Textarea placeholder="Décrivez l'objectif de la mission..." value={missionObject} onChange={(e) => setMissionObject(e.target.value)} required rows={2} maxLength={500} />
                    <p className="text-[10px] text-muted-foreground text-right">{missionObject.length}/500</p>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Date de début *</Label>
                      <DatePicker id="missionStartDate" value={missionStartDate} onChange={setMissionStartDate} min={format(new Date(), 'yyyy-MM-dd')} placeholder="Début" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Date de fin *</Label>
                      <DatePicker id="missionEndDate" value={missionEndDate} onChange={setMissionEndDate} min={missionStartDate || format(new Date(), 'yyyy-MM-dd')} placeholder="Fin" />
                    </div>
                  </div>
                  {missionStartDate && missionEndDate && missionWorkingDays > 0 && (
                    <div className="status-progress rounded-xl border px-3 py-2 text-sm">
                      <strong>{missionWorkingDays}</strong> jour{missionWorkingDays > 1 ? 's' : ''} ouvrable{missionWorkingDays > 1 ? 's' : ''} — du {format(new Date(missionStartDate), 'dd MMM', { locale: fr })} au {format(new Date(missionEndDate), 'dd MMM yyyy', { locale: fr })}
                    </div>
                  )}

                  {/* Transport */}
                  <div className="space-y-2">
                    <Label className="text-sm">Transport</Label>
                    <select value={transportType} onChange={(e) => setTransportType(e.target.value)}
                      className="h-10 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/60">
                      <option value="">-- Sélectionner --</option>
                      {TRANSPORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                    {transportType && (
                      <Input placeholder={transportType.includes('voiture') ? 'Immatriculation' : transportType === 'avion' ? 'N° de vol' : 'Précisez...'} value={transportDetails} onChange={(e) => setTransportDetails(e.target.value)} />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Next */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>Annuler</Button>
                <Button type="button" onClick={() => setMissionStep(2)}
                  disabled={!departureCity || !arrivalCity || !missionObject || missionWorkingDays <= 0 || (isAssigning && !selectedEmployeeId)}>
                  Suivant <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Details (zone, financial, vehicle, expenses, replacement, comments) ═══ */}
          {missionStep === 2 && (
            <div className="space-y-5">
              {/* Zone & Destination (INTERNATIONAL only) */}
              {missionScope === 'INTERNATIONAL' && (
                <Card className="border-border/70">
                  <CardContent className="space-y-4 pt-5">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Zone géographique</Label>
                      <select value={missionZoneId} onChange={e => setMissionZoneId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/60">
                        <option value="">-- Sélectionner --</option>
                        {missionZones.map(z => (<option key={z.id} value={z.id}>{z.name}</option>))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-sm">Pays</Label><Input placeholder="Ex: France" value={missionCountry} onChange={e => setMissionCountry(e.target.value)} /></div>
                      <div className="space-y-1.5"><Label className="text-sm">Lieu</Label><Input placeholder="Ex: Golf National" value={missionVenue} onChange={e => setMissionVenue(e.target.value)} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Devise</Label>
                      <select value={missionCurrency} onChange={e => setMissionCurrency(e.target.value)}
                        className="h-10 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/60">
                        {CURRENCY_OPTIONS.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                      </select>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Financial — LOCAL: hotel only | INTERNATIONAL: PEC choice + conditional meals */}
              <Card className="border-border/70">
                <CardContent className="space-y-4 pt-5">
                  {missionScope === 'LOCAL' ? (
                    <>
                      <Label className="text-sm font-medium">Hébergement</Label>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Montant hôtel / nuit</Label>
                        <Input type="number" min="0" step="0.01" placeholder="0.00" value={hotelAmount} onChange={e => setHotelAmount(e.target.value)} />
                      </div>
                      {computedTotalAllowance > 0 && (
                        <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                          <div className="flex justify-between text-xs text-muted-foreground"><span>Hôtel {hotelPerNight} × {missionWorkingDays}j</span><span>{computedTotalAllowance} MAD</span></div>
                          <div className="flex justify-between text-sm mt-1"><span className="font-medium text-foreground">Dotation totale</span><span className="font-bold text-primary">{computedTotalAllowance} MAD</span></div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Label className="text-sm font-medium">Prise en charge</Label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setMissionPec(true)}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${missionPec ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20' : 'border-border/70 bg-card text-muted-foreground hover:border-border'}`}>
                          Avec PEC<p className="mt-0.5 text-[10px] font-normal opacity-70">Repas séparés</p>
                        </button>
                        <button type="button" onClick={() => setMissionPec(false)}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${!missionPec ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20' : 'border-border/70 bg-card text-muted-foreground hover:border-border'}`}>
                          Sans PEC<p className="mt-0.5 text-[10px] font-normal opacity-70">Hôtel tout inclus</p>
                        </button>
                      </div>

                      {/* Avec PEC: meal counts */}
                      {missionPec && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1"><Label className="text-[10px]">Nb. P.déj</Label><Input type="number" min="0" value={nbrPetitDej} onChange={e => setNbrPetitDej(parseInt(e.target.value) || 0)} className="h-8 text-sm" /></div>
                          <div className="space-y-1"><Label className="text-[10px]">Nb. Déj</Label><Input type="number" min="0" value={nbrDej} onChange={e => setNbrDej(parseInt(e.target.value) || 0)} className="h-8 text-sm" /></div>
                          <div className="space-y-1"><Label className="text-[10px]">Nb. Dîners</Label><Input type="number" min="0" value={nbrDiner} onChange={e => setNbrDiner(parseInt(e.target.value) || 0)} className="h-8 text-sm" /></div>
                        </div>
                      )}

                      {/* Hotel */}
                      <div className="space-y-1.5">
                        <Label className="text-sm">Montant hôtel / nuit {!missionPec && <span className="text-xs text-muted-foreground">(repas inclus)</span>}</Label>
                        <Input type="number" min="0" step="0.01" placeholder="0.00" value={hotelAmount} onChange={e => setHotelAmount(e.target.value)} />
                      </div>

                      {/* Calculation breakdown — always visible */}
                      {(() => {
                        const t = missionTariff || { petit_dej: 0, dej: 0, diner: 0, indem_avec_pec: 0, indem_sans_pec: 0 }
                        return (
                          <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-1.5">
                            {missionPec ? (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <div className="flex justify-between"><span>P.déj: {t.petit_dej} × {nbrPetitDej}</span><span>{(t.petit_dej * nbrPetitDej).toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>Déj: {t.dej} × {nbrDej}</span><span>{(t.dej * nbrDej).toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>Dîner: {t.diner} × {nbrDiner}</span><span>{(t.diner * nbrDiner).toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>(Hôtel {hotelPerNight} + Indemnité {t.indem_avec_pec}) × {missionWorkingDays}j</span><span>{((hotelPerNight + t.indem_avec_pec) * missionDurationWithTravel).toFixed(2)}</span></div>
                              </div>
                            ) : (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <div className="flex justify-between"><span>(Indemnité {t.indem_sans_pec} + Hôtel {hotelPerNight}) × {missionWorkingDays}j</span><span>{computedTotalAllowance.toFixed(2)}</span></div>
                              </div>
                            )}
                            <div className="border-t border-border/50 pt-1.5 mt-1.5">
                              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dotation journalière</span><span className="font-medium">{computedDailyAllowance} {missionCurrency}</span></div>
                              <div className="flex justify-between text-sm mt-0.5"><span className="font-medium text-foreground">Dotation totale</span><span className="font-bold text-primary">{computedTotalAllowance} {missionCurrency}</span></div>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Vehicle (voiture_personnelle) */}
              {transportType === 'voiture_personnelle' && (
                <Card className="border-border/70">
                  <CardContent className="space-y-3 pt-5">
                    <Label className="text-sm font-medium">Détails du véhicule</Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1"><Label className="text-xs">Marque</Label><Input placeholder="Dacia Duster" value={vehicleBrand} onChange={e => setVehicleBrand(e.target.value)} className="h-9" /></div>
                      <div className="space-y-1"><Label className="text-xs">Puissance fiscale</Label><Input placeholder="6 CV" value={vehicleFiscalPower} onChange={e => setVehicleFiscalPower(e.target.value)} className="h-9" /></div>
                      <div className="space-y-1"><Label className="text-xs">Immatriculation</Label><Input placeholder="12345-A-6" value={vehiclePlateRequested} onChange={e => setVehiclePlateRequested(e.target.value)} className="h-9" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Véhicule du</Label><Input type="date" value={vehicleDateFrom} onChange={e => setVehicleDateFrom(e.target.value)} className="h-9" /></div>
                      <div className="space-y-1"><Label className="text-xs">Véhicule au</Label><Input type="date" value={vehicleDateTo} onChange={e => setVehicleDateTo(e.target.value)} className="h-9" /></div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Personnes transportées</Label><Input placeholder="Noms" value={personsTransported} onChange={e => setPersonsTransported(e.target.value)} className="h-9" /></div>
                    <div className="space-y-1"><Label className="text-xs">Autres personnes</Label><Input placeholder="Accompagnants" value={personsOther} onChange={e => setPersonsOther(e.target.value)} className="h-9" /></div>
                  </CardContent>
                </Card>
              )}

              {/* Expenses + Replacement + Comments — compact */}
              <Card className="border-border/70">
                <CardContent className="space-y-4 pt-5">
                  {/* Extra expenses */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Frais supplémentaires</Label>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setExtraExpenses(prev => [...prev, { label: '', amount: '' }])}>
                        <Plus className="mr-1 h-3 w-3" /> Ajouter
                      </Button>
                    </div>
                    {extraExpenses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun frais ajouté</p>
                    ) : (
                      <div className="space-y-1.5">
                        {extraExpenses.map((exp, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <Input placeholder="Libellé" value={exp.label} onChange={e => { const c = [...extraExpenses]; c[idx] = { ...c[idx], label: e.target.value }; setExtraExpenses(c) }} className="flex-1 h-8 text-sm" />
                            <Input type="number" min="0" step="0.01" placeholder="Montant" value={exp.amount} onChange={e => { const c = [...extraExpenses]; c[idx] = { ...c[idx], amount: e.target.value }; setExtraExpenses(c) }} className="w-28 h-8 text-sm" />
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setExtraExpenses(prev => prev.filter((_, i) => i !== idx))}><Minus className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                        {extraExpenses.some(e => e.amount) && (
                          <p className="text-right text-xs font-medium">Total: {extraExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toFixed(2)} {missionCurrency}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Replacement */}
                  {colleagues.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Intérimaire (optionnel)</Label>
                      <select value={missionReplacementId} onChange={(e) => setMissionReplacementId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-input bg-background/70 px-4 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/60">
                        <option value="">Aucun</option>
                        {colleagues.filter((c) => c.id !== user.id && c.id !== selectedEmployeeId).map((c) => (
                          <option key={c.id} value={c.id}>{c.full_name}{c.job_title ? ` — ${c.job_title}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Comments */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Commentaires (optionnel)</Label>
                    <Textarea placeholder="Commentaires supplémentaires..." value={missionComments} onChange={(e) => setMissionComments(e.target.value)} rows={2} maxLength={500} />
                  </div>
                </CardContent>
              </Card>

              {/* Nav */}
              <div className="flex justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => setMissionStep(1)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Précédent
                </Button>
                <Button type="button" onClick={() => setMissionStep(3)}>
                  Suivant <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Summary + Signature + Submit ═══ */}
          {missionStep === 3 && (
            <div className="space-y-5">
              <Card className="border-border/70 bg-secondary/35">
                <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Récapitulatif</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  <div className="divide-y divide-border/50">
                    <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Portée</span><span className="text-sm font-medium">{missionScope === 'LOCAL' ? 'Locale' : 'Internationale'}</span></div>
                    {isAssigning && selectedEmployeeId && (
                      <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Missionnaire</span><span className="text-sm font-medium">{selectedEmployeeId === '_external' ? externalPersonName : (employees.find((e) => e.id === selectedEmployeeId)?.full_name || '—')}</span></div>
                    )}
                    <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Trajet</span><span className="text-sm font-medium">{departureCity} → {arrivalCity}</span></div>
                    <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Objet</span><span className="max-w-[55%] truncate text-right text-sm font-medium">{missionObject}</span></div>
                    <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Durée</span><span className="text-sm font-medium">{missionWorkingDays} jour{missionWorkingDays > 1 ? 's' : ''}</span></div>
                    {transportType && (
                      <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Transport</span><span className="text-sm font-medium">{TRANSPORT_OPTIONS.find((t) => t.value === transportType)?.label}{transportDetails ? ` (${transportDetails})` : ''}</span></div>
                    )}
                    {missionScope === 'INTERNATIONAL' && (
                      <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">PEC</span><span className="text-sm font-medium">{missionPec ? 'Avec PEC' : 'Sans PEC (tout inclus)'}</span></div>
                    )}
                    {computedTotalAllowance > 0 && (
                      <>
                        <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Indemnité/jour</span><span className="text-sm font-medium">{computedDailyAllowance} {missionCurrency}</span></div>
                        <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Durée</span><span className="text-sm font-medium">{missionWorkingDays} jour{missionWorkingDays > 1 ? 's' : ''}</span></div>
                        <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground font-medium">Dotation totale</span><span className="text-sm font-bold text-primary">{computedTotalAllowance} {missionCurrency}</span></div>
                      </>
                    )}
                    {parseFloat(hotelAmount) > 0 && (
                      <div className="flex items-center justify-between py-3"><span className="text-sm text-muted-foreground">Hébergement</span><span className="text-sm font-medium">{hotelAmount} {missionCurrency}</span></div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Signature area */}
              <Card className="border-border/70">
                <CardContent className="pt-5">
                  <Label className="mb-3 block text-sm font-medium">Signature du missionnaire</Label>
                  <div className="rounded-xl border-2 border-dashed border-border/70 bg-white p-1">
                    <canvas
                      ref={missionCanvasRef}
                      className="w-full rounded-lg cursor-crosshair"
                      style={{ height: '150px', touchAction: 'none' }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {missionSignatureEmpty ? 'Dessinez votre signature ci-dessus' : 'Signature enregistrée'}
                    </p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearMissionSignature}>
                      Effacer
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Nav + Submit */}
              <div className="flex justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => setMissionStep(2)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Précédent
                </Button>
                <Button type="submit" disabled={isSubmittingMission || missionWorkingDays <= 0 || !departureCity || !arrivalCity || !missionObject}>
                  {isSubmittingMission ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Soumission...</>) : isAssigning ? 'Assigner la mission' : 'Soumettre la demande'}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

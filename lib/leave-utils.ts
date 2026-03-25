import { createClient } from '@/lib/supabase/client'
import { Holiday, LeaveRequestDetail, LeaveSegment, WorkingDays } from '@/lib/types/database'
import { addDays, format } from 'date-fns'

// ─── In-memory caches (per session) ───────────────────────
let cachedHolidays: Holiday[] | null = null
const cachedWorkingDaysMap = new Map<string, WorkingDays>()

// ─── Data fetchers ────────────────────────────────────────

export async function fetchHolidays(companyId?: number): Promise<Holiday[]> {
  if (cachedHolidays) return cachedHolidays

  const supabase = createClient()
  let query = supabase.from('holidays').select('*')
  if (companyId) query = query.eq('company_id', companyId)

  const { data } = await query
  cachedHolidays = data || []
  return cachedHolidays
}

const DEFAULT_WORKING_DAYS: Omit<WorkingDays, 'id' | 'company_id' | 'category_id' | 'department_id'> = {
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
  monday_morning: true, monday_afternoon: true,
  tuesday_morning: true, tuesday_afternoon: true,
  wednesday_morning: true, wednesday_afternoon: true,
  thursday_morning: true, thursday_afternoon: true,
  friday_morning: true, friday_afternoon: true,
  saturday_morning: true, saturday_afternoon: false,
  sunday_morning: false, sunday_afternoon: false,
}

export async function fetchWorkingDays(companyId?: number, departmentId?: number): Promise<WorkingDays> {
  const cacheKey = `${companyId ?? 'all'}-${departmentId ?? 'default'}`
  const cached = cachedWorkingDaysMap.get(cacheKey)
  if (cached) return cached

  const supabase = createClient()

  // Priority 1: Department-specific config
  if (departmentId) {
    let query = supabase.from('working_days').select('*').eq('department_id', departmentId)
    if (companyId) query = query.eq('company_id', companyId)
    const { data } = await query.limit(1).single()
    if (data) {
      cachedWorkingDaysMap.set(cacheKey, data as WorkingDays)
      return data as WorkingDays
    }
  }

  // Priority 2: Company default (department_id IS NULL, category_id IS NULL)
  let fallbackQuery = supabase.from('working_days').select('*')
    .is('department_id', null)
    .is('category_id', null)
  if (companyId) fallbackQuery = fallbackQuery.eq('company_id', companyId)
  const { data: fallbackData } = await fallbackQuery.limit(1).single()

  const result = fallbackData || {
    id: 0, company_id: null, category_id: null, department_id: null,
    ...DEFAULT_WORKING_DAYS,
  }
  cachedWorkingDaysMap.set(cacheKey, result as WorkingDays)
  return result as WorkingDays
}

export function clearCaches() {
  cachedHolidays = null
  cachedWorkingDaysMap.clear()
}

// ─── Day checking helpers ─────────────────────────────────

export function isHoliday(date: Date, holidays: Holiday[]): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()

  return holidays.some((h) => {
    const hDate = new Date(h.date + 'T00:00:00')
    const hMonth = hDate.getMonth() + 1
    const hDay = hDate.getDate()

    if (h.is_recurring) {
      return hMonth === month && hDay === day
    }
    return hDate.getFullYear() === year && hMonth === month && hDay === day
  })
}

/** Returns the matching Holiday object, or undefined */
export function getHolidayForDate(date: Date, holidays: Holiday[]): Holiday | undefined {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()

  return holidays.find((h) => {
    const hDate = new Date(h.date + 'T00:00:00')
    const hMonth = hDate.getMonth() + 1
    const hDay = hDate.getDate()

    if (h.is_recurring) {
      return hMonth === month && hDay === day
    }
    return hDate.getFullYear() === year && hMonth === month && hDay === day
  })
}

/**
 * Checks if a date is a working day based on company config and holidays.
 * getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
 */
export function isWorkingDay(
  date: Date,
  config: WorkingDays,
  holidays: Holiday[]
): boolean {
  const dow = date.getDay()

  const dayActive =
    dow === 0 ? config.sunday :
    dow === 1 ? config.monday :
    dow === 2 ? config.tuesday :
    dow === 3 ? config.wednesday :
    dow === 4 ? config.thursday :
    dow === 5 ? config.friday :
    dow === 6 ? config.saturday :
    false

  if (!dayActive) return false
  return !isHoliday(date, holidays)
}

/**
 * Get the working value of a day (0, 0.5, or 1) considering half-day config.
 */
export function getDayWorkValue(
  date: Date,
  config: WorkingDays,
  holidays: Holiday[]
): number {
  if (!isWorkingDay(date, config, holidays)) return 0

  const dow = date.getDay()

  const morning =
    dow === 0 ? config.sunday_morning :
    dow === 1 ? config.monday_morning :
    dow === 2 ? config.tuesday_morning :
    dow === 3 ? config.wednesday_morning :
    dow === 4 ? config.thursday_morning :
    dow === 5 ? config.friday_morning :
    dow === 6 ? config.saturday_morning :
    false

  const afternoon =
    dow === 0 ? config.sunday_afternoon :
    dow === 1 ? config.monday_afternoon :
    dow === 2 ? config.tuesday_afternoon :
    dow === 3 ? config.wednesday_afternoon :
    dow === 4 ? config.thursday_afternoon :
    dow === 5 ? config.friday_afternoon :
    dow === 6 ? config.saturday_afternoon :
    false

  // If half-day columns are not set (null/undefined), fall back to full day
  const m = morning ?? true
  const a = afternoon ?? true

  let value = 0
  if (m) value += 0.5
  if (a) value += 0.5
  return value
}

// ─── Core day counting ────────────────────────────────────

/**
 * Counts working days between start and end (inclusive),
 * respecting company working days config, excluding holidays,
 * and supporting half-day start/end.
 */
export function countWorkingDays(
  start: string,
  end: string,
  config: WorkingDays,
  holidays: Holiday[],
  startHalfDay: string = 'FULL',
  endHalfDay: string = 'FULL'
): number {
  if (!start || !end) return 0
  let days = 0
  let current = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  const startDate = new Date(start + 'T00:00:00')

  while (current <= last) {
    let dayValue = getDayWorkValue(current, config, holidays)

    if (dayValue > 0) {
      // Apply half-day restrictions for start/end dates
      if (current.getTime() === startDate.getTime() && startHalfDay === 'AFTERNOON') {
        dayValue = Math.max(dayValue - 0.5, 0)
      }
      if (current.getTime() === last.getTime() && endHalfDay === 'MORNING') {
        dayValue = Math.max(dayValue - 0.5, 0)
      }
    }

    days += dayValue
    current = addDays(current, 1)
  }
  return days
}

/**
 * Returns all holidays that fall on working days within a date range.
 * Used to display which holidays are excluded from the count.
 */
export function getHolidaysInRange(
  start: string,
  end: string,
  config: WorkingDays,
  holidays: Holiday[]
): Holiday[] {
  if (!start || !end) return []
  const result: Holiday[] = []
  let current = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')

  while (current <= last) {
    const dow = current.getDay()
    const dayActive =
      dow === 0 ? config.sunday :
      dow === 1 ? config.monday :
      dow === 2 ? config.tuesday :
      dow === 3 ? config.wednesday :
      dow === 4 ? config.thursday :
      dow === 5 ? config.friday :
      dow === 6 ? config.saturday :
      false

    if (dayActive) {
      const holiday = getHolidayForDate(current, holidays)
      if (holiday && !result.find((h) => h.id === holiday.id)) {
        result.push(holiday)
      }
    }
    current = addDays(current, 1)
  }
  return result
}

/**
 * Finds the next working day on or after the given date.
 */
export function nextWorkingDay(
  from: Date,
  config: WorkingDays,
  holidays: Holiday[]
): Date {
  let d = new Date(from)
  while (!isWorkingDay(d, config, holidays)) {
    d = addDays(d, 1)
  }
  return d
}

// ─── Enumerate individual working days ───────────────────

export interface WorkingDayEntry {
  date: string   // yyyy-MM-dd
  value: number  // 0.5 or 1
}

/**
 * Like countWorkingDays but returns each individual working day
 * instead of a total. Used for inserting leave_request_details rows.
 */
export function enumerateWorkingDays(
  start: string,
  end: string,
  config: WorkingDays,
  holidays: Holiday[],
  startHalfDay: string = 'FULL',
  endHalfDay: string = 'FULL'
): WorkingDayEntry[] {
  if (!start || !end) return []
  const result: WorkingDayEntry[] = []
  let current = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  const startDate = new Date(start + 'T00:00:00')

  while (current <= last) {
    let dayValue = getDayWorkValue(current, config, holidays)

    if (dayValue > 0) {
      if (current.getTime() === startDate.getTime() && startHalfDay === 'AFTERNOON') {
        dayValue = Math.max(dayValue - 0.5, 0)
      }
      if (current.getTime() === last.getTime() && endHalfDay === 'MORNING') {
        dayValue = Math.max(dayValue - 0.5, 0)
      }

      if (dayValue > 0) {
        result.push({
          date: format(current, 'yyyy-MM-dd'),
          value: dayValue,
        })
      }
    }
    current = addDays(current, 1)
  }
  return result
}

// ─── Segment grouping ────────────────────────────────────

export interface SegmentSummary {
  type: 'CONGE' | 'RECUPERATION'
  startDate: string
  endDate: string
  workingDays: number
  details: LeaveRequestDetail[]
}

/**
 * Groups sorted leave_request_details rows into contiguous same-type segments.
 * Used to display segments on the request detail and validation pages.
 */
export function groupDetailsIntoSegments(details: LeaveRequestDetail[]): SegmentSummary[] {
  if (!details.length) return []

  const segments: SegmentSummary[] = []
  let currentSegment: SegmentSummary = {
    type: details[0].type,
    startDate: details[0].date,
    endDate: details[0].date,
    workingDays: 1,
    details: [details[0]],
  }

  for (let i = 1; i < details.length; i++) {
    const d = details[i]
    if (d.type === currentSegment.type) {
      currentSegment.endDate = d.date
      currentSegment.workingDays++
      currentSegment.details.push(d)
    } else {
      segments.push(currentSegment)
      currentSegment = {
        type: d.type,
        startDate: d.date,
        endDate: d.date,
        workingDays: 1,
        details: [d],
      }
    }
  }
  segments.push(currentSegment)
  return segments
}

/**
 * Validates the 5-consecutive-récup-day rule across segments.
 * Returns error messages (empty array = valid).
 */
export function validateSegments(
  segments: LeaveSegment[],
): string[] {
  const errors: string[] = []
  if (segments.length === 0) return errors

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'RECUPERATION' && seg.workingDays > 5) {
      errors.push(`Segment ${i + 1}: maximum 5 jours consécutifs de récupération (actuellement ${seg.workingDays}j)`)
    }
  }

  // Check consecutive RECUPERATION segments (no CONGE break between them)
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].type === 'RECUPERATION' && segments[i - 1].type === 'RECUPERATION') {
      errors.push(`Segments ${i} et ${i + 1}: deux blocs de récupération consécutifs — insérez au moins 1 jour de congé entre eux`)
    }
  }

  return errors
}

// ─── Floor to nearest 0.5 ────────────────────────────────
/** Floor any number to the nearest 0.5 (e.g. 1.9→1.5, 2.3→2, 5.7→5.5, 3.0→3) */
export function roundHalf(n: number): number {
  return Math.floor(n * 2) / 2
}

// ─── Monthly Balance Accrual (Req #5) ────────────────────

export interface MonthlyAccrualInfo {
  annualEntitlement: number  // from department + seniority (e.g. 21)
  carryOver: number          // carry-over from previous year (solde antérieur)
  currentMonth: number       // 1-12
  monthlyRate: number        // annualEntitlement / 12
  cumulativeEarned: number   // monthlyRate * currentMonth
  daysUsed: number           // approved CONGE days this year
  daysPending: number        // pending CONGE days this year
  availableNow: number       // carryOver + cumulativeEarned - daysUsed - daysPending
}

/**
 * Calculates the monthly accrual balance for an employee.
 * Annual entitlement comes from department config + seniority bonus.
 * Carry-over from previous year is fully available immediately.
 * Available = carryOver + (annualEntitlement / 12 * currentMonth) - daysUsed - daysPending
 */
export function calculateMonthlyAccrual(
  annualEntitlement: number,
  carryOver: number = 0,
  daysUsed: number = 0,
  daysPending: number = 0,
  month?: number
): MonthlyAccrualInfo {
  const currentMonth = month ?? (new Date().getMonth() + 1) // 1-based
  const monthlyRate = annualEntitlement / 12
  const cumulativeEarned = roundHalf(monthlyRate * currentMonth)
  const availableNow = roundHalf(Math.max(carryOver + cumulativeEarned - daysUsed - daysPending, 0))

  return {
    annualEntitlement: roundHalf(annualEntitlement),
    carryOver: roundHalf(carryOver),
    currentMonth,
    monthlyRate: roundHalf(monthlyRate),
    cumulativeEarned,
    daysUsed: roundHalf(daysUsed),
    daysPending: roundHalf(daysPending),
    availableNow,
  }
}

// ─── Seniority & Entitlement (mirrors SQL RPC for frontend display) ───

export interface SeniorityInfo {
  yearsOfService: number
  seniorityPeriods: number
  baseDays: number
  bonusDays: number
  totalEntitlement: number
}

/**
 * Moroccan law entitlement based on seniority date.
 * Uses jours ouvrables: base days/year + 1.5/5yr seniority bonus, max 30.
 * Priority: employee override > department default > 18.
 * Seniority calc uses date_anciennete if available, otherwise hire_date.
 */
export function calculateSeniority(
  hireDateStr: string | null,
  deptAnnualDays?: number,
  employeeAnnualDays?: number | null,
  dateAncienneteStr?: string | null
): SeniorityInfo {
  // Simple priority: employee override > department > default 18
  const baseDays = employeeAnnualDays ?? deptAnnualDays ?? 18
  const maxDays = 30  // max jours ouvrables (Article 232)

  // Use date_anciennete for seniority calculation, fallback to hire_date
  const seniorityDateStr = dateAncienneteStr || hireDateStr

  if (!seniorityDateStr) {
    return { yearsOfService: 0, seniorityPeriods: 0, baseDays, bonusDays: 0, totalEntitlement: baseDays }
  }

  const seniorityDate = new Date(seniorityDateStr + 'T00:00:00')
  const now = new Date()
  const diffMs = now.getTime() - seniorityDate.getTime()
  const yearsOfService = diffMs / (365.25 * 24 * 60 * 60 * 1000)
  const seniorityPeriods = Math.floor(Math.max(yearsOfService, 0) / 5)
  const bonusDays = seniorityPeriods * 1.5
  const totalEntitlement = roundHalf(Math.min(baseDays + bonusDays, maxDays))

  return { yearsOfService: Math.max(yearsOfService, 0), seniorityPeriods, baseDays, bonusDays: roundHalf(bonusDays), totalEntitlement }
}

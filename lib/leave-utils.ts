import { createClient } from '@/lib/supabase/client'
import { Holiday, WorkingDays } from '@/lib/types/database'
import { addDays } from 'date-fns'

// ─── In-memory caches (per session) ───────────────────────
let cachedHolidays: Holiday[] | null = null
let cachedWorkingDays: WorkingDays | null = null

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

export async function fetchWorkingDays(companyId?: number): Promise<WorkingDays> {
  if (cachedWorkingDays) return cachedWorkingDays

  const supabase = createClient()
  let query = supabase.from('working_days').select('*')
  if (companyId) query = query.eq('company_id', companyId)

  const { data } = await query.limit(1).single()

  // Default: Mon-Sat (Moroccan jours ouvrables)
  const result = data || {
    id: 0,
    company_id: null,
    category_id: null,
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
    monday_morning: true, monday_afternoon: true,
    tuesday_morning: true, tuesday_afternoon: true,
    wednesday_morning: true, wednesday_afternoon: true,
    thursday_morning: true, thursday_afternoon: true,
    friday_morning: true, friday_afternoon: true,
    saturday_morning: true, saturday_afternoon: false,
    sunday_morning: false, sunday_afternoon: false,
  }
  cachedWorkingDays = result as WorkingDays
  return cachedWorkingDays
}

export function clearCaches() {
  cachedHolidays = null
  cachedWorkingDays = null
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

// ─── Seniority & Entitlement (mirrors SQL RPC for frontend display) ───

export interface SeniorityInfo {
  yearsOfService: number
  seniorityPeriods: number
  baseDays: number
  bonusDays: number
  totalEntitlement: number
}

/**
 * Moroccan law entitlement based on hire date.
 * Uses jours ouvrables: 18 days/year base + 1.5/5yr seniority, max 30.
 * Supports category-based annual leave days (Req #3).
 */
export function calculateSeniority(hireDateStr: string | null, categoryAnnualDays?: number): SeniorityInfo {
  const baseDays = categoryAnnualDays ?? 18 // category-based or default (Article 231)
  const maxDays = 30  // max jours ouvrables (Article 232)

  if (!hireDateStr) {
    return { yearsOfService: 0, seniorityPeriods: 0, baseDays, bonusDays: 0, totalEntitlement: baseDays }
  }

  const hireDate = new Date(hireDateStr + 'T00:00:00')
  const now = new Date()
  const diffMs = now.getTime() - hireDate.getTime()
  const yearsOfService = diffMs / (365.25 * 24 * 60 * 60 * 1000)
  const seniorityPeriods = Math.floor(Math.max(yearsOfService, 0) / 5)
  const bonusDays = seniorityPeriods * 1.5
  const totalEntitlement = Math.min(baseDays + bonusDays, maxDays)

  return { yearsOfService: Math.max(yearsOfService, 0), seniorityPeriods, baseDays, bonusDays, totalEntitlement }
}

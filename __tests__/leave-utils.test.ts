import { describe, it, expect, beforeEach } from 'vitest'
import {
  isHoliday,
  getHolidayForDate,
  isWorkingDay,
  getDayWorkValue,
  countWorkingDays,
  getHolidaysInRange,
  nextWorkingDay,
  calculateMonthlyAccrual,
  calculateSeniority,
  clearCaches,
} from '@/lib/leave-utils'
import type { Holiday, WorkingDays } from '@/lib/types/database'

// ─── Test fixtures ───────────────────────────────────────

/** Standard Moroccan config: Mon-Sat, Saturday half-day (morning only) */
const MOROCCAN_WORKING_DAYS: WorkingDays = {
  id: 1,
  company_id: 1,
  category_id: null,
  monday: true, tuesday: true, wednesday: true,
  thursday: true, friday: true, saturday: true, sunday: false,
  monday_morning: true, monday_afternoon: true,
  tuesday_morning: true, tuesday_afternoon: true,
  wednesday_morning: true, wednesday_afternoon: true,
  thursday_morning: true, thursday_afternoon: true,
  friday_morning: true, friday_afternoon: true,
  saturday_morning: true, saturday_afternoon: false,
  sunday_morning: false, sunday_afternoon: false,
}

/** Mon-Fri only config (international standard) */
const MON_FRI_WORKING_DAYS: WorkingDays = {
  ...MOROCCAN_WORKING_DAYS,
  saturday: false,
  saturday_morning: false,
  saturday_afternoon: false,
}

/** Sample Moroccan holidays */
const SAMPLE_HOLIDAYS: Holiday[] = [
  { id: 1, company_id: 1, name: 'Nouvel An', date: '2026-01-01', is_recurring: true, created_at: '' },
  { id: 2, company_id: 1, name: 'Fête du Travail', date: '2026-05-01', is_recurring: true, created_at: '' },
  { id: 3, company_id: 1, name: 'Fête du Trône', date: '2026-07-30', is_recurring: true, created_at: '' },
  { id: 4, company_id: 1, name: 'Marche Verte', date: '2026-11-06', is_recurring: true, created_at: '' },
  { id: 5, company_id: 1, name: 'Fête de l\'Indépendance', date: '2026-11-18', is_recurring: true, created_at: '' },
  // Non-recurring (Islamic holidays - specific year)
  { id: 6, company_id: 1, name: 'Aïd Al-Fitr 2026', date: '2026-03-20', is_recurring: false, created_at: '' },
  { id: 7, company_id: 1, name: 'Aïd Al-Fitr 2026 J2', date: '2026-03-21', is_recurring: false, created_at: '' },
]

const NO_HOLIDAYS: Holiday[] = []

// ─── isHoliday ───────────────────────────────────────────

describe('isHoliday', () => {
  it('returns true for a recurring holiday (Jan 1st in any year)', () => {
    expect(isHoliday(new Date('2026-01-01T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
    expect(isHoliday(new Date('2030-01-01T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
  })

  it('returns true for a non-recurring holiday in the correct year', () => {
    expect(isHoliday(new Date('2026-03-20T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
  })

  it('returns false for a non-recurring holiday in a different year', () => {
    expect(isHoliday(new Date('2027-03-20T00:00:00'), SAMPLE_HOLIDAYS)).toBe(false)
  })

  it('returns false for a regular working day', () => {
    expect(isHoliday(new Date('2026-03-02T00:00:00'), SAMPLE_HOLIDAYS)).toBe(false)
  })

  it('returns false when holidays list is empty', () => {
    expect(isHoliday(new Date('2026-01-01T00:00:00'), NO_HOLIDAYS)).toBe(false)
  })

  it('matches recurring holiday across different years', () => {
    // May 1st is recurring
    expect(isHoliday(new Date('2026-05-01T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
    expect(isHoliday(new Date('2025-05-01T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
    expect(isHoliday(new Date('2028-05-01T00:00:00'), SAMPLE_HOLIDAYS)).toBe(true)
  })
})

// ─── getHolidayForDate ───────────────────────────────────

describe('getHolidayForDate', () => {
  it('returns the Holiday object for a matching date', () => {
    const result = getHolidayForDate(new Date('2026-01-01T00:00:00'), SAMPLE_HOLIDAYS)
    expect(result).toBeDefined()
    expect(result!.name).toBe('Nouvel An')
  })

  it('returns undefined for a non-holiday date', () => {
    const result = getHolidayForDate(new Date('2026-03-02T00:00:00'), SAMPLE_HOLIDAYS)
    expect(result).toBeUndefined()
  })

  it('returns recurring holiday matching any year', () => {
    const result = getHolidayForDate(new Date('2030-07-30T00:00:00'), SAMPLE_HOLIDAYS)
    expect(result).toBeDefined()
    expect(result!.name).toBe('Fête du Trône')
  })

  it('returns non-recurring holiday only for exact year', () => {
    const match2026 = getHolidayForDate(new Date('2026-03-20T00:00:00'), SAMPLE_HOLIDAYS)
    expect(match2026).toBeDefined()
    expect(match2026!.name).toBe('Aïd Al-Fitr 2026')

    const noMatch = getHolidayForDate(new Date('2027-03-20T00:00:00'), SAMPLE_HOLIDAYS)
    expect(noMatch).toBeUndefined()
  })
})

// ─── isWorkingDay ────────────────────────────────────────

describe('isWorkingDay', () => {
  it('returns true for a Monday (working day)', () => {
    // 2026-03-02 is Monday
    expect(isWorkingDay(new Date('2026-03-02T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(true)
  })

  it('returns false for a Sunday (non-working day)', () => {
    // 2026-03-01 is Sunday
    expect(isWorkingDay(new Date('2026-03-01T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(false)
  })

  it('returns true for Saturday in Moroccan config', () => {
    // 2026-03-07 is Saturday
    expect(isWorkingDay(new Date('2026-03-07T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(true)
  })

  it('returns false for Saturday in Mon-Fri config', () => {
    expect(isWorkingDay(new Date('2026-03-07T00:00:00'), MON_FRI_WORKING_DAYS, NO_HOLIDAYS)).toBe(false)
  })

  it('returns false for a holiday even if it is a weekday', () => {
    // 2026-01-01 is Thursday — a working day, but it's a holiday
    expect(isWorkingDay(new Date('2026-01-01T00:00:00'), MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)).toBe(false)
  })

  it('returns true for a weekday that is not a holiday', () => {
    // 2026-01-02 is Friday — not a holiday
    expect(isWorkingDay(new Date('2026-01-02T00:00:00'), MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)).toBe(true)
  })
})

// ─── getDayWorkValue ─────────────────────────────────────

describe('getDayWorkValue', () => {
  it('returns 1 for a full working day (Mon-Fri)', () => {
    // Monday: morning=true, afternoon=true → 1
    expect(getDayWorkValue(new Date('2026-03-02T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)
  })

  it('returns 0.5 for Saturday (morning only in Moroccan config)', () => {
    // Saturday: morning=true, afternoon=false → 0.5
    expect(getDayWorkValue(new Date('2026-03-07T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0.5)
  })

  it('returns 0 for Sunday', () => {
    expect(getDayWorkValue(new Date('2026-03-01T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0)
  })

  it('returns 0 for a holiday', () => {
    // Jan 1 is Thursday but a holiday
    expect(getDayWorkValue(new Date('2026-01-01T00:00:00'), MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)).toBe(0)
  })

  it('returns 0 for Saturday in Mon-Fri config', () => {
    expect(getDayWorkValue(new Date('2026-03-07T00:00:00'), MON_FRI_WORKING_DAYS, NO_HOLIDAYS)).toBe(0)
  })

  it('handles all weekdays correctly for Moroccan config', () => {
    // 2026-03-02 Mon, 03 Tue, 04 Wed, 05 Thu, 06 Fri, 07 Sat, 08 Sun
    expect(getDayWorkValue(new Date('2026-03-02T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)   // Mon
    expect(getDayWorkValue(new Date('2026-03-03T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)   // Tue
    expect(getDayWorkValue(new Date('2026-03-04T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)   // Wed
    expect(getDayWorkValue(new Date('2026-03-05T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)   // Thu
    expect(getDayWorkValue(new Date('2026-03-06T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)   // Fri
    expect(getDayWorkValue(new Date('2026-03-07T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0.5) // Sat
    expect(getDayWorkValue(new Date('2026-03-08T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0)   // Sun
  })
})

// ─── countWorkingDays ────────────────────────────────────

describe('countWorkingDays', () => {
  it('counts a full Mon-Sat week (Moroccan) = 5.5 days', () => {
    // Mon 2026-03-02 to Sat 2026-03-07 = 5 full + 0.5 sat = 5.5
    expect(countWorkingDays('2026-03-02', '2026-03-07', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(5.5)
  })

  it('counts a full Mon-Fri week = 5 days', () => {
    expect(countWorkingDays('2026-03-02', '2026-03-06', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(5)
  })

  it('counts a single day', () => {
    expect(countWorkingDays('2026-03-02', '2026-03-02', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(1)
  })

  it('returns 0 for a single Sunday', () => {
    expect(countWorkingDays('2026-03-01', '2026-03-01', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0)
  })

  it('excludes holidays from count', () => {
    // March 16-21 (Mon-Sat): 5 weekdays + 1 Sat(0.5) = 5.5
    // Mar 20 (Fri) = holiday, Mar 21 (Sat) = holiday → subtract 1 + 0.5 = 1.5
    // Result: 5.5 - 1.5 = 4
    expect(countWorkingDays('2026-03-16', '2026-03-21', MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)).toBe(4)
  })

  it('handles two-week period correctly', () => {
    // Mar 2 Mon to Mar 13 Fri:
    // Mon-Fri(5) + Sat(0.5) + Sun(0) + Mon-Fri(5) = 10.5
    expect(countWorkingDays('2026-03-02', '2026-03-13', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(10.5)
  })

  it('handles two-week period with Saturday correctly', () => {
    // Mar 2 Mon to Mar 14 Sat
    // Mon-Fri(5) + Sat(0.5) + Sun(0) + Mon-Fri(5) + Sat(0.5) = 11
    expect(countWorkingDays('2026-03-02', '2026-03-14', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(11)
  })

  it('returns 0 for empty/null dates', () => {
    expect(countWorkingDays('', '', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(0)
  })

  it('handles half-day start (AFTERNOON) — deducts morning', () => {
    // Single Monday, start AFTERNOON: 1 - 0.5 = 0.5
    expect(countWorkingDays('2026-03-02', '2026-03-02', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS, 'AFTERNOON')).toBe(0.5)
  })

  it('handles half-day end (MORNING) — deducts afternoon', () => {
    // Single Monday, end MORNING: 1 - 0.5 = 0.5
    expect(countWorkingDays('2026-03-02', '2026-03-02', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS, 'FULL', 'MORNING')).toBe(0.5)
  })

  it('handles half-day start AND half-day end on same day', () => {
    // Start AFTERNOON + End MORNING on same day: 1 - 0.5 - 0.5 = 0
    expect(countWorkingDays('2026-03-02', '2026-03-02', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS, 'AFTERNOON', 'MORNING')).toBe(0)
  })

  it('handles half-day start on multi-day range', () => {
    // Mon (afternoon only = 0.5) + Tue (1) = 1.5
    expect(countWorkingDays('2026-03-02', '2026-03-03', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS, 'AFTERNOON')).toBe(1.5)
  })

  it('handles half-day end on multi-day range', () => {
    // Mon (1) + Tue (morning only = 0.5) = 1.5
    expect(countWorkingDays('2026-03-02', '2026-03-03', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS, 'FULL', 'MORNING')).toBe(1.5)
  })

  it('handles Mon-Fri config (no Saturday)', () => {
    // Mon to Sat in Mon-Fri config: only Mon-Fri count = 5
    expect(countWorkingDays('2026-03-02', '2026-03-07', MON_FRI_WORKING_DAYS, NO_HOLIDAYS)).toBe(5)
  })

  it('counts one full month correctly (March 2026, no holidays)', () => {
    // March has 31 days. Mar 1 is Sunday.
    // Working days: Mon-Sat each week
    // Week 1: Mar 2-7 (5 + 0.5)
    // Week 2: Mar 9-14 (5 + 0.5)
    // Week 3: Mar 16-21 (5 + 0.5)
    // Week 4: Mar 23-28 (5 + 0.5)
    // Mar 30-31 (Mon, Tue) = 2
    // Total: 4 * 5.5 + 2 = 24
    expect(countWorkingDays('2026-03-01', '2026-03-31', MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)).toBe(24)
  })
})

// ─── getHolidaysInRange ──────────────────────────────────

describe('getHolidaysInRange', () => {
  it('returns holidays that fall on working days within range', () => {
    // March 16-21: includes Mar 20 (Fri, holiday) and Mar 21 (Sat, holiday)
    const result = getHolidaysInRange('2026-03-16', '2026-03-21', MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)
    expect(result.length).toBe(2)
    expect(result.map(h => h.name)).toContain('Aïd Al-Fitr 2026')
    expect(result.map(h => h.name)).toContain('Aïd Al-Fitr 2026 J2')
  })

  it('returns empty array when no holidays in range', () => {
    const result = getHolidaysInRange('2026-03-02', '2026-03-06', MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)
    expect(result).toEqual([])
  })

  it('returns empty array for empty dates', () => {
    expect(getHolidaysInRange('', '', MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)).toEqual([])
  })

  it('does not include holidays falling on non-working days', () => {
    // If a holiday falls on Sunday, it should NOT be included
    const holidayOnSunday: Holiday[] = [
      { id: 100, company_id: 1, name: 'Sunday Holiday', date: '2026-03-01', is_recurring: false, created_at: '' },
    ]
    const result = getHolidaysInRange('2026-03-01', '2026-03-01', MOROCCAN_WORKING_DAYS, holidayOnSunday)
    expect(result).toEqual([])
  })

  it('does not return duplicate holidays', () => {
    const result = getHolidaysInRange('2026-01-01', '2026-12-31', MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)
    const ids = result.map(h => h.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── nextWorkingDay ──────────────────────────────────────

describe('nextWorkingDay', () => {
  it('returns the same day if it is already a working day', () => {
    const result = nextWorkingDay(new Date('2026-03-02T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-02')
  })

  it('skips Sunday and returns Monday', () => {
    const result = nextWorkingDay(new Date('2026-03-01T00:00:00'), MOROCCAN_WORKING_DAYS, NO_HOLIDAYS)
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-02')
  })

  it('skips holidays and returns the next working day', () => {
    // Jan 1 (Thursday) is holiday → next working day is Jan 2 (Friday)
    const result = nextWorkingDay(new Date('2026-01-01T00:00:00'), MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-02')
  })

  it('skips both Sunday and Saturday in Mon-Fri config', () => {
    // Saturday Mar 7 → next working day is Monday Mar 9
    const result = nextWorkingDay(new Date('2026-03-07T00:00:00'), MON_FRI_WORKING_DAYS, NO_HOLIDAYS)
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-09')
  })

  it('skips consecutive holidays', () => {
    // Mar 20 (Fri) and Mar 21 (Sat) are both holidays, Mar 22 is Sunday
    // Next working day = Monday Mar 23
    const result = nextWorkingDay(new Date('2026-03-20T00:00:00'), MOROCCAN_WORKING_DAYS, SAMPLE_HOLIDAYS)
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-23')
  })
})

// ─── calculateMonthlyAccrual ─────────────────────────────

describe('calculateMonthlyAccrual', () => {
  // New signature: (annualEntitlement, carryOver, daysUsed, daysPending, month?)

  it('calculates monthly rate correctly (22 days / 12 months)', () => {
    const result = calculateMonthlyAccrual(22, 0, 0, 0, 1)
    expect(result.monthlyRate).toBeCloseTo(1.83, 2)
    expect(result.annualEntitlement).toBe(22)
  })

  it('calculates cumulative earned for month 6', () => {
    const result = calculateMonthlyAccrual(22, 0, 0, 0, 6)
    expect(result.cumulativeEarned).toBeCloseTo(1.83 * 6, 1)
  })

  it('deducts used and pending days from available', () => {
    const result = calculateMonthlyAccrual(22, 0, 5, 2, 6)
    expect(result.daysUsed).toBe(5)
    expect(result.daysPending).toBe(2)
    // available = carryOver + cumulative - used - pending
    expect(result.availableNow).toBeCloseTo(1.83 * 6 - 5 - 2, 1)
  })

  it('does not go below 0 for available', () => {
    const result = calculateMonthlyAccrual(22, 0, 20, 5, 1)
    // cumulative at month 1 ≈ 1.83, used=20, pending=5 → would be negative
    expect(result.availableNow).toBe(0)
  })

  it('handles month 12 (full year)', () => {
    const result = calculateMonthlyAccrual(22, 0, 0, 0, 12)
    // cumulative should equal the full annual amount (within rounding)
    expect(result.cumulativeEarned).toBeCloseTo(22, 0)
  })

  it('handles 18 base days (default Moroccan entitlement)', () => {
    const result = calculateMonthlyAccrual(18, 0, 0, 0, 1)
    expect(result.monthlyRate).toBe(1.5)
    expect(result.cumulativeEarned).toBe(1.5)
  })

  it('handles MAX_LEAVE_BALANCE (52 days)', () => {
    const result = calculateMonthlyAccrual(52, 0, 0, 0, 12)
    expect(result.cumulativeEarned).toBeCloseTo(52, 0)
  })

  it('adds carry-over to available balance', () => {
    // 18 entitlement, 10 carry-over, 0 used, 0 pending, month 1
    const result = calculateMonthlyAccrual(18, 10, 0, 0, 1)
    expect(result.carryOver).toBe(10)
    // available = 10 + 1.5 - 0 - 0 = 11.5
    expect(result.availableNow).toBe(11.5)
  })

  it('carry-over is fully available from month 1', () => {
    const result = calculateMonthlyAccrual(18, 15, 0, 0, 1)
    // available = 15 (carry) + 1.5 (month 1 accrual) = 16.5
    expect(result.availableNow).toBe(16.5)
  })

  it('carry-over + accrual - used gives correct available', () => {
    // 21 entitlement (dept+seniority), 8 carry-over, 5 used, 2 pending, month 3
    const result = calculateMonthlyAccrual(21, 8, 5, 2, 3)
    const monthlyRate = Math.round((21 / 12) * 100) / 100  // 1.75
    const cumulative = Math.round(monthlyRate * 3 * 100) / 100  // 5.25
    expect(result.availableNow).toBeCloseTo(8 + cumulative - 5 - 2, 1)
  })
})

// ─── calculateSeniority ─────────────────────────────────

describe('calculateSeniority', () => {
  it('returns base 18 days for null hire date', () => {
    const result = calculateSeniority(null)
    expect(result.yearsOfService).toBe(0)
    expect(result.baseDays).toBe(18)
    expect(result.bonusDays).toBe(0)
    expect(result.totalEntitlement).toBe(18)
  })

  it('returns 18 days for new employee (< 5 years)', () => {
    const result = calculateSeniority('2024-01-01')
    expect(result.yearsOfService).toBeGreaterThan(0)
    expect(result.yearsOfService).toBeLessThan(5)
    expect(result.seniorityPeriods).toBe(0)
    expect(result.bonusDays).toBe(0)
    expect(result.totalEntitlement).toBe(18)
  })

  it('adds 1.5 bonus days per 5-year seniority period', () => {
    // Hired 10 years ago → 2 periods × 1.5 = 3 bonus days
    const tenYearsAgo = new Date()
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
    const result = calculateSeniority(tenYearsAgo.toISOString().split('T')[0])
    expect(result.seniorityPeriods).toBe(2)
    expect(result.bonusDays).toBe(3)
    expect(result.totalEntitlement).toBe(21) // 18 + 3
  })

  it('caps total at 30 days maximum', () => {
    // Hired 50 years ago → many periods, but capped
    const longAgo = new Date()
    longAgo.setFullYear(longAgo.getFullYear() - 50)
    const result = calculateSeniority(longAgo.toISOString().split('T')[0])
    expect(result.totalEntitlement).toBe(30)
  })

  it('calculates correctly for 5-year employee', () => {
    const fiveYearsAgo = new Date()
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
    fiveYearsAgo.setMonth(fiveYearsAgo.getMonth() - 1) // ensure > 5 years
    const result = calculateSeniority(fiveYearsAgo.toISOString().split('T')[0])
    expect(result.seniorityPeriods).toBe(1)
    expect(result.bonusDays).toBe(1.5)
    expect(result.totalEntitlement).toBe(19.5)
  })

  it('uses department-specific annual days when provided', () => {
    const result = calculateSeniority(null, 24) // Department with 24 days
    expect(result.baseDays).toBe(24)
    expect(result.totalEntitlement).toBe(24)
  })

  it('caps department-based days at 30', () => {
    // 24 base + many seniority bonuses → max 30
    const longAgo = new Date()
    longAgo.setFullYear(longAgo.getFullYear() - 30)
    const result = calculateSeniority(longAgo.toISOString().split('T')[0], 24)
    expect(result.totalEntitlement).toBe(30)
  })

  it('calculates seniority for seeded employees correctly', () => {
    // Salma Berrada: hired 2019-03-15
    const salma = calculateSeniority('2019-03-15')
    // In 2026: ~7 years → 1 period → 1.5 bonus
    expect(salma.seniorityPeriods).toBe(1)
    expect(salma.totalEntitlement).toBe(19.5)

    // Fatima Alaoui: hired 2012-11-05
    const fatima = calculateSeniority('2012-11-05')
    // In 2026: ~13 years → 2 periods → 3 bonus
    expect(fatima.seniorityPeriods).toBe(2)
    expect(fatima.totalEntitlement).toBe(21) // 18 + 3
  })
})

// ─── clearCaches ────────────────────────────────────────

describe('clearCaches', () => {
  it('does not throw when called', () => {
    expect(() => clearCaches()).not.toThrow()
  })
})

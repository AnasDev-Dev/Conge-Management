"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isBefore,
  isAfter,
  isToday,
  isWeekend,
} from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

interface CalendarProps {
  value?: Date | null
  onChange?: (date: Date) => void
  minDate?: Date | null
  maxDate?: Date | null
  className?: string
  compact?: boolean
}

function Calendar({
  value,
  onChange,
  minDate,
  maxDate,
  className,
  compact,
}: CalendarProps) {
  const [displayMonth, setDisplayMonth] = useState(
    () => value ?? new Date()
  )

  const monthStart = startOfMonth(displayMonth)
  const monthEnd = endOfMonth(displayMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Monday = 0 for French week start
  const startDayOfWeek = (getDay(monthStart) + 6) % 7
  const paddingBefore: null[] = Array.from(
    { length: startDayOfWeek },
    () => null
  )
  const totalCells = paddingBefore.length + days.length
  const paddingAfter: null[] = Array.from(
    { length: (7 - (totalCells % 7)) % 7 },
    () => null
  )
  const grid = [...paddingBefore, ...days, ...paddingAfter]

  const isDisabled = (day: Date) => {
    if (minDate && isBefore(day, minDate)) return true
    if (maxDate && isAfter(day, maxDate)) return true
    return false
  }

  const cellSize = compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"

  return (
    <div className={cn("p-0", className)} data-slot="calendar">
      {/* Navigation header */}
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size={compact ? "icon-xs" : "icon-sm"}
          onClick={() => setDisplayMonth((m) => subMonths(m, 1))}
          type="button"
        >
          <ChevronLeft />
        </Button>
        <span
          className={cn(
            "font-medium capitalize",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {format(displayMonth, "MMMM yyyy", { locale: fr })}
        </span>
        <Button
          variant="ghost"
          size={compact ? "icon-xs" : "icon-sm"}
          onClick={() => setDisplayMonth((m) => addMonths(m, 1))}
          type="button"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS_FR.map((d) => (
          <div
            key={d}
            className={cn(
              "text-center font-medium text-muted-foreground",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            {compact ? d.charAt(0) : d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} className={cellSize} />

          const selected = value ? isSameDay(day, value) : false
          const today = isToday(day)
          const disabled = isDisabled(day)
          const weekend = isWeekend(day)

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange?.(day)}
              className={cn(
                "flex items-center justify-center rounded-lg transition-colors",
                cellSize,
                selected &&
                  "bg-primary text-primary-foreground font-semibold",
                !selected &&
                  today &&
                  "bg-primary/10 text-primary font-medium",
                !selected &&
                  !today &&
                  !disabled &&
                  !weekend &&
                  "text-foreground hover:bg-accent",
                !selected &&
                  !today &&
                  weekend &&
                  !disabled &&
                  "text-muted-foreground/60 hover:bg-accent",
                disabled && "cursor-not-allowed text-muted-foreground/30"
              )}
            >
              {format(day, "d")}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar }
export type { CalendarProps }

"use client"

import { useState } from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  compact?: boolean
}

function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Selectionnez une date",
  disabled,
  id,
  className,
  compact,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const parseDate = (v: string): Date | null =>
    v ? new Date(v + "T00:00:00") : null

  const selectedDate = parseDate(value)
  const minDate = min ? parseDate(min) : null
  const maxDate = max ? parseDate(max) : null

  const handleSelect = (date: Date) => {
    onChange(format(date, "yyyy-MM-dd"))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          type="button"
          className={cn(
            "w-full justify-start text-left font-normal",
            compact
              ? "h-8 rounded-2xl px-3 text-xs"
              : "relative h-11 rounded-2xl pl-12",
            !value && "text-muted-foreground",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {!compact && (
            <CalendarIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          )}
          {selectedDate
            ? compact
              ? format(selectedDate, "dd/MM/yyyy", { locale: fr })
              : format(selectedDate, "dd MMMM yyyy", { locale: fr })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={compact ? "p-2" : "p-3"}
        onClick={(e) => e.stopPropagation()}
      >
        <Calendar
          value={selectedDate}
          onChange={handleSelect}
          minDate={minDate}
          maxDate={maxDate}
          compact={compact}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
export type { DatePickerProps }

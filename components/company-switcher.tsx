'use client'

import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { Badge } from '@/components/ui/badge'
import { Building2, ChevronDown } from 'lucide-react'
import { useState } from 'react'

export function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompany, activeRole } = useCompanyContext()
  const [open, setOpen] = useState(false)

  if (companies.length <= 1) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-border bg-background/90 px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{activeCompany?.name || 'Sélectionner'}</p>
          {activeRole && (
            <p className="text-[10px] text-muted-foreground">{activeRole}</p>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-background shadow-lg">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => { setActiveCompany(company); setOpen(false) }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent ${
                activeCompany?.id === company.id ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{company.name}</span>
              {activeCompany?.id === company.id && (
                <Badge className="ml-auto text-[10px]">Actif</Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

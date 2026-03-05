'use client'

import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { getRoleLabel } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Building2, ChevronDown, Home } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompany, userRoles, activeRole, isHome } = useCompanyContext()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Only show if user has roles in multiple companies
  const accessibleCompanyIds = new Set(userRoles.map(r => r.company_id))
  const accessibleCompanies = companies.filter(c => accessibleCompanyIds.has(c.id))

  if (accessibleCompanies.length <= 1) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-border bg-background/90 px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{activeCompany?.name || 'Selectionner'}</p>
            {isHome && <Home className="h-3 w-3 text-muted-foreground" />}
          </div>
          {activeRole && (
            <p className="text-[10px] text-muted-foreground">{getRoleLabel(activeRole)}</p>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {accessibleCompanies.map(company => {
            const roleRecord = userRoles.find(r => r.company_id === company.id)
            const isActive = activeCompany?.id === company.id
            return (
              <button
                key={company.id}
                onClick={() => { setActiveCompany(company); setOpen(false) }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent ${
                  isActive ? 'bg-accent/50 font-medium' : ''
                }`}
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{company.name}</span>
                    {roleRecord?.is_home && <Home className="h-3 w-3 text-amber-500" />}
                  </div>
                  {roleRecord && (
                    <p className="text-[10px] text-muted-foreground">{getRoleLabel(roleRecord.role)}</p>
                  )}
                </div>
                {isActive && (
                  <Badge className="ml-auto text-[10px]">Actif</Badge>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

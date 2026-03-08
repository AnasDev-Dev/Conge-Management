'use client'

import Image from 'next/image'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { getRoleLabel } from '@/lib/constants'
import { getCompanyLogo, getCompanyFullName } from '@/lib/company-logos'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Home } from 'lucide-react'
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

  const accessibleCompanyIds = new Set(userRoles.map(r => r.company_id))
  const accessibleCompanies = companies.filter(c => accessibleCompanyIds.has(c.id))
  const hasMultiple = accessibleCompanies.length > 1

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => hasMultiple && setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3.5 text-left transition-colors ${
          hasMultiple ? 'cursor-pointer hover:bg-accent' : 'cursor-default'
        }`}
      >
        <Image
          src={getCompanyLogo(activeCompany?.name)}
          alt={activeCompany?.name || 'FRMG'}
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold tracking-tight text-foreground leading-tight">
              {activeCompany?.name || 'FRMG'}
            </p>
            {isHome && <Home className="h-3 w-3 text-muted-foreground" />}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {getCompanyFullName(activeCompany?.name) || 'Gestion des conges'}
          </p>
          {activeRole && (
            <p className="text-[10px] font-medium text-primary/70">{getRoleLabel(activeRole)}</p>
          )}
        </div>
        {hasMultiple && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && hasMultiple && (
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
                <Image
                  src={getCompanyLogo(company.name)}
                  alt={company.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded object-contain"
                />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{company.name}</span>
                    {roleRecord?.is_home && <Home className="h-3 w-3 text-amber-500" />}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {getCompanyFullName(company.name)}
                  </p>
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

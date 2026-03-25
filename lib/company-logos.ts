/** Map company name to its logo path */
const COMPANY_LOGOS: Record<string, string> = {
  FRMG: '/logo/FRMG_LOGO.png',
  ATH: '/logo/ATH_LOGO.png',
}

const COMPANY_FULL_NAMES: Record<string, string> = {
  FRMG: 'Federation Royale Marocaine de Golf',
  ATH: 'Hassan II Golf Trophy Association',
}

const DEFAULT_LOGO = '/logo/FRMG_LOGO.png'

export function getCompanyLogo(companyName?: string | null): string {
  if (!companyName) return DEFAULT_LOGO
  const key = companyName.trim().toUpperCase()
  return COMPANY_LOGOS[key] || DEFAULT_LOGO
}

export function getCompanyFullName(companyName?: string | null): string {
  if (!companyName) return ''
  const key = companyName.trim().toUpperCase()
  return COMPANY_FULL_NAMES[key] || companyName
}

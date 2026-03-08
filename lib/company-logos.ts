/** Map company name to its logo path */
const COMPANY_LOGOS: Record<string, string> = {
  FRMG: '/logo/imgi_57_NV_LOGO_FRMG_ANG-AR-3-removebg-preview.png',
  ATH: '/logo/ath_logo.png',
}

const COMPANY_FULL_NAMES: Record<string, string> = {
  FRMG: 'Federation Royale Marocaine de Golf',
  ATH: 'Hassan II Golf Trophy Association',
}

const DEFAULT_LOGO = '/logo/imgi_57_NV_LOGO_FRMG_ANG-AR-3-removebg-preview.png'

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

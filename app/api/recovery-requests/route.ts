import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SUPABASE_URL =
  process.env.SUPABASE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://cogneapp-kong:8000'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// GET /api/recovery-requests?company_id=123
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const companyId = req.nextUrl.searchParams.get('company_id')

    // Get the user's role (check user_company_roles first, then fallback)
    const admin = getAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    // Determine if user is a manager
    let isManager = false
    const { data: userData } = await admin
      .from('utilisateurs')
      .select('role')
      .eq('id', user.id)
      .single()

    if (companyId) {
      // Check user_company_roles for this company
      const { data: ucr } = await admin
        .from('user_company_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single()

      const effectiveRole = ucr?.role || userData?.role
      isManager = ['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF', 'CHEF_SERVICE', 'RESPONSABLE_ADMIN'].includes(effectiveRole)
    } else {
      isManager = ['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF', 'CHEF_SERVICE'].includes(userData?.role)
    }

    // Build query using service role client (bypasses RLS)
    let query = admin
      .from('recovery_requests')
      .select('*, user:utilisateurs!recovery_requests_user_id_fkey(id, full_name, job_title, department_id, company_id)')
      .order('created_at', { ascending: false })

    // Filter by company
    if (companyId) {
      query = query.eq('user.company_id', companyId)
    }

    // Employees only see their own requests
    if (!isManager) {
      query = query.eq('user_id', user.id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Recovery requests GET error:', error)
      return NextResponse.json({ error: 'Erreur lecture demandes' }, { status: 500 })
    }

    // Filter out rows where user join returned null (different company)
    const filtered = (data || []).filter((r: Record<string, unknown>) => r.user !== null)

    return NextResponse.json(filtered)
  } catch (err) {
    console.error('Recovery requests GET error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

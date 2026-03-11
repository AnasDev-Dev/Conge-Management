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

/**
 * Check if user has 'settings.permissions' action for any of their active company roles.
 * Uses service role client to bypass RLS (avoids circular dependency).
 */
async function hasPermissionsAccess(userId: string): Promise<boolean> {
  const admin = getAdminClient()
  if (!admin) return false

  // Get user's active company roles
  const { data: userRoles } = await admin
    .from('user_company_roles')
    .select('company_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!userRoles || userRoles.length === 0) return false

  // Check if any of their roles have settings.permissions in the DB
  for (const ucr of userRoles) {
    const { data: perm } = await admin
      .from('role_permissions')
      .select('actions')
      .eq('company_id', ucr.company_id)
      .eq('role', ucr.role)
      .single()

    if (perm && Array.isArray(perm.actions) && perm.actions.includes('settings.permissions')) {
      return true
    }
  }

  // Fallback: check static defaults (ADMIN always has it)
  const { data: baseUser } = await admin
    .from('utilisateurs')
    .select('role')
    .eq('id', userId)
    .single()

  if (baseUser?.role === 'ADMIN') return true

  return false
}

// GET /api/role-permissions?company_id=123
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const companyId = req.nextUrl.searchParams.get('company_id')
    if (!companyId) {
      return NextResponse.json({ error: 'company_id requis' }, { status: 400 })
    }

    // Prefer service role client, fall back to user session
    const client = getAdminClient() || supabase
    const { data, error } = await client
      .from('role_permissions')
      .select('*')
      .eq('company_id', companyId)

    if (error) {
      console.error('Role permissions GET error:', error)
      return NextResponse.json({ error: 'Erreur lecture permissions' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Role permissions GET error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// PUT /api/role-permissions — Upsert (single or batch)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Check if caller has settings.permissions (DB-driven, not hardcoded roles)
    const canManage = await hasPermissionsAccess(user.id)
    if (!canManage) {
      return NextResponse.json({ error: 'Non autorisé — permission "settings.permissions" requise' }, { status: 403 })
    }

    // Bootstrap safety: ADMIN must always keep settings.permissions
    const enforceAdminBootstrap = (rows: Record<string, unknown>[]) => {
      return rows.map(row => {
        if (row.role === 'ADMIN' && Array.isArray(row.actions)) {
          const actions = row.actions as string[]
          if (!actions.includes('settings.permissions')) {
            return { ...row, actions: [...actions, 'settings.permissions'] }
          }
        }
        return row
      })
    }

    // Prefer service role client, fall back to user session
    const client = getAdminClient() || supabase

    // Batch upsert: { rows: [...] }
    if (body.rows && Array.isArray(body.rows)) {
      const safeRows = enforceAdminBootstrap(body.rows)
      const { data, error } = await client
        .from('role_permissions')
        .upsert(safeRows, { onConflict: 'company_id,role' })
        .select()

      if (error) {
        console.error('Role permissions batch upsert error:', error)
        return NextResponse.json({ error: 'Erreur lors de la mise à jour des permissions' }, { status: 500 })
      }

      return NextResponse.json(data)
    }

    // Single upsert: { company_id, role, sidebar, pages, actions, data_scope }
    const { company_id, role, sidebar, pages, actions, data_scope } = body

    if (!company_id || !role) {
      return NextResponse.json({ error: 'company_id et role sont obligatoires' }, { status: 400 })
    }

    const payload: Record<string, unknown> = { company_id, role }
    if (sidebar !== undefined) payload.sidebar = sidebar
    if (pages !== undefined) payload.pages = pages
    if (actions !== undefined) payload.actions = actions
    if (data_scope !== undefined) payload.data_scope = data_scope

    // Bootstrap safety for single upsert
    const [safePayload] = enforceAdminBootstrap([payload])

    const { data, error } = await client
      .from('role_permissions')
      .upsert(safePayload, { onConflict: 'company_id,role' })
      .select()
      .single()

    if (error) {
      console.error('Role permissions upsert error:', error)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour des permissions' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Role permissions PUT error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

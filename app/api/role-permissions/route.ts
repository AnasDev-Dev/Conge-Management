import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SUPABASE_URL =
  process.env.SUPABASE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://cogneapp-kong:8000'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ALLOWED_ROLES = new Set(['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'])

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function checkAuth() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: caller } = await supabase
    .from('utilisateurs')
    .select('role')
    .eq('id', user.id)
    .single()
  return caller
}

// GET /api/role-permissions?company_id=123
export async function GET(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const companyId = req.nextUrl.searchParams.get('company_id')
    if (!companyId) {
      return NextResponse.json({ error: 'company_id requis' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin
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
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const body = await req.json()
    const admin = getAdminClient()

    // Batch upsert: { rows: [...] }
    if (body.rows && Array.isArray(body.rows)) {
      const { data, error } = await admin
        .from('role_permissions')
        .upsert(body.rows, { onConflict: 'company_id,role' })
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

    const { data, error } = await admin
      .from('role_permissions')
      .upsert(payload, { onConflict: 'company_id,role' })
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

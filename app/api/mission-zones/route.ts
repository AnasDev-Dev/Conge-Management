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

// GET /api/mission-zones?company_id=1
export async function GET(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const companyId = req.nextUrl.searchParams.get('company_id')
    const admin = getAdminClient()
    let query = admin.from('mission_zones').select('*').order('sort_order')
    if (companyId) query = query.eq('company_id', parseInt(companyId))

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('Mission zones GET error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// POST /api/mission-zones
export async function POST(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { name, description, sort_order, company_id } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin.from('mission_zones').insert({
      name: name.trim(),
      description: description?.trim() || null,
      sort_order: sort_order ?? 0,
      company_id: company_id || null,
    }).select().single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Cette zone existe déjà' }, { status: 409 })
      }
      console.error('Mission zone insert error:', error)
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Mission zones POST error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// PUT /api/mission-zones
export async function PUT(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { id, name, description, sort_order, is_active } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) payload.name = name.trim()
    if (description !== undefined) payload.description = description?.trim() || null
    if (sort_order !== undefined) payload.sort_order = sort_order
    if (is_active !== undefined) payload.is_active = is_active

    const admin = getAdminClient()
    const { error } = await admin.from('mission_zones').update(payload).eq('id', id)
    if (error) {
      console.error('Mission zone update error:', error)
      return NextResponse.json({ error: 'Erreur lors de la modification' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Zone modifiée' })
  } catch (err) {
    console.error('Mission zones PUT error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// DELETE /api/mission-zones?id=123
export async function DELETE(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

    const admin = getAdminClient()

    const { count } = await admin.from('mission_requests')
      .select('id', { count: 'exact', head: true })
      .eq('mission_zone_id', parseInt(id))
    if (count && count > 0) {
      return NextResponse.json({ error: `Impossible : ${count} mission(s) utilise(nt) cette zone` }, { status: 409 })
    }

    const { error } = await admin.from('mission_zones').delete().eq('id', parseInt(id))
    if (error) {
      console.error('Mission zone delete error:', error)
      return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Zone supprimée' })
  } catch (err) {
    console.error('Mission zones DELETE error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

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

// GET /api/mission-tariff-grid?company_id=1
export async function GET(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const companyId = req.nextUrl.searchParams.get('company_id')
    const admin = getAdminClient()

    let query = admin.from('mission_tariff_grid').select(`
      *,
      category:mission_personnel_categories!mission_tariff_grid_category_id_fkey(id, name, company_id, sort_order),
      zone:mission_zones!mission_tariff_grid_zone_id_fkey(id, name, company_id, sort_order)
    `)

    if (companyId) {
      query = query.eq('category.company_id', parseInt(companyId))
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('Tariff grid GET error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// PUT /api/mission-tariff-grid (upsert)
export async function PUT(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { category_id, zone_id, petit_dej, dej, diner, indem_avec_pec, indem_sans_pec } = await req.json()
    if (!category_id || !zone_id) {
      return NextResponse.json({ error: 'category_id et zone_id sont obligatoires' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin.from('mission_tariff_grid').upsert({
      category_id,
      zone_id,
      petit_dej: parseFloat(petit_dej) || 0,
      dej: parseFloat(dej) || 0,
      diner: parseFloat(diner) || 0,
      indem_avec_pec: parseFloat(indem_avec_pec) || 0,
      indem_sans_pec: parseFloat(indem_sans_pec) || 0,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'category_id,zone_id',
    }).select().single()

    if (error) {
      console.error('Tariff grid upsert error:', error)
      return NextResponse.json({ error: 'Erreur lors de la sauvegarde' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Tariff grid PUT error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

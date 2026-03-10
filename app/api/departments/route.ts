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

// POST /api/departments — Create
export async function POST(req: NextRequest) {
  try {
    const caller = await checkAuth()
    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { name, annual_leave_days, company_id } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin.from('departments').insert({
      name: name.trim(),
      annual_leave_days: parseFloat(annual_leave_days) || 18,
      company_id: company_id || null,
    }).select().single()

    if (error) {
      console.error('Department insert error:', error)
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Department POST error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// PUT /api/departments — Update (expects { id, ...fields })
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

    // Batch update: array of { id, annual_leave_days } or { id, name }
    if (Array.isArray(body)) {
      const admin = getAdminClient()
      let ok = 0, fail = 0
      for (const item of body) {
        const payload: Record<string, unknown> = {}
        if (item.name !== undefined) payload.name = item.name
        if (item.annual_leave_days !== undefined) payload.annual_leave_days = item.annual_leave_days
        if (Object.keys(payload).length === 0) continue
        const { error } = await admin.from('departments').update(payload).eq('id', item.id)
        if (error) { console.error(error); fail++ } else { ok++ }
      }
      return NextResponse.json({ ok, fail })
    }

    // Single update
    const { id, name, annual_leave_days } = body
    if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

    const payload: Record<string, unknown> = {}
    if (name !== undefined) payload.name = name.trim()
    if (annual_leave_days !== undefined) payload.annual_leave_days = annual_leave_days

    const admin = getAdminClient()
    const { error } = await admin.from('departments').update(payload).eq('id', id)
    if (error) {
      console.error('Department update error:', error)
      return NextResponse.json({ error: 'Erreur lors de la modification' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Département modifié' })
  } catch (err) {
    console.error('Department PUT error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

// DELETE /api/departments?id=123
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

    // Check if employees are assigned
    const { count } = await admin.from('utilisateurs').select('id', { count: 'exact', head: true }).eq('department_id', parseInt(id))
    if (count && count > 0) {
      return NextResponse.json({ error: `Impossible : ${count} employé(s) dans ce département` }, { status: 409 })
    }

    const { error } = await admin.from('departments').delete().eq('id', parseInt(id))
    if (error) {
      console.error('Department delete error:', error)
      return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Département supprimé' })
  } catch (err) {
    console.error('Department DELETE error:', err)
    return NextResponse.json({ error: 'Erreur inattendue' }, { status: 500 })
  }
}

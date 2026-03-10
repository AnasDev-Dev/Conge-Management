import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SUPABASE_URL =
  process.env.SUPABASE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://cogneapp-kong:8000'

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ALLOWED_EDIT_ROLES = new Set(['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'])
const ALLOWED_DELETE_ROLES = new Set(['ADMIN'])

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── PUT /api/employees/[id] ────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabaseUser = await createServerClient()
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data: caller } = await supabaseUser
      .from('utilisateurs')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (!caller || !ALLOWED_EDIT_ROLES.has(caller.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas la permission de modifier des employés" },
        { status: 403 }
      )
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Configuration serveur manquante (service role key)' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const supabaseAdmin = getAdminClient()

    // Build update payload (only safe fields)
    const payload: Record<string, unknown> = {}
    const allowedFields = [
      'full_name', 'phone', 'job_title', 'role', 'department_id', 'company_id',
      'hire_date', 'birth_date', 'gender', 'matricule', 'cin', 'cnss', 'rib',
      'address', 'city', 'is_active', 'category_id', 'balance_conge', 'balance_recuperation',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (['company_id', 'department_id', 'category_id'].includes(field)) {
          payload[field] = body[field] ? parseInt(body[field]) : null
        } else if (['balance_conge', 'balance_recuperation'].includes(field)) {
          payload[field] = parseFloat(body[field]) || 0
        } else {
          payload[field] = body[field]
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
    }

    // Update utilisateurs table
    const { error: updateError } = await supabaseAdmin
      .from('utilisateurs')
      .update(payload)
      .eq('id', id)

    if (updateError) {
      console.error('Employee update error:', updateError)
      return NextResponse.json(
        { error: "Erreur lors de la modification de l'employé" },
        { status: 500 }
      )
    }

    // If role changed, update user_company_roles for the employee's active company
    if (body.role && body.company_id) {
      const { error: roleError } = await supabaseAdmin
        .from('user_company_roles')
        .update({ role: body.role, department_id: body.department_id ? parseInt(body.department_id) : null })
        .eq('user_id', id)
        .eq('company_id', parseInt(body.company_id))

      if (roleError) {
        console.error('Role update error:', roleError)
      }
    }

    // Handle company_assignments if provided (Req 3: multi-company)
    if (body.company_assignments && Array.isArray(body.company_assignments)) {
      const assignments = body.company_assignments as Array<{
        company_id: number
        role: string
        department_id: number | null
        is_home: boolean
      }>

      // Validate exactly one home
      const homeCount = assignments.filter(a => a.is_home).length
      if (homeCount !== 1) {
        return NextResponse.json(
          { error: 'Exactement une société doit être définie comme principale' },
          { status: 400 }
        )
      }

      // Delete existing roles for this user
      const { error: deleteError } = await supabaseAdmin
        .from('user_company_roles')
        .delete()
        .eq('user_id', id)

      if (deleteError) {
        console.error('Delete company roles error:', deleteError)
        return NextResponse.json(
          { error: 'Erreur lors de la mise à jour des sociétés' },
          { status: 500 }
        )
      }

      // Insert new roles
      const rows = assignments.map(a => ({
        user_id: id,
        company_id: a.company_id,
        role: a.role,
        department_id: a.department_id,
        is_home: a.is_home,
        is_active: true,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('user_company_roles')
        .insert(rows)

      if (insertError) {
        console.error('Insert company roles error:', insertError)
        return NextResponse.json(
          { error: 'Erreur lors de la mise à jour des sociétés' },
          { status: 500 }
        )
      }

      // Update utilisateurs to match home company
      const home = assignments.find(a => a.is_home)!
      await supabaseAdmin
        .from('utilisateurs')
        .update({
          company_id: home.company_id,
          department_id: home.department_id,
          role: home.role,
        })
        .eq('id', id)
    }

    // If password reset requested
    if (body.new_password && body.new_password.length >= 6) {
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: body.new_password,
      })
      if (pwError) {
        console.error('Password reset error:', pwError)
        return NextResponse.json(
          { error: 'Employé modifié mais erreur lors de la réinitialisation du mot de passe' },
          { status: 207 }
        )
      }
    }

    return NextResponse.json(
      { message: 'Employé modifié avec succès' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Update employee error:', err)
    return NextResponse.json(
      { error: 'Une erreur inattendue est survenue' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/employees/[id] ─────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabaseUser = await createServerClient()
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data: caller } = await supabaseUser
      .from('utilisateurs')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (!caller || !ALLOWED_DELETE_ROLES.has(caller.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas la permission de supprimer des employés" },
        { status: 403 }
      )
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Configuration serveur manquante (service role key)' },
        { status: 500 }
      )
    }

    // Prevent self-deletion
    if (id === authUser.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas supprimer votre propre compte' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getAdminClient()

    // Soft-delete: set is_active = false
    const { error: updateError } = await supabaseAdmin
      .from('utilisateurs')
      .update({ is_active: false })
      .eq('id', id)

    if (updateError) {
      console.error('Employee soft-delete error:', updateError)
      return NextResponse.json(
        { error: "Erreur lors de la désactivation de l'employé" },
        { status: 500 }
      )
    }

    // Deactivate company roles
    await supabaseAdmin
      .from('user_company_roles')
      .update({ is_active: false })
      .eq('user_id', id)

    // Ban the auth user so they can't log in
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: '876000h', // ~100 years
    })

    if (banError) {
      console.error('Auth ban error:', banError)
    }

    return NextResponse.json(
      { message: 'Employé désactivé avec succès' },
      { status: 200 }
    )
  } catch (err) {
    console.error('Delete employee error:', err)
    return NextResponse.json(
      { error: 'Une erreur inattendue est survenue' },
      { status: 500 }
    )
  }
}

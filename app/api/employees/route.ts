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

const ALLOWED_ROLES = new Set(['ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'])

export async function POST(req: NextRequest) {
  try {
    // 1. Verify the caller is authenticated and has permission
    const supabaseUser = await createServerClient()
    const {
      data: { user: authUser },
    } = await supabaseUser.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get caller's role from utilisateurs
    const { data: caller } = await supabaseUser
      .from('utilisateurs')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (!caller || !ALLOWED_ROLES.has(caller.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas la permission de créer des employés" },
        { status: 403 }
      )
    }

    // 2. Parse the request body
    const body = await req.json()
    const {
      full_name,
      email,
      password,
      phone,
      role,
      job_title,
      company_id,
      department_id,
      hire_date,
      birth_date,
      gender,
      matricule,
      cin,
      cnss,
      rib,
      address,
      city,
      balance_conge,
      balance_recuperation,
    } = body

    // 3. Validate required fields
    if (!full_name?.trim()) {
      return NextResponse.json(
        { error: 'Le nom complet est obligatoire' },
        { status: 400 }
      )
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { error: "L'email est obligatoire" },
        { status: 400 }
      )
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      )
    }
    if (!company_id) {
      return NextResponse.json(
        { error: 'La société est obligatoire' },
        { status: 400 }
      )
    }
    if (!department_id) {
      return NextResponse.json(
        { error: 'Le département est obligatoire' },
        { status: 400 }
      )
    }
    if (!hire_date) {
      return NextResponse.json(
        { error: "La date d'embauche est obligatoire" },
        { status: 400 }
      )
    }

    // 4. Create admin client with service_role key (bypasses RLS)
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Configuration serveur manquante (service role key)' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // 5. Create the auth user (auto-confirmed)
    const { data: newAuthUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
        },
      })

    if (authError) {
      if (
        authError.message?.includes('already been registered') ||
        authError.message?.includes('already exists')
      ) {
        return NextResponse.json(
          { error: 'Un utilisateur avec cet email existe déjà', code: '23505' },
          { status: 409 }
        )
      }
      console.error('Auth user creation error:', authError)
      return NextResponse.json(
        { error: "Erreur lors de la création du compte d'authentification" },
        { status: 500 }
      )
    }

    // 6. Insert the employee record in utilisateurs with the same UUID
    const payload: Record<string, unknown> = {
      id: newAuthUser.user.id,
      full_name: full_name.trim(),
      email: email.trim(),
      role: role || 'EMPLOYEE',
      is_active: true,
      company_id: parseInt(company_id),
      department_id: parseInt(department_id),
      hire_date,
      balance_conge: parseFloat(balance_conge) || 0,
      balance_recuperation: parseFloat(balance_recuperation) || 0,
    }

    if (phone?.trim()) payload.phone = phone.trim()
    if (job_title?.trim()) payload.job_title = job_title.trim()
    if (birth_date) payload.birth_date = birth_date
    if (gender) payload.gender = gender
    if (matricule?.trim()) payload.matricule = matricule.trim()
    if (cin?.trim()) payload.cin = cin.trim()
    if (cnss?.trim()) payload.cnss = cnss.trim()
    if (rib?.trim()) payload.rib = rib.trim()
    if (address?.trim()) payload.address = address.trim()
    if (city?.trim()) payload.city = city.trim()

    const { error: insertError } = await supabaseAdmin
      .from('utilisateurs')
      .insert(payload)

    if (insertError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id)

      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Un employé avec cet email existe déjà', code: '23505' },
          { status: 409 }
        )
      }
      console.error('Employee insert error:', insertError)
      return NextResponse.json(
        { error: "Erreur lors de la création de l'employé" },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: `${full_name.trim()} a été créé avec succès`, id: newAuthUser.user.id },
      { status: 201 }
    )
  } catch (err) {
    console.error('Create employee error:', err)
    return NextResponse.json(
      { error: 'Une erreur inattendue est survenue' },
      { status: 500 }
    )
  }
}

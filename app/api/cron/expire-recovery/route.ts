import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * API route to expire recovery days and send warnings.
 * Call daily via external cron (Dokploy, GitHub Actions, etc.):
 *   curl -X POST https://your-app/api/cron/expire-recovery \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET env vars.
 */
export async function POST(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    // 1. Expire overdue recovery lots
    const { data: expireResult, error: expireError } = await supabase.rpc('expire_recovery_days')
    if (expireError) throw expireError

    // 2. Send warnings for lots expiring in the next 30 days
    const { data: warnResult, error: warnError } = await supabase.rpc('warn_expiring_recovery_days', {
      p_days_before: 30,
    })
    if (warnError) throw warnError

    return NextResponse.json({
      ok: true,
      expired: expireResult,
      warnings: warnResult,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Cron expire-recovery error:', error)
    return NextResponse.json({ error: 'Internal error', details: String(error) }, { status: 500 })
  }
}

// Also allow GET for easy testing
export async function GET(request: Request) {
  return POST(request)
}

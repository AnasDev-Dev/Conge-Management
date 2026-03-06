import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0ODQ0ODAwLCJleHAiOjIwMTk5NjQ4MDB9.mrwxnw7huvacr_Dc8W1oyF6wNb-4bs6HPpyG8fujZKY'

// Browser requests go through /api/supabase-proxy/* API route which proxies to
// Supabase, bypassing SSL certificate issues (self-signed cert on database.backends.space).
function getSupabaseUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/supabase-proxy`
  }
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://cogneapp-kong:8000'
}

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), SUPABASE_ANON_KEY)
}

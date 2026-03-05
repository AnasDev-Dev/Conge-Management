import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzA0ODQ0ODAwLCJleHAiOjIwMTk5NjQ4MDB9.mrwxnw7huvacr_Dc8W1oyF6wNb-4bs6HPpyG8fujZKY'

// Use a same-origin proxy to avoid SSL certificate issues with the Supabase backend.
// All browser requests go to /supabase-proxy/* which Next.js rewrites to the actual Supabase URL.
// This prevents ERR_CERT_AUTHORITY_INVALID errors in the browser.
function getSupabaseUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/supabase-proxy`
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://database.backends.space'
}

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), SUPABASE_ANON_KEY)
}

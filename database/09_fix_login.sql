-- ============================================================================
-- QUICK FIX: Resolve "Database error querying schema" login error
-- ============================================================================
-- Run this if login returns 500 "Database error querying schema".
-- This script:
--   1. Drops auth.users triggers that interfere with GoTrue login
--   2. Drops orphaned trigger functions
--   3. Reloads PostgREST schema cache
--   4. Verifies auth users are properly configured
-- ============================================================================


-- ============================================================================
-- STEP 1: DROP ALL TRIGGERS ON auth.users
-- ============================================================================
-- GoTrue updates last_sign_in_at during login, which fires any AFTER UPDATE
-- triggers. If those triggers call missing/broken public functions, login fails.

DO $$
DECLARE
  r RECORD;
  trigger_count INT := 0;
BEGIN
  FOR r IN (
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relname = 'users'
    AND NOT t.tgisinternal
  )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
    RAISE NOTICE 'Dropped auth.users trigger: %', r.tgname;
    trigger_count := trigger_count + 1;
  END LOOP;

  IF trigger_count = 0 THEN
    RAISE NOTICE 'No custom triggers found on auth.users (OK)';
  ELSE
    RAISE NOTICE 'Dropped % trigger(s) on auth.users', trigger_count;
  END IF;
END $$;


-- ============================================================================
-- STEP 2: DROP ORPHANED TRIGGER FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;


-- ============================================================================
-- STEP 3: ENSURE ALL RLS-REFERENCED FUNCTIONS EXIST
-- ============================================================================

DO $$
BEGIN
  -- Test that key functions exist and don't error
  PERFORM public.get_my_role();
  RAISE NOTICE 'get_my_role() OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'get_my_role() ERROR: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM public.is_manager();
  RAISE NOTICE 'is_manager() OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'is_manager() ERROR: %', SQLERRM;
END $$;


-- ============================================================================
-- STEP 4: FIX NULL COLUMNS THAT GoTrue CANNOT SCAN
-- ============================================================================
-- GoTrue crashes with "sql: Scan error on column ... converting NULL to string"
-- when these columns are NULL instead of empty string.

UPDATE auth.users SET
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE email_change IS NULL
   OR reauthentication_token IS NULL;

DO $$ BEGIN RAISE NOTICE 'Fixed NULL columns in auth.users'; END $$;


-- ============================================================================
-- STEP 5: VERIFY AUTH USERS ARE PROPERLY CONFIGURED (after fix)
-- ============================================================================

SELECT '--- AUTH USERS STATUS ---' AS section;
SELECT
  au.email,
  CASE WHEN au.email_confirmed_at IS NOT NULL THEN 'VERIFIED' ELSE 'NOT VERIFIED' END AS email_status,
  CASE WHEN au.encrypted_password IS NOT NULL AND au.encrypted_password != '' THEN 'HAS PASSWORD' ELSE 'NO PASSWORD' END AS password_status,
  au.aud,
  au.role AS auth_role,
  (au.raw_app_meta_data->>'email_verified')::text AS email_verified_flag,
  CASE WHEN ai.id IS NOT NULL THEN 'HAS IDENTITY' ELSE 'NO IDENTITY' END AS identity_status,
  CASE WHEN u.id IS NOT NULL THEN 'HAS PROFILE' ELSE 'NO PROFILE' END AS profile_status
FROM auth.users au
LEFT JOIN auth.identities ai ON ai.user_id = au.id
LEFT JOIN public.utilisateurs u ON u.id = au.id
ORDER BY au.email;


-- ============================================================================
-- STEP 6: CHECK FOR REMAINING TRIGGERS ON AUTH TABLES
-- ============================================================================

SELECT '--- REMAINING AUTH TRIGGERS (should be empty) ---' AS section;
SELECT t.tgname, c.relname, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'auth'
AND NOT t.tgisinternal;


-- ============================================================================
-- STEP 7: CHECK RLS POLICIES EXIST
-- ============================================================================

SELECT '--- RLS POLICIES COUNT ---' AS section;
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;


-- ============================================================================
-- STEP 8: RELOAD PostgREST SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

DO $$ BEGIN RAISE NOTICE 'PostgREST schema reload requested. Login should work now.'; END $$;

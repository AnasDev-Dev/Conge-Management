-- ============================================================================
-- FINAL SUPABASE AUTH MIGRATION SCRIPT
-- ============================================================================
-- 1. Creates Auth Users with password 'login1A'
-- 2. Updates `utilisateurs` table to link with Auth Users
-- 3. Handles existing users gracefully
-- ============================================================================

-- Enable required extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user RECORD;
  v_auth_id UUID;
  v_encrypted_password TEXT;
  v_old_id UUID;
BEGIN
  -- 1. Set the default password hash (bcrypt)
  -- Password: login1A
  v_encrypted_password := crypt('login1A', gen_salt('bf'));
  
  RAISE NOTICE 'Starting migration...';

  -- 2. Loop through all active users in your table
  FOR v_user IN 
    SELECT * FROM public.utilisateurs 
    WHERE is_active = TRUE 
    AND email IS NOT NULL
  LOOP
    
    -- Check if auth user already exists by email
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_user.email;
    
    -- If not, create the auth user
    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at, confirmation_token, recovery_token, is_sso_user
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_auth_id,
        'authenticated',
        'authenticated',
        v_user.email,
        v_encrypted_password,
        NOW(), -- Auto confirm
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', v_user.full_name, 'username', v_user.username),
        NOW(),
        NOW(),
        '',
        '',
        FALSE
      );

      -- Create the identity (needed for login)
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_auth_id,
        jsonb_build_object('sub', v_auth_id::text, 'email', v_user.email),
        'email',
        NOW(),
        NOW(),
        NOW()
      );
      
      RAISE NOTICE 'Created auth user for: %', v_user.email;
    ELSE
      RAISE NOTICE 'Auth user already exists for: %', v_user.email;
    END IF;

    -- 3. LINKING: Update the utilisateurs table to use the Auth User ID
    -- This ensures that when they log in, the app finds their profile
    IF v_user.id != v_auth_id THEN
      BEGIN
        -- Disable foreign key checks for this link operation if possible, 
        -- but since we can't easily do that in DO block, we assume
        -- no leave_requests exist yet, OR we update them first.
        
        -- Optional: Update dependent tables if you have data
        -- UPDATE public.leave_requests SET user_id = v_auth_id WHERE user_id = v_user.id;
        
        -- Update the profile ID
        UPDATE public.utilisateurs 
        SET id = v_auth_id 
        WHERE email = v_user.email;
        
        RAISE NOTICE 'Linked utilisateurs table for: %', v_user.email;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not link ID for %: %', v_user.email, SQLERRM;
      END;
    END IF;

  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully!';
END $$;

-- Verify results
SELECT count(*) as total_auth_users FROM auth.users;
SELECT count(*) as total_utilisateurs_linked FROM public.utilisateurs u
JOIN auth.users au ON u.id = au.id;

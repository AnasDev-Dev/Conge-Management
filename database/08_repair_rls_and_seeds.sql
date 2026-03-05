-- ============================================================================
-- REPAIR: RESTORE RLS POLICIES + RESET SEED DATA WITH SIMPLE EMAILS
-- ============================================================================
-- Run this AFTER 06_multi_company_roles.sql to fix the policies that were
-- dropped by DROP FUNCTION ... CASCADE.
--
-- Also resets seed data with easy-to-remember emails:
--   directeur@ath.ma, rh@ath.ma, chef@ath.ma, employee@ath.ma, etc.
--
-- All passwords: Test1234
-- ============================================================================


-- ============================================================================
-- PART 1: RESTORE ALL RLS POLICIES DROPPED BY CASCADE
-- ============================================================================
-- The 06_multi_company_roles.sql used DROP FUNCTION ... CASCADE on
-- get_my_role(), is_manager(), and can_manage_user() which destroyed
-- all policies referencing them. We recreate them here.

-- First, drop any surviving policies to avoid conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ── UTILISATEURS ──
ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "utilisateurs_select_authenticated"
  ON public.utilisateurs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "utilisateurs_update_own_profile"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "utilisateurs_update_manager"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (public.is_manager());

CREATE POLICY "utilisateurs_insert_admin"
  ON public.utilisateurs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'ADMIN');

CREATE POLICY "utilisateurs_delete_admin"
  ON public.utilisateurs FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'ADMIN');


-- ── LEAVE_REQUESTS ──
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_requests_select"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

CREATE POLICY "leave_requests_update"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status)
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status)
  );

CREATE POLICY "leave_requests_delete"
  ON public.leave_requests FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status AND status != 'APPROVED'::public.leave_status)
    OR public.get_my_role() = 'ADMIN'
  );


-- ── MISSION_REQUESTS ──
ALTER TABLE public.mission_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_requests_select_own"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_by);

CREATE POLICY "mission_requests_select_manager"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (public.can_manage_user(user_id));

CREATE POLICY "mission_requests_insert_self"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mission_requests_insert_manager"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_user(user_id));

CREATE POLICY "mission_requests_update"
  ON public.mission_requests FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status)
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status)
  );

CREATE POLICY "mission_requests_delete"
  ON public.mission_requests FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status AND status != 'APPROVED'::public.leave_status)
    OR public.get_my_role() = 'ADMIN'
  );


-- ── COMPANIES ──
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_authenticated"
  ON public.companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "companies_manage_admin"
  ON public.companies FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── DEPARTMENTS ──
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_authenticated"
  ON public.departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "departments_manage_admin"
  ON public.departments FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── LEAVE_BALANCE_HISTORY ──
ALTER TABLE public.leave_balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balance_history_select"
  ON public.leave_balance_history FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

CREATE POLICY "balance_history_insert_manager"
  ON public.leave_balance_history FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_user(user_id));

CREATE POLICY "balance_history_manage_admin"
  ON public.leave_balance_history FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── NOTIFICATIONS ──
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ── HOLIDAYS ──
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select_authenticated"
  ON public.holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY "holidays_manage_admin"
  ON public.holidays FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── WORKING_DAYS ──
ALTER TABLE public.working_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "working_days_select_authenticated"
  ON public.working_days FOR SELECT TO authenticated USING (true);

CREATE POLICY "working_days_manage_admin"
  ON public.working_days FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── AUDIT_LOGS ──
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_only"
  ON public.audit_logs FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ── USER_COMPANY_ROLES ──
ALTER TABLE public.user_company_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles
CREATE POLICY "ucr_select_own"
  ON public.user_company_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins/RH can see all roles
CREATE POLICY "ucr_select_manager"
  ON public.user_company_roles FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'));

-- Admins can manage roles
CREATE POLICY "ucr_manage_admin"
  ON public.user_company_roles FOR ALL TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


DO $$ BEGIN RAISE NOTICE 'RLS policies restored successfully.'; END $$;


-- ============================================================================
-- PART 2: RESET ALL SEED DATA WITH SIMPLE EMAILS
-- ============================================================================
-- Wipe existing data and re-seed with easy-to-remember emails.
-- GoTrue required columns are all included.

-- ============================================================================
-- STEP 0: DROP AUTH TRIGGERS that auto-create utilisateurs from auth.users
-- ============================================================================
-- These triggers can fire during login (GoTrue updates last_sign_in_at)
-- and cause "Database error querying schema" if they reference broken functions.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop ALL triggers on auth.users (they interfere with seed inserts AND logins)
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
    RAISE NOTICE 'Dropped auth trigger: %', r.tgname;
  END LOOP;

  -- Drop functions that might be referenced by those triggers
  DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
  DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
  DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;

  RAISE NOTICE 'Auth triggers cleaned.';
END $$;


-- Clean existing data (order matters for FK constraints)
TRUNCATE public.audit_logs CASCADE;
TRUNCATE public.notifications CASCADE;
TRUNCATE public.leave_balance_history CASCADE;
TRUNCATE public.leave_requests CASCADE;
TRUNCATE public.mission_requests CASCADE;
TRUNCATE public.user_company_roles CASCADE;
TRUNCATE public.holidays CASCADE;
TRUNCATE public.working_days CASCADE;
TRUNCATE public.utilisateurs CASCADE;
TRUNCATE public.departments CASCADE;
TRUNCATE public.companies CASCADE;

-- Clean auth
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
DELETE FROM auth.mfa_factors;
DELETE FROM auth.identities;
DELETE FROM auth.users;


-- ============================================================================
-- COMPANIES
-- ============================================================================

INSERT INTO public.companies (name) VALUES ('ATH'), ('FRMG');


-- ============================================================================
-- DEPARTMENTS
-- ============================================================================

-- ATH departments
INSERT INTO public.departments (name, company_id)
SELECT d.name, c.id
FROM (VALUES
  ('ADMINISTRATIF & FINANCE'),
  ('Sportif'),
  ('Communication'),
  ('Logistique'),
  ('Financier')
) AS d(name)
CROSS JOIN (SELECT id FROM public.companies WHERE name = 'ATH') AS c;

-- FRMG departments
INSERT INTO public.departments (name, company_id)
SELECT d.name, c.id
FROM (VALUES
  ('Direction Generale'),
  ('Ressources Humaines'),
  ('Developpement du Golf'),
  ('Competitions'),
  ('Formation et Academies'),
  ('Marketing et Communication'),
  ('Finance et Comptabilite')
) AS d(name)
CROSS JOIN (SELECT id FROM public.companies WHERE name = 'FRMG') AS c;


-- ============================================================================
-- CREATE ALL USERS (auth + utilisateurs + company roles)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_pass TEXT := crypt('Test1234', gen_salt('bf'));

  -- ── ATH users ──
  uid_employee1  UUID := 'b0000000-0000-0000-0000-000000000001';
  uid_employee2  UUID := 'b0000000-0000-0000-0000-000000000002';
  uid_rh         UUID := 'b0000000-0000-0000-0000-000000000003';
  uid_chef       UUID := 'b0000000-0000-0000-0000-000000000004';
  uid_tresorier  UUID := 'b0000000-0000-0000-0000-000000000005';
  uid_directeur  UUID := 'b0000000-0000-0000-0000-000000000006';
  uid_admin1     UUID := 'b0000000-0000-0000-0000-000000000007';
  uid_admin2     UUID := 'b0000000-0000-0000-0000-000000000008';
  uid_employee3  UUID := 'b0000000-0000-0000-0000-000000000009';

  -- ── FRMG users ──
  uid_frmg_emp1  UUID := 'c0000000-0000-0000-0000-000000000001';
  uid_frmg_emp2  UUID := 'c0000000-0000-0000-0000-000000000002';
  uid_frmg_emp3  UUID := 'c0000000-0000-0000-0000-000000000003';
  uid_frmg_rh    UUID := 'c0000000-0000-0000-0000-000000000004';
  uid_frmg_emp4  UUID := 'c0000000-0000-0000-0000-000000000005';
  uid_frmg_dir   UUID := 'c0000000-0000-0000-0000-000000000006';

  -- Company IDs
  v_ath_id   BIGINT;
  v_frmg_id  BIGINT;

  -- ATH department IDs
  v_ath_admin  BIGINT;
  v_ath_sport  BIGINT;
  v_ath_comm   BIGINT;
  v_ath_log    BIGINT;
  v_ath_fin    BIGINT;

  -- FRMG department IDs
  v_frmg_dir_dept  BIGINT;
  v_frmg_rh_dept   BIGINT;
  v_frmg_dev       BIGINT;
  v_frmg_comp      BIGINT;
  v_frmg_form      BIGINT;
  v_frmg_mktg      BIGINT;
  v_frmg_fin       BIGINT;

BEGIN
  -- Get company IDs
  SELECT id INTO v_ath_id  FROM public.companies WHERE name = 'ATH';
  SELECT id INTO v_frmg_id FROM public.companies WHERE name = 'FRMG';

  -- Get ATH department IDs
  SELECT id INTO v_ath_admin FROM public.departments WHERE name = 'ADMINISTRATIF & FINANCE' AND company_id = v_ath_id;
  SELECT id INTO v_ath_sport FROM public.departments WHERE name = 'Sportif'                 AND company_id = v_ath_id;
  SELECT id INTO v_ath_comm  FROM public.departments WHERE name = 'Communication'            AND company_id = v_ath_id;
  SELECT id INTO v_ath_log   FROM public.departments WHERE name = 'Logistique'               AND company_id = v_ath_id;
  SELECT id INTO v_ath_fin   FROM public.departments WHERE name = 'Financier'                AND company_id = v_ath_id;

  -- Get FRMG department IDs
  SELECT id INTO v_frmg_dir_dept FROM public.departments WHERE name = 'Direction Generale'        AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_rh_dept  FROM public.departments WHERE name = 'Ressources Humaines'       AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_dev      FROM public.departments WHERE name = 'Developpement du Golf'     AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_comp     FROM public.departments WHERE name = 'Competitions'               AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_form     FROM public.departments WHERE name = 'Formation et Academies'    AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_mktg     FROM public.departments WHERE name = 'Marketing et Communication' AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_fin      FROM public.departments WHERE name = 'Finance et Comptabilite'   AND company_id = v_frmg_id;


  -- ====================================================================
  -- AUTH USERS (GoTrue required columns included)
  -- ====================================================================
  -- Required GoTrue columns:
  --   instance_id, id, aud, role, email, encrypted_password,
  --   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  --   created_at, updated_at, confirmation_token, recovery_token,
  --   is_sso_user
  -- Plus auth.identities row with provider='email'

  -- ── ATH USERS ──

  -- employee@ath.ma (Salma - EMPLOYEE, Sportif)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_employee1, 'authenticated', 'authenticated', 'employee@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Salma Berrada"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_employee1, jsonb_build_object('sub', uid_employee1::text, 'email', 'employee@ath.ma'), 'email', uid_employee1::text, NOW(), NOW(), NOW());

  -- employee2@ath.ma (Youssef - EMPLOYEE, Communication)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_employee2, 'authenticated', 'authenticated', 'employee2@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Youssef Amrani"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_employee2, jsonb_build_object('sub', uid_employee2::text, 'email', 'employee2@ath.ma'), 'email', uid_employee2::text, NOW(), NOW(), NOW());

  -- rh@ath.ma (Nadia - RH, Admin & Finance)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_rh, 'authenticated', 'authenticated', 'rh@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Nadia Fassi"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_rh, jsonb_build_object('sub', uid_rh::text, 'email', 'rh@ath.ma'), 'email', uid_rh::text, NOW(), NOW(), NOW());

  -- chef@ath.ma (Karim - CHEF_SERVICE, Sportif)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_chef, 'authenticated', 'authenticated', 'chef@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Karim Bennani"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_chef, jsonb_build_object('sub', uid_chef::text, 'email', 'chef@ath.ma'), 'email', uid_chef::text, NOW(), NOW(), NOW());

  -- tresorier@ath.ma (Ahmed - TRESORIER_GENERAL, Financier)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_tresorier, 'authenticated', 'authenticated', 'tresorier@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Ahmed Tazi"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_tresorier, jsonb_build_object('sub', uid_tresorier::text, 'email', 'tresorier@ath.ma'), 'email', uid_tresorier::text, NOW(), NOW(), NOW());

  -- directeur@ath.ma (Fatima - DIRECTEUR_EXECUTIF, Admin & Finance)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_directeur, 'authenticated', 'authenticated', 'directeur@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Fatima Alaoui"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_directeur, jsonb_build_object('sub', uid_directeur::text, 'email', 'directeur@ath.ma'), 'email', uid_directeur::text, NOW(), NOW(), NOW());

  -- admin@ath.ma (Anas - ADMIN)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_admin1, 'authenticated', 'authenticated', 'admin@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Anas Admin"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_admin1, jsonb_build_object('sub', uid_admin1::text, 'email', 'admin@ath.ma'), 'email', uid_admin1::text, NOW(), NOW(), NOW());

  -- admin2@ath.ma (Nabil - ADMIN)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_admin2, 'authenticated', 'authenticated', 'admin2@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Nabil Admin"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_admin2, jsonb_build_object('sub', uid_admin2::text, 'email', 'admin2@ath.ma'), 'email', uid_admin2::text, NOW(), NOW(), NOW());

  -- employee3@ath.ma (Omar - EMPLOYEE, Logistique)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_employee3, 'authenticated', 'authenticated', 'employee3@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Omar Idrissi"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_employee3, jsonb_build_object('sub', uid_employee3::text, 'email', 'employee3@ath.ma'), 'email', uid_employee3::text, NOW(), NOW(), NOW());

  -- ── FRMG USERS ──

  -- employee@frmg.ma (Rachid - EMPLOYEE, Competitions)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_emp1, 'authenticated', 'authenticated', 'employee@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Rachid Moussaoui"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_emp1, jsonb_build_object('sub', uid_frmg_emp1::text, 'email', 'employee@frmg.ma'), 'email', uid_frmg_emp1::text, NOW(), NOW(), NOW());

  -- employee2@frmg.ma (Laila - EMPLOYEE, Formation)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_emp2, 'authenticated', 'authenticated', 'employee2@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Laila Benkirane"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_emp2, jsonb_build_object('sub', uid_frmg_emp2::text, 'email', 'employee2@frmg.ma'), 'email', uid_frmg_emp2::text, NOW(), NOW(), NOW());

  -- employee3@frmg.ma (Hassan - EMPLOYEE, Developpement)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_emp3, 'authenticated', 'authenticated', 'employee3@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Hassan Chraibi"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_emp3, jsonb_build_object('sub', uid_frmg_emp3::text, 'email', 'employee3@frmg.ma'), 'email', uid_frmg_emp3::text, NOW(), NOW(), NOW());

  -- rh@frmg.ma (Zineb - RH, Ressources Humaines)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_rh, 'authenticated', 'authenticated', 'rh@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Zineb El Haddad"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_rh, jsonb_build_object('sub', uid_frmg_rh::text, 'email', 'rh@frmg.ma'), 'email', uid_frmg_rh::text, NOW(), NOW(), NOW());

  -- employee4@frmg.ma (Mouad - EMPLOYEE, Marketing)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_emp4, 'authenticated', 'authenticated', 'employee4@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Mouad Jebli"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_emp4, jsonb_build_object('sub', uid_frmg_emp4::text, 'email', 'employee4@frmg.ma'), 'email', uid_frmg_emp4::text, NOW(), NOW(), NOW());

  -- directeur@frmg.ma (Amina - DIRECTEUR_EXECUTIF, Direction Generale)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_confirm_status, reauthentication_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_frmg_dir, 'authenticated', 'authenticated', 'directeur@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"],"email_verified":true}', '{"full_name":"Amina Senhaji"}', NOW(), NOW(), '', '', '', '', 0, '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_frmg_dir, jsonb_build_object('sub', uid_frmg_dir::text, 'email', 'directeur@frmg.ma'), 'email', uid_frmg_dir::text, NOW(), NOW(), NOW());


  -- ====================================================================
  -- UTILISATEURS PROFILES
  -- ====================================================================

  -- ATH users
  INSERT INTO public.utilisateurs (id, email, full_name, username, company_id, department_id, job_title, role, is_active, balance_conge, balance_recuperation, phone, hire_date, birth_date, matricule, gender, city)
  VALUES
    (uid_employee1, 'employee@ath.ma',   'Salma Berrada',  's.berrada',   v_ath_id, v_ath_sport, 'Coordinatrice Sportive',          'EMPLOYEE',           TRUE, 22, 3,  '0661-234567', '2019-03-15', '1992-07-20', 'MAT-1001', 'F', 'Casablanca'),
    (uid_employee2, 'employee2@ath.ma',  'Youssef Amrani', 'y.amrani',    v_ath_id, v_ath_comm,  'Charge de Communication',         'EMPLOYEE',           TRUE, 18, 0,  '0662-345678', '2020-09-01', '1995-01-12', 'MAT-1002', 'M', 'Rabat'),
    (uid_rh,        'rh@ath.ma',         'Nadia Fassi',    'n.fassi',     v_ath_id, v_ath_admin, 'Responsable RH',                  'RH',                 TRUE, 25, 5,  '0663-456789', '2016-06-01', '1985-11-03', 'MAT-1003', 'F', 'Casablanca'),
    (uid_chef,      'chef@ath.ma',       'Karim Bennani',  'k.bennani',   v_ath_id, v_ath_sport, 'Chef de Service Sportif',         'CHEF_SERVICE',       TRUE, 20, 2,  '0664-567890', '2017-01-10', '1988-04-25', 'MAT-1004', 'M', 'Marrakech'),
    (uid_tresorier, 'tresorier@ath.ma',  'Ahmed Tazi',     'a.tazi',      v_ath_id, v_ath_fin,   'Tresorier General',               'TRESORIER_GENERAL',  TRUE, 24, 0,  '0665-678901', '2015-02-20', '1980-08-15', 'MAT-1005', 'M', 'Casablanca'),
    (uid_directeur, 'directeur@ath.ma',  'Fatima Alaoui',  'f.alaoui',    v_ath_id, v_ath_admin, 'Directrice Executive',            'DIRECTEUR_EXECUTIF', TRUE, 30, 0,  '0666-789012', '2012-11-05', '1975-03-30', 'MAT-1006', 'F', 'Casablanca'),
    (uid_admin1,    'admin@ath.ma',      'Anas Admin',     'anas.admin',  v_ath_id, v_ath_admin, 'Administrateur',                  'ADMIN',              TRUE, 18, 0,  '0667-890123', '2018-04-01', '1990-06-10', 'MAT-1007', 'M', 'Casablanca'),
    (uid_admin2,    'admin2@ath.ma',     'Nabil Admin',    'nabil.admin', v_ath_id, v_ath_admin, 'Administrateur',                  'ADMIN',              TRUE, 18, 0,  '0668-901234', '2018-04-01', '1991-02-15', 'MAT-1008', 'M', 'Casablanca'),
    (uid_employee3, 'employee3@ath.ma',  'Omar Idrissi',   'o.idrissi',   v_ath_id, v_ath_log,   'Assistant Logistique',            'EMPLOYEE',           TRUE, 15, 1,  '0669-012345', '2021-06-01', '1997-09-08', 'MAT-1009', 'M', 'Tanger');

  -- FRMG users
  INSERT INTO public.utilisateurs (id, email, full_name, username, company_id, department_id, job_title, role, is_active, balance_conge, balance_recuperation, phone, hire_date, birth_date, matricule, gender, city)
  VALUES
    (uid_frmg_emp1, 'employee@frmg.ma',  'Rachid Moussaoui', 'r.moussaoui', v_frmg_id, v_frmg_comp,     'Coordinateur Competitions',   'EMPLOYEE',           TRUE, 20, 2,  '0670-111111', '2019-05-01', '1991-03-15', 'FRMG-001', 'M', 'Rabat'),
    (uid_frmg_emp2, 'employee2@frmg.ma', 'Laila Benkirane',  'l.benkirane',  v_frmg_id, v_frmg_form,     'Responsable Formation',       'EMPLOYEE',           TRUE, 18, 0,  '0670-222222', '2020-02-15', '1993-08-22', 'FRMG-002', 'F', 'Casablanca'),
    (uid_frmg_emp3, 'employee3@frmg.ma', 'Hassan Chraibi',   'h.chraibi',    v_frmg_id, v_frmg_dev,      'Ingenieur Developpement',     'EMPLOYEE',           TRUE, 22, 1,  '0670-333333', '2018-09-01', '1988-11-05', 'FRMG-003', 'M', 'Marrakech'),
    (uid_frmg_rh,   'rh@frmg.ma',        'Zineb El Haddad',  'z.elhaddad',   v_frmg_id, v_frmg_rh_dept,  'Responsable RH FRMG',         'RH',                 TRUE, 24, 3,  '0670-444444', '2016-01-10', '1984-06-18', 'FRMG-004', 'F', 'Rabat'),
    (uid_frmg_emp4, 'employee4@frmg.ma', 'Mouad Jebli',      'm.jebli',      v_frmg_id, v_frmg_mktg,     'Charge de Marketing',         'EMPLOYEE',           TRUE, 15, 0,  '0670-555555', '2021-11-01', '1996-02-28', 'FRMG-005', 'M', 'Tanger'),
    (uid_frmg_dir,  'directeur@frmg.ma', 'Amina Senhaji',    'a.senhaji',    v_frmg_id, v_frmg_dir_dept, 'Directrice Generale FRMG',    'DIRECTEUR_EXECUTIF', TRUE, 30, 0,  '0670-666666', '2013-04-01', '1976-12-10', 'FRMG-006', 'F', 'Rabat');


  -- ====================================================================
  -- USER_COMPANY_ROLES
  -- ====================================================================

  -- ── ATH-only users (home = ATH) ──
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_employee1, v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_sport),
    (uid_employee2, v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_comm),
    (uid_employee3, v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_log),
    (uid_tresorier, v_ath_id, 'TRESORIER_GENERAL',  TRUE, TRUE, v_ath_fin),
    (uid_directeur, v_ath_id, 'DIRECTEUR_EXECUTIF', TRUE, TRUE, v_ath_admin);

  -- ── FRMG-only users (home = FRMG) ──
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_frmg_emp1, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_comp),
    (uid_frmg_emp2, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_form),
    (uid_frmg_emp3, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_dev),
    (uid_frmg_emp4, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_mktg),
    (uid_frmg_dir,  v_frmg_id, 'DIRECTEUR_EXECUTIF', TRUE, TRUE, v_frmg_dir_dept);

  -- ====================================================================
  -- MULTI-COMPANY USERS (the key test cases!)
  -- ====================================================================

  -- CASE 1: chef@ath.ma (Karim)
  --   ATH  = CHEF_SERVICE (Sportif)       [HOME - balances here]
  --   FRMG = CHEF_SERVICE (Competitions)  [manager view, approves FRMG requests]
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_chef, v_ath_id,  'CHEF_SERVICE', TRUE, TRUE,  v_ath_sport),
    (uid_chef, v_frmg_id, 'CHEF_SERVICE', TRUE, FALSE, v_frmg_comp);

  -- CASE 2: rh@ath.ma (Nadia)
  --   ATH  = RH (Admin & Finance)    [HOME - balances here]
  --   FRMG = EMPLOYEE (Competitions) [employee view at FRMG]
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_rh, v_ath_id,  'RH',       TRUE, TRUE,  v_ath_admin),
    (uid_rh, v_frmg_id, 'EMPLOYEE', TRUE, FALSE, v_frmg_comp);

  -- CASE 3: rh@frmg.ma (Zineb)
  --   FRMG = RH (Ressources Humaines) [HOME]
  --   ATH  = RH (Admin & Finance)     [RH at BOTH companies!]
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_frmg_rh, v_frmg_id, 'RH', TRUE, TRUE,  v_frmg_rh_dept),
    (uid_frmg_rh, v_ath_id,  'RH', TRUE, FALSE, v_ath_admin);

  -- CASE 4: admin@ath.ma (Anas) - ADMIN at both
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_admin1, v_ath_id,  'ADMIN', TRUE, TRUE,  v_ath_admin),
    (uid_admin1, v_frmg_id, 'ADMIN', TRUE, FALSE, v_frmg_dir_dept);

  -- CASE 5: admin2@ath.ma (Nabil) - ADMIN at both
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_admin2, v_ath_id,  'ADMIN', TRUE, TRUE,  v_ath_admin),
    (uid_admin2, v_frmg_id, 'ADMIN', TRUE, FALSE, v_frmg_dir_dept);


  -- ====================================================================
  -- LEAVE REQUESTS (test data for validation flow)
  -- ====================================================================

  -- ATH: 3x PENDING (for rh@ath.ma to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES
    (uid_employee1, 'CONGE',        '2026-03-16', '2026-03-20', 5, '2026-03-23', 'PENDING', 'Vacances familiales a Agadir',                22, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
    (uid_employee1, 'RECUPERATION', '2026-03-25', '2026-03-26', 2, '2026-03-27', 'PENDING', 'Recuperation heures supplementaires tournoi',  3,  NOW() - INTERVAL '1 day',  NOW() - INTERVAL '1 day'),
    (uid_employee2, 'CONGE',        '2026-04-06', '2026-04-17', 10,'2026-04-20', 'PENDING', 'Conge annuel - voyage personnel',              18, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

  -- ATH: 2x VALIDATED_RP (for chef@ath.ma to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES
    (uid_employee2, 'CONGE', '2026-03-02', '2026-03-04', 3, '2026-03-05', 'VALIDATED_RP', 'Rendez-vous medical et repos',  18, uid_rh, NOW() - INTERVAL '1 day',    NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day'),
    (uid_employee1, 'CONGE', '2026-02-27', '2026-02-27', 1, '2026-03-02', 'VALIDATED_RP', 'Rendez-vous administratif',     22, uid_rh, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '3 days', NOW() - INTERVAL '12 hours');

  -- ATH: 1x VALIDATED_DC (for tresorier@ath.ma)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, created_at, updated_at)
  VALUES
    (uid_employee3, 'CONGE', '2026-04-20', '2026-04-24', 5, '2026-04-27', 'VALIDATED_DC', 'Fete familiale a Fes', 15, uid_rh, NOW() - INTERVAL '5 days', uid_chef, NOW() - INTERVAL '3 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days');

  -- ATH: 1x VALIDATED_TG (for directeur@ath.ma)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, approved_by_tg, approved_at_tg, created_at, updated_at)
  VALUES
    (uid_employee2, 'CONGE', '2026-05-04', '2026-05-08', 5, '2026-05-11', 'VALIDATED_TG', 'Conge pour demenagement', 18, uid_rh, NOW() - INTERVAL '10 days', uid_chef, NOW() - INTERVAL '8 days', uid_tresorier, NOW() - INTERVAL '5 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '5 days');

  -- FRMG: 2x PENDING (for rh@frmg.ma to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES
    (uid_frmg_emp1, 'CONGE',        '2026-03-16', '2026-03-20', 5, '2026-03-23', 'PENDING', 'Vacances a Essaouira',               20, NOW() - INTERVAL '1 day',  NOW() - INTERVAL '1 day'),
    (uid_frmg_emp4, 'RECUPERATION', '2026-03-25', '2026-03-25', 1, '2026-03-26', 'PENDING', 'Recuperation journee salon du golf',  0,  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

  -- FRMG: 1x VALIDATED_RP (for chef@ath.ma as FRMG CHEF to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES
    (uid_frmg_emp1, 'CONGE', '2026-04-06', '2026-04-10', 5, '2026-04-13', 'VALIDATED_RP', 'Conge pour mariage cousin', 20, uid_frmg_rh, NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day');

  -- FRMG: 1x APPROVED (history)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, approved_by_de, approved_at_de, created_at, updated_at)
  VALUES
    (uid_frmg_emp3, 'CONGE', '2026-02-10', '2026-02-14', 5, '2026-02-17', 'APPROVED', 'Conge annuel hiver', 22, uid_frmg_rh, NOW() - INTERVAL '25 days', uid_chef, NOW() - INTERVAL '23 days', uid_frmg_dir, NOW() - INTERVAL '20 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '20 days');


  -- ====================================================================
  -- SUMMARY
  -- ====================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE '  DATABASE REPAIRED + RESEEDED';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'ALL PASSWORDS: Test1234';
  RAISE NOTICE '';
  RAISE NOTICE '-- ATH USERS --';
  RAISE NOTICE '  employee@ath.ma      EMPLOYEE        (Sportif)';
  RAISE NOTICE '  employee2@ath.ma     EMPLOYEE        (Communication)';
  RAISE NOTICE '  employee3@ath.ma     EMPLOYEE        (Logistique)';
  RAISE NOTICE '  rh@ath.ma            RH              (Admin & Finance)';
  RAISE NOTICE '  chef@ath.ma          CHEF_SERVICE    (Sportif)';
  RAISE NOTICE '  tresorier@ath.ma     TRESORIER       (Financier)';
  RAISE NOTICE '  directeur@ath.ma     DIRECTEUR_EXEC  (Admin & Finance)';
  RAISE NOTICE '  admin@ath.ma         ADMIN';
  RAISE NOTICE '  admin2@ath.ma        ADMIN';
  RAISE NOTICE '';
  RAISE NOTICE '-- FRMG USERS --';
  RAISE NOTICE '  employee@frmg.ma     EMPLOYEE        (Competitions)';
  RAISE NOTICE '  employee2@frmg.ma    EMPLOYEE        (Formation)';
  RAISE NOTICE '  employee3@frmg.ma    EMPLOYEE        (Developpement)';
  RAISE NOTICE '  employee4@frmg.ma    EMPLOYEE        (Marketing)';
  RAISE NOTICE '  rh@frmg.ma           RH              (Ressources Humaines)';
  RAISE NOTICE '  directeur@frmg.ma    DIRECTEUR_EXEC  (Direction Generale)';
  RAISE NOTICE '';
  RAISE NOTICE '-- MULTI-COMPANY (key test cases) --';
  RAISE NOTICE '  chef@ath.ma     -> ATH=CHEF [HOME] + FRMG=CHEF';
  RAISE NOTICE '  rh@ath.ma       -> ATH=RH [HOME] + FRMG=EMPLOYEE';
  RAISE NOTICE '  rh@frmg.ma      -> FRMG=RH [HOME] + ATH=RH';
  RAISE NOTICE '  admin@ath.ma    -> ATH=ADMIN [HOME] + FRMG=ADMIN';
  RAISE NOTICE '  admin2@ath.ma   -> ATH=ADMIN [HOME] + FRMG=ADMIN';
  RAISE NOTICE '';
  RAISE NOTICE '-- LEAVE REQUESTS --';
  RAISE NOTICE '  ATH:  3x PENDING, 2x VALIDATED_RP, 1x VALIDATED_DC, 1x VALIDATED_TG';
  RAISE NOTICE '  FRMG: 2x PENDING, 1x VALIDATED_RP, 1x APPROVED';
  RAISE NOTICE '=========================================================';

END $$;


-- ============================================================================
-- WORKING DAYS + HOLIDAYS
-- ============================================================================

-- ATH: Mon-Sat (Moroccan jours ouvrables)
INSERT INTO public.working_days (company_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT c.id, true, true, true, true, true, true, false
FROM public.companies c WHERE c.name = 'ATH';

-- FRMG: Mon-Fri (different schedule)
INSERT INTO public.working_days (company_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT c.id, true, true, true, true, true, false, false
FROM public.companies c WHERE c.name = 'FRMG';

-- Moroccan public holidays for ATH
DO $$
DECLARE
  v_ath_id BIGINT;
  v_frmg_id BIGINT;
BEGIN
  SELECT id INTO v_ath_id FROM public.companies WHERE name = 'ATH';
  SELECT id INTO v_frmg_id FROM public.companies WHERE name = 'FRMG';

  INSERT INTO public.holidays (company_id, name, date, is_recurring) VALUES
    -- Fixed national holidays (recurring) - ATH
    (v_ath_id, 'Nouvel An',                         '2025-01-01', true),
    (v_ath_id, 'Manifeste de l''Independance',      '2025-01-11', true),
    (v_ath_id, 'Yennayer (Nouvel An Amazigh)',       '2025-01-14', true),
    (v_ath_id, 'Fete du Travail',                    '2025-05-01', true),
    (v_ath_id, 'Fete du Trone',                      '2025-07-30', true),
    (v_ath_id, 'Allegeance Oued Ed-Dahab',           '2025-08-14', true),
    (v_ath_id, 'Revolution du Roi et du Peuple',     '2025-08-20', true),
    (v_ath_id, 'Fete de la Jeunesse',                '2025-08-21', true),
    (v_ath_id, 'Fete de l''Unite',                   '2025-10-31', true),
    (v_ath_id, 'Marche Verte',                       '2025-11-06', true),
    (v_ath_id, 'Fete de l''Independance',            '2025-11-18', true),
    -- Religious holidays 2025 - ATH
    (v_ath_id, 'Aid Al-Fitr (1er jour)',            '2025-03-30', false),
    (v_ath_id, 'Aid Al-Fitr (2eme jour)',           '2025-03-31', false),
    (v_ath_id, 'Aid Al-Adha (1er jour)',            '2025-06-06', false),
    (v_ath_id, 'Aid Al-Adha (2eme jour)',           '2025-06-07', false),
    (v_ath_id, '1er Moharram',                       '2025-06-26', false),
    (v_ath_id, 'Aid Al Mawlid (1er jour)',          '2025-09-04', false),
    (v_ath_id, 'Aid Al Mawlid (2eme jour)',         '2025-09-05', false),
    -- Religious holidays 2026 - ATH
    (v_ath_id, 'Aid Al-Fitr (1er jour)',            '2026-03-20', false),
    (v_ath_id, 'Aid Al-Fitr (2eme jour)',           '2026-03-21', false),
    (v_ath_id, 'Aid Al-Adha (1er jour)',            '2026-05-27', false),
    (v_ath_id, 'Aid Al-Adha (2eme jour)',           '2026-05-28', false),
    (v_ath_id, '1er Moharram',                       '2026-06-16', false),
    (v_ath_id, 'Aid Al Mawlid (1er jour)',          '2026-08-25', false),
    (v_ath_id, 'Aid Al Mawlid (2eme jour)',         '2026-08-26', false);

  -- Same holidays for FRMG
  INSERT INTO public.holidays (company_id, name, date, is_recurring)
  SELECT v_frmg_id, h.name, h.date, h.is_recurring
  FROM public.holidays h
  WHERE h.company_id = v_ath_id;
END $$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT '--- COMPANIES ---' AS section;
SELECT id, name FROM public.companies ORDER BY name;

SELECT '--- ALL USERS (simple emails) ---' AS section;
SELECT u.email, u.role, u.full_name, c.name AS company,
       CASE WHEN au.id IS NOT NULL THEN 'OK' ELSE 'NO AUTH' END AS gotrue
FROM public.utilisateurs u
LEFT JOIN public.companies c ON c.id = u.company_id
LEFT JOIN auth.users au ON au.id = u.id
ORDER BY c.name, u.role, u.email;

SELECT '--- MULTI-COMPANY ROLES ---' AS section;
SELECT u.email, c.name AS company, ucr.role, ucr.is_home,
       d.name AS department
FROM public.user_company_roles ucr
JOIN public.utilisateurs u ON u.id = ucr.user_id
JOIN public.companies c ON c.id = ucr.company_id
LEFT JOIN public.departments d ON d.id = ucr.department_id
WHERE ucr.is_active = true
ORDER BY u.email, ucr.is_home DESC;

SELECT '--- RLS POLICIES CHECK ---' AS section;
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT '--- AUTH TRIGGERS CHECK (should be empty) ---' AS section;
SELECT tgname, c.relname
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users'
AND NOT t.tgisinternal;

-- ============================================================================
-- RELOAD PostgREST schema cache (critical after policy/function changes)
-- ============================================================================
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

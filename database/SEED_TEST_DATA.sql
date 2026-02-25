-- ============================================================================
-- FULL DATABASE RESET + SEED
-- ============================================================================
-- This script:
--   1. Finds and drops any trigger auto-creating utilisateurs from auth.users
--   2. Wipes ALL data from every table
--   3. Re-seeds companies + departments
--   4. Creates 9 test users (auth + utilisateurs) covering every role
--   5. Creates 8 leave requests at every approval stage
--
-- After running this, you have a clean database ready to test.
-- All users password: Test1234
-- ============================================================================


-- ============================================================================
-- STEP 1: FIND AND DROP TRIGGERS THAT AUTO-CREATE UTILISATEURS
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any trigger on auth.users that might auto-insert into utilisateurs
  FOR r IN (
    SELECT tgname, relname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relname = 'users'
    AND NOT t.tgisinternal
  )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
    RAISE NOTICE 'Dropped trigger: % on auth.users', r.tgname;
  END LOOP;

  -- Also check public schema triggers
  FOR r IN (
    SELECT tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
  )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.relname);
    RAISE NOTICE 'Dropped trigger: % on public.%', r.tgname, r.relname;
  END LOOP;

  -- Drop trigger functions that reference utilisateurs
  DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
  DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
  DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;

  RAISE NOTICE 'Triggers cleaned.';
END $$;


-- ============================================================================
-- STEP 2: WIPE ALL DATA
-- ============================================================================

-- Public tables (order matters for FK)
TRUNCATE public.audit_logs CASCADE;
TRUNCATE public.notifications CASCADE;
TRUNCATE public.leave_balance_history CASCADE;
TRUNCATE public.leave_requests CASCADE;
TRUNCATE public.holidays CASCADE;
TRUNCATE public.working_days CASCADE;
TRUNCATE public.utilisateurs CASCADE;
TRUNCATE public.departments CASCADE;
TRUNCATE public.companies CASCADE;

-- Auth tables
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
DELETE FROM auth.mfa_factors;
DELETE FROM auth.identities;
DELETE FROM auth.users;


-- ============================================================================
-- STEP 3: SEED COMPANIES + DEPARTMENTS
-- ============================================================================

INSERT INTO public.companies (legacy_id, name) VALUES
  ('1', 'ATH'),
  ('2', 'TH2')
ON CONFLICT (legacy_id) DO NOTHING;

INSERT INTO public.departments (legacy_id, name, company_id)
SELECT d.id::bigint, d.designation, c.id
FROM (VALUES
  (3,  'Production'),
  (5,  'Partenariat'),
  (6,  'Logistique'),
  (8,  'Communication'),
  (9,  'Sportif'),
  (11, 'ADMINISTRATIF & FINANCE'),
  (14, 'Fonctionnement'),
  (15, 'Sécurité'),
  (16, 'Hébergement'),
  (17, 'ACCREDITATION'),
  (18, 'Restauration'),
  (19, 'SPORTIF TH II'),
  (20, 'PRODUCTION CDT'),
  (21, 'ADMINISTRATIF'),
  (22, 'Financier'),
  (23, 'RECEPTION & ANIMATION')
) AS d(id, designation)
CROSS JOIN (SELECT id FROM public.companies WHERE name = 'ATH') AS c
ON CONFLICT (legacy_id) DO NOTHING;


-- ============================================================================
-- STEP 4: CREATE ALL TEST USERS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_pass TEXT := crypt('Test1234', gen_salt('bf'));

  -- Fixed UUIDs for all users
  uid_salma   UUID := 'b0000000-0000-0000-0000-000000000001';
  uid_youssef UUID := 'b0000000-0000-0000-0000-000000000002';
  uid_nadia   UUID := 'b0000000-0000-0000-0000-000000000003';
  uid_karim   UUID := 'b0000000-0000-0000-0000-000000000004';
  uid_ahmed   UUID := 'b0000000-0000-0000-0000-000000000005';
  uid_fatima  UUID := 'b0000000-0000-0000-0000-000000000006';
  uid_anas    UUID := 'b0000000-0000-0000-0000-000000000007';
  uid_nabil   UUID := 'b0000000-0000-0000-0000-000000000008';
  uid_omar    UUID := 'b0000000-0000-0000-0000-000000000009';

  v_company_id BIGINT;
  v_dept_admin BIGINT;
  v_dept_sport BIGINT;
  v_dept_comm  BIGINT;
  v_dept_log   BIGINT;
  v_dept_fin   BIGINT;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE name = 'ATH' LIMIT 1;
  SELECT id INTO v_dept_admin FROM public.departments WHERE name = 'ADMINISTRATIF & FINANCE' LIMIT 1;
  SELECT id INTO v_dept_sport FROM public.departments WHERE name = 'Sportif' LIMIT 1;
  SELECT id INTO v_dept_comm  FROM public.departments WHERE name = 'Communication' LIMIT 1;
  SELECT id INTO v_dept_log   FROM public.departments WHERE name = 'Logistique' LIMIT 1;
  SELECT id INTO v_dept_fin   FROM public.departments WHERE name = 'Financier' LIMIT 1;

  -- ======================================================================
  -- AUTH USERS + IDENTITIES
  -- ======================================================================

  -- Salma (EMPLOYEE)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_salma, 'authenticated', 'authenticated', 'salma.berrada@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Salma Berrada"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_salma, jsonb_build_object('sub', uid_salma::text, 'email', 'salma.berrada@ath.ma'), 'email', uid_salma::text, NOW(), NOW(), NOW());

  -- Youssef (EMPLOYEE)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_youssef, 'authenticated', 'authenticated', 'youssef.amrani@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Youssef Amrani"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_youssef, jsonb_build_object('sub', uid_youssef::text, 'email', 'youssef.amrani@ath.ma'), 'email', uid_youssef::text, NOW(), NOW(), NOW());

  -- Nadia (RH)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_nadia, 'authenticated', 'authenticated', 'nadia.fassi@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nadia Fassi"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_nadia, jsonb_build_object('sub', uid_nadia::text, 'email', 'nadia.fassi@ath.ma'), 'email', uid_nadia::text, NOW(), NOW(), NOW());

  -- Karim (CHEF_SERVICE)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_karim, 'authenticated', 'authenticated', 'karim.bennani@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Karim Bennani"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_karim, jsonb_build_object('sub', uid_karim::text, 'email', 'karim.bennani@ath.ma'), 'email', uid_karim::text, NOW(), NOW(), NOW());

  -- Ahmed (TRESORIER_GENERAL)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_ahmed, 'authenticated', 'authenticated', 'ahmed.tazi@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmed Tazi"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_ahmed, jsonb_build_object('sub', uid_ahmed::text, 'email', 'ahmed.tazi@ath.ma'), 'email', uid_ahmed::text, NOW(), NOW(), NOW());

  -- Fatima (DIRECTEUR_EXECUTIF)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_fatima, 'authenticated', 'authenticated', 'fatima.alaoui@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fatima Alaoui"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_fatima, jsonb_build_object('sub', uid_fatima::text, 'email', 'fatima.alaoui@ath.ma'), 'email', uid_fatima::text, NOW(), NOW(), NOW());

  -- Anas (ADMIN)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_anas, 'authenticated', 'authenticated', 'anas@admin.com', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Anas Admin"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_anas, jsonb_build_object('sub', uid_anas::text, 'email', 'anas@admin.com'), 'email', uid_anas::text, NOW(), NOW(), NOW());

  -- Nabil (ADMIN)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_nabil, 'authenticated', 'authenticated', 'nabil@admin.com', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nabil Admin"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_nabil, jsonb_build_object('sub', uid_nabil::text, 'email', 'nabil@admin.com'), 'email', uid_nabil::text, NOW(), NOW(), NOW());

  -- Omar (EMPLOYEE - extra for more test data)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_omar, 'authenticated', 'authenticated', 'omar.idrissi@ath.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Omar Idrissi"}', NOW(), NOW(), '', '', FALSE);
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_omar, jsonb_build_object('sub', uid_omar::text, 'email', 'omar.idrissi@ath.ma'), 'email', uid_omar::text, NOW(), NOW(), NOW());

  -- ======================================================================
  -- UTILISATEURS PROFILES (same UUIDs, ON CONFLICT to handle triggers)
  -- ======================================================================

  INSERT INTO public.utilisateurs (id, email, full_name, username, company_id, department_id, job_title, role, is_active, balance_conge, balance_recuperation, phone, hire_date, birth_date, matricule, gender, city)
  VALUES
    (uid_salma,   'salma.berrada@ath.ma',  'Salma Berrada',  's.berrada',  v_company_id, v_dept_sport, 'Coordinatrice Sportive',          'EMPLOYEE',              TRUE, 22, 3, '0661-234567', '2019-03-15', '1992-07-20', 'MAT-1001', 'F', 'Casablanca'),
    (uid_youssef, 'youssef.amrani@ath.ma', 'Youssef Amrani', 'y.amrani',   v_company_id, v_dept_comm,  'Chargé de Communication',         'EMPLOYEE',              TRUE, 18, 0, '0662-345678', '2020-09-01', '1995-01-12', 'MAT-1002', 'M', 'Rabat'),
    (uid_nadia,   'nadia.fassi@ath.ma',    'Nadia Fassi',    'n.fassi',    v_company_id, v_dept_admin, 'Responsable Ressources Humaines', 'RH', TRUE, 25, 5, '0663-456789', '2016-06-01', '1985-11-03', 'MAT-1003', 'F', 'Casablanca'),
    (uid_karim,   'karim.bennani@ath.ma',  'Karim Bennani',  'k.bennani',  v_company_id, v_dept_sport, 'Chef de Service Sportif',         'CHEF_SERVICE',          TRUE, 20, 2, '0664-567890', '2017-01-10', '1988-04-25', 'MAT-1004', 'M', 'Marrakech'),
    (uid_ahmed,   'ahmed.tazi@ath.ma',     'Ahmed Tazi',     'a.tazi',     v_company_id, v_dept_fin,   'Trésorier Général',               'TRESORIER_GENERAL',     TRUE, 24, 0, '0665-678901', '2015-02-20', '1980-08-15', 'MAT-1005', 'M', 'Casablanca'),
    (uid_fatima,  'fatima.alaoui@ath.ma',  'Fatima Alaoui',  'f.alaoui',   v_company_id, v_dept_admin, 'Directrice Exécutive',            'DIRECTEUR_EXECUTIF',    TRUE, 30, 0, '0666-789012', '2012-11-05', '1975-03-30', 'MAT-1006', 'F', 'Casablanca'),
    (uid_anas,    'anas@admin.com',        'Anas Admin',     'anas.admin', v_company_id, v_dept_admin, 'Administrateur',                  'ADMIN',                 TRUE, 18, 0, '0667-890123', '2018-04-01', '1990-06-10', 'MAT-1007', 'M', 'Casablanca'),
    (uid_nabil,   'nabil@admin.com',       'Nabil Admin',    'nabil.admin',v_company_id, v_dept_admin, 'Administrateur',                  'ADMIN',                 TRUE, 18, 0, '0668-901234', '2018-04-01', '1991-02-15', 'MAT-1008', 'M', 'Casablanca'),
    (uid_omar,    'omar.idrissi@ath.ma',   'Omar Idrissi',   'o.idrissi',  v_company_id, v_dept_log,   'Assistant Logistique',            'EMPLOYEE',              TRUE, 15, 1, '0669-012345', '2021-06-01', '1997-09-08', 'MAT-1009', 'M', 'Tanger')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    company_id = EXCLUDED.company_id,
    department_id = EXCLUDED.department_id,
    job_title = EXCLUDED.job_title,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    balance_conge = EXCLUDED.balance_conge,
    balance_recuperation = EXCLUDED.balance_recuperation,
    phone = EXCLUDED.phone,
    hire_date = EXCLUDED.hire_date,
    birth_date = EXCLUDED.birth_date,
    matricule = EXCLUDED.matricule,
    gender = EXCLUDED.gender,
    city = EXCLUDED.city;

  -- ======================================================================
  -- LEAVE REQUESTS
  -- ======================================================================

  -- 3x PENDING (for RH / Nadia to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES
    (uid_salma,   'CONGE',        '2026-03-09', '2026-03-13', 5, '2026-03-16', 'PENDING', 'Vacances familiales à Agadir',                22, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
    (uid_salma,   'RECUPERATION', '2026-03-20', '2026-03-21', 2, '2026-03-23', 'PENDING', 'Récupération heures supplémentaires tournoi',  3,  NOW() - INTERVAL '1 day',  NOW() - INTERVAL '1 day'),
    (uid_youssef, 'CONGE',        '2026-04-06', '2026-04-17', 10,'2026-04-20', 'PENDING', 'Congé annuel - voyage personnel',              18, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

  -- 2x VALIDATED_RP (for Chef / Karim to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES
    (uid_youssef, 'CONGE', '2026-03-02', '2026-03-04', 3, '2026-03-05', 'VALIDATED_RP', 'Rendez-vous médical et repos',  18, uid_nadia, NOW() - INTERVAL '1 day',    NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day'),
    (uid_salma,   'CONGE', '2026-02-27', '2026-02-27', 1, '2026-03-02', 'VALIDATED_RP', 'Rendez-vous administratif',     22, uid_nadia, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '3 days', NOW() - INTERVAL '12 hours');

  -- 1x VALIDATED_DC (for Trésorier / Ahmed to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, created_at, updated_at)
  VALUES
    (uid_omar, 'CONGE', '2026-04-20', '2026-04-24', 5, '2026-04-27', 'VALIDATED_DC', 'Fête familiale à Fès', 15, uid_nadia, NOW() - INTERVAL '5 days', uid_karim, NOW() - INTERVAL '3 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days');

  -- 1x VALIDATED_TG (for Directeur / Fatima to review - final step)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, approved_by_tg, approved_at_tg, created_at, updated_at)
  VALUES
    (uid_youssef, 'CONGE', '2026-05-04', '2026-05-08', 5, '2026-05-11', 'VALIDATED_TG', 'Congé pour déménagement', 18, uid_nadia, NOW() - INTERVAL '10 days', uid_karim, NOW() - INTERVAL '8 days', uid_ahmed, NOW() - INTERVAL '5 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '5 days');

  RAISE NOTICE '';
  RAISE NOTICE '=========================================';
  RAISE NOTICE '  DATABASE RESET COMPLETE';
  RAISE NOTICE '=========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'ALL USERS PASSWORD: Test1234';
  RAISE NOTICE '';
  RAISE NOTICE 'EMPLOYEES:';
  RAISE NOTICE '  salma.berrada@ath.ma   (Coordinatrice Sportive)';
  RAISE NOTICE '  youssef.amrani@ath.ma  (Chargé Communication)';
  RAISE NOTICE '  omar.idrissi@ath.ma    (Assistant Logistique)';
  RAISE NOTICE '';
  RAISE NOTICE 'MANAGERS:';
  RAISE NOTICE '  nadia.fassi@ath.ma     (RH - sees 3 PENDING)';
  RAISE NOTICE '  karim.bennani@ath.ma   (Chef - sees 2 VALIDATED_RP)';
  RAISE NOTICE '  ahmed.tazi@ath.ma      (Trésorier - sees 1 VALIDATED_DC)';
  RAISE NOTICE '  fatima.alaoui@ath.ma   (Directeur - sees 1 VALIDATED_TG)';
  RAISE NOTICE '';
  RAISE NOTICE 'ADMINS:';
  RAISE NOTICE '  anas@admin.com         (sees all)';
  RAISE NOTICE '  nabil@admin.com        (sees all)';
  RAISE NOTICE '=========================================';

END $$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT '--- USERS ---' AS section;
SELECT u.full_name, u.email, u.role, u.balance_conge,
       CASE WHEN au.id IS NOT NULL THEN 'OK' ELSE 'NO AUTH' END AS auth
FROM public.utilisateurs u
LEFT JOIN auth.users au ON au.id = u.id
ORDER BY u.role, u.full_name;

SELECT '--- LEAVE REQUESTS ---' AS section;
SELECT lr.id, u.full_name, lr.request_type, lr.status, lr.days_count,
       lr.start_date || ' → ' || lr.end_date AS dates
FROM public.leave_requests lr
JOIN public.utilisateurs u ON u.id = lr.user_id
ORDER BY lr.status, lr.created_at;

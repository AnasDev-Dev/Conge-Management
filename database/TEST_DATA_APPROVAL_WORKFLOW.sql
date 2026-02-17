-- ============================================================================
-- TEST DATA: Approval Workflow Testing
-- ============================================================================
-- Run this in your Supabase SQL Editor AFTER the FINAL_MIGRATION.sql
-- and FINAL_AUTH_MIGRATION.sql have been applied.
--
-- Creates 7 test users (one per role) + 8 leave requests at various stages
-- All users login with: password = "Test1234"
--
-- CREDENTIALS TABLE:
-- +--------------------------+-----------------------------------+---------------------------+
-- | Role                     | Email                             | Password                  |
-- +--------------------------+-----------------------------------+---------------------------+
-- | EMPLOYEE                 | salma.berrada@ath.ma              | Test1234                  |
-- | EMPLOYEE                 | youssef.amrani@ath.ma             | Test1234                  |
-- | RESPONSABLE_PERSONNEL    | nadia.fassi@ath.ma                | Test1234                  |
-- | CHEF_SERVICE              | karim.bennani@ath.ma              | Test1234                  |
-- | TRESORIER_GENERAL        | ahmed.tazi@ath.ma                 | Test1234                  |
-- | DIRECTEUR_EXECUTIF       | fatima.alaoui@ath.ma              | Test1234                  |
-- | ADMIN                    | admin.test@ath.ma                 | Test1234                  |
-- +--------------------------+-----------------------------------+---------------------------+
-- ============================================================================

-- Required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- STEP 1: Generate fixed UUIDs for deterministic references
-- ============================================================================
DO $$
DECLARE
  -- User UUIDs
  uid_salma     UUID := 'a0000001-0000-0000-0000-000000000001';
  uid_youssef   UUID := 'a0000001-0000-0000-0000-000000000002';
  uid_nadia     UUID := 'a0000001-0000-0000-0000-000000000003';
  uid_karim     UUID := 'a0000001-0000-0000-0000-000000000004';
  uid_ahmed     UUID := 'a0000001-0000-0000-0000-000000000005';
  uid_fatima    UUID := 'a0000001-0000-0000-0000-000000000006';
  uid_admin     UUID := 'a0000001-0000-0000-0000-000000000007';

  v_encrypted   TEXT;
  v_company_id  BIGINT;
  v_dept_admin  BIGINT;
  v_dept_sport  BIGINT;
  v_dept_comm   BIGINT;
  v_dept_log    BIGINT;
BEGIN

  -- Hash the test password
  v_encrypted := crypt('Test1234', gen_salt('bf'));

  -- Get company and department IDs
  SELECT id INTO v_company_id FROM public.companies WHERE name = 'ATH' LIMIT 1;
  SELECT id INTO v_dept_admin FROM public.departments WHERE name = 'ADMINISTRATIF & FINANCE' LIMIT 1;
  SELECT id INTO v_dept_sport FROM public.departments WHERE name = 'Sportif' LIMIT 1;
  SELECT id INTO v_dept_comm  FROM public.departments WHERE name = 'Communication' LIMIT 1;
  SELECT id INTO v_dept_log   FROM public.departments WHERE name = 'Logistique' LIMIT 1;

  -- ========================================================================
  -- STEP 2: Create Auth Users (auth.users + auth.identities)
  -- ========================================================================

  -- 1) Salma Berrada - EMPLOYEE (Sportif)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_salma, 'authenticated', 'authenticated', 'salma.berrada@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Salma Berrada"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_salma, jsonb_build_object('sub', uid_salma::text, 'email', 'salma.berrada@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 2) Youssef Amrani - EMPLOYEE (Communication)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_youssef, 'authenticated', 'authenticated', 'youssef.amrani@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Youssef Amrani"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_youssef, jsonb_build_object('sub', uid_youssef::text, 'email', 'youssef.amrani@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 3) Nadia Fassi - RESPONSABLE_PERSONNEL (RH)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_nadia, 'authenticated', 'authenticated', 'nadia.fassi@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nadia Fassi"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_nadia, jsonb_build_object('sub', uid_nadia::text, 'email', 'nadia.fassi@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 4) Karim Bennani - CHEF_SERVICE
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_karim, 'authenticated', 'authenticated', 'karim.bennani@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Karim Bennani"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_karim, jsonb_build_object('sub', uid_karim::text, 'email', 'karim.bennani@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 5) Ahmed Tazi - TRESORIER_GENERAL
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_ahmed, 'authenticated', 'authenticated', 'ahmed.tazi@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmed Tazi"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_ahmed, jsonb_build_object('sub', uid_ahmed::text, 'email', 'ahmed.tazi@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 6) Fatima Alaoui - DIRECTEUR_EXECUTIF
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_fatima, 'authenticated', 'authenticated', 'fatima.alaoui@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fatima Alaoui"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_fatima, jsonb_build_object('sub', uid_fatima::text, 'email', 'fatima.alaoui@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- 7) Admin Test - ADMIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_admin, 'authenticated', 'authenticated', 'admin.test@ath.ma', v_encrypted, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Test"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_admin, jsonb_build_object('sub', uid_admin::text, 'email', 'admin.test@ath.ma'), 'email', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- ========================================================================
  -- STEP 3: Create Utilisateurs profiles (linked by same UUID)
  -- ========================================================================

  INSERT INTO public.utilisateurs (id, email, full_name, username, company_id, department_id, job_title, role, is_active, balance_conge, balance_recuperation, phone, hire_date, birth_date, matricule, gender, city)
  VALUES
    (uid_salma,   'salma.berrada@ath.ma',   'Salma Berrada',   's.berrada',   v_company_id, v_dept_sport, 'Coordinatrice Sportive',          'EMPLOYEE',                TRUE, 22, 3, '0661-234567', '2019-03-15', '1992-07-20', 'MAT-1001', 'F', 'Casablanca'),
    (uid_youssef, 'youssef.amrani@ath.ma',  'Youssef Amrani',  'y.amrani',    v_company_id, v_dept_comm,  'Chargé de Communication',         'EMPLOYEE',                TRUE, 18, 0, '0662-345678', '2020-09-01', '1995-01-12', 'MAT-1002', 'M', 'Rabat'),
    (uid_nadia,   'nadia.fassi@ath.ma',     'Nadia Fassi',     'n.fassi',     v_company_id, v_dept_admin, 'Responsable Ressources Humaines', 'RESPONSABLE_PERSONNEL',   TRUE, 25, 5, '0663-456789', '2016-06-01', '1985-11-03', 'MAT-1003', 'F', 'Casablanca'),
    (uid_karim,   'karim.bennani@ath.ma',   'Karim Bennani',   'k.bennani',   v_company_id, v_dept_sport, 'Chef de Service Sportif',         'CHEF_SERVICE',            TRUE, 20, 2, '0664-567890', '2017-01-10', '1988-04-25', 'MAT-1004', 'M', 'Marrakech'),
    (uid_ahmed,   'ahmed.tazi@ath.ma',      'Ahmed Tazi',      'a.tazi',      v_company_id, v_dept_admin, 'Trésorier Général',               'TRESORIER_GENERAL',       TRUE, 24, 0, '0665-678901', '2015-02-20', '1980-08-15', 'MAT-1005', 'M', 'Casablanca'),
    (uid_fatima,  'fatima.alaoui@ath.ma',   'Fatima Alaoui',   'f.alaoui',    v_company_id, v_dept_admin, 'Directrice Exécutive',            'DIRECTEUR_EXECUTIF',      TRUE, 30, 0, '0666-789012', '2012-11-05', '1975-03-30', 'MAT-1006', 'F', 'Casablanca'),
    (uid_admin,   'admin.test@ath.ma',      'Admin Test',      'admin.test',  v_company_id, v_dept_admin, 'Administrateur Système',          'ADMIN',                   TRUE, 18, 0, '0667-890123', '2018-04-01', '1990-06-10', 'MAT-1007', 'M', 'Casablanca')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    job_title = EXCLUDED.job_title,
    balance_conge = EXCLUDED.balance_conge,
    balance_recuperation = EXCLUDED.balance_recuperation;

  -- ========================================================================
  -- STEP 4: Create leave requests at various approval stages
  -- ========================================================================

  -- -----------------------------------------------------------------------
  -- A) 3 requests at PENDING (waiting for RH / Nadia to review)
  -- -----------------------------------------------------------------------

  -- Salma: 5-day vacation in March
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES (uid_salma, 'CONGE', '2026-03-09', '2026-03-13', 5, '2026-03-16', 'PENDING', 'Vacances familiales à Agadir', 22, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

  -- Salma: 2-day recovery
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES (uid_salma, 'RECUPERATION', '2026-03-20', '2026-03-21', 2, '2026-03-23', 'PENDING', 'Récupération heures supplémentaires tournoi', 3, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

  -- Youssef: 10-day vacation in April
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES (uid_youssef, 'CONGE', '2026-04-06', '2026-04-17', 10, '2026-04-20', 'PENDING', 'Congé annuel - voyage personnel', 18, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

  -- -----------------------------------------------------------------------
  -- B) 2 requests at VALIDATED_RP (waiting for Chef / Karim)
  --    Already approved by RH (Nadia)
  -- -----------------------------------------------------------------------

  -- Youssef: 3-day leave already validated by RH
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES (uid_youssef, 'CONGE', '2026-03-02', '2026-03-04', 3, '2026-03-05', 'VALIDATED_RP', 'Rendez-vous médical et repos', 18, uid_nadia, NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day');

  -- Salma: 1-day leave already validated by RH
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES (uid_salma, 'CONGE', '2026-02-27', '2026-02-27', 1, '2026-03-02', 'VALIDATED_RP', 'Rendez-vous administratif', 22, uid_nadia, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '3 days', NOW() - INTERVAL '12 hours');

  -- -----------------------------------------------------------------------
  -- C) 1 request at VALIDATED_DC (waiting for Trésorier / Ahmed)
  --    Already approved by RH + Chef
  -- -----------------------------------------------------------------------

  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, created_at, updated_at)
  VALUES (uid_salma, 'CONGE', '2026-04-20', '2026-04-24', 5, '2026-04-27', 'VALIDATED_DC', 'Fête familiale à Fès', 22, uid_nadia, NOW() - INTERVAL '5 days', uid_karim, NOW() - INTERVAL '3 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days');

  -- -----------------------------------------------------------------------
  -- D) 1 request at VALIDATED_TG (waiting for Directeur / Fatima)
  --    Already approved by RH + Chef + Trésorier
  -- -----------------------------------------------------------------------

  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, approved_by_tg, approved_at_tg, created_at, updated_at)
  VALUES (uid_youssef, 'CONGE', '2026-05-04', '2026-05-08', 5, '2026-05-11', 'VALIDATED_TG', 'Congé pour déménagement', 18, uid_nadia, NOW() - INTERVAL '10 days', uid_karim, NOW() - INTERVAL '8 days', uid_ahmed, NOW() - INTERVAL '5 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '5 days');

  RAISE NOTICE '✅ Test data inserted successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '7 test users created (password: Test1234):';
  RAISE NOTICE '  EMPLOYEE:               salma.berrada@ath.ma';
  RAISE NOTICE '  EMPLOYEE:               youssef.amrani@ath.ma';
  RAISE NOTICE '  RESPONSABLE_PERSONNEL:  nadia.fassi@ath.ma';
  RAISE NOTICE '  CHEF_SERVICE:           karim.bennani@ath.ma';
  RAISE NOTICE '  TRESORIER_GENERAL:      ahmed.tazi@ath.ma';
  RAISE NOTICE '  DIRECTEUR_EXECUTIF:     fatima.alaoui@ath.ma';
  RAISE NOTICE '  ADMIN:                  admin.test@ath.ma';
  RAISE NOTICE '';
  RAISE NOTICE '8 leave requests created:';
  RAISE NOTICE '  3x PENDING        → login as nadia.fassi@ath.ma to approve';
  RAISE NOTICE '  2x VALIDATED_RP   → login as karim.bennani@ath.ma to approve';
  RAISE NOTICE '  1x VALIDATED_DC   → login as ahmed.tazi@ath.ma to approve';
  RAISE NOTICE '  1x VALIDATED_TG   → login as fatima.alaoui@ath.ma to approve';

END $$;

-- ============================================================================
-- VERIFICATION: Check what was created
-- ============================================================================

SELECT '--- TEST USERS ---' AS info;
SELECT id, full_name, email, role, balance_conge, balance_recuperation
FROM public.utilisateurs
WHERE email LIKE '%@ath.ma'
  AND id IN (
    'a0000001-0000-0000-0000-000000000001',
    'a0000001-0000-0000-0000-000000000002',
    'a0000001-0000-0000-0000-000000000003',
    'a0000001-0000-0000-0000-000000000004',
    'a0000001-0000-0000-0000-000000000005',
    'a0000001-0000-0000-0000-000000000006',
    'a0000001-0000-0000-0000-000000000007'
  )
ORDER BY role;

SELECT '--- TEST LEAVE REQUESTS ---' AS info;
SELECT lr.id, u.full_name, lr.request_type, lr.start_date, lr.end_date, lr.days_count, lr.status, lr.reason
FROM public.leave_requests lr
JOIN public.utilisateurs u ON u.id = lr.user_id
WHERE lr.user_id IN (
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002'
)
ORDER BY lr.status, lr.created_at;

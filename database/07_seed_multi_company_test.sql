-- ============================================================================
-- SEED: MULTI-COMPANY TEST DATA
-- ============================================================================
-- Run AFTER 06_multi_company_roles.sql
-- Adds:
--   1. FRMG company (if not exists) + departments for FRMG
--   2. 6 new users for FRMG (employees, chef, RH, directeur)
--   3. Multi-company role assignments (some users have roles in BOTH companies)
--   4. Leave requests for FRMG employees (to test validation flow)
--   5. user_company_roles entries for existing ATH users
--
-- Password for all new users: Test1234
-- ============================================================================


-- ============================================================================
-- STEP 1: ENSURE BOTH COMPANIES EXIST
-- ============================================================================

INSERT INTO public.companies (name) VALUES ('FRMG')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.companies (name) VALUES ('ATH')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- STEP 2: FRMG DEPARTMENTS
-- ============================================================================

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
CROSS JOIN (SELECT id FROM public.companies WHERE name = 'FRMG') AS c
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments dep
  WHERE dep.name = d.name AND dep.company_id = c.id
);


-- ============================================================================
-- STEP 3: CREATE FRMG USERS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_pass TEXT := crypt('Test1234', gen_salt('bf'));

  -- Fixed UUIDs for FRMG users (different range to avoid conflicts)
  uid_rachid   UUID := 'c0000000-0000-0000-0000-000000000001';
  uid_laila    UUID := 'c0000000-0000-0000-0000-000000000002';
  uid_hassan   UUID := 'c0000000-0000-0000-0000-000000000003';
  uid_zineb    UUID := 'c0000000-0000-0000-0000-000000000004';
  uid_mouad    UUID := 'c0000000-0000-0000-0000-000000000005';
  uid_amina    UUID := 'c0000000-0000-0000-0000-000000000006';

  -- Existing ATH users (from SEED_TEST_DATA.sql)
  uid_nadia   UUID := 'b0000000-0000-0000-0000-000000000003';  -- RH at ATH
  uid_karim   UUID := 'b0000000-0000-0000-0000-000000000004';  -- CHEF_SERVICE at ATH
  uid_fatima  UUID := 'b0000000-0000-0000-0000-000000000006';  -- DIRECTEUR at ATH
  uid_salma   UUID := 'b0000000-0000-0000-0000-000000000001';  -- EMPLOYEE at ATH
  uid_youssef UUID := 'b0000000-0000-0000-0000-000000000002';  -- EMPLOYEE at ATH
  uid_omar    UUID := 'b0000000-0000-0000-0000-000000000009';  -- EMPLOYEE at ATH
  uid_ahmed   UUID := 'b0000000-0000-0000-0000-000000000005';  -- TRESORIER at ATH
  uid_anas    UUID := 'b0000000-0000-0000-0000-000000000007';  -- ADMIN at ATH
  uid_nabil   UUID := 'b0000000-0000-0000-0000-000000000008';  -- ADMIN at ATH

  v_frmg_id       BIGINT;
  v_ath_id        BIGINT;
  v_frmg_dir      BIGINT;
  v_frmg_rh       BIGINT;
  v_frmg_dev      BIGINT;
  v_frmg_comp     BIGINT;
  v_frmg_form     BIGINT;
  v_frmg_mktg     BIGINT;
  v_frmg_fin      BIGINT;

  -- ATH departments (from existing seed)
  v_ath_admin     BIGINT;
  v_ath_sport     BIGINT;
  v_ath_comm      BIGINT;
  v_ath_log       BIGINT;
  v_ath_fin       BIGINT;
BEGIN
  -- Get company IDs
  SELECT id INTO v_frmg_id FROM public.companies WHERE name = 'FRMG';
  SELECT id INTO v_ath_id  FROM public.companies WHERE name = 'ATH';

  -- Get FRMG department IDs
  SELECT id INTO v_frmg_dir  FROM public.departments WHERE name = 'Direction Generale'        AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_rh   FROM public.departments WHERE name = 'Ressources Humaines'       AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_dev  FROM public.departments WHERE name = 'Developpement du Golf'     AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_comp FROM public.departments WHERE name = 'Competitions'               AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_form FROM public.departments WHERE name = 'Formation et Academies'    AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_mktg FROM public.departments WHERE name = 'Marketing et Communication' AND company_id = v_frmg_id;
  SELECT id INTO v_frmg_fin  FROM public.departments WHERE name = 'Finance et Comptabilite'   AND company_id = v_frmg_id;

  -- Get ATH department IDs
  SELECT id INTO v_ath_admin FROM public.departments WHERE name = 'ADMINISTRATIF & FINANCE' LIMIT 1;
  SELECT id INTO v_ath_sport FROM public.departments WHERE name = 'Sportif' LIMIT 1;
  SELECT id INTO v_ath_comm  FROM public.departments WHERE name = 'Communication' LIMIT 1;
  SELECT id INTO v_ath_log   FROM public.departments WHERE name = 'Logistique' LIMIT 1;
  SELECT id INTO v_ath_fin   FROM public.departments WHERE name = 'Financier' LIMIT 1;

  -- ======================================================================
  -- AUTH USERS FOR FRMG
  -- ======================================================================

  -- Rachid (EMPLOYEE at FRMG, Competitions dept)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_rachid, 'authenticated', 'authenticated', 'rachid.moussaoui@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rachid Moussaoui"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_rachid, jsonb_build_object('sub', uid_rachid::text, 'email', 'rachid.moussaoui@frmg.ma'), 'email', uid_rachid::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Laila (EMPLOYEE at FRMG, Formation dept)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_laila, 'authenticated', 'authenticated', 'laila.benkirane@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Laila Benkirane"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_laila, jsonb_build_object('sub', uid_laila::text, 'email', 'laila.benkirane@frmg.ma'), 'email', uid_laila::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Hassan (EMPLOYEE at FRMG, Developpement dept)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_hassan, 'authenticated', 'authenticated', 'hassan.chraibi@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hassan Chraibi"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_hassan, jsonb_build_object('sub', uid_hassan::text, 'email', 'hassan.chraibi@frmg.ma'), 'email', uid_hassan::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Zineb (RH at FRMG)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_zineb, 'authenticated', 'authenticated', 'zineb.elhaddad@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Zineb El Haddad"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_zineb, jsonb_build_object('sub', uid_zineb::text, 'email', 'zineb.elhaddad@frmg.ma'), 'email', uid_zineb::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Mouad (EMPLOYEE at FRMG, Marketing dept)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_mouad, 'authenticated', 'authenticated', 'mouad.jebli@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mouad Jebli"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_mouad, jsonb_build_object('sub', uid_mouad::text, 'email', 'mouad.jebli@frmg.ma'), 'email', uid_mouad::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- Amina (DIRECTEUR_EXECUTIF at FRMG)
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, is_sso_user)
  VALUES ('00000000-0000-0000-0000-000000000000', uid_amina, 'authenticated', 'authenticated', 'amina.senhaji@frmg.ma', v_pass, NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Amina Senhaji"}', NOW(), NOW(), '', '', FALSE)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), uid_amina, jsonb_build_object('sub', uid_amina::text, 'email', 'amina.senhaji@frmg.ma'), 'email', uid_amina::text, NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  -- ======================================================================
  -- FRMG UTILISATEURS PROFILES
  -- ======================================================================

  INSERT INTO public.utilisateurs (id, email, full_name, username, company_id, department_id, job_title, role, is_active, balance_conge, balance_recuperation, phone, hire_date, birth_date, matricule, gender, city)
  VALUES
    (uid_rachid, 'rachid.moussaoui@frmg.ma', 'Rachid Moussaoui', 'r.moussaoui', v_frmg_id, v_frmg_comp, 'Coordinateur Competitions',    'EMPLOYEE',           TRUE, 20, 2,  '0670-111111', '2019-05-01', '1991-03-15', 'FRMG-001', 'M', 'Rabat'),
    (uid_laila,  'laila.benkirane@frmg.ma',  'Laila Benkirane',  'l.benkirane',  v_frmg_id, v_frmg_form, 'Responsable Formation',        'EMPLOYEE',           TRUE, 18, 0,  '0670-222222', '2020-02-15', '1993-08-22', 'FRMG-002', 'F', 'Casablanca'),
    (uid_hassan, 'hassan.chraibi@frmg.ma',   'Hassan Chraibi',   'h.chraibi',    v_frmg_id, v_frmg_dev,  'Ingenieur Developpement Golf',  'EMPLOYEE',           TRUE, 22, 1,  '0670-333333', '2018-09-01', '1988-11-05', 'FRMG-003', 'M', 'Marrakech'),
    (uid_zineb,  'zineb.elhaddad@frmg.ma',   'Zineb El Haddad',  'z.elhaddad',   v_frmg_id, v_frmg_rh,   'Responsable RH FRMG',          'RH',                 TRUE, 24, 3,  '0670-444444', '2016-01-10', '1984-06-18', 'FRMG-004', 'F', 'Rabat'),
    (uid_mouad,  'mouad.jebli@frmg.ma',      'Mouad Jebli',      'm.jebli',      v_frmg_id, v_frmg_mktg, 'Charge de Marketing',           'EMPLOYEE',           TRUE, 15, 0,  '0670-555555', '2021-11-01', '1996-02-28', 'FRMG-005', 'M', 'Tanger'),
    (uid_amina,  'amina.senhaji@frmg.ma',    'Amina Senhaji',    'a.senhaji',    v_frmg_id, v_frmg_dir,  'Directrice Generale FRMG',      'DIRECTEUR_EXECUTIF', TRUE, 30, 0,  '0670-666666', '2013-04-01', '1976-12-10', 'FRMG-006', 'F', 'Rabat')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, full_name = EXCLUDED.full_name, username = EXCLUDED.username,
    company_id = EXCLUDED.company_id, department_id = EXCLUDED.department_id,
    job_title = EXCLUDED.job_title, role = EXCLUDED.role, is_active = EXCLUDED.is_active,
    balance_conge = EXCLUDED.balance_conge, balance_recuperation = EXCLUDED.balance_recuperation,
    phone = EXCLUDED.phone, hire_date = EXCLUDED.hire_date, birth_date = EXCLUDED.birth_date,
    matricule = EXCLUDED.matricule, gender = EXCLUDED.gender, city = EXCLUDED.city;


  -- ======================================================================
  -- STEP 4: MULTI-COMPANY ROLE ASSIGNMENTS (user_company_roles)
  -- ======================================================================
  -- This is the KEY part: some users have roles in BOTH companies

  -- ── FRMG-only users (home = FRMG) ──

  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_rachid, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_comp),
    (uid_laila,  v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_form),
    (uid_hassan, v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_dev),
    (uid_mouad,  v_frmg_id, 'EMPLOYEE',           TRUE, TRUE, v_frmg_mktg),
    (uid_amina,  v_frmg_id, 'DIRECTEUR_EXECUTIF', TRUE, TRUE, v_frmg_dir)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- ── ATH-only users (home = ATH) ──
  -- (The migration 06 already seeded these, but let's make sure)

  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_salma,   v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_sport),
    (uid_youssef, v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_comm),
    (uid_omar,    v_ath_id, 'EMPLOYEE',           TRUE, TRUE, v_ath_log),
    (uid_ahmed,   v_ath_id, 'TRESORIER_GENERAL',  TRUE, TRUE, v_ath_fin),
    (uid_fatima,  v_ath_id, 'DIRECTEUR_EXECUTIF', TRUE, TRUE, v_ath_admin)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- ======================================================================
  -- MULTI-COMPANY USERS (the interesting test cases!)
  -- ======================================================================

  -- CASE 1: Karim Bennani
  --   ATH  = CHEF_SERVICE (Sportif)  ← home company, balances here
  --   FRMG = CHEF_SERVICE (Competitions) ← manager view, approves FRMG requests
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_karim, v_ath_id,  'CHEF_SERVICE', TRUE, TRUE,  v_ath_sport),
    (uid_karim, v_frmg_id, 'CHEF_SERVICE', TRUE, FALSE, v_frmg_comp)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- CASE 2: Nadia Fassi
  --   ATH  = RH (Admin & Finance)    ← home company, balances here
  --   FRMG = EMPLOYEE (Competitions) ← employee view at FRMG, can submit leave
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_nadia, v_ath_id,  'RH',       TRUE, TRUE,  v_ath_admin),
    (uid_nadia, v_frmg_id, 'EMPLOYEE', TRUE, FALSE, v_frmg_comp)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- CASE 3: Zineb El Haddad
  --   FRMG = RH (Ressources Humaines)  ← home company
  --   ATH  = RH (Admin & Finance)      ← also RH at ATH! Can validate at both
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_zineb, v_frmg_id, 'RH', TRUE, TRUE,  v_frmg_rh),
    (uid_zineb, v_ath_id,  'RH', TRUE, FALSE, v_ath_admin)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- CASE 4: Anas Admin
  --   ATH  = ADMIN ← home
  --   FRMG = ADMIN ← admin at both
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_anas, v_ath_id,  'ADMIN', TRUE, TRUE,  v_ath_admin),
    (uid_anas, v_frmg_id, 'ADMIN', TRUE, FALSE, v_frmg_dir)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;

  -- CASE 5: Nabil Admin
  --   ATH  = ADMIN ← home
  --   FRMG = ADMIN ← admin at both
  INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id) VALUES
    (uid_nabil, v_ath_id,  'ADMIN', TRUE, TRUE,  v_ath_admin),
    (uid_nabil, v_frmg_id, 'ADMIN', TRUE, FALSE, v_frmg_dir)
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = EXCLUDED.role, is_home = EXCLUDED.is_home, department_id = EXCLUDED.department_id;


  -- ======================================================================
  -- STEP 5: LEAVE REQUESTS FOR FRMG EMPLOYEES
  -- ======================================================================
  -- These give the FRMG managers something to validate

  -- 2x PENDING (for Zineb / FRMG RH to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, created_at, updated_at)
  VALUES
    (uid_rachid, 'CONGE',        '2026-03-16', '2026-03-20', 5, '2026-03-23', 'PENDING', 'Vacances a Essaouira',               20, NOW() - INTERVAL '1 day',  NOW() - INTERVAL '1 day'),
    (uid_mouad,  'RECUPERATION', '2026-03-25', '2026-03-25', 1, '2026-03-26', 'PENDING', 'Recuperation journee salon du golf',  0,  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

  -- 1x VALIDATED_RP (for Karim / FRMG CHEF_SERVICE Competitions to review)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, created_at, updated_at)
  VALUES
    (uid_rachid, 'CONGE', '2026-04-06', '2026-04-10', 5, '2026-04-13', 'VALIDATED_RP', 'Conge pour mariage cousin', 20, uid_zineb, NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day');

  -- 1x VALIDATED_DC (for Amina / FRMG Directeur to approve)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, created_at, updated_at)
  VALUES
    (uid_laila, 'CONGE', '2026-04-20', '2026-04-24', 5, '2026-04-27', 'VALIDATED_DC', 'Stage formation a Agadir', 18, uid_zineb, NOW() - INTERVAL '5 days', uid_karim, NOW() - INTERVAL '2 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days');

  -- 1x APPROVED (history)
  INSERT INTO public.leave_requests (user_id, request_type, start_date, end_date, days_count, return_date, status, reason, balance_before, approved_by_rp, approved_at_rp, approved_by_dc, approved_at_dc, approved_by_de, approved_at_de, created_at, updated_at)
  VALUES
    (uid_hassan, 'CONGE', '2026-02-10', '2026-02-14', 5, '2026-02-17', 'APPROVED', 'Conge annuel hiver', 22, uid_zineb, NOW() - INTERVAL '25 days', uid_karim, NOW() - INTERVAL '23 days', uid_amina, NOW() - INTERVAL '20 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '20 days');


  -- ======================================================================
  -- SUMMARY
  -- ======================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE '  MULTI-COMPANY TEST DATA SEEDED';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'ALL PASSWORDS: Test1234';
  RAISE NOTICE '';
  RAISE NOTICE '── FRMG USERS (new) ──';
  RAISE NOTICE '  rachid.moussaoui@frmg.ma  EMPLOYEE       (Competitions)';
  RAISE NOTICE '  laila.benkirane@frmg.ma   EMPLOYEE       (Formation)';
  RAISE NOTICE '  hassan.chraibi@frmg.ma    EMPLOYEE       (Developpement)';
  RAISE NOTICE '  mouad.jebli@frmg.ma       EMPLOYEE       (Marketing)';
  RAISE NOTICE '  zineb.elhaddad@frmg.ma    RH             (Ressources Humaines)';
  RAISE NOTICE '  amina.senhaji@frmg.ma     DIRECTEUR_EXEC (Direction Generale)';
  RAISE NOTICE '';
  RAISE NOTICE '── MULTI-COMPANY USERS (key test cases) ──';
  RAISE NOTICE '';
  RAISE NOTICE '  karim.bennani@ath.ma';
  RAISE NOTICE '    ATH  = CHEF_SERVICE (Sportif)       [HOME]';
  RAISE NOTICE '    FRMG = CHEF_SERVICE (Competitions)';
  RAISE NOTICE '    -> Switch to FRMG: sees manager dashboard, approves FRMG requests';
  RAISE NOTICE '    -> Switch to ATH:  sees manager dashboard + his own balances';
  RAISE NOTICE '';
  RAISE NOTICE '  nadia.fassi@ath.ma';
  RAISE NOTICE '    ATH  = RH (Admin & Finance)         [HOME]';
  RAISE NOTICE '    FRMG = EMPLOYEE (Competitions)';
  RAISE NOTICE '    -> Switch to FRMG: sees employee dashboard, can submit leave';
  RAISE NOTICE '    -> Switch to ATH:  sees RH dashboard, validates requests';
  RAISE NOTICE '';
  RAISE NOTICE '  zineb.elhaddad@frmg.ma';
  RAISE NOTICE '    FRMG = RH (Ressources Humaines)     [HOME]';
  RAISE NOTICE '    ATH  = RH (Admin & Finance)';
  RAISE NOTICE '    -> RH at BOTH companies! Can validate at both';
  RAISE NOTICE '';
  RAISE NOTICE '  anas@admin.com / nabil@admin.com';
  RAISE NOTICE '    ATH  = ADMIN [HOME]';
  RAISE NOTICE '    FRMG = ADMIN';
  RAISE NOTICE '    -> Admin at both companies';
  RAISE NOTICE '';
  RAISE NOTICE '── FRMG LEAVE REQUESTS ──';
  RAISE NOTICE '  2x PENDING      (for Zineb RH to review)';
  RAISE NOTICE '  1x VALIDATED_RP (for Karim CHEF to review)';
  RAISE NOTICE '  1x VALIDATED_DC (for Amina DIRECTEUR to approve)';
  RAISE NOTICE '  1x APPROVED     (history)';
  RAISE NOTICE '=========================================================';

END $$;


-- ============================================================================
-- WORKING DAYS + HOLIDAYS FOR FRMG
-- ============================================================================

INSERT INTO public.working_days (company_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT c.id, true, true, true, true, true, false, false
FROM public.companies c
WHERE c.name = 'FRMG'
AND NOT EXISTS (SELECT 1 FROM public.working_days w WHERE w.company_id = c.id);

-- Copy same Moroccan holidays for FRMG
INSERT INTO public.holidays (company_id, name, date, is_recurring)
SELECT frmg.id, h.name, h.date, h.is_recurring
FROM public.holidays h
CROSS JOIN (SELECT id FROM public.companies WHERE name = 'FRMG') frmg
WHERE h.company_id = (SELECT id FROM public.companies WHERE name = 'ATH')
AND NOT EXISTS (
  SELECT 1 FROM public.holidays h2
  WHERE h2.company_id = frmg.id AND h2.name = h.name AND h2.date = h.date
);


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT '--- COMPANIES ---' AS section;
SELECT id, name FROM public.companies ORDER BY name;

SELECT '--- FRMG DEPARTMENTS ---' AS section;
SELECT d.id, d.name FROM public.departments d
JOIN public.companies c ON c.id = d.company_id
WHERE c.name = 'FRMG' ORDER BY d.name;

SELECT '--- ALL USERS BY COMPANY ---' AS section;
SELECT u.full_name, u.email, u.role AS global_role, c.name AS company, u.balance_conge
FROM public.utilisateurs u
LEFT JOIN public.companies c ON c.id = u.company_id
ORDER BY c.name, u.role, u.full_name;

SELECT '--- MULTI-COMPANY ROLE ASSIGNMENTS ---' AS section;
SELECT u.full_name, c.name AS company, ucr.role, ucr.is_home,
       d.name AS department
FROM public.user_company_roles ucr
JOIN public.utilisateurs u ON u.id = ucr.user_id
JOIN public.companies c ON c.id = ucr.company_id
LEFT JOIN public.departments d ON d.id = ucr.department_id
WHERE ucr.is_active = true
ORDER BY u.full_name, ucr.is_home DESC;

SELECT '--- FRMG LEAVE REQUESTS ---' AS section;
SELECT lr.id, u.full_name, lr.request_type, lr.status, lr.days_count,
       lr.start_date || ' -> ' || lr.end_date AS dates
FROM public.leave_requests lr
JOIN public.utilisateurs u ON u.id = lr.user_id
JOIN public.companies c ON c.id = u.company_id
WHERE c.name = 'FRMG'
ORDER BY lr.status, lr.created_at;

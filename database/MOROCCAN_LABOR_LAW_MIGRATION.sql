-- ============================================================
-- MOROCCAN LABOR LAW - LEAVE BALANCE CALCULATION
-- ============================================================
-- Implements Moroccan Code du Travail (Articles 231-268):
--   - Holiday-aware working day counting
--   - Seniority-based annual entitlement (18 days base + 1.5/5yr)
--   - Balance history tracking on approval
--   - Recuperation credit for rest-day work
--   - Configurable working days (default Mon-Sat)
-- ============================================================


-- ============================================================
-- 1. SEED WORKING DAYS (Mon-Sat default, per Moroccan law)
-- ============================================================
INSERT INTO public.working_days (company_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT c.id, true, true, true, true, true, true, false
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.working_days w WHERE w.company_id = c.id);


-- ============================================================
-- 2. SEED MOROCCAN PUBLIC HOLIDAYS
-- ============================================================

-- 2A. Fixed national holidays (recurring every year)
DO $$
DECLARE
  v_company_id BIGINT;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;

  -- Only insert if holidays table is empty for this company
  IF NOT EXISTS (SELECT 1 FROM public.holidays WHERE company_id = v_company_id) THEN
    INSERT INTO public.holidays (company_id, name, date, is_recurring) VALUES
      (v_company_id, 'Nouvel An',                         '2025-01-01', true),
      (v_company_id, 'Manifeste de l''Indépendance',      '2025-01-11', true),
      (v_company_id, 'Yennayer (Nouvel An Amazigh)',       '2025-01-14', true),
      (v_company_id, 'Fête du Travail',                    '2025-05-01', true),
      (v_company_id, 'Fête du Trône',                      '2025-07-30', true),
      (v_company_id, 'Allégeance Oued Ed-Dahab',           '2025-08-14', true),
      (v_company_id, 'Révolution du Roi et du Peuple',     '2025-08-20', true),
      (v_company_id, 'Fête de la Jeunesse',                '2025-08-21', true),
      (v_company_id, 'Fête de l''Unité',                   '2025-10-31', true),
      (v_company_id, 'Marche Verte',                       '2025-11-06', true),
      (v_company_id, 'Fête de l''Indépendance',            '2025-11-18', true),

    -- 2B. Religious holidays 2025 (variable - Hijri calendar)
      (v_company_id, 'Aïd Al-Fitr (1er jour)',            '2025-03-30', false),
      (v_company_id, 'Aïd Al-Fitr (2ème jour)',           '2025-03-31', false),
      (v_company_id, 'Aïd Al-Adha (1er jour)',            '2025-06-06', false),
      (v_company_id, 'Aïd Al-Adha (2ème jour)',           '2025-06-07', false),
      (v_company_id, '1er Moharram',                       '2025-06-26', false),
      (v_company_id, 'Aïd Al Mawlid (1er jour)',          '2025-09-04', false),
      (v_company_id, 'Aïd Al Mawlid (2ème jour)',         '2025-09-05', false),

    -- 2C. Religious holidays 2026
      (v_company_id, 'Aïd Al-Fitr (1er jour)',            '2026-03-20', false),
      (v_company_id, 'Aïd Al-Fitr (2ème jour)',           '2026-03-21', false),
      (v_company_id, 'Aïd Al-Adha (1er jour)',            '2026-05-27', false),
      (v_company_id, 'Aïd Al-Adha (2ème jour)',           '2026-05-28', false),
      (v_company_id, '1er Moharram',                       '2026-06-16', false),
      (v_company_id, 'Aïd Al Mawlid (1er jour)',          '2026-08-25', false),
      (v_company_id, 'Aïd Al Mawlid (2ème jour)',         '2026-08-26', false),

    -- 2D. Religious holidays 2027
      (v_company_id, 'Aïd Al-Fitr (1er jour)',            '2027-03-10', false),
      (v_company_id, 'Aïd Al-Fitr (2ème jour)',           '2027-03-11', false),
      (v_company_id, 'Aïd Al-Adha (1er jour)',            '2027-05-17', false),
      (v_company_id, 'Aïd Al-Adha (2ème jour)',           '2027-05-18', false),
      (v_company_id, '1er Moharram',                       '2027-06-06', false),
      (v_company_id, 'Aïd Al Mawlid (1er jour)',          '2027-08-14', false),
      (v_company_id, 'Aïd Al Mawlid (2ème jour)',         '2027-08-15', false);
  END IF;
END $$;


-- ============================================================
-- 3. RPC: count_working_days
--    Counts working days between two dates, excluding
--    non-working days (per company config) and holidays.
-- ============================================================
CREATE OR REPLACE FUNCTION count_working_days(
  p_start_date DATE,
  p_end_date   DATE,
  p_company_id BIGINT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count      INTEGER := 0;
  v_current    DATE := p_start_date;
  v_dow        INTEGER;
  v_company    BIGINT;
  v_is_holiday BOOLEAN;
  v_wd         RECORD;
  v_day_active BOOLEAN;
BEGIN
  -- Default to first company if not specified
  v_company := COALESCE(p_company_id, (SELECT id FROM public.companies LIMIT 1));

  -- Fetch working days config
  SELECT * INTO v_wd FROM public.working_days WHERE company_id = v_company LIMIT 1;

  -- If no config found, default to Mon-Sat
  IF NOT FOUND THEN
    v_wd.monday    := true;
    v_wd.tuesday   := true;
    v_wd.wednesday := true;
    v_wd.thursday  := true;
    v_wd.friday    := true;
    v_wd.saturday  := true;
    v_wd.sunday    := false;
  END IF;

  WHILE v_current <= p_end_date LOOP
    -- ISODOW: 1=Monday, 2=Tuesday, ..., 7=Sunday
    v_dow := EXTRACT(ISODOW FROM v_current)::INTEGER;

    -- Check if this day of week is a working day
    v_day_active := CASE v_dow
      WHEN 1 THEN v_wd.monday
      WHEN 2 THEN v_wd.tuesday
      WHEN 3 THEN v_wd.wednesday
      WHEN 4 THEN v_wd.thursday
      WHEN 5 THEN v_wd.friday
      WHEN 6 THEN v_wd.saturday
      WHEN 7 THEN v_wd.sunday
      ELSE false
    END;

    IF v_day_active THEN
      -- Check if this date is a holiday
      SELECT EXISTS(
        SELECT 1 FROM public.holidays h
        WHERE h.company_id = v_company
        AND (
          (h.is_recurring = true
           AND EXTRACT(MONTH FROM h.date) = EXTRACT(MONTH FROM v_current)
           AND EXTRACT(DAY FROM h.date) = EXTRACT(DAY FROM v_current))
          OR
          (h.is_recurring = false AND h.date = v_current)
        )
      ) INTO v_is_holiday;

      IF NOT v_is_holiday THEN
        v_count := v_count + 1;
      END IF;
    END IF;

    v_current := v_current + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ============================================================
-- 4. RPC: calculate_annual_entitlement
--    Moroccan law: 18 jours ouvrables/year base (adults)
--    + 1.5 days per 5-year seniority period, max 30 days
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_annual_entitlement(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user              utilisateurs%ROWTYPE;
  v_hire_date         DATE;
  v_years_of_service  FLOAT;
  v_seniority_periods INTEGER;
  v_base_days         FLOAT := 18.0;   -- jours ouvrables/year (Article 231)
  v_bonus_days        FLOAT := 0;
  v_total_entitlement FLOAT;
  v_max_days          FLOAT := 30.0;   -- max jours ouvrables (Article 232)
  v_is_minor          BOOLEAN := false;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  v_hire_date := COALESCE(v_user.hire_date, CURRENT_DATE);

  -- Check if minor (under 18) -> 24 days base (Article 231)
  IF v_user.birth_date IS NOT NULL THEN
    v_is_minor := (age(CURRENT_DATE, v_user.birth_date) < interval '18 years');
  END IF;

  IF v_is_minor THEN
    v_base_days := 24.0;
  END IF;

  -- Years of service from hire date
  v_years_of_service := EXTRACT(EPOCH FROM age(CURRENT_DATE, v_hire_date)) / (365.25 * 86400);

  -- Seniority bonus: +1.5 jours ouvrables per 5-year period (Article 232)
  v_seniority_periods := FLOOR(v_years_of_service / 5.0)::INTEGER;
  v_bonus_days := v_seniority_periods * 1.5;

  -- Total capped at max
  v_total_entitlement := LEAST(v_base_days + v_bonus_days, v_max_days);

  RETURN jsonb_build_object(
    'user_id',            p_user_id,
    'hire_date',          v_hire_date,
    'years_of_service',   ROUND(v_years_of_service::NUMERIC, 1),
    'seniority_periods',  v_seniority_periods,
    'base_days',          v_base_days,
    'bonus_days',         v_bonus_days,
    'annual_entitlement', v_total_entitlement,
    'is_minor',           v_is_minor,
    'max_days',           v_max_days
  );
END;
$$;


-- ============================================================
-- 5. RPC: calculate_leave_balance
--    Combines entitlement with actual usage for current year
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_leave_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user                utilisateurs%ROWTYPE;
  v_entitlement         JSONB;
  v_annual_entitlement  FLOAT;
  v_current_year        INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_days_used_this_year FLOAT := 0;
  v_days_pending        FLOAT := 0;
  v_recup_used          FLOAT := 0;
  v_recup_pending       FLOAT := 0;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Get entitlement
  v_entitlement := calculate_annual_entitlement(p_user_id);
  v_annual_entitlement := (v_entitlement->>'annual_entitlement')::FLOAT;

  -- Conge days used this year (APPROVED)
  SELECT COALESCE(SUM(days_count), 0) INTO v_days_used_this_year
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'CONGE'
    AND status = 'APPROVED'
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  -- Conge days pending
  SELECT COALESCE(SUM(days_count), 0) INTO v_days_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'CONGE'
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  -- Recuperation days used this year
  SELECT COALESCE(SUM(days_count), 0) INTO v_recup_used
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'RECUPERATION'
    AND status = 'APPROVED'
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  -- Recuperation days pending
  SELECT COALESCE(SUM(days_count), 0) INTO v_recup_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'RECUPERATION'
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  RETURN jsonb_build_object(
    'user_id',              p_user_id,
    'balance_conge',        v_user.balance_conge,
    'balance_recuperation', v_user.balance_recuperation,
    'annual_entitlement',   v_annual_entitlement,
    'days_used_this_year',  v_days_used_this_year,
    'days_pending',         v_days_pending,
    'recup_used',           v_recup_used,
    'recup_pending',        v_recup_pending,
    'entitlement_details',  v_entitlement
  );
END;
$$;


-- ============================================================
-- 6. RPC: credit_recuperation
--    RH/Admin credits recuperation days when employee works
--    on rest days (Sunday, holiday, etc.)
-- ============================================================
CREATE OR REPLACE FUNCTION credit_recuperation(
  p_user_id   UUID,
  p_days      FLOAT,
  p_date_from DATE,
  p_date_to   DATE,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user      utilisateurs%ROWTYPE;
  v_new_balance FLOAT;
BEGIN
  -- Validate user exists
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Validate days
  IF p_days <= 0 THEN
    RAISE EXCEPTION 'Days must be positive';
  END IF;

  -- Update balance
  v_new_balance := v_user.balance_recuperation + p_days;
  UPDATE utilisateurs SET balance_recuperation = v_new_balance WHERE id = p_user_id;

  -- Record in balance history
  INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
  VALUES (
    p_user_id,
    'RECUPERATION',
    p_days,
    COALESCE(p_reason, 'Crédit récupération'),
    EXTRACT(YEAR FROM p_date_from)::INT,
    p_date_from,
    p_date_to
  );

  RETURN jsonb_build_object(
    'user_id',       p_user_id,
    'days_credited', p_days,
    'new_balance',   v_new_balance,
    'reason',        p_reason
  );
END;
$$;


-- ============================================================
-- 7. UPDATE approve_leave_request RPC
--    Add: server-side day recalculation + balance history
-- ============================================================
CREATE OR REPLACE FUNCTION approve_leave_request(
  p_request_id     BIGINT,
  p_approver_id    UUID,
  p_new_start_date DATE DEFAULT NULL,
  p_new_end_date   DATE DEFAULT NULL,
  p_new_days_count FLOAT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request       leave_requests%ROWTYPE;
  v_approver      utilisateurs%ROWTYPE;
  v_request_user  utilisateurs%ROWTYPE;
  v_expected_role TEXT;
  v_next_status   TEXT;
  v_field         TEXT;
  v_days          FLOAT;
  v_balance_field TEXT;
  v_company_id    BIGINT;
BEGIN
  -- Fetch the request
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  -- Fetch the approver
  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver % not found', p_approver_id;
  END IF;

  -- 3-stage approval chain
  CASE v_request.status
    WHEN 'PENDING' THEN
      v_expected_role := 'RH';
      v_next_status := 'VALIDATED_RP';
      v_field := 'rp';
    WHEN 'VALIDATED_RP' THEN
      v_expected_role := 'CHEF_SERVICE';
      v_next_status := 'VALIDATED_DC';
      v_field := 'dc';
    WHEN 'VALIDATED_DC' THEN
      v_expected_role := 'DIRECTEUR_EXECUTIF';
      v_next_status := 'APPROVED';
      v_field := 'de';
    ELSE
      RAISE EXCEPTION 'Request % is in status %, cannot be approved', p_request_id, v_request.status;
  END CASE;

  -- Validate approver role (ADMIN can act at any step)
  IF v_approver.role != v_expected_role AND v_approver.role != 'ADMIN' THEN
    RAISE EXCEPTION 'Approver role % does not match expected role % for status %',
      v_approver.role, v_expected_role, v_request.status;
  END IF;

  -- RH step: optionally update dates
  IF v_field = 'rp' AND p_new_start_date IS NOT NULL AND p_new_end_date IS NOT NULL THEN
    UPDATE leave_requests SET
      start_date = p_new_start_date,
      end_date   = p_new_end_date,
      days_count = COALESCE(p_new_days_count, v_request.days_count)
    WHERE id = p_request_id;

    -- Refresh the record
    SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  END IF;

  v_days := v_request.days_count;

  -- Update status and approval fields
  EXECUTE format(
    'UPDATE leave_requests SET status = $1, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  -- On final approval (APPROVED): recalculate days, deduct balance, record history
  IF v_next_status = 'APPROVED' THEN
    -- Get the request user's company for holiday-aware calculation
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Recalculate days server-side (holiday-aware)
    v_days := count_working_days(v_request.start_date, v_request.end_date, v_company_id);

    -- Update the request with the authoritative day count
    UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;

    -- Deduct from appropriate balance
    IF v_request.request_type = 'CONGE' THEN
      v_balance_field := 'balance_conge';
    ELSE
      v_balance_field := 'balance_recuperation';
    END IF;

    EXECUTE format(
      'UPDATE utilisateurs SET %I = GREATEST(%I - $1, 0) WHERE id = $2',
      v_balance_field, v_balance_field
    ) USING v_days, v_request.user_id;

    -- Record in balance history
    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
    VALUES (
      v_request.user_id,
      v_request.request_type,
      -v_days,
      'Approbation demande #' || p_request_id,
      EXTRACT(YEAR FROM v_request.start_date)::INT,
      v_request.start_date,
      v_request.end_date
    );
  END IF;

  -- Return the updated request
  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================
-- 8. RPC: recalculate_all_balances
--    One-time admin function to reset balances from entitlement
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_all_balances()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user         RECORD;
  v_entitlement  JSONB;
  v_annual       FLOAT;
  v_used         FLOAT;
  v_new_balance  FLOAT;
  v_current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_count        INTEGER := 0;
BEGIN
  FOR v_user IN SELECT id, full_name FROM utilisateurs WHERE is_active = true LOOP
    -- Get entitlement
    v_entitlement := calculate_annual_entitlement(v_user.id);
    v_annual := (v_entitlement->>'annual_entitlement')::FLOAT;

    -- Get approved conge days this year
    SELECT COALESCE(SUM(days_count), 0) INTO v_used
    FROM leave_requests
    WHERE user_id = v_user.id
      AND request_type = 'CONGE'
      AND status = 'APPROVED'
      AND EXTRACT(YEAR FROM start_date) = v_current_year;

    v_new_balance := GREATEST(v_annual - v_used, 0);

    -- Update balance
    UPDATE utilisateurs SET balance_conge = v_new_balance WHERE id = v_user.id;

    -- Record in history
    INSERT INTO leave_balance_history (user_id, type, amount, reason, year)
    VALUES (
      v_user.id,
      'CONGE',
      v_new_balance,
      'Recalcul automatique - Droit annuel ' || v_current_year,
      v_current_year
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'employees_updated', v_count,
    'year',              v_current_year,
    'status',            'completed'
  );
END;
$$;


-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================
GRANT EXECUTE ON FUNCTION count_working_days TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_annual_entitlement TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_leave_balance TO authenticated;
GRANT EXECUTE ON FUNCTION credit_recuperation TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_balances TO authenticated;


-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Check holidays seeded
SELECT COUNT(*) AS total_holidays,
       COUNT(*) FILTER (WHERE is_recurring) AS recurring,
       COUNT(*) FILTER (WHERE NOT is_recurring) AS variable
FROM public.holidays;

-- Check working days
SELECT * FROM public.working_days;

-- Test count_working_days for January 2026 (should exclude Jan 1, 11, 14 + Sundays)
-- SELECT count_working_days('2026-01-01', '2026-01-31');

-- ============================================================================
-- Migration: Balance Model v2 — Department-based entitlement + carry-over
-- ============================================================================
-- balance_conge is now carry-over (solde antérieur), not annual total.
-- Annual entitlement comes from departments.annual_leave_days + seniority.
-- Approval no longer deducts from balance_conge (fixes double-counting bug).
-- ============================================================================

-- 1. Add annual_leave_days to departments (default 18 per Moroccan law)
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS annual_leave_days FLOAT NOT NULL DEFAULT 18;


-- 2. Update calculate_annual_entitlement to use departments instead of personnel_categories
CREATE OR REPLACE FUNCTION calculate_annual_entitlement(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user              utilisateurs%ROWTYPE;
  v_dept              departments%ROWTYPE;
  v_hire_date         DATE;
  v_years_of_service  FLOAT;
  v_seniority_periods INTEGER;
  v_base_days         FLOAT := 18.0;
  v_bonus_days        FLOAT := 0;
  v_total_entitlement FLOAT;
  v_max_days          FLOAT := 30.0;
  v_is_minor          BOOLEAN := false;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Use department-specific annual leave days if available
  IF v_user.department_id IS NOT NULL THEN
    SELECT * INTO v_dept FROM departments WHERE id = v_user.department_id;
    IF FOUND AND v_dept.annual_leave_days IS NOT NULL THEN
      v_base_days := v_dept.annual_leave_days;
    END IF;
  END IF;

  v_hire_date := COALESCE(v_user.hire_date, CURRENT_DATE);

  IF v_user.birth_date IS NOT NULL THEN
    v_is_minor := (age(CURRENT_DATE, v_user.birth_date) < interval '18 years');
  END IF;

  IF v_is_minor THEN
    v_base_days := GREATEST(v_base_days, 24.0);
  END IF;

  v_years_of_service := EXTRACT(EPOCH FROM age(CURRENT_DATE, v_hire_date)) / (365.25 * 86400);
  v_seniority_periods := FLOOR(v_years_of_service / 5.0)::INTEGER;
  v_bonus_days := v_seniority_periods * 1.5;
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
    'max_days',           v_max_days,
    'department_id',      v_user.department_id
  );
END;
$$;


-- 3. Update calculate_leave_balance to use department entitlement + carry-over
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
  v_current_month       INTEGER := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
  v_days_used_this_year FLOAT := 0;
  v_days_pending        FLOAT := 0;
  v_recup_used          FLOAT := 0;
  v_recup_pending       FLOAT := 0;
  v_monthly_accrued     FLOAT := 0;
  v_max_balance         FLOAT := 52.0;
  v_is_max_reached      BOOLEAN := false;
  v_recup_expires_at    DATE;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  v_entitlement := calculate_annual_entitlement(p_user_id);
  v_annual_entitlement := (v_entitlement->>'annual_entitlement')::FLOAT;

  SELECT COALESCE(SUM(days_count), 0) INTO v_days_used_this_year
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'CONGE'
    AND status = 'APPROVED'
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(days_count), 0) INTO v_days_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'CONGE'
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(days_count), 0) INTO v_recup_used
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'RECUPERATION'
    AND status = 'APPROVED'
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(days_count), 0) INTO v_recup_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND request_type = 'RECUPERATION'
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  -- Monthly accrual from department entitlement (not balance_conge)
  v_monthly_accrued := ROUND((v_annual_entitlement / 12.0 * v_current_month)::NUMERIC, 2)::FLOAT;

  -- 52-day cap applies to carry-over
  v_is_max_reached := v_user.balance_conge >= v_max_balance;

  -- Recovery expiration date (June 30 of next year)
  v_recup_expires_at := make_date(v_current_year + 1, 6, 30);

  RETURN jsonb_build_object(
    'user_id',              p_user_id,
    'carry_over',           v_user.balance_conge,
    'balance_conge',        v_user.balance_conge,
    'balance_recuperation', v_user.balance_recuperation,
    'annual_entitlement',   v_annual_entitlement,
    'days_used_this_year',  v_days_used_this_year,
    'days_pending',         v_days_pending,
    'recup_used',           v_recup_used,
    'recup_pending',        v_recup_pending,
    'entitlement_details',  v_entitlement,
    'monthly_accrued',      v_monthly_accrued,
    'monthly_rate',         ROUND((v_annual_entitlement / 12.0)::NUMERIC, 2)::FLOAT,
    'available_now',        GREATEST(v_user.balance_conge + v_monthly_accrued - v_days_used_this_year - v_days_pending, 0),
    'is_max_reached',       v_is_max_reached,
    'max_balance',          v_max_balance,
    'recup_expires_at',     v_recup_expires_at
  );
END;
$$;


-- 4. Update approve_leave_request: stop deducting balance_conge for CONGE
--    (CONGE usage now tracked via leave_requests queries only)
--    Keep RECUPERATION deduction + audit trail for both types
CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id     BIGINT,
  p_approver_id    UUID,
  p_new_start_date DATE DEFAULT NULL,
  p_new_end_date   DATE DEFAULT NULL,
  p_new_days_count FLOAT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request            leave_requests%ROWTYPE;
  v_approver           utilisateurs%ROWTYPE;
  v_request_user       utilisateurs%ROWTYPE;
  v_expected_role      TEXT;
  v_next_status        TEXT;
  v_field              TEXT;
  v_days               FLOAT;
  v_requester_dept_id  BIGINT;
  v_company_id         BIGINT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approbateur introuvable';
  END IF;

  -- Prevent self-approval
  IF p_approver_id = v_request.user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas approuver votre propre demande';
  END IF;

  CASE v_request.status
    WHEN 'PENDING'::public.leave_status THEN
      v_expected_role := 'RH';
      v_next_status := 'VALIDATED_RP';
      v_field := 'rp';
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_expected_role := 'CHEF_SERVICE';
      v_next_status := 'VALIDATED_DC';
      v_field := 'dc';
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_expected_role := 'DIRECTEUR_EXECUTIF';
      v_next_status := 'APPROVED';
      v_field := 'de';
    ELSE
      RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas etre approuvee',
        p_request_id, v_request.status;
  END CASE;

  -- Role check (ADMIN can act at any step)
  IF v_approver.role::TEXT != v_expected_role AND v_approver.role::TEXT != 'ADMIN' THEN
    RAISE EXCEPTION 'Seul le role % peut approuver a cette etape (vous etes %)',
      v_expected_role, v_approver.role;
  END IF;

  -- Department check for CHEF_SERVICE
  IF v_approver.role::TEXT = 'CHEF_SERVICE' THEN
    SELECT department_id INTO v_requester_dept_id
    FROM utilisateurs WHERE id = v_request.user_id;

    IF v_approver.department_id IS NULL
       OR v_requester_dept_id IS NULL
       OR v_approver.department_id != v_requester_dept_id THEN
      RAISE EXCEPTION 'Le chef de service ne peut approuver que les demandes de son departement';
    END IF;
  END IF;

  -- RH can edit dates at PENDING stage
  IF v_field = 'rp' AND p_new_start_date IS NOT NULL AND p_new_end_date IS NOT NULL THEN
    UPDATE leave_requests SET
      start_date = p_new_start_date,
      end_date = p_new_end_date,
      days_count = COALESCE(p_new_days_count, v_request.days_count)
    WHERE id = p_request_id;
    SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  END IF;

  v_days := v_request.days_count;

  -- Update status and approval fields
  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  -- On final approval: recalculate days, deduct RECUPERATION only, record history
  IF v_next_status = 'APPROVED' THEN
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Recalculate days server-side (holiday-aware)
    v_days := count_working_days(v_request.start_date, v_request.end_date, v_company_id);
    UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;

    -- Only deduct balance for RECUPERATION (CONGE tracked via leave_requests queries)
    IF v_request.request_type = 'RECUPERATION' THEN
      UPDATE utilisateurs SET balance_recuperation = GREATEST(balance_recuperation - v_days, 0)
      WHERE id = v_request.user_id;
    END IF;

    -- Audit trail (kept for both types)
    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
    VALUES (
      v_request.user_id,
      v_request.request_type,
      -v_days,
      'Demande approuvee #' || p_request_id,
      EXTRACT(YEAR FROM v_request.start_date)::INT,
      v_request.start_date,
      v_request.end_date
    );
  END IF;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- 5. Update undo_approve_leave_request: stop restoring balance_conge for CONGE
CREATE OR REPLACE FUNCTION public.undo_approve_leave_request(
  p_request_id BIGINT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request      leave_requests%ROWTYPE;
  v_user         utilisateurs%ROWTYPE;
  v_prev_status  TEXT;
  v_field        TEXT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF v_request.status = v_request.initial_status THEN
    RAISE EXCEPTION 'Impossible d''annuler: la demande est a son statut initial';
  END IF;

  CASE v_request.status
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_prev_status := 'PENDING';
      v_field := 'rp';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_rp != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_prev_status := 'VALIDATED_RP';
      v_field := 'dc';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_dc != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      IF v_request.initial_status = 'VALIDATED_DC'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est a son statut initial';
      END IF;
    WHEN 'APPROVED'::public.leave_status THEN
      v_prev_status := 'VALIDATED_DC';
      v_field := 'de';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_de != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;

      -- Only reverse balance for RECUPERATION (CONGE tracked via leave_requests queries)
      IF v_request.request_type = 'RECUPERATION' THEN
        UPDATE utilisateurs SET balance_recuperation = balance_recuperation + v_request.days_count
        WHERE id = v_request.user_id;
      END IF;

      -- Audit trail (kept for both types)
      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (
        v_request.user_id,
        v_request.request_type,
        v_request.days_count,
        'Annulation approbation demande #' || p_request_id,
        EXTRACT(YEAR FROM v_request.start_date)::INT,
        v_request.start_date,
        v_request.end_date
      );
    ELSE
      RAISE EXCEPTION 'La demande #% est au statut %, impossible d''annuler', p_request_id, v_request.status;
  END CASE;

  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = NULL, approved_at_%s = NULL, updated_at = NOW() WHERE id = $2',
    v_field, v_field
  ) USING v_prev_status, p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;

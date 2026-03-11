-- ============================================================================
-- Migration: Working Days per Department
-- ============================================================================
-- Adds department_id to working_days so each department can have its own
-- working schedule. Rows with department_id IS NULL remain the company default.
-- Lookup order: department → company default → hardcoded fallback.
-- ============================================================================

-- 1. Add department_id column to working_days
ALTER TABLE public.working_days
  ADD COLUMN IF NOT EXISTS department_id bigint REFERENCES public.departments(id) ON DELETE CASCADE;

-- 2. Unique constraint: one config per (company, department) pair
--    NULL department_id = company default
CREATE UNIQUE INDEX IF NOT EXISTS uq_working_days_company_department
  ON public.working_days (company_id, COALESCE(department_id, -1));

-- 3. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_working_days_department
  ON public.working_days(department_id) WHERE department_id IS NOT NULL;


-- 4. Update count_working_days() to support department-based lookup
--    New parameter: p_department_id (optional)
--    Lookup order: department → category → company default → hardcoded
CREATE OR REPLACE FUNCTION count_working_days(
  p_start_date     DATE,
  p_end_date       DATE,
  p_company_id     BIGINT DEFAULT NULL,
  p_category_id    BIGINT DEFAULT NULL,
  p_start_half_day TEXT DEFAULT 'FULL',
  p_end_half_day   TEXT DEFAULT 'FULL',
  p_department_id  BIGINT DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count      FLOAT := 0;
  v_current    DATE := p_start_date;
  v_dow        INTEGER;
  v_company    BIGINT;
  v_is_holiday BOOLEAN;
  v_wd         RECORD;
  v_day_active BOOLEAN;
  v_morning    BOOLEAN;
  v_afternoon  BOOLEAN;
  v_day_value  FLOAT;
BEGIN
  v_company := COALESCE(p_company_id, (SELECT id FROM public.companies LIMIT 1));

  -- Priority 1: Department-specific working days
  IF p_department_id IS NOT NULL THEN
    SELECT * INTO v_wd FROM public.working_days
    WHERE company_id = v_company AND department_id = p_department_id
    LIMIT 1;
  END IF;

  -- Priority 2: Category-specific working days
  IF NOT FOUND AND p_category_id IS NOT NULL THEN
    SELECT * INTO v_wd FROM public.working_days
    WHERE category_id = p_category_id
    LIMIT 1;
  END IF;

  -- Priority 3: Company default (department_id IS NULL, category_id IS NULL)
  IF NOT FOUND OR (p_department_id IS NULL AND p_category_id IS NULL) THEN
    SELECT * INTO v_wd FROM public.working_days
    WHERE company_id = v_company AND department_id IS NULL AND category_id IS NULL
    LIMIT 1;
  END IF;

  -- Priority 4: Hardcoded Moroccan standard
  IF NOT FOUND THEN
    v_wd.monday := true; v_wd.tuesday := true; v_wd.wednesday := true;
    v_wd.thursday := true; v_wd.friday := true; v_wd.saturday := true; v_wd.sunday := false;
    v_wd.monday_morning := true; v_wd.monday_afternoon := true;
    v_wd.tuesday_morning := true; v_wd.tuesday_afternoon := true;
    v_wd.wednesday_morning := true; v_wd.wednesday_afternoon := true;
    v_wd.thursday_morning := true; v_wd.thursday_afternoon := true;
    v_wd.friday_morning := true; v_wd.friday_afternoon := true;
    v_wd.saturday_morning := true; v_wd.saturday_afternoon := false;
    v_wd.sunday_morning := false; v_wd.sunday_afternoon := false;
  END IF;

  WHILE v_current <= p_end_date LOOP
    v_dow := EXTRACT(ISODOW FROM v_current)::INTEGER;

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
        v_morning := COALESCE(CASE v_dow
          WHEN 1 THEN v_wd.monday_morning
          WHEN 2 THEN v_wd.tuesday_morning
          WHEN 3 THEN v_wd.wednesday_morning
          WHEN 4 THEN v_wd.thursday_morning
          WHEN 5 THEN v_wd.friday_morning
          WHEN 6 THEN v_wd.saturday_morning
          WHEN 7 THEN v_wd.sunday_morning
        END, true);

        v_afternoon := COALESCE(CASE v_dow
          WHEN 1 THEN v_wd.monday_afternoon
          WHEN 2 THEN v_wd.tuesday_afternoon
          WHEN 3 THEN v_wd.wednesday_afternoon
          WHEN 4 THEN v_wd.thursday_afternoon
          WHEN 5 THEN v_wd.friday_afternoon
          WHEN 6 THEN v_wd.saturday_afternoon
          WHEN 7 THEN v_wd.sunday_afternoon
        END, false);

        v_day_value := 0;
        IF v_morning THEN v_day_value := v_day_value + 0.5; END IF;
        IF v_afternoon THEN v_day_value := v_day_value + 0.5; END IF;

        IF v_current = p_start_date AND p_start_half_day = 'AFTERNOON' AND v_morning THEN
          v_day_value := v_day_value - 0.5;
        END IF;
        IF v_current = p_end_date AND p_end_half_day = 'MORNING' AND v_afternoon THEN
          v_day_value := v_day_value - 0.5;
        END IF;

        v_count := v_count + GREATEST(v_day_value, 0);
      END IF;
    END IF;

    v_current := v_current + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- 5. Update approve_leave_request to pass department_id to count_working_days
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

  IF v_approver.role::TEXT != v_expected_role AND v_approver.role::TEXT != 'ADMIN' THEN
    RAISE EXCEPTION 'Seul le role % peut approuver a cette etape (vous etes %)',
      v_expected_role, v_approver.role;
  END IF;

  IF v_approver.role::TEXT = 'CHEF_SERVICE' THEN
    SELECT department_id INTO v_requester_dept_id
    FROM utilisateurs WHERE id = v_request.user_id;

    IF v_approver.department_id IS NULL
       OR v_requester_dept_id IS NULL
       OR v_approver.department_id != v_requester_dept_id THEN
      RAISE EXCEPTION 'Le chef de service ne peut approuver que les demandes de son departement';
    END IF;
  END IF;

  IF v_field = 'rp' AND p_new_start_date IS NOT NULL AND p_new_end_date IS NOT NULL THEN
    UPDATE leave_requests SET
      start_date = p_new_start_date,
      end_date = p_new_end_date,
      days_count = COALESCE(p_new_days_count, v_request.days_count)
    WHERE id = p_request_id;
    SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  END IF;

  v_days := v_request.days_count;

  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  IF v_next_status = 'APPROVED' THEN
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Recalculate days with department-aware working days
    v_days := count_working_days(
      v_request.start_date, v_request.end_date,
      v_company_id, NULL, 'FULL', 'FULL',
      v_request_user.department_id
    );
    UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;

    IF v_request.request_type = 'RECUPERATION' THEN
      UPDATE utilisateurs SET balance_recuperation = GREATEST(balance_recuperation - v_days, 0)
      WHERE id = v_request.user_id;
    END IF;

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


-- 6. Grant execute on updated function (same signature + new param)
GRANT EXECUTE ON FUNCTION count_working_days(DATE, DATE, BIGINT, BIGINT, TEXT, TEXT, BIGINT) TO authenticated;

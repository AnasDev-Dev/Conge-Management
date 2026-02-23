-- ============================================================================
-- DEPARTMENT-SCOPED RLS MIGRATION
-- ============================================================================
-- CHEF_SERVICE → own department only
-- RH / DIRECTEUR_EXECUTIF / ADMIN → full cross-department access
-- EMPLOYEE → own records only
--
-- Run in Supabase SQL Editor. Idempotent (safe to re-run).
-- ============================================================================


-- ============================================================================
-- STEP 1: CREATE can_manage_user() HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_user(target_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_dept_id    BIGINT;
  v_target_dept BIGINT;
BEGIN
  SELECT role::TEXT, department_id
  INTO v_role, v_dept_id
  FROM public.utilisateurs
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Global roles: full access
  IF v_role IN ('RH', 'DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    RETURN TRUE;
  END IF;

  -- CHEF_SERVICE: same department only
  IF v_role = 'CHEF_SERVICE' AND v_dept_id IS NOT NULL THEN
    SELECT department_id INTO v_target_dept
    FROM public.utilisateurs
    WHERE id = target_user_id;

    RETURN v_dept_id = v_target_dept;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO service_role;


-- ============================================================================
-- STEP 2: UPDATE RLS POLICY ON utilisateurs
-- ============================================================================

DROP POLICY IF EXISTS "utilisateurs_select_authenticated" ON public.utilisateurs;
CREATE POLICY "utilisateurs_select_authenticated"
  ON public.utilisateurs FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.can_manage_user(id)
  );


-- ============================================================================
-- STEP 3: UPDATE RLS POLICIES ON leave_requests
-- ============================================================================

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

DROP POLICY IF EXISTS "leave_requests_insert" ON public.leave_requests;
CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
CREATE POLICY "leave_requests_update"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_user(user_id)
    OR (user_id = auth.uid() AND status = 'PENDING')
  );


-- ============================================================================
-- STEP 3: UPDATE RLS POLICIES ON leave_balance_history
-- ============================================================================

DROP POLICY IF EXISTS "balance_history_select" ON public.leave_balance_history;
CREATE POLICY "balance_history_select"
  ON public.leave_balance_history FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

DROP POLICY IF EXISTS "balance_history_insert_manager" ON public.leave_balance_history;
CREATE POLICY "balance_history_insert_manager"
  ON public.leave_balance_history FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_user(user_id));


-- ============================================================================
-- STEP 4: UPDATE approve_leave_request RPC (add department check)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id   BIGINT,
  p_approver_id  UUID,
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
  v_expected_role      TEXT;
  v_next_status        TEXT;
  v_field              TEXT;
  v_days               FLOAT;
  v_balance_field      TEXT;
  v_requester_dept_id  BIGINT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver % not found', p_approver_id;
  END IF;

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

  IF v_approver.role != v_expected_role AND v_approver.role != 'ADMIN' THEN
    RAISE EXCEPTION 'Approver role % does not match expected role % for status %',
      v_approver.role, v_expected_role, v_request.status;
  END IF;

  -- Department check for CHEF_SERVICE
  IF v_approver.role = 'CHEF_SERVICE' THEN
    SELECT department_id INTO v_requester_dept_id
    FROM utilisateurs WHERE id = v_request.user_id;

    IF v_approver.department_id IS NULL
       OR v_requester_dept_id IS NULL
       OR v_approver.department_id != v_requester_dept_id THEN
      RAISE EXCEPTION 'Chef de service can only approve requests from their own department';
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
    'UPDATE leave_requests SET status = $1, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  IF v_next_status = 'APPROVED' THEN
    IF v_request.request_type = 'CONGE' THEN
      v_balance_field := 'balance_conge';
    ELSE
      v_balance_field := 'balance_recuperation';
    END IF;

    EXECUTE format(
      'UPDATE utilisateurs SET %I = %I - $1 WHERE id = $2',
      v_balance_field, v_balance_field
    ) USING v_days, v_request.user_id;
  END IF;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================================
-- STEP 5: UPDATE reject_leave_request RPC (add department check)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_leave_request(
  p_request_id  BIGINT,
  p_rejector_id UUID,
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request            leave_requests%ROWTYPE;
  v_rejector           utilisateurs%ROWTYPE;
  v_requester_dept_id  BIGINT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  IF v_request.status NOT IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC') THEN
    RAISE EXCEPTION 'Request % is in status %, cannot be rejected', p_request_id, v_request.status;
  END IF;

  SELECT * INTO v_rejector FROM utilisateurs WHERE id = p_rejector_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rejector % not found', p_rejector_id;
  END IF;

  -- Department check for CHEF_SERVICE
  IF v_rejector.role = 'CHEF_SERVICE' THEN
    SELECT department_id INTO v_requester_dept_id
    FROM utilisateurs WHERE id = v_request.user_id;

    IF v_rejector.department_id IS NULL
       OR v_requester_dept_id IS NULL
       OR v_rejector.department_id != v_requester_dept_id THEN
      RAISE EXCEPTION 'Chef de service can only reject requests from their own department';
    END IF;
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE leave_requests SET
    status = 'REJECTED',
    rejected_by = p_rejector_id,
    rejected_at = NOW(),
    rejection_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leave_requests', 'leave_balance_history')
ORDER BY tablename, policyname;

-- ============================================================================
-- EMERGENCY ROLLBACK: Restore original RLS policies
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor to fix the broken state.
-- It removes can_manage_user and restores all original policies.
-- ============================================================================

-- STEP 1: Drop can_manage_user CASCADE (removes all dependent policies too)
DROP FUNCTION IF EXISTS public.can_manage_user(UUID) CASCADE;

-- STEP 2: Drop ALL remaining policies on ALL public tables (clean slate)
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

-- STEP 3: Disable RLS on all tables
ALTER TABLE IF EXISTS public.utilisateurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_balance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;

-- STEP 4: Recreate helper functions
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.is_manager();

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.utilisateurs WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role IN ('CHEF_SERVICE', 'RH', 'TRESORIER_GENERAL', 'DIRECTEUR_EXECUTIF', 'ADMIN')
  FROM public.utilisateurs
  WHERE id = auth.uid();
$$;

-- STEP 5: Enable RLS and create ALL policies

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
    OR public.is_manager()
  );

CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_manager()
  );

CREATE POLICY "leave_requests_update"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_manager()
    OR (user_id = auth.uid() AND status = 'PENDING')
  );

CREATE POLICY "leave_requests_delete"
  ON public.leave_requests FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING')
    OR public.get_my_role() = 'ADMIN'
  );

-- ── COMPANIES ──
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_authenticated"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "companies_manage_admin"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── DEPARTMENTS ──
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_authenticated"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_manage_admin"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── LEAVE_BALANCE_HISTORY ──
ALTER TABLE public.leave_balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balance_history_select"
  ON public.leave_balance_history FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_manager()
  );

CREATE POLICY "balance_history_insert_manager"
  ON public.leave_balance_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "balance_history_manage_admin"
  ON public.leave_balance_history FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── NOTIFICATIONS ──
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── HOLIDAYS ──
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select_authenticated"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "holidays_manage_admin"
  ON public.holidays FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── WORKING_DAYS ──
ALTER TABLE public.working_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "working_days_select_authenticated"
  ON public.working_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "working_days_manage_admin"
  ON public.working_days FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── AUDIT_LOGS ──
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_only"
  ON public.audit_logs FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- STEP 6: Restore original approval RPCs (3-stage, no department check)

CREATE OR REPLACE FUNCTION approve_leave_request(
  p_request_id   BIGINT,
  p_approver_id  UUID,
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
  v_expected_role TEXT;
  v_next_status   TEXT;
  v_field         TEXT;
  v_days          FLOAT;
  v_balance_field TEXT;
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

CREATE OR REPLACE FUNCTION reject_leave_request(
  p_request_id  BIGINT,
  p_rejector_id UUID,
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request  leave_requests%ROWTYPE;
  v_rejector utilisateurs%ROWTYPE;
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


-- STEP 7: Verify everything is restored
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

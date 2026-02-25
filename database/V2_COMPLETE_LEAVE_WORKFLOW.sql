-- ============================================================================
-- V2: COMPLETE LEAVE REQUEST WORKFLOW REWRITE
-- ============================================================================
-- This migration replaces all previous RLS/RPC migrations.
-- It implements the correct role-based leave request workflow:
--
--   EMPLOYEE creates    → PENDING (full chain: RH → CHEF dept → DIR)
--   RH creates for self → VALIDATED_DC (skip RH+CHEF, goes to DIR)
--   RH creates on behalf→ VALIDATED_RP (skip RH, goes to CHEF of employee's dept)
--   CHEF creates for self→ VALIDATED_DC (skip RH+CHEF, goes to DIR)
--   CHEF creates on behalf→ VALIDATED_DC (skip RH+CHEF, goes to DIR)
--   DIR/ADMIN creates   → APPROVED (auto-approved immediately)
--
-- Roles: EMPLOYEE, CHEF_SERVICE, RH, DIRECTEUR_EXECUTIF, ADMIN
-- (TRESORIER_GENERAL removed from active workflow)
--
-- Run in Supabase SQL Editor. Idempotent (safe to re-run).
-- ============================================================================


-- ============================================================================
-- SECTION 1: SCHEMA CHANGES
-- ============================================================================

-- Add created_by column (who submitted the request — may differ from user_id)
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add initial_status column (status set at creation, used to prevent undo past this point)
-- Uses the same leave_status enum as the status column
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS initial_status public.leave_status;

-- Backfill existing rows
UPDATE public.leave_requests
  SET created_by = user_id
  WHERE created_by IS NULL;

UPDATE public.leave_requests
  SET initial_status = 'PENDING'::public.leave_status
  WHERE initial_status IS NULL;


-- ============================================================================
-- SECTION 2: CLEAN SLATE — DROP ALL EXISTING POLICIES & FUNCTIONS
-- ============================================================================

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

-- Disable RLS on all tables
ALTER TABLE IF EXISTS public.utilisateurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_balance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop old functions
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_manager() CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.approve_leave_request(BIGINT, UUID, DATE, DATE, FLOAT) CASCADE;
DROP FUNCTION IF EXISTS public.reject_leave_request(BIGINT, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.undo_approve_leave_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.undo_reject_leave_request(BIGINT, UUID) CASCADE;

-- Drop old triggers
DROP TRIGGER IF EXISTS trg_compute_initial_leave_status ON public.leave_requests;
DROP TRIGGER IF EXISTS trg_handle_auto_approved_leave ON public.leave_requests;
DROP FUNCTION IF EXISTS public.compute_initial_leave_status() CASCADE;
DROP FUNCTION IF EXISTS public.handle_auto_approved_leave() CASCADE;


-- ============================================================================
-- SECTION 3: HELPER FUNCTIONS
-- ============================================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.utilisateurs WHERE id = auth.uid();
$$;

-- Check if current user is a manager (TRESORIER_GENERAL removed)
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN')
  FROM public.utilisateurs
  WHERE id = auth.uid();
$$;

-- Department-scoped management check
-- CHEF_SERVICE → same department only
-- RH / DIRECTEUR_EXECUTIF / ADMIN → full cross-department access
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


-- ============================================================================
-- SECTION 4: TRIGGERS
-- ============================================================================

-- BEFORE INSERT: Compute the correct initial status based on creator's role
CREATE OR REPLACE FUNCTION public.compute_initial_leave_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role TEXT;
BEGIN
  -- Always set created_by to the authenticated user
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- If no authenticated user (service role / dashboard), keep status as provided
  IF auth.uid() IS NULL THEN
    NEW.initial_status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    NEW.status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    RETURN NEW;
  END IF;

  -- Get creator's role
  SELECT role::TEXT INTO v_creator_role
  FROM utilisateurs
  WHERE id = auth.uid();

  -- DIRECTEUR_EXECUTIF or ADMIN: auto-approve immediately
  IF v_creator_role IN ('DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    NEW.status := 'APPROVED'::public.leave_status;
    NEW.approved_by_de := auth.uid();
    NEW.approved_at_de := NOW();
    NEW.initial_status := 'APPROVED'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH creating for themselves: skip RH + CHEF → go to DIR
  IF v_creator_role = 'RH' AND NEW.user_id = auth.uid() THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH creating on behalf: skip RH stage → go to CHEF of employee's dept
  IF v_creator_role = 'RH' AND NEW.user_id != auth.uid() THEN
    NEW.status := 'VALIDATED_RP'::public.leave_status;
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_RP'::public.leave_status;
    RETURN NEW;
  END IF;

  -- CHEF_SERVICE creating for themselves: skip RH + CHEF → go to DIR
  IF v_creator_role = 'CHEF_SERVICE' AND NEW.user_id = auth.uid() THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- CHEF_SERVICE creating on behalf: skip RH + CHEF → go to DIR
  IF v_creator_role = 'CHEF_SERVICE' AND NEW.user_id != auth.uid() THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- EMPLOYEE (default): starts at PENDING → goes to RH
  NEW.status := 'PENDING'::public.leave_status;
  NEW.initial_status := 'PENDING'::public.leave_status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_initial_leave_status
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_initial_leave_status();


-- AFTER INSERT: Handle balance deduction for auto-approved requests
CREATE OR REPLACE FUNCTION public.handle_auto_approved_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'APPROVED'::public.leave_status THEN
    -- Deduct balance
    IF NEW.request_type = 'CONGE' THEN
      UPDATE utilisateurs
      SET balance_conge = balance_conge - NEW.days_count
      WHERE id = NEW.user_id;
    ELSE
      UPDATE utilisateurs
      SET balance_recuperation = balance_recuperation - NEW.days_count
      WHERE id = NEW.user_id;
    END IF;

    -- Record in balance history
    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
    VALUES (
      NEW.user_id,
      NEW.request_type,
      -NEW.days_count,
      'Demande auto-approuvée #' || NEW.id,
      EXTRACT(YEAR FROM NEW.start_date)::INT,
      NEW.start_date,
      NEW.end_date
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_auto_approved_leave
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_approved_leave();


-- ============================================================================
-- SECTION 5: RLS POLICIES
-- ============================================================================

-- ── UTILISATEURS ──
ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all profiles
-- (needed for replacement user dropdown, approver names, employee directory)
CREATE POLICY "utilisateurs_select_authenticated"
  ON public.utilisateurs FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "utilisateurs_update_own_profile"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Managers can update any user (needed for balance deduction via RPCs)
CREATE POLICY "utilisateurs_update_manager"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (public.is_manager());

-- Admin can insert/delete users
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

-- SELECT: employees see own, managers see based on department scope
CREATE POLICY "leave_requests_select"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

-- INSERT: employees for self, managers for users they can manage
CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_user(user_id)
  );

-- UPDATE: only employee can edit own request while at initial status,
-- or creator can edit while no one else has acted on it.
-- All approval/rejection/undo operations go through SECURITY DEFINER RPCs.
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

-- DELETE: employee can delete own PENDING request, or creator can delete
-- if no external approval has happened yet, or admin can delete anything
CREATE POLICY "leave_requests_delete"
  ON public.leave_requests FOR DELETE
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


-- ============================================================================
-- SECTION 6: RPC FUNCTIONS
-- ============================================================================

-- ────────────────────────────────────────────────────────
-- APPROVE LEAVE REQUEST
-- ────────────────────────────────────────────────────────
-- Validates: role matches stage, not self-approval,
-- department check for CHEF, balance deduction on final approval
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
  v_expected_role      TEXT;
  v_next_status        TEXT;
  v_field              TEXT;
  v_days               FLOAT;
  v_balance_field      TEXT;
  v_requester_dept_id  BIGINT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approbateur introuvable';
  END IF;

  -- Prevent self-approval (user_id = the person the leave is FOR)
  IF p_approver_id = v_request.user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas approuver votre propre demande';
  END IF;

  -- Determine expected role for current status
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
      RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas être approuvée',
        p_request_id, v_request.status;
  END CASE;

  -- Role check: must match expected role or be ADMIN
  IF v_approver.role::TEXT != v_expected_role AND v_approver.role::TEXT != 'ADMIN' THEN
    RAISE EXCEPTION 'Seul le rôle % peut approuver à cette étape (vous êtes %)',
      v_expected_role, v_approver.role;
  END IF;

  -- Department check for CHEF_SERVICE
  IF v_approver.role::TEXT = 'CHEF_SERVICE' THEN
    SELECT department_id INTO v_requester_dept_id
    FROM utilisateurs WHERE id = v_request.user_id;

    IF v_approver.department_id IS NULL
       OR v_requester_dept_id IS NULL
       OR v_approver.department_id != v_requester_dept_id THEN
      RAISE EXCEPTION 'Le chef de service ne peut approuver que les demandes de son département';
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

  -- On final approval: deduct balance and record history
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

    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
    VALUES (
      v_request.user_id,
      v_request.request_type,
      -v_days,
      'Demande approuvée #' || p_request_id,
      EXTRACT(YEAR FROM v_request.start_date)::INT,
      v_request.start_date,
      v_request.end_date
    );
  END IF;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- REJECT LEAVE REQUEST
-- ────────────────────────────────────────────────────────
-- Only the role responsible for the current stage can reject.
-- RH rejects at PENDING, CHEF at VALIDATED_RP, DIR at VALIDATED_DC.
-- ADMIN can reject at any stage.
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
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_rejector FROM utilisateurs WHERE id = p_rejector_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'La raison du rejet est obligatoire';
  END IF;

  -- Stage-role matching (ADMIN can reject at any stage)
  IF v_rejector.role::TEXT != 'ADMIN' THEN
    CASE v_request.status
      WHEN 'PENDING'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'RH' THEN
          RAISE EXCEPTION 'Seul le RH peut rejeter à cette étape';
        END IF;
      WHEN 'VALIDATED_RP'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'CHEF_SERVICE' THEN
          RAISE EXCEPTION 'Seul le Chef de Service peut rejeter à cette étape';
        END IF;
        -- Department check for CHEF_SERVICE
        SELECT department_id INTO v_requester_dept_id
        FROM utilisateurs WHERE id = v_request.user_id;
        IF v_rejector.department_id IS NULL
           OR v_requester_dept_id IS NULL
           OR v_rejector.department_id != v_requester_dept_id THEN
          RAISE EXCEPTION 'Le chef de service ne peut rejeter que les demandes de son département';
        END IF;
      WHEN 'VALIDATED_DC'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'DIRECTEUR_EXECUTIF' THEN
          RAISE EXCEPTION 'Seul le Directeur Exécutif peut rejeter à cette étape';
        END IF;
      ELSE
        RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas être rejetée',
          p_request_id, v_request.status;
    END CASE;
  ELSE
    -- ADMIN can reject, but request must be in a rejectable status
    IF v_request.status NOT IN ('PENDING'::public.leave_status, 'VALIDATED_RP'::public.leave_status, 'VALIDATED_DC'::public.leave_status) THEN
      RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas être rejetée',
        p_request_id, v_request.status;
    END IF;
  END IF;

  UPDATE leave_requests SET
    status = 'REJECTED'::public.leave_status,
    rejected_by = p_rejector_id,
    rejected_at = NOW(),
    rejection_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- UNDO APPROVE
-- ────────────────────────────────────────────────────────
-- Moves the request back one stage. Only the person who approved
-- (or ADMIN) can undo. Cannot undo past initial_status.
-- Reverses balance deduction if undoing from APPROVED.
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
  v_balance_field TEXT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Cannot undo if already at initial_status (auto-promoted stages)
  IF v_request.status = v_request.initial_status THEN
    RAISE EXCEPTION 'Impossible d''annuler: la demande est à son statut initial';
  END IF;

  -- Determine previous status and field
  CASE v_request.status
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_prev_status := 'PENDING';
      v_field := 'rp';
      -- Only the RH who approved (or admin) can undo
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_rp != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_prev_status := 'VALIDATED_RP';
      v_field := 'dc';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_dc != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      -- If VALIDATED_DC is the initial_status, cannot undo
      IF v_request.initial_status = 'VALIDATED_DC'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est à son statut initial';
      END IF;
    WHEN 'APPROVED'::public.leave_status THEN
      v_prev_status := 'VALIDATED_DC';
      v_field := 'de';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_de != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;

      -- Reverse balance deduction
      IF v_request.request_type = 'CONGE' THEN
        v_balance_field := 'balance_conge';
      ELSE
        v_balance_field := 'balance_recuperation';
      END IF;

      EXECUTE format(
        'UPDATE utilisateurs SET %I = %I + $1 WHERE id = $2',
        v_balance_field, v_balance_field
      ) USING v_request.days_count, v_request.user_id;

      -- Record reversal in balance history
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

  -- Clear approval fields and move to previous status
  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = NULL, approved_at_%s = NULL, updated_at = NOW() WHERE id = $2',
    v_field, v_field
  ) USING v_prev_status, p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- UNDO REJECT
-- ────────────────────────────────────────────────────────
-- Restores the request to its pre-rejection status.
-- Only the person who rejected (or ADMIN) can undo.
CREATE OR REPLACE FUNCTION public.undo_reject_leave_request(
  p_request_id BIGINT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request        leave_requests%ROWTYPE;
  v_user           utilisateurs%ROWTYPE;
  v_restore_status TEXT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  IF v_request.status != 'REJECTED'::public.leave_status THEN
    RAISE EXCEPTION 'La demande #% n''est pas rejetée', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Only the rejector or admin can undo
  IF v_user.role::TEXT != 'ADMIN' AND v_request.rejected_by != p_user_id THEN
    RAISE EXCEPTION 'Seul la personne qui a rejeté ou un admin peut restaurer cette demande';
  END IF;

  -- Infer the pre-rejection status from approval fields
  IF v_request.approved_by_dc IS NOT NULL THEN
    v_restore_status := 'VALIDATED_DC';
  ELSIF v_request.approved_by_rp IS NOT NULL THEN
    v_restore_status := 'VALIDATED_RP';
  ELSE
    v_restore_status := 'PENDING';
  END IF;

  -- Ensure we don't go below initial_status
  IF v_restore_status = 'PENDING' AND v_request.initial_status != 'PENDING'::public.leave_status THEN
    v_restore_status := v_request.initial_status::TEXT;
  ELSIF v_restore_status = 'VALIDATED_RP'
        AND v_request.initial_status IN ('VALIDATED_DC'::public.leave_status, 'APPROVED'::public.leave_status) THEN
    v_restore_status := v_request.initial_status::TEXT;
  END IF;

  UPDATE leave_requests SET
    status = v_restore_status::public.leave_status,
    rejected_by = NULL,
    rejected_at = NULL,
    rejection_reason = NULL,
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================================
-- SECTION 7: GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(BIGINT, UUID, DATE, DATE, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_approve_leave_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_reject_leave_request(BIGINT, UUID) TO authenticated;


-- ============================================================================
-- SECTION 8: VERIFICATION
-- ============================================================================

-- Check RLS is enabled
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- List all active policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check triggers
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'leave_requests'
  AND trigger_schema = 'public';

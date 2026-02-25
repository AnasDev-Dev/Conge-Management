-- ==============================================================================
-- PART 2/4: RLS POLICIES + TRIGGERS
-- ==============================================================================
-- Run AFTER 01_tables.sql.
-- Safe to re-run: drops all existing policies first, uses DROP IF EXISTS.
-- ==============================================================================


-- ==============================================================================
-- SECTION 5: RLS POLICIES
-- ==============================================================================

-- Clean slate: drop all existing policies
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

ALTER TABLE IF EXISTS public.utilisateurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_balance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mission_requests DISABLE ROW LEVEL SECURITY;


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


-- ==============================================================================
-- SECTION 6: TRIGGERS
-- ==============================================================================

-- ── Leave: Compute initial status based on creator's role ──

DROP TRIGGER IF EXISTS trg_compute_initial_leave_status ON public.leave_requests;
DROP FUNCTION IF EXISTS public.compute_initial_leave_status() CASCADE;

CREATE OR REPLACE FUNCTION public.compute_initial_leave_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- Service role / dashboard: keep status as provided
  IF auth.uid() IS NULL THEN
    NEW.initial_status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    NEW.status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    RETURN NEW;
  END IF;

  SELECT role::TEXT INTO v_creator_role
  FROM utilisateurs WHERE id = auth.uid();

  -- DIR/ADMIN: auto-approve
  IF v_creator_role IN ('DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    NEW.status := 'APPROVED'::public.leave_status;
    NEW.approved_by_de := auth.uid();
    NEW.approved_at_de := NOW();
    NEW.initial_status := 'APPROVED'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH self: skip RH+CHEF -> DIR
  IF v_creator_role = 'RH' AND NEW.user_id = auth.uid() THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH on behalf: skip RH -> CHEF
  IF v_creator_role = 'RH' AND NEW.user_id != auth.uid() THEN
    NEW.status := 'VALIDATED_RP'::public.leave_status;
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_RP'::public.leave_status;
    RETURN NEW;
  END IF;

  -- CHEF self or on behalf: skip RH+CHEF -> DIR
  IF v_creator_role = 'CHEF_SERVICE' THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- EMPLOYEE: PENDING -> full chain
  NEW.status := 'PENDING'::public.leave_status;
  NEW.initial_status := 'PENDING'::public.leave_status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_initial_leave_status
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_initial_leave_status();


-- ── Leave: Handle balance deduction for auto-approved requests ──

DROP TRIGGER IF EXISTS trg_handle_auto_approved_leave ON public.leave_requests;
DROP FUNCTION IF EXISTS public.handle_auto_approved_leave() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_auto_approved_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'APPROVED'::public.leave_status THEN
    IF NEW.request_type = 'CONGE' THEN
      UPDATE utilisateurs
      SET balance_conge = balance_conge - NEW.days_count
      WHERE id = NEW.user_id;
    ELSE
      UPDATE utilisateurs
      SET balance_recuperation = balance_recuperation - NEW.days_count
      WHERE id = NEW.user_id;
    END IF;

    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
    VALUES (
      NEW.user_id,
      NEW.request_type,
      -NEW.days_count,
      'Demande auto-approuvee #' || NEW.id,
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


-- ── Mission: Compute initial status based on creator's role ──

DROP TRIGGER IF EXISTS trg_compute_initial_mission_status ON public.mission_requests;
DROP FUNCTION IF EXISTS public.compute_initial_mission_status() CASCADE;

CREATE OR REPLACE FUNCTION public.compute_initial_mission_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  IF auth.uid() IS NULL THEN
    NEW.initial_status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    NEW.status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    RETURN NEW;
  END IF;

  SELECT role::TEXT INTO v_creator_role
  FROM utilisateurs WHERE id = auth.uid();

  -- DIR/ADMIN: auto-approve
  IF v_creator_role IN ('DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    NEW.status := 'APPROVED'::public.leave_status;
    NEW.approved_by_de := auth.uid();
    NEW.approved_at_de := NOW();
    NEW.director_decision := 'ACCORDEE';
    NEW.initial_status := 'APPROVED'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH self: skip Chef+RH -> DIR
  IF v_creator_role = 'RH' AND NEW.user_id = auth.uid() THEN
    NEW.status := 'VALIDATED_RP'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_RP'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH on behalf: Chef must approve first (RH step auto-skipped in approve RPC)
  IF v_creator_role = 'RH' AND NEW.user_id != auth.uid() THEN
    NEW.status := 'PENDING'::public.leave_status;
    NEW.initial_status := 'PENDING'::public.leave_status;
    RETURN NEW;
  END IF;

  -- CHEF (self or on behalf): skip Chef step -> RH
  IF v_creator_role = 'CHEF_SERVICE' THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- EMPLOYEE: PENDING -> full chain
  NEW.status := 'PENDING'::public.leave_status;
  NEW.initial_status := 'PENDING'::public.leave_status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_initial_mission_status
  BEFORE INSERT ON public.mission_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_initial_mission_status();


-- ── Mission: Auto-update updated_at ──

DROP TRIGGER IF EXISTS trigger_mission_updated_at ON public.mission_requests;
DROP FUNCTION IF EXISTS update_mission_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_mission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mission_updated_at
    BEFORE UPDATE ON public.mission_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_mission_updated_at();

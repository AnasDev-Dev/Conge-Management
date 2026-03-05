-- ==============================================================================
-- PART 6: MULTI-COMPANY MULTI-ROLE SUPPORT
-- ==============================================================================
-- Run AFTER 05_new_features.sql.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS.
--
-- Purpose: Allow one person to have different roles in different companies.
-- Example: Ahmed is EMPLOYEE at FRMG (home company, balances here)
--          but CHEF_SERVICE at ATH (manager view, approves requests).
--
-- Strategy:
--   1. Enhance user_company_roles with is_home + department_id
--   2. Use PostgreSQL session variable (app.active_company_id) to track
--      which company the user is currently viewing
--   3. Rewrite get_my_role(), is_manager(), can_manage_user() to read
--      the role from user_company_roles based on active company
--   4. Add is_in_active_company() for data scoping
--   5. Update triggers to use company-aware role lookup
-- ==============================================================================


-- ==============================================================================
-- STEP 1: ENHANCE user_company_roles TABLE
-- ==============================================================================

-- is_home: marks which company is the employee's "home" for leave balances
ALTER TABLE public.user_company_roles
  ADD COLUMN IF NOT EXISTS is_home BOOLEAN DEFAULT false;

-- department_id: a user may belong to different departments in different companies
ALTER TABLE public.user_company_roles
  ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES public.departments(id);

-- Ensure only ONE home company per user
DROP INDEX IF EXISTS idx_one_home_per_user;
CREATE UNIQUE INDEX idx_one_home_per_user
  ON public.user_company_roles(user_id) WHERE is_home = true;

-- Index for department lookups
CREATE INDEX IF NOT EXISTS idx_user_company_roles_dept
  ON public.user_company_roles(company_id, department_id);


-- ==============================================================================
-- STEP 2: HELPER — get_active_company_id()
-- ==============================================================================
-- Reads the session variable set by the frontend.
-- Returns NULL if no company is selected (legacy single-company mode).

CREATE OR REPLACE FUNCTION public.get_active_company_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
BEGIN
  v_raw := current_setting('app.active_company_id', true);
  IF v_raw IS NULL OR v_raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::BIGINT;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;


-- ==============================================================================
-- STEP 3: set_active_company() RPC
-- ==============================================================================
-- Called by the frontend when the user switches company.
-- Sets the session variable and returns the user's role in that company.

CREATE OR REPLACE FUNCTION public.set_active_company(p_company_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_home BOOLEAN;
  v_dept_id BIGINT;
BEGIN
  -- Verify user has an active role in this company
  SELECT role::TEXT, is_home, department_id
  INTO v_role, v_is_home, v_dept_id
  FROM user_company_roles
  WHERE user_id = auth.uid()
    AND company_id = p_company_id
    AND is_active = true;

  IF NOT FOUND THEN
    -- Fallback: check if user's default company matches
    SELECT role::TEXT, true, department_id
    INTO v_role, v_is_home, v_dept_id
    FROM utilisateurs
    WHERE id = auth.uid()
      AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aucun role actif dans cette societe (company_id=%)', p_company_id;
    END IF;
  END IF;

  -- Set the session variable for all subsequent RLS checks
  PERFORM set_config('app.active_company_id', p_company_id::TEXT, false);

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'role', v_role,
    'is_home', COALESCE(v_is_home, false),
    'department_id', v_dept_id
  );
END;
$$;


-- ==============================================================================
-- STEP 4: REWRITE get_my_role() — company-aware with fallback
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id BIGINT;
  v_role TEXT;
BEGIN
  -- 1. Read active company from session variable
  v_company_id := get_active_company_id();

  -- 2. If a company is selected, look up role in user_company_roles
  IF v_company_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role
    FROM user_company_roles
    WHERE user_id = auth.uid()
      AND company_id = v_company_id
      AND is_active = true;

    IF FOUND THEN
      RETURN v_role;
    END IF;
  END IF;

  -- 3. Fallback: global role from utilisateurs (backward compatible)
  SELECT role::TEXT INTO v_role
  FROM utilisateurs
  WHERE id = auth.uid();

  RETURN v_role;
END;
$$;


-- ==============================================================================
-- STEP 5: REWRITE is_manager() — delegates to company-aware get_my_role()
-- ==============================================================================

DROP FUNCTION IF EXISTS public.is_manager() CASCADE;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN get_my_role() IN ('CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN');
END;
$$;


-- ==============================================================================
-- STEP 6: REWRITE can_manage_user() — company + department scoped
-- ==============================================================================

DROP FUNCTION IF EXISTS public.can_manage_user(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.can_manage_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     BIGINT;
  v_role           TEXT;
  v_my_dept        BIGINT;
  v_target_company BIGINT;
  v_target_dept    BIGINT;
BEGIN
  v_company_id := get_active_company_id();
  v_role := get_my_role();

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- ── Global roles (RH, DIR, ADMIN): manage anyone in the active company ──
  IF v_role IN ('RH', 'DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    IF v_company_id IS NOT NULL THEN
      -- Target must belong to the same company (via utilisateurs.company_id
      -- or via user_company_roles)
      SELECT company_id INTO v_target_company
      FROM utilisateurs WHERE id = target_user_id;

      IF v_target_company = v_company_id THEN
        RETURN TRUE;
      END IF;

      -- Also check if target has any role in this company
      RETURN EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_id = target_user_id
          AND company_id = v_company_id
          AND is_active = true
      );
    END IF;
    -- No company set (legacy mode): full access
    RETURN TRUE;
  END IF;

  -- ── CHEF_SERVICE: same department within the active company ──
  IF v_role = 'CHEF_SERVICE' THEN
    IF v_company_id IS NOT NULL THEN
      -- Get my department in this company from user_company_roles
      SELECT department_id INTO v_my_dept
      FROM user_company_roles
      WHERE user_id = auth.uid()
        AND company_id = v_company_id
        AND is_active = true;

      -- Fallback to utilisateurs.department_id if not set in UCR
      IF v_my_dept IS NULL THEN
        SELECT department_id INTO v_my_dept
        FROM utilisateurs WHERE id = auth.uid();
      END IF;

      -- Get target's department
      SELECT department_id INTO v_target_dept
      FROM utilisateurs WHERE id = target_user_id;

      RETURN v_my_dept IS NOT NULL
         AND v_target_dept IS NOT NULL
         AND v_my_dept = v_target_dept;
    END IF;

    -- Legacy fallback (no company set)
    SELECT department_id INTO v_my_dept
    FROM utilisateurs WHERE id = auth.uid();

    SELECT department_id INTO v_target_dept
    FROM utilisateurs WHERE id = target_user_id;

    RETURN v_my_dept IS NOT NULL
       AND v_target_dept IS NOT NULL
       AND v_my_dept = v_target_dept;
  END IF;

  RETURN FALSE;
END;
$$;


-- ==============================================================================
-- STEP 7: NEW HELPER — is_in_active_company()
-- ==============================================================================
-- Returns TRUE if the given user belongs to the currently active company.
-- Used to scope data queries (employees, requests, etc.) to one company.

CREATE OR REPLACE FUNCTION public.is_in_active_company(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id BIGINT;
  v_user_company BIGINT;
BEGIN
  v_company_id := get_active_company_id();

  -- No company filter set: show all (legacy behavior)
  IF v_company_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check utilisateurs.company_id
  SELECT company_id INTO v_user_company
  FROM utilisateurs WHERE id = p_user_id;

  IF v_user_company = v_company_id THEN
    RETURN TRUE;
  END IF;

  -- Also check if user has any role in this company
  RETURN EXISTS (
    SELECT 1 FROM user_company_roles
    WHERE user_id = p_user_id
      AND company_id = v_company_id
      AND is_active = true
  );
END;
$$;


-- ==============================================================================
-- STEP 8: NEW HELPER — get_my_home_company_id()
-- ==============================================================================
-- Returns the user's home company ID (where balances live).

CREATE OR REPLACE FUNCTION public.get_my_home_company_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_company BIGINT;
BEGIN
  -- Check user_company_roles for explicit home
  SELECT company_id INTO v_home_company
  FROM user_company_roles
  WHERE user_id = auth.uid()
    AND is_home = true
    AND is_active = true;

  IF FOUND THEN
    RETURN v_home_company;
  END IF;

  -- Fallback: utilisateurs.company_id
  SELECT company_id INTO v_home_company
  FROM utilisateurs WHERE id = auth.uid();

  RETURN v_home_company;
END;
$$;


-- ==============================================================================
-- STEP 9: UPDATE TRIGGERS — use company-aware role lookup
-- ==============================================================================

-- The leave request trigger reads utilisateurs.role directly.
-- We need it to also check user_company_roles for the active company.

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

  -- Use company-aware role lookup
  v_creator_role := get_my_role();

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


-- ── Mission trigger: same treatment ──

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

  -- Use company-aware role lookup
  v_creator_role := get_my_role();

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

  -- RH on behalf: Chef must approve first
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


-- ==============================================================================
-- STEP 10: UPDATE APPROVAL RPCs — use company-aware role for validation checks
-- ==============================================================================
-- The approve/reject RPCs read v_approver.role directly from utilisateurs.
-- We need them to check user_company_roles for the request's company context.

-- Helper: get a user's role for a specific company (used by RPCs)
CREATE OR REPLACE FUNCTION public.get_user_role_for_company(
  p_user_id UUID,
  p_company_id BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check user_company_roles first
  SELECT role::TEXT INTO v_role
  FROM user_company_roles
  WHERE user_id = p_user_id
    AND company_id = p_company_id
    AND is_active = true;

  IF FOUND THEN
    RETURN v_role;
  END IF;

  -- Fallback to utilisateurs if company matches
  SELECT role::TEXT INTO v_role
  FROM utilisateurs
  WHERE id = p_user_id
    AND company_id = p_company_id;

  IF FOUND THEN
    RETURN v_role;
  END IF;

  -- Last fallback: global role (for backward compatibility)
  SELECT role::TEXT INTO v_role
  FROM utilisateurs WHERE id = p_user_id;

  RETURN v_role;
END;
$$;


-- ==============================================================================
-- STEP 11: SEED user_company_roles FROM EXISTING utilisateurs
-- ==============================================================================
-- Populates user_company_roles for all existing users based on their
-- current company_id, role, and department_id.
-- The home company is set to their current company.

INSERT INTO public.user_company_roles (user_id, company_id, role, is_active, is_home, department_id)
SELECT
  u.id,
  u.company_id,
  u.role,
  true,
  true,  -- current company = home
  u.department_id
FROM public.utilisateurs u
WHERE u.company_id IS NOT NULL
  AND u.is_active = true
ON CONFLICT (user_id, company_id)
DO UPDATE SET
  role = EXCLUDED.role,
  is_home = EXCLUDED.is_home,
  department_id = EXCLUDED.department_id;


-- ==============================================================================
-- STEP 12: GRANTS
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.get_active_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_company(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_in_active_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_home_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role_for_company(UUID, BIGINT) TO authenticated;


-- ==============================================================================
-- MIGRATION COMPLETE
-- ==============================================================================
-- Summary of changes:
--   1. user_company_roles: added is_home (bool), department_id (FK)
--   2. New RPCs: set_active_company(), get_active_company_id(),
--      is_in_active_company(), get_my_home_company_id(),
--      get_user_role_for_company()
--   3. Rewritten: get_my_role(), is_manager(), can_manage_user()
--      (all now company-aware via session variable)
--   4. Triggers: compute_initial_leave_status, compute_initial_mission_status
--      (now use get_my_role() instead of direct utilisateurs.role read)
--   5. Seeded user_company_roles from existing utilisateurs data
--
-- Frontend must call set_active_company(company_id) on company switch
-- to set the session variable for RLS.
-- ==============================================================================

-- ============================================================================
-- V3: COMPLETE MISSION REQUEST WORKFLOW
-- ============================================================================
-- Implements the role-based mission request approval workflow.
-- Mission approval chain: Chef de Service → RH → Directeur Exécutif
-- (different from leave requests which go: RH → Chef → Directeur)
--
--   EMPLOYEE creates      → PENDING (full chain: Chef → RH → Dir)
--   CHEF creates for self → VALIDATED_DC (skip Chef → goes to RH)
--   CHEF creates on behalf→ VALIDATED_DC (skip Chef → goes to RH)
--   RH creates for self   → VALIDATED_RP (skip Chef+RH → goes to Dir)
--   RH creates on behalf  → PENDING (Chef must approve first; RH step auto-skipped in approve RPC)
--   DIR/ADMIN creates     → APPROVED (auto-approved immediately)
--
-- Run in Supabase SQL Editor. Idempotent (safe to re-run).
-- ============================================================================


-- ============================================================================
-- SECTION 1: SCHEMA CHANGES
-- ============================================================================

ALTER TABLE public.mission_requests
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.mission_requests
  ADD COLUMN IF NOT EXISTS initial_status public.leave_status;

-- Backfill existing rows
UPDATE public.mission_requests
  SET created_by = COALESCE(assigned_by, user_id)
  WHERE created_by IS NULL;

UPDATE public.mission_requests
  SET initial_status = 'PENDING'::public.leave_status
  WHERE initial_status IS NULL;


-- ============================================================================
-- SECTION 2: DROP OLD MISSION TRIGGERS & FUNCTIONS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_compute_initial_mission_status ON public.mission_requests;
DROP FUNCTION IF EXISTS public.compute_initial_mission_status() CASCADE;

DROP FUNCTION IF EXISTS public.approve_mission_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reject_mission_request(BIGINT, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.undo_approve_mission_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.undo_reject_mission_request(BIGINT, UUID) CASCADE;


-- ============================================================================
-- SECTION 3: BEFORE INSERT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_initial_mission_status()
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

  -- If no authenticated user (service role), keep status as provided
  IF auth.uid() IS NULL THEN
    NEW.initial_status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    NEW.status := COALESCE(NEW.status, 'PENDING'::public.leave_status);
    RETURN NEW;
  END IF;

  SELECT role::TEXT INTO v_creator_role
  FROM utilisateurs WHERE id = auth.uid();

  -- DIRECTEUR_EXECUTIF or ADMIN: auto-approve immediately
  IF v_creator_role IN ('DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    NEW.status := 'APPROVED'::public.leave_status;
    NEW.approved_by_de := auth.uid();
    NEW.approved_at_de := NOW();
    NEW.director_decision := 'ACCORDEE';
    NEW.initial_status := 'APPROVED'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH creating for themselves: skip Chef + RH → goes to Director
  IF v_creator_role = 'RH' AND NEW.user_id = auth.uid() THEN
    NEW.status := 'VALIDATED_RP'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.approved_by_rp := auth.uid();
    NEW.approved_at_rp := NOW();
    NEW.initial_status := 'VALIDATED_RP'::public.leave_status;
    RETURN NEW;
  END IF;

  -- RH creating on behalf: Chef must still approve first
  -- RH step will be auto-skipped later in approve_mission_request RPC
  IF v_creator_role = 'RH' AND NEW.user_id != auth.uid() THEN
    NEW.status := 'PENDING'::public.leave_status;
    NEW.initial_status := 'PENDING'::public.leave_status;
    RETURN NEW;
  END IF;

  -- CHEF_SERVICE (self or on behalf): skip Chef step → goes to RH
  IF v_creator_role = 'CHEF_SERVICE' THEN
    NEW.status := 'VALIDATED_DC'::public.leave_status;
    NEW.approved_by_dc := auth.uid();
    NEW.approved_at_dc := NOW();
    NEW.initial_status := 'VALIDATED_DC'::public.leave_status;
    RETURN NEW;
  END IF;

  -- EMPLOYEE (default): PENDING → full chain
  NEW.status := 'PENDING'::public.leave_status;
  NEW.initial_status := 'PENDING'::public.leave_status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_initial_mission_status
  BEFORE INSERT ON public.mission_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_initial_mission_status();


-- ============================================================================
-- SECTION 4: RPC FUNCTIONS
-- ============================================================================

-- ────────────────────────────────────────────────────────
-- APPROVE MISSION REQUEST
-- ────────────────────────────────────────────────────────
-- Mission chain: PENDING→Chef(dc) → VALIDATED_DC→RH(rp) → VALIDATED_RP→Dir(de) → APPROVED
-- Auto-skips RH step when creator is RH (on-behalf case)
CREATE OR REPLACE FUNCTION public.approve_mission_request(
  p_request_id  BIGINT,
  p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request            mission_requests%ROWTYPE;
  v_approver           utilisateurs%ROWTYPE;
  v_expected_role      TEXT;
  v_next_status        TEXT;
  v_field              TEXT;
  v_requester_dept_id  BIGINT;
  v_creator_role       TEXT;
BEGIN
  SELECT * INTO v_request FROM mission_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mission #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approbateur introuvable';
  END IF;

  -- Prevent self-approval
  IF p_approver_id = v_request.user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas approuver votre propre demande';
  END IF;

  -- Mission approval chain: Chef(dc) → RH(rp) → Dir(de)
  CASE v_request.status
    WHEN 'PENDING'::public.leave_status THEN
      v_expected_role := 'CHEF_SERVICE';
      v_next_status := 'VALIDATED_DC';
      v_field := 'dc';
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_expected_role := 'RH';
      v_next_status := 'VALIDATED_RP';
      v_field := 'rp';
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_expected_role := 'DIRECTEUR_EXECUTIF';
      v_next_status := 'APPROVED';
      v_field := 'de';
    ELSE
      RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas être approuvée',
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

  -- Update status and approval fields
  EXECUTE format(
    'UPDATE mission_requests SET status = $1::public.leave_status, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  -- On final approval, set director_decision
  IF v_next_status = 'APPROVED' THEN
    UPDATE mission_requests
    SET director_decision = 'ACCORDEE'
    WHERE id = p_request_id;
  END IF;

  -- Auto-skip RH step if creator is RH (on-behalf case)
  -- When Chef approves (→VALIDATED_DC), check if creator is RH → auto-advance to VALIDATED_RP
  IF v_next_status = 'VALIDATED_DC' AND v_request.created_by IS NOT NULL THEN
    SELECT role::TEXT INTO v_creator_role
    FROM utilisateurs WHERE id = v_request.created_by;

    IF v_creator_role = 'RH' THEN
      UPDATE mission_requests SET
        status = 'VALIDATED_RP'::public.leave_status,
        approved_by_rp = v_request.created_by,
        approved_at_rp = NOW(),
        updated_at = NOW()
      WHERE id = p_request_id;
    END IF;
  END IF;

  RETURN (SELECT to_jsonb(mr.*) FROM mission_requests mr WHERE mr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- REJECT MISSION REQUEST
-- ────────────────────────────────────────────────────────
-- Stage-role matching for missions: PENDING=CHEF, VALIDATED_DC=RH, VALIDATED_RP=DIR
CREATE OR REPLACE FUNCTION public.reject_mission_request(
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
  v_request            mission_requests%ROWTYPE;
  v_rejector           utilisateurs%ROWTYPE;
  v_requester_dept_id  BIGINT;
BEGIN
  SELECT * INTO v_request FROM mission_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mission #% introuvable', p_request_id;
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
        IF v_rejector.role::TEXT != 'CHEF_SERVICE' THEN
          RAISE EXCEPTION 'Seul le Chef de Service peut rejeter à cette étape';
        END IF;
        -- Department check
        SELECT department_id INTO v_requester_dept_id
        FROM utilisateurs WHERE id = v_request.user_id;
        IF v_rejector.department_id IS NULL
           OR v_requester_dept_id IS NULL
           OR v_rejector.department_id != v_requester_dept_id THEN
          RAISE EXCEPTION 'Le chef de service ne peut rejeter que les demandes de son département';
        END IF;
      WHEN 'VALIDATED_DC'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'RH' THEN
          RAISE EXCEPTION 'Seul le RH peut rejeter à cette étape';
        END IF;
      WHEN 'VALIDATED_RP'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'DIRECTEUR_EXECUTIF' THEN
          RAISE EXCEPTION 'Seul le Directeur Exécutif peut rejeter à cette étape';
        END IF;
      ELSE
        RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas être rejetée',
          p_request_id, v_request.status;
    END CASE;
  ELSE
    -- ADMIN can reject, but must be in a rejectable status
    IF v_request.status NOT IN ('PENDING'::public.leave_status, 'VALIDATED_DC'::public.leave_status, 'VALIDATED_RP'::public.leave_status) THEN
      RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas être rejetée',
        p_request_id, v_request.status;
    END IF;
  END IF;

  UPDATE mission_requests SET
    status = 'REJECTED'::public.leave_status,
    rejected_by = p_rejector_id,
    rejected_at = NOW(),
    rejection_reason = TRIM(p_reason),
    director_decision = CASE
      WHEN v_rejector.role::TEXT IN ('DIRECTEUR_EXECUTIF', 'ADMIN') THEN 'REFUSEE'
      ELSE director_decision
    END,
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN (SELECT to_jsonb(mr.*) FROM mission_requests mr WHERE mr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- UNDO APPROVE MISSION
-- ────────────────────────────────────────────────────────
-- Mission stages: PENDING → VALIDATED_DC → VALIDATED_RP → APPROVED
CREATE OR REPLACE FUNCTION public.undo_approve_mission_request(
  p_request_id BIGINT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request      mission_requests%ROWTYPE;
  v_user         utilisateurs%ROWTYPE;
  v_prev_status  TEXT;
  v_field        TEXT;
BEGIN
  SELECT * INTO v_request FROM mission_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mission #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Cannot undo if at initial_status
  IF v_request.status = v_request.initial_status THEN
    RAISE EXCEPTION 'Impossible d''annuler: la demande est à son statut initial';
  END IF;

  -- Mission stages: PENDING → VALIDATED_DC → VALIDATED_RP → APPROVED
  CASE v_request.status
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_prev_status := 'PENDING';
      v_field := 'dc';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_dc != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      IF v_request.initial_status = 'VALIDATED_DC'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est à son statut initial';
      END IF;
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_prev_status := 'VALIDATED_DC';
      v_field := 'rp';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_rp != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      IF v_request.initial_status = 'VALIDATED_RP'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est à son statut initial';
      END IF;
    WHEN 'APPROVED'::public.leave_status THEN
      v_prev_status := 'VALIDATED_RP';
      v_field := 'de';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_de != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      -- Clear director_decision
      UPDATE mission_requests SET director_decision = NULL WHERE id = p_request_id;
    ELSE
      RAISE EXCEPTION 'La demande de mission #% est au statut %, impossible d''annuler',
        p_request_id, v_request.status;
  END CASE;

  -- Clear approval fields and move to previous status
  EXECUTE format(
    'UPDATE mission_requests SET status = $1::public.leave_status, approved_by_%s = NULL, approved_at_%s = NULL, updated_at = NOW() WHERE id = $2',
    v_field, v_field
  ) USING v_prev_status, p_request_id;

  RETURN (SELECT to_jsonb(mr.*) FROM mission_requests mr WHERE mr.id = p_request_id);
END;
$$;


-- ────────────────────────────────────────────────────────
-- UNDO REJECT MISSION
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.undo_reject_mission_request(
  p_request_id BIGINT,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request        mission_requests%ROWTYPE;
  v_user           utilisateurs%ROWTYPE;
  v_restore_status TEXT;
BEGIN
  SELECT * INTO v_request FROM mission_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de mission #% introuvable', p_request_id;
  END IF;

  IF v_request.status != 'REJECTED'::public.leave_status THEN
    RAISE EXCEPTION 'La demande de mission #% n''est pas rejetée', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Only the rejector or admin can undo
  IF v_user.role::TEXT != 'ADMIN' AND v_request.rejected_by != p_user_id THEN
    RAISE EXCEPTION 'Seul la personne qui a rejeté ou un admin peut restaurer cette demande';
  END IF;

  -- Infer pre-rejection status from approval fields (mission order: dc → rp → de)
  IF v_request.approved_by_rp IS NOT NULL THEN
    v_restore_status := 'VALIDATED_RP';
  ELSIF v_request.approved_by_dc IS NOT NULL THEN
    v_restore_status := 'VALIDATED_DC';
  ELSE
    v_restore_status := 'PENDING';
  END IF;

  -- Ensure we don't go below initial_status
  IF v_restore_status = 'PENDING' AND v_request.initial_status != 'PENDING'::public.leave_status THEN
    v_restore_status := v_request.initial_status::TEXT;
  ELSIF v_restore_status = 'VALIDATED_DC'
        AND v_request.initial_status IN ('VALIDATED_RP'::public.leave_status, 'APPROVED'::public.leave_status) THEN
    v_restore_status := v_request.initial_status::TEXT;
  END IF;

  UPDATE mission_requests SET
    status = v_restore_status::public.leave_status,
    rejected_by = NULL,
    rejected_at = NULL,
    rejection_reason = NULL,
    director_decision = NULL,
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN (SELECT to_jsonb(mr.*) FROM mission_requests mr WHERE mr.id = p_request_id);
END;
$$;


-- ============================================================================
-- SECTION 5: COMPLETE RLS POLICIES FOR MISSION_REQUESTS
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.mission_requests ENABLE ROW LEVEL SECURITY;

-- Drop ALL old mission policies to rebuild from scratch
DROP POLICY IF EXISTS "Managers can update missions" ON public.mission_requests;
DROP POLICY IF EXISTS "Users can delete own pending missions" ON public.mission_requests;
DROP POLICY IF EXISTS "Admin can delete any mission" ON public.mission_requests;
DROP POLICY IF EXISTS "Users can create own missions" ON public.mission_requests;
DROP POLICY IF EXISTS "Managers can create missions for others" ON public.mission_requests;
DROP POLICY IF EXISTS "Users can view own missions" ON public.mission_requests;
DROP POLICY IF EXISTS "Managers can view all missions" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_update" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_delete" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_insert_self" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_insert_manager" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_select_own" ON public.mission_requests;
DROP POLICY IF EXISTS "mission_requests_select_manager" ON public.mission_requests;

-- ── SELECT ──
-- Users can see their own missions
CREATE POLICY "mission_requests_select_own"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_by);

-- Managers can see missions of users they manage
CREATE POLICY "mission_requests_select_manager"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (public.can_manage_user(user_id));

-- ── INSERT ──
-- Users can create missions for themselves (trigger sets status/initial_status)
CREATE POLICY "mission_requests_insert_self"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Managers can create missions on behalf of others
CREATE POLICY "mission_requests_insert_manager"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_user(user_id));

-- ── UPDATE ──
-- Only owner at PENDING or creator at initial_status can edit
-- All approval state changes go through SECURITY DEFINER RPCs
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

-- ── DELETE ──
-- Owner at PENDING, creator at initial_status (not APPROVED), or ADMIN
CREATE POLICY "mission_requests_delete"
  ON public.mission_requests FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING'::public.leave_status)
    OR (created_by = auth.uid() AND status = initial_status AND status != 'APPROVED'::public.leave_status)
    OR public.get_my_role() = 'ADMIN'
  );


-- ============================================================================
-- SECTION 6: GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.approve_mission_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_mission_request(BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_approve_mission_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_reject_mission_request(BIGINT, UUID) TO authenticated;


-- ============================================================================
-- SECTION 7: VERIFICATION
-- ============================================================================

-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'mission_requests'
  AND column_name IN ('created_by', 'initial_status');

-- Check triggers
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'mission_requests'
  AND trigger_schema = 'public';

-- Check policies
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'mission_requests'
ORDER BY policyname;

-- ==============================================================================
-- PART 3/4: ALL RPCs (Leave, Mission, Labor Law, Balance Init)
-- ==============================================================================
-- Run AFTER 02_rls_triggers.sql.
-- Safe to re-run: uses DROP IF EXISTS + CREATE OR REPLACE.
--
-- Approval chains:
--   Leave:   PENDING -> RH -> VALIDATED_RP -> Chef -> VALIDATED_DC -> Dir -> APPROVED
--   Mission: PENDING -> Chef -> VALIDATED_DC -> RH -> VALIDATED_RP -> Dir -> APPROVED
-- ==============================================================================


-- ==============================================================================
-- LEAVE REQUEST RPCs
-- ==============================================================================

DROP FUNCTION IF EXISTS public.approve_leave_request(BIGINT, UUID, DATE, DATE, FLOAT) CASCADE;
DROP FUNCTION IF EXISTS public.reject_leave_request(BIGINT, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.undo_approve_leave_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.undo_reject_leave_request(BIGINT, UUID) CASCADE;

-- ── APPROVE LEAVE REQUEST ──
-- 3-stage: PENDING->RH->VALIDATED_RP, VALIDATED_RP->CHEF->VALIDATED_DC, VALIDATED_DC->DIR->APPROVED
-- On final approval: recalculates days (holiday-aware), deducts balance, records history
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
  v_balance_field      TEXT;
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

  -- On final approval: recalculate days, deduct RECUPERATION only, record audit trail
  IF v_next_status = 'APPROVED' THEN
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Recalculate days server-side (holiday-aware)
    v_days := count_working_days(v_request.start_date, v_request.end_date, v_company_id);
    UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;

    -- *** CONGE: audit trail ONLY — NO balance_conge deduction ***
    -- (balance is computed dynamically by calculate_leave_balance)
    IF v_request.request_type = 'CONGE' THEN
      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (v_request.user_id, 'CONGE', -v_days,
        'Approbation demande #' || p_request_id || ' (conge)',
        EXTRACT(YEAR FROM v_request.start_date)::INT, v_request.start_date, v_request.end_date);
    ELSE
      -- RECUPERATION: deduct from balance
      UPDATE utilisateurs SET balance_recuperation = GREATEST(balance_recuperation - v_days, 0)
      WHERE id = v_request.user_id;

      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (v_request.user_id, 'RECUPERATION', -v_days,
        'Approbation demande #' || p_request_id || ' (recuperation)',
        EXTRACT(YEAR FROM v_request.start_date)::INT, v_request.start_date, v_request.end_date);
    END IF;
  END IF;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ── REJECT LEAVE REQUEST ──
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
          RAISE EXCEPTION 'Seul le RH peut rejeter a cette etape';
        END IF;
      WHEN 'VALIDATED_RP'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'CHEF_SERVICE' THEN
          RAISE EXCEPTION 'Seul le Chef de Service peut rejeter a cette etape';
        END IF;
        SELECT department_id INTO v_requester_dept_id
        FROM utilisateurs WHERE id = v_request.user_id;
        IF v_rejector.department_id IS NULL
           OR v_requester_dept_id IS NULL
           OR v_rejector.department_id != v_requester_dept_id THEN
          RAISE EXCEPTION 'Le chef de service ne peut rejeter que les demandes de son departement';
        END IF;
      WHEN 'VALIDATED_DC'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'DIRECTEUR_EXECUTIF' THEN
          RAISE EXCEPTION 'Seul le Directeur Executif peut rejeter a cette etape';
        END IF;
      ELSE
        RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas etre rejetee',
          p_request_id, v_request.status;
    END CASE;
  ELSE
    IF v_request.status NOT IN ('PENDING'::public.leave_status, 'VALIDATED_RP'::public.leave_status, 'VALIDATED_DC'::public.leave_status) THEN
      RAISE EXCEPTION 'La demande #% est au statut %, elle ne peut pas etre rejetee',
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


-- ── UNDO APPROVE LEAVE ──
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

      -- *** CONGE: audit trail ONLY — NO balance_conge restoration ***
      IF v_request.request_type = 'CONGE' THEN
        INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
        VALUES (v_request.user_id, 'CONGE', v_request.days_count,
          'Annulation approbation demande #' || p_request_id || ' (conge)',
          EXTRACT(YEAR FROM v_request.start_date)::INT, v_request.start_date, v_request.end_date);
      ELSE
        -- RECUPERATION: restore balance
        UPDATE utilisateurs SET balance_recuperation = balance_recuperation + v_request.days_count
        WHERE id = v_request.user_id;

        INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
        VALUES (v_request.user_id, 'RECUPERATION', v_request.days_count,
          'Annulation approbation demande #' || p_request_id || ' (recuperation)',
          EXTRACT(YEAR FROM v_request.start_date)::INT, v_request.start_date, v_request.end_date);
      END IF;
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


-- ── UNDO REJECT LEAVE ──
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
    RAISE EXCEPTION 'La demande #% n''est pas rejetee', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF v_user.role::TEXT != 'ADMIN' AND v_request.rejected_by != p_user_id THEN
    RAISE EXCEPTION 'Seul la personne qui a rejete ou un admin peut restaurer cette demande';
  END IF;

  IF v_request.approved_by_dc IS NOT NULL THEN
    v_restore_status := 'VALIDATED_DC';
  ELSIF v_request.approved_by_rp IS NOT NULL THEN
    v_restore_status := 'VALIDATED_RP';
  ELSE
    v_restore_status := 'PENDING';
  END IF;

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


-- ==============================================================================
-- MISSION REQUEST RPCs
-- ==============================================================================

DROP FUNCTION IF EXISTS public.approve_mission_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reject_mission_request(BIGINT, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.undo_approve_mission_request(BIGINT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.undo_reject_mission_request(BIGINT, UUID) CASCADE;

-- ── APPROVE MISSION REQUEST ──
-- Mission chain: PENDING->Chef(dc) -> VALIDATED_DC->RH(rp) -> VALIDATED_RP->Dir(de) -> APPROVED
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

  IF p_approver_id = v_request.user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas approuver votre propre demande';
  END IF;

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
      RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas etre approuvee',
        p_request_id, v_request.status;
  END CASE;

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

  EXECUTE format(
    'UPDATE mission_requests SET status = $1::public.leave_status, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  IF v_next_status = 'APPROVED' THEN
    UPDATE mission_requests SET director_decision = 'ACCORDEE' WHERE id = p_request_id;
  END IF;

  -- Auto-skip RH step if creator is RH (on-behalf case)
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


-- ── REJECT MISSION REQUEST ──
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

  IF v_rejector.role::TEXT != 'ADMIN' THEN
    CASE v_request.status
      WHEN 'PENDING'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'CHEF_SERVICE' THEN
          RAISE EXCEPTION 'Seul le Chef de Service peut rejeter a cette etape';
        END IF;
        SELECT department_id INTO v_requester_dept_id
        FROM utilisateurs WHERE id = v_request.user_id;
        IF v_rejector.department_id IS NULL
           OR v_requester_dept_id IS NULL
           OR v_rejector.department_id != v_requester_dept_id THEN
          RAISE EXCEPTION 'Le chef de service ne peut rejeter que les demandes de son departement';
        END IF;
      WHEN 'VALIDATED_DC'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'RH' THEN
          RAISE EXCEPTION 'Seul le RH peut rejeter a cette etape';
        END IF;
      WHEN 'VALIDATED_RP'::public.leave_status THEN
        IF v_rejector.role::TEXT != 'DIRECTEUR_EXECUTIF' THEN
          RAISE EXCEPTION 'Seul le Directeur Executif peut rejeter a cette etape';
        END IF;
      ELSE
        RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas etre rejetee',
          p_request_id, v_request.status;
    END CASE;
  ELSE
    IF v_request.status NOT IN ('PENDING'::public.leave_status, 'VALIDATED_DC'::public.leave_status, 'VALIDATED_RP'::public.leave_status) THEN
      RAISE EXCEPTION 'La demande de mission #% est au statut %, elle ne peut pas etre rejetee',
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


-- ── UNDO APPROVE MISSION ──
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

  IF v_request.status = v_request.initial_status THEN
    RAISE EXCEPTION 'Impossible d''annuler: la demande est a son statut initial';
  END IF;

  CASE v_request.status
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_prev_status := 'PENDING';
      v_field := 'dc';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_dc != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      IF v_request.initial_status = 'VALIDATED_DC'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est a son statut initial';
      END IF;
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_prev_status := 'VALIDATED_DC';
      v_field := 'rp';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_rp != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      IF v_request.initial_status = 'VALIDATED_RP'::public.leave_status THEN
        RAISE EXCEPTION 'Impossible d''annuler: la demande est a son statut initial';
      END IF;
    WHEN 'APPROVED'::public.leave_status THEN
      v_prev_status := 'VALIDATED_RP';
      v_field := 'de';
      IF v_user.role::TEXT != 'ADMIN' AND v_request.approved_by_de != p_user_id THEN
        RAISE EXCEPTION 'Seul l''approbateur ou un admin peut annuler cette validation';
      END IF;
      UPDATE mission_requests SET director_decision = NULL WHERE id = p_request_id;
    ELSE
      RAISE EXCEPTION 'La demande de mission #% est au statut %, impossible d''annuler',
        p_request_id, v_request.status;
  END CASE;

  EXECUTE format(
    'UPDATE mission_requests SET status = $1::public.leave_status, approved_by_%s = NULL, approved_at_%s = NULL, updated_at = NOW() WHERE id = $2',
    v_field, v_field
  ) USING v_prev_status, p_request_id;

  RETURN (SELECT to_jsonb(mr.*) FROM mission_requests mr WHERE mr.id = p_request_id);
END;
$$;


-- ── UNDO REJECT MISSION ──
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
    RAISE EXCEPTION 'La demande de mission #% n''est pas rejetee', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF v_user.role::TEXT != 'ADMIN' AND v_request.rejected_by != p_user_id THEN
    RAISE EXCEPTION 'Seul la personne qui a rejete ou un admin peut restaurer cette demande';
  END IF;

  IF v_request.approved_by_rp IS NOT NULL THEN
    v_restore_status := 'VALIDATED_RP';
  ELSIF v_request.approved_by_dc IS NOT NULL THEN
    v_restore_status := 'VALIDATED_DC';
  ELSE
    v_restore_status := 'PENDING';
  END IF;

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


-- ==============================================================================
-- MOROCCAN LABOR LAW RPCs
-- ==============================================================================

-- ── count_working_days ──
-- SUPERSEDED: This 3-arg version was replaced by the 7-arg version in
-- 08_working_days_per_department.sql (with department, category, and half-day support).
-- Keeping this DROP to prevent overload ambiguity if schema is re-seeded.
DROP FUNCTION IF EXISTS count_working_days(DATE, DATE, BIGINT);


-- ── calculate_annual_entitlement ──
-- Moroccan law: 18 jours ouvrables/year + 1.5 days per 5-year seniority, max 30
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

  v_hire_date := COALESCE(v_user.hire_date, CURRENT_DATE);

  IF v_user.birth_date IS NOT NULL THEN
    v_is_minor := (age(CURRENT_DATE, v_user.birth_date) < interval '18 years');
  END IF;

  IF v_is_minor THEN
    v_base_days := 24.0;
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
    'max_days',           v_max_days
  );
END;
$$;


-- ── calculate_leave_balance ──
-- Combines entitlement with actual usage for current year
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


-- ── credit_recuperation ──
-- RH/Admin credits recuperation days when employee works on rest days
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
  v_user        utilisateurs%ROWTYPE;
  v_new_balance FLOAT;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  IF p_days <= 0 THEN
    RAISE EXCEPTION 'Days must be positive';
  END IF;

  v_new_balance := v_user.balance_recuperation + p_days;
  UPDATE utilisateurs SET balance_recuperation = v_new_balance WHERE id = p_user_id;

  INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
  VALUES (
    p_user_id,
    'RECUPERATION',
    p_days,
    COALESCE(p_reason, 'Credit recuperation'),
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


-- ── recalculate_all_balances ──
-- Admin function to reset all balances from entitlement - usage
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
    v_entitlement := calculate_annual_entitlement(v_user.id);
    v_annual := (v_entitlement->>'annual_entitlement')::FLOAT;

    SELECT COALESCE(SUM(days_count), 0) INTO v_used
    FROM leave_requests
    WHERE user_id = v_user.id
      AND request_type = 'CONGE'
      AND status = 'APPROVED'
      AND EXTRACT(YEAR FROM start_date) = v_current_year;

    v_new_balance := GREATEST(v_annual - v_used, 0);

    UPDATE utilisateurs SET balance_conge = v_new_balance WHERE id = v_user.id;

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


-- ==============================================================================
-- BALANCE INIT RPC
-- ==============================================================================

-- Allows RH/ADMIN to manually set leave balance (for initial setup)
CREATE OR REPLACE FUNCTION set_initial_balance(
  p_user_id  UUID,
  p_balance  FLOAT,
  p_year     INTEGER,
  p_reason   TEXT DEFAULT 'Initialisation solde par RH'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user        utilisateurs%ROWTYPE;
  v_old_balance FLOAT;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur % introuvable', p_user_id;
  END IF;

  IF p_balance < 0 THEN
    RAISE EXCEPTION 'Le solde ne peut pas etre negatif';
  END IF;

  v_old_balance := v_user.balance_conge;

  UPDATE utilisateurs
  SET balance_conge = p_balance, updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO leave_balance_history (user_id, type, amount, reason, year)
  VALUES (
    p_user_id,
    'CONGE',
    p_balance,
    COALESCE(p_reason, 'Initialisation solde par RH') || ' (ancien solde: ' || v_old_balance || ')',
    p_year
  );

  RETURN jsonb_build_object(
    'user_id',     p_user_id,
    'old_balance', v_old_balance,
    'new_balance', p_balance,
    'year',        p_year
  );
END;
$$;

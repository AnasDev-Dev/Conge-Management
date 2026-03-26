-- ==============================================================================
-- PART 10: COMBINED LEAVE REQUESTS (Congé + Récupération)
-- ==============================================================================
-- Run AFTER 09_fix_login.sql.
-- Safe to re-run: uses CREATE OR REPLACE.
--
-- balance_conge is carry-over only (solde anterieur). CONGE usage is tracked
-- via leave_requests queries in calculate_leave_balance() RPC.
-- Only RECUPERATION is deducted from utilisateurs.balance_recuperation.
--
-- Changes:
--   1. Auto-approval trigger: RECUPERATION deduction + FIFO lots only
--   2. approve_leave_request: RECUPERATION deduction only, CONGE audit trail only
--   3. undo_approve: RECUPERATION restoration only, CONGE audit trail only
-- ==============================================================================


-- ==============================================================================
-- 1. UPDATE AUTO-APPROVAL TRIGGER: RECUPERATION only, CONGE audit trail
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_auto_approved_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'APPROVED'::public.leave_status THEN
    -- CONGE: no balance deduction (tracked via leave_requests queries)
    -- RECUPERATION: deduct from utilisateurs + recovery_balance_lots FIFO
    IF COALESCE(NEW.balance_recuperation_used, 0) > 0 THEN
      UPDATE utilisateurs
      SET balance_recuperation = GREATEST(balance_recuperation - NEW.balance_recuperation_used, 0)
      WHERE id = NEW.user_id;

      -- Deduct from recovery_balance_lots FIFO (earliest expiration first)
      DECLARE
        v_lot RECORD;
        v_remaining FLOAT := NEW.balance_recuperation_used;
      BEGIN
        FOR v_lot IN
          SELECT id, remaining_days
          FROM recovery_balance_lots
          WHERE user_id = NEW.user_id
            AND expired = false
            AND remaining_days > 0
          ORDER BY expires_at ASC, id ASC
        LOOP
          EXIT WHEN v_remaining <= 0;
          IF v_lot.remaining_days >= v_remaining THEN
            UPDATE recovery_balance_lots
            SET remaining_days = remaining_days - v_remaining
            WHERE id = v_lot.id;
            v_remaining := 0;
          ELSE
            v_remaining := v_remaining - v_lot.remaining_days;
            UPDATE recovery_balance_lots
            SET remaining_days = 0
            WHERE id = v_lot.id;
          END IF;
        END LOOP;
      END;
    END IF;

    -- Audit trail (kept for both types, no balance mutation for CONGE)
    IF COALESCE(NEW.balance_conge_used, 0) > 0 THEN
      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (
        NEW.user_id, 'CONGE', -NEW.balance_conge_used,
        'Demande auto-approuvee #' || NEW.id || ' (conge)',
        EXTRACT(YEAR FROM NEW.start_date)::INT,
        NEW.start_date, NEW.end_date
      );
    END IF;

    IF COALESCE(NEW.balance_recuperation_used, 0) > 0 THEN
      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (
        NEW.user_id, 'RECUPERATION', -NEW.balance_recuperation_used,
        'Demande auto-approuvee #' || NEW.id || ' (recuperation)',
        EXTRACT(YEAR FROM NEW.start_date)::INT,
        NEW.start_date, NEW.end_date
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ==============================================================================
-- 2. UPDATE APPROVE LEAVE REQUEST: RECUPERATION deduction only on final approval
-- ==============================================================================

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
  v_conge_used         FLOAT;
  v_recup_used         FLOAT;
  v_lot                RECORD;
  v_remaining_to_deduct FLOAT;
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
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Recalculate days with actual half-day values
    DECLARE
      v_new_days FLOAT;
    BEGIN
      v_new_days := COALESCE(p_new_days_count, count_working_days(
        p_new_start_date, p_new_end_date,
        v_company_id, NULL,
        COALESCE(v_request.start_half_day, 'FULL'),
        COALESCE(v_request.end_half_day, 'FULL'),
        v_request_user.department_id
      ));

      UPDATE leave_requests SET
        start_date = p_new_start_date,
        end_date = p_new_end_date,
        days_count = v_new_days,
        -- Reset split when dates change (will be recalculated on final approval)
        balance_conge_used = CASE WHEN v_request.is_mixed THEN NULL ELSE v_new_days END,
        balance_recuperation_used = CASE WHEN v_request.request_type = 'RECUPERATION' AND NOT COALESCE(v_request.is_mixed, false) THEN v_new_days ELSE NULL END
      WHERE id = p_request_id;
    END;
    SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  END IF;

  v_days := v_request.days_count;

  -- Update status and approval fields
  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  -- On final approval: deduct RECUPERATION only, record audit trail
  IF v_next_status = 'APPROVED' THEN
    SELECT * INTO v_request_user FROM utilisateurs WHERE id = v_request.user_id;
    v_company_id := COALESCE(v_request_user.company_id, (SELECT id FROM companies LIMIT 1));

    -- Use the stored split amounts if available
    v_conge_used := COALESCE(v_request.balance_conge_used, 0);
    v_recup_used := COALESCE(v_request.balance_recuperation_used, 0);

    IF v_conge_used > 0 OR v_recup_used > 0 THEN
      -- Trust the stored split (from segments or frontend)
      v_days := v_conge_used + v_recup_used;
      UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;
    ELSE
      -- Legacy: no split stored, recalculate with actual half-day values
      v_days := count_working_days(
        v_request.start_date, v_request.end_date,
        v_company_id, NULL,
        COALESCE(v_request.start_half_day, 'FULL'),
        COALESCE(v_request.end_half_day, 'FULL'),
        v_request_user.department_id
      );
      UPDATE leave_requests SET days_count = v_days WHERE id = p_request_id;

      IF v_request.request_type = 'CONGE' THEN
        v_conge_used := v_days;
      ELSE
        v_recup_used := v_days;
      END IF;
    END IF;

    -- CONGE: audit trail only, no balance deduction (tracked via leave_requests queries)
    IF v_conge_used > 0 THEN
      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (
        v_request.user_id, 'CONGE', -v_conge_used,
        'Approbation demande #' || p_request_id || ' (conge)',
        EXTRACT(YEAR FROM v_request.start_date)::INT,
        v_request.start_date, v_request.end_date
      );
    END IF;

    -- RECUPERATION: deduct from utilisateurs + recovery_balance_lots FIFO
    IF v_recup_used > 0 THEN
      UPDATE utilisateurs
      SET balance_recuperation = GREATEST(balance_recuperation - v_recup_used, 0)
      WHERE id = v_request.user_id;

      INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
      VALUES (
        v_request.user_id, 'RECUPERATION', -v_recup_used,
        'Approbation demande #' || p_request_id || ' (recuperation)',
        EXTRACT(YEAR FROM v_request.start_date)::INT,
        v_request.start_date, v_request.end_date
      );

      -- Deduct from recovery_balance_lots FIFO (earliest expiration first)
      v_remaining_to_deduct := v_recup_used;
      FOR v_lot IN
        SELECT id, remaining_days
        FROM recovery_balance_lots
        WHERE user_id = v_request.user_id
          AND expired = false
          AND remaining_days > 0
        ORDER BY expires_at ASC, id ASC
      LOOP
        EXIT WHEN v_remaining_to_deduct <= 0;
        IF v_lot.remaining_days >= v_remaining_to_deduct THEN
          UPDATE recovery_balance_lots
          SET remaining_days = remaining_days - v_remaining_to_deduct
          WHERE id = v_lot.id;
          v_remaining_to_deduct := 0;
        ELSE
          v_remaining_to_deduct := v_remaining_to_deduct - v_lot.remaining_days;
          UPDATE recovery_balance_lots
          SET remaining_days = 0
          WHERE id = v_lot.id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ==============================================================================
-- 3. UPDATE UNDO APPROVE: RECUPERATION restoration only, CONGE audit trail
-- ==============================================================================

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
  v_conge_used   FLOAT;
  v_recup_used   FLOAT;
BEGIN
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande #% introuvable', p_request_id;
  END IF;

  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF v_user.role::TEXT NOT IN ('RH', 'CHEF_SERVICE', 'DIRECTEUR_EXECUTIF', 'ADMIN') THEN
    RAISE EXCEPTION 'Seul un responsable peut annuler une approbation';
  END IF;

  CASE v_request.status
    WHEN 'VALIDATED_RP'::public.leave_status THEN
      v_prev_status := 'PENDING';
      v_field := 'rp';
    WHEN 'VALIDATED_DC'::public.leave_status THEN
      v_prev_status := 'VALIDATED_RP';
      v_field := 'dc';
    WHEN 'APPROVED'::public.leave_status THEN
      v_prev_status := 'VALIDATED_DC';
      v_field := 'de';

      -- Restore balances using stored split
      v_conge_used := COALESCE(v_request.balance_conge_used, 0);
      v_recup_used := COALESCE(v_request.balance_recuperation_used, 0);

      -- Legacy fallback
      IF v_conge_used = 0 AND v_recup_used = 0 THEN
        IF v_request.request_type = 'CONGE' THEN
          v_conge_used := v_request.days_count;
        ELSE
          v_recup_used := v_request.days_count;
        END IF;
      END IF;

      -- CONGE: audit trail only, no balance restoration (tracked via leave_requests queries)
      IF v_conge_used > 0 THEN
        INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
        VALUES (
          v_request.user_id, 'CONGE', v_conge_used,
          'Annulation approbation demande #' || p_request_id || ' (conge)',
          EXTRACT(YEAR FROM v_request.start_date)::INT,
          v_request.start_date, v_request.end_date
        );
      END IF;

      -- RECUPERATION: restore utilisateurs + recovery_balance_lots FIFO
      IF v_recup_used > 0 THEN
        UPDATE utilisateurs
        SET balance_recuperation = balance_recuperation + v_recup_used
        WHERE id = v_request.user_id;

        INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to)
        VALUES (
          v_request.user_id, 'RECUPERATION', v_recup_used,
          'Annulation approbation demande #' || p_request_id || ' (recuperation)',
          EXTRACT(YEAR FROM v_request.start_date)::INT,
          v_request.start_date, v_request.end_date
        );

        -- Restore recovery_balance_lots FIFO (earliest expiration first, up to original days)
        DECLARE
          v_lot RECORD;
          v_remaining FLOAT := v_recup_used;
          v_room FLOAT;
          v_credit FLOAT;
        BEGIN
          FOR v_lot IN
            SELECT id, days, remaining_days
            FROM recovery_balance_lots
            WHERE user_id = v_request.user_id
              AND expired = false
              AND remaining_days < days
            ORDER BY expires_at ASC, id ASC
          LOOP
            EXIT WHEN v_remaining <= 0;
            v_room := v_lot.days - v_lot.remaining_days;
            v_credit := LEAST(v_remaining, v_room);
            IF v_credit > 0 THEN
              UPDATE recovery_balance_lots
              SET remaining_days = remaining_days + v_credit
              WHERE id = v_lot.id;
              v_remaining := v_remaining - v_credit;
            END IF;
          END LOOP;
        END;
      END IF;
    ELSE
      RAISE EXCEPTION 'La demande #% est au statut %, impossible d''annuler', p_request_id, v_request.status;
  END CASE;

  -- Restore initial status if applicable
  IF v_prev_status = 'PENDING' AND v_request.initial_status != 'PENDING'::public.leave_status THEN
    v_prev_status := v_request.initial_status::TEXT;
  ELSIF v_prev_status = 'VALIDATED_RP'
        AND v_request.initial_status IN ('VALIDATED_DC'::public.leave_status, 'APPROVED'::public.leave_status) THEN
    v_prev_status := v_request.initial_status::TEXT;
  END IF;

  EXECUTE format(
    'UPDATE leave_requests SET status = $1::public.leave_status, approved_by_%s = NULL, approved_at_%s = NULL, updated_at = NOW() WHERE id = $2',
    v_field, v_field
  ) USING v_prev_status, p_request_id;

  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ==============================================================================
-- DONE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';

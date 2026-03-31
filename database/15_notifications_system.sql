-- ============================================================================
-- 15_notifications_system.sql
-- Full in-app notification system: triggers on leave, mission, recovery
-- status changes + new request creation → auto-generates notifications
-- ============================================================================

-- 1. Add columns for mission and recovery request references
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_mission_id bigint REFERENCES public.mission_requests(id),
  ADD COLUMN IF NOT EXISTS related_recovery_id bigint REFERENCES public.recovery_requests(id);

CREATE INDEX IF NOT EXISTS idx_notifications_mission ON public.notifications(related_mission_id)
  WHERE related_mission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recovery ON public.notifications(related_recovery_id)
  WHERE related_recovery_id IS NOT NULL;


-- ============================================================================
-- 2. LEAVE REQUEST — status change trigger (notify requester + next validators)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_leave_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_requester_dept    BIGINT;
  v_approver_name     TEXT;
  v_title             TEXT;
  v_message           TEXT;
  v_type              TEXT;
  v_type_label        TEXT;
  v_dates_text        TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name, company_id, department_id
  INTO v_requester_name, v_requester_company, v_requester_dept
  FROM utilisateurs WHERE id = NEW.user_id;

  v_type_label := CASE NEW.request_type WHEN 'CONGE' THEN 'conge' ELSE 'recuperation' END;
  v_dates_text := to_char(NEW.start_date, 'DD/MM/YYYY') || ' au ' || to_char(NEW.end_date, 'DD/MM/YYYY');

  -- === NOTIFY REQUESTER ===
  CASE
    WHEN NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'PENDING'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_rp;
      v_title := 'Demande validee par RH';
      v_message := format('Votre demande de %s du %s a ete validee par %s (RH). En attente du Chef de Service.',
        v_type_label, v_dates_text, COALESCE(v_approver_name, 'RH'));
      v_type := 'LEAVE_VALIDATED_RP';

    WHEN NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'VALIDATED_RP'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_dc;
      v_title := 'Demande validee par Chef de Service';
      v_message := format('Votre demande de %s du %s a ete validee par %s (Chef de Service). En attente du Directeur.',
        v_type_label, v_dates_text, COALESCE(v_approver_name, 'Chef de Service'));
      v_type := 'LEAVE_VALIDATED_DC';

    WHEN NEW.status = 'APPROVED'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_de;
      v_title := 'Demande approuvee';
      v_message := format('Votre demande de %s du %s (%s jours) a ete approuvee par %s.',
        v_type_label, v_dates_text, NEW.days_count, COALESCE(v_approver_name, 'le Directeur'));
      v_type := 'LEAVE_APPROVED';

    WHEN NEW.status = 'REJECTED'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.rejected_by;
      v_title := 'Demande rejetee';
      v_message := format('Votre demande de %s du %s a ete rejetee par %s. Motif: %s',
        v_type_label, v_dates_text,
        COALESCE(v_approver_name, 'un responsable'),
        COALESCE(NEW.rejection_reason, 'Non specifie'));
      v_type := 'LEAVE_REJECTED';

    -- Undo / Restore cases
    WHEN NEW.status = 'PENDING'::leave_status AND OLD.status = 'REJECTED'::leave_status THEN
      v_title := 'Demande restauree';
      v_message := format('Votre demande de %s du %s a ete restauree et est de nouveau en attente.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_RESTORED';

    WHEN NEW.status = 'PENDING'::leave_status AND OLD.status = 'VALIDATED_RP'::leave_status THEN
      v_title := 'Validation RH annulee';
      v_message := format('La validation RH de votre demande de %s du %s a ete annulee.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_UNDO';

    WHEN NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'VALIDATED_DC'::leave_status THEN
      v_title := 'Validation Chef de Service annulee';
      v_message := format('La validation Chef de Service de votre demande de %s du %s a ete annulee.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_UNDO';

    WHEN NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'REJECTED'::leave_status THEN
      v_title := 'Demande restauree';
      v_message := format('Votre demande de %s du %s a ete restauree au stade Chef de Service.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_RESTORED';

    WHEN NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'APPROVED'::leave_status THEN
      v_title := 'Approbation annulee';
      v_message := format('L''approbation de votre demande de %s du %s a ete annulee.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_UNDO';

    WHEN NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'REJECTED'::leave_status THEN
      v_title := 'Demande restauree';
      v_message := format('Votre demande de %s du %s a ete restauree au stade Directeur.',
        v_type_label, v_dates_text);
      v_type := 'LEAVE_RESTORED';

    ELSE
      RETURN NEW;
  END CASE;

  -- Insert notification for the requester
  INSERT INTO notifications (user_id, title, message, type, related_request_id)
  VALUES (NEW.user_id, v_title, v_message, v_type, NEW.id);

  -- === NOTIFY NEXT VALIDATORS when request advances ===
  IF NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'PENDING'::leave_status THEN
    -- Next validator: CHEF_SERVICE in same department
    INSERT INTO notifications (user_id, title, message, type, related_request_id)
    SELECT u.id,
      'Demande de conge a valider',
      format('%s a une demande de %s du %s (%s jours) en attente de votre validation.',
        v_requester_name, v_type_label, v_dates_text, NEW.days_count),
      'LEAVE_TO_VALIDATE',
      NEW.id
    FROM utilisateurs u
    WHERE u.role::TEXT = 'CHEF_SERVICE'
      AND u.is_active = true
      AND u.department_id = v_requester_dept
      AND u.company_id = v_requester_company
      AND u.id != NEW.user_id;

  ELSIF NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'VALIDATED_RP'::leave_status THEN
    -- Next validator: DIRECTEUR_EXECUTIF
    INSERT INTO notifications (user_id, title, message, type, related_request_id)
    SELECT u.id,
      'Demande de conge a approuver',
      format('%s a une demande de %s du %s (%s jours) en attente de votre approbation finale.',
        v_requester_name, v_type_label, v_dates_text, NEW.days_count),
      'LEAVE_TO_VALIDATE',
      NEW.id
    FROM utilisateurs u
    WHERE u.role::TEXT = 'DIRECTEUR_EXECUTIF'
      AND u.is_active = true
      AND u.company_id = v_requester_company
      AND u.id != NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_status_notify ON leave_requests;
CREATE TRIGGER trg_leave_status_notify
  AFTER UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_leave_status_change();


-- ============================================================================
-- 3. LEAVE REQUEST — new request trigger (notify first validators = RH)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_leave_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_type_label        TEXT;
  v_dates_text        TEXT;
BEGIN
  SELECT full_name, company_id
  INTO v_requester_name, v_requester_company
  FROM utilisateurs WHERE id = NEW.user_id;

  v_type_label := CASE NEW.request_type WHEN 'CONGE' THEN 'conge' ELSE 'recuperation' END;
  v_dates_text := to_char(NEW.start_date, 'DD/MM/YYYY') || ' au ' || to_char(NEW.end_date, 'DD/MM/YYYY');

  -- Notify RH users (first stage validators) in the same company
  INSERT INTO notifications (user_id, title, message, type, related_request_id)
  SELECT u.id,
    'Nouvelle demande de ' || v_type_label,
    format('%s a soumis une demande de %s du %s (%s jours). En attente de votre validation.',
      v_requester_name, v_type_label, v_dates_text, NEW.days_count),
    'NEW_LEAVE_TO_VALIDATE',
    NEW.id
  FROM utilisateurs u
  WHERE u.role::TEXT IN ('RH', 'ADMIN')
    AND u.is_active = true
    AND u.company_id = v_requester_company
    AND u.id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_created_notify ON leave_requests;
CREATE TRIGGER trg_leave_created_notify
  AFTER INSERT ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_leave_created();


-- ============================================================================
-- 4. MISSION REQUEST — status change trigger
-- ============================================================================
-- Mission chain: PENDING -> Chef(dc) -> VALIDATED_DC -> RH(rp) -> VALIDATED_RP -> Dir(de) -> APPROVED
CREATE OR REPLACE FUNCTION notify_mission_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_requester_dept    BIGINT;
  v_approver_name     TEXT;
  v_title             TEXT;
  v_message           TEXT;
  v_type              TEXT;
  v_dates_text        TEXT;
  v_object_text       TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name, company_id, department_id
  INTO v_requester_name, v_requester_company, v_requester_dept
  FROM utilisateurs WHERE id = NEW.user_id;

  v_dates_text := to_char(NEW.start_date, 'DD/MM/YYYY') || ' au ' || to_char(NEW.end_date, 'DD/MM/YYYY');
  v_object_text := LEFT(COALESCE(NEW.mission_object, ''), 60);

  CASE
    -- Stage 1: RH validates (PENDING → VALIDATED_RP)
    WHEN NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'PENDING'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_rp;
      v_title := 'Mission validee par RH';
      v_message := format('Votre ordre de mission "%s" du %s a ete valide par %s. En attente du Chef de Service.',
        v_object_text, v_dates_text, COALESCE(v_approver_name, 'RH'));
      v_type := 'MISSION_VALIDATED_RP';

    -- Stage 2: Chef validates (VALIDATED_RP → VALIDATED_DC)
    WHEN NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'VALIDATED_RP'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_dc;
      v_title := 'Mission validee par Chef de Service';
      v_message := format('Votre ordre de mission "%s" du %s a ete valide par %s. En attente du Directeur.',
        v_object_text, v_dates_text, COALESCE(v_approver_name, 'Chef de Service'));
      v_type := 'MISSION_VALIDATED_DC';

    WHEN NEW.status = 'APPROVED'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.approved_by_de;
      v_title := 'Mission approuvee';
      v_message := format('Votre ordre de mission "%s" du %s a ete approuve par %s.',
        v_object_text, v_dates_text, COALESCE(v_approver_name, 'le Directeur'));
      v_type := 'MISSION_APPROVED';

    WHEN NEW.status = 'REJECTED'::leave_status THEN
      SELECT full_name INTO v_approver_name FROM utilisateurs WHERE id = NEW.rejected_by;
      v_title := 'Mission rejetee';
      v_message := format('Votre ordre de mission "%s" du %s a ete rejete par %s. Motif: %s',
        v_object_text, v_dates_text,
        COALESCE(v_approver_name, 'un responsable'),
        COALESCE(NEW.rejection_reason, 'Non specifie'));
      v_type := 'MISSION_REJECTED';

    -- Undo / Restore cases
    -- Undo: RH validation cancelled (VALIDATED_RP → PENDING)
    WHEN NEW.status = 'PENDING'::leave_status AND OLD.status IN ('VALIDATED_RP'::leave_status, 'REJECTED'::leave_status) THEN
      IF OLD.status = 'REJECTED'::leave_status THEN
        v_title := 'Mission restauree';
        v_message := format('Votre ordre de mission "%s" du %s a ete restaure.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_RESTORED';
      ELSE
        v_title := 'Validation RH annulee';
        v_message := format('La validation RH de votre ordre de mission "%s" du %s a ete annulee.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_UNDO';
      END IF;

    -- Undo: Chef validation cancelled (VALIDATED_DC → VALIDATED_RP)
    WHEN NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status IN ('VALIDATED_DC'::leave_status, 'REJECTED'::leave_status) THEN
      IF OLD.status = 'REJECTED'::leave_status THEN
        v_title := 'Mission restauree';
        v_message := format('Votre ordre de mission "%s" du %s a ete restaure au stade Chef de Service.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_RESTORED';
      ELSE
        v_title := 'Validation Chef de Service annulee';
        v_message := format('La validation du Chef de Service de votre ordre de mission "%s" du %s a ete annulee.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_UNDO';
      END IF;

    -- Undo: Director approval cancelled (APPROVED → VALIDATED_DC)
    WHEN NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status IN ('APPROVED'::leave_status, 'REJECTED'::leave_status) THEN
      IF OLD.status = 'REJECTED'::leave_status THEN
        v_title := 'Mission restauree';
        v_message := format('Votre ordre de mission "%s" du %s a ete restaure au stade Directeur.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_RESTORED';
      ELSE
        v_title := 'Approbation mission annulee';
        v_message := format('L''approbation de votre ordre de mission "%s" du %s a ete annulee.',
          v_object_text, v_dates_text);
        v_type := 'MISSION_UNDO';
      END IF;

    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO notifications (user_id, title, message, type, related_mission_id)
  VALUES (NEW.user_id, v_title, v_message, v_type, NEW.id);

  -- === NOTIFY NEXT VALIDATORS (aligned with leave pipeline: RH → Chef → Dir) ===
  -- After RH validates (VALIDATED_RP), notify Chef de Service
  IF NEW.status = 'VALIDATED_RP'::leave_status AND OLD.status = 'PENDING'::leave_status THEN
    INSERT INTO notifications (user_id, title, message, type, related_mission_id)
    SELECT u.id,
      'Ordre de mission a valider',
      format('%s a un ordre de mission "%s" du %s en attente de votre validation.',
        v_requester_name, v_object_text, v_dates_text),
      'MISSION_TO_VALIDATE',
      NEW.id
    FROM utilisateurs u
    WHERE u.role::TEXT = 'CHEF_SERVICE'
      AND u.is_active = true
      AND u.company_id = v_requester_company
      AND u.department_id = v_requester_dept
      AND u.id != NEW.user_id;

  -- After Chef validates (VALIDATED_DC), notify Director
  ELSIF NEW.status = 'VALIDATED_DC'::leave_status AND OLD.status = 'VALIDATED_RP'::leave_status THEN
    INSERT INTO notifications (user_id, title, message, type, related_mission_id)
    SELECT u.id,
      'Ordre de mission a approuver',
      format('%s a un ordre de mission "%s" du %s en attente de votre approbation finale.',
        v_requester_name, v_object_text, v_dates_text),
      'MISSION_TO_VALIDATE',
      NEW.id
    FROM utilisateurs u
    WHERE u.role::TEXT = 'DIRECTEUR_EXECUTIF'
      AND u.is_active = true
      AND u.company_id = v_requester_company
      AND u.id != NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_status_notify ON mission_requests;
CREATE TRIGGER trg_mission_status_notify
  AFTER UPDATE ON mission_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_mission_status_change();


-- ============================================================================
-- 5. MISSION REQUEST — new request trigger (notify CHEF_SERVICE)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_mission_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_requester_dept    BIGINT;
  v_dates_text        TEXT;
  v_object_text       TEXT;
BEGIN
  SELECT full_name, company_id, department_id
  INTO v_requester_name, v_requester_company, v_requester_dept
  FROM utilisateurs WHERE id = NEW.user_id;

  v_dates_text := to_char(NEW.start_date, 'DD/MM/YYYY') || ' au ' || to_char(NEW.end_date, 'DD/MM/YYYY');
  v_object_text := LEFT(COALESCE(NEW.mission_object, ''), 60);

  -- Notify RH (first stage for missions — aligned with leave pipeline)
  INSERT INTO notifications (user_id, title, message, type, related_mission_id)
  SELECT u.id,
    'Nouvel ordre de mission',
    format('%s a soumis un ordre de mission "%s" du %s. En attente de votre validation.',
      v_requester_name, v_object_text, v_dates_text),
    'NEW_MISSION_TO_VALIDATE',
    NEW.id
  FROM utilisateurs u
  WHERE u.role::TEXT IN ('RH', 'ADMIN')
    AND u.is_active = true
    AND u.company_id = v_requester_company
    AND u.id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_created_notify ON mission_requests;
CREATE TRIGGER trg_mission_created_notify
  AFTER INSERT ON mission_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_mission_created();


-- ============================================================================
-- 6. RECOVERY REQUEST — status change trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_recovery_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validator_name TEXT;
  v_title          TEXT;
  v_message        TEXT;
  v_type           TEXT;
  v_date_text      TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_date_text := to_char(NEW.date_worked, 'DD/MM/YYYY');

  CASE
    WHEN NEW.status = 'VALIDATED' AND OLD.status = 'PENDING' THEN
      SELECT full_name INTO v_validator_name FROM utilisateurs WHERE id = NEW.validated_by;
      v_title := 'Recuperation validee';
      v_message := format('Votre demande de recuperation de %s jour(s) du %s a ete validee par %s. Votre solde a ete credite.',
        NEW.days, v_date_text, COALESCE(v_validator_name, 'un responsable'));
      v_type := 'RECOVERY_VALIDATED';

    WHEN NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
      SELECT full_name INTO v_validator_name FROM utilisateurs WHERE id = NEW.validated_by;
      v_title := 'Recuperation rejetee';
      v_message := format('Votre demande de recuperation de %s jour(s) du %s a ete rejetee. Motif: %s',
        NEW.days, v_date_text, COALESCE(NEW.rejection_reason, 'Non specifie'));
      v_type := 'RECOVERY_REJECTED';

    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO notifications (user_id, title, message, type, related_recovery_id)
  VALUES (NEW.user_id, v_title, v_message, v_type, NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_status_notify ON recovery_requests;
CREATE TRIGGER trg_recovery_status_notify
  AFTER UPDATE ON recovery_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_recovery_status_change();


-- ============================================================================
-- 7. RECOVERY REQUEST — new request trigger (notify managers)
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_recovery_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_date_text         TEXT;
BEGIN
  SELECT full_name, company_id
  INTO v_requester_name, v_requester_company
  FROM utilisateurs WHERE id = NEW.user_id;

  v_date_text := to_char(NEW.date_worked, 'DD/MM/YYYY');

  INSERT INTO notifications (user_id, title, message, type, related_recovery_id)
  SELECT u.id,
    'Nouvelle demande de recuperation',
    format('%s a soumis une demande de recuperation de %s jour(s) pour le %s. En attente de validation.',
      v_requester_name, NEW.days, v_date_text),
    'NEW_RECOVERY_TO_VALIDATE',
    NEW.id
  FROM utilisateurs u
  WHERE u.role::TEXT IN ('RH', 'CHEF_SERVICE', 'DIRECTEUR_EXECUTIF', 'ADMIN')
    AND u.is_active = true
    AND u.company_id = v_requester_company
    AND u.id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_created_notify ON recovery_requests;
CREATE TRIGGER trg_recovery_created_notify
  AFTER INSERT ON recovery_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_recovery_created();

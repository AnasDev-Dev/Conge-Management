-- ==============================================================================
-- Notifications for Exceptional Leave Claims & Sick Leaves
-- ==============================================================================
-- Date: 25 March 2026
-- Run AFTER 20260324_fix_exceptional_claims_schema.sql
--
-- These leave types are auto-accepted (no validation pipeline).
-- Notifications are informational: they alert management (RH, Chef de Service,
-- Directeur Executif, Admin) when an employee declares exceptional or sick leave.
-- ==============================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  1. ADD FK COLUMNS TO NOTIFICATIONS TABLE                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_exceptional_claim_id BIGINT REFERENCES public.exceptional_leave_claims(id),
  ADD COLUMN IF NOT EXISTS related_sick_leave_id BIGINT REFERENCES public.sick_leaves(id);

CREATE INDEX IF NOT EXISTS idx_notifications_exceptional_claim
  ON public.notifications(related_exceptional_claim_id)
  WHERE related_exceptional_claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_sick_leave
  ON public.notifications(related_sick_leave_id)
  WHERE related_sick_leave_id IS NOT NULL;


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  2. EXCEPTIONAL LEAVE — AFTER INSERT trigger                                ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION notify_exceptional_leave_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name    TEXT;
  v_requester_company BIGINT;
  v_requester_dept    BIGINT;
  v_type_name         TEXT;
  v_dates_text        TEXT;
  v_days              FLOAT;
BEGIN
  -- Resolve employee info
  SELECT full_name, company_id, department_id
  INTO v_requester_name, v_requester_company, v_requester_dept
  FROM utilisateurs WHERE id = NEW.user_id;

  -- Resolve the exceptional leave type name (or "Autre" custom name)
  IF NEW.exceptional_leave_type_id IS NOT NULL THEN
    SELECT name INTO v_type_name
    FROM exceptional_leave_types WHERE id = NEW.exceptional_leave_type_id;
  END IF;
  v_type_name := COALESCE(v_type_name, NEW.autre_type_name, 'Conge exceptionnel');

  -- Build date range text
  v_dates_text := to_char(COALESCE(NEW.start_date, NEW.claim_date), 'DD/MM/YYYY')
    || ' au '
    || to_char(COALESCE(NEW.end_date, NEW.claim_date), 'DD/MM/YYYY');

  v_days := COALESCE(NEW.days_count, NEW.days_granted);

  -- Notify managers: RH, CHEF_SERVICE (same dept), DIRECTEUR_EXECUTIF, ADMIN
  INSERT INTO notifications (user_id, title, message, type, related_exceptional_claim_id)
  SELECT u.id,
    'Conge exceptionnel declare',
    format('%s a declare un conge exceptionnel (%s) du %s (%s jour(s)).',
      v_requester_name, v_type_name, v_dates_text, v_days),
    'NEW_EXCEPTIONAL_LEAVE',
    NEW.id
  FROM utilisateurs u
  WHERE u.role::TEXT IN ('RH', 'CHEF_SERVICE', 'DIRECTEUR_EXECUTIF', 'ADMIN')
    AND u.is_active = true
    AND u.company_id = v_requester_company
    AND (u.role::TEXT != 'CHEF_SERVICE' OR u.department_id = v_requester_dept)
    AND u.id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exceptional_leave_created_notify ON exceptional_leave_claims;
CREATE TRIGGER trg_exceptional_leave_created_notify
  AFTER INSERT ON exceptional_leave_claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_exceptional_leave_created();


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  3. SICK LEAVE — AFTER INSERT trigger                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION notify_sick_leave_created()
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
BEGIN
  -- Resolve employee info
  SELECT full_name, company_id, department_id
  INTO v_requester_name, v_requester_company, v_requester_dept
  FROM utilisateurs WHERE id = NEW.user_id;

  -- Build date range text
  v_dates_text := to_char(NEW.start_date, 'DD/MM/YYYY')
    || ' au '
    || to_char(NEW.end_date, 'DD/MM/YYYY');

  -- Notify managers: RH, CHEF_SERVICE (same dept), DIRECTEUR_EXECUTIF, ADMIN
  INSERT INTO notifications (user_id, title, message, type, related_sick_leave_id)
  SELECT u.id,
    'Conge maladie declare',
    format('%s a declare un conge maladie du %s (%s jour(s)).',
      v_requester_name, v_dates_text, NEW.days_count),
    'NEW_SICK_LEAVE',
    NEW.id
  FROM utilisateurs u
  WHERE u.role::TEXT IN ('RH', 'CHEF_SERVICE', 'DIRECTEUR_EXECUTIF', 'ADMIN')
    AND u.is_active = true
    AND u.company_id = v_requester_company
    AND (u.role::TEXT != 'CHEF_SERVICE' OR u.department_id = v_requester_dept)
    AND u.id != NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sick_leave_created_notify ON sick_leaves;
CREATE TRIGGER trg_sick_leave_created_notify
  AFTER INSERT ON sick_leaves
  FOR EACH ROW
  EXECUTE FUNCTION notify_sick_leave_created();


COMMIT;

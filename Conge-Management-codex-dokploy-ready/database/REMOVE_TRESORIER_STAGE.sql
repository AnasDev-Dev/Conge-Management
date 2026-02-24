-- ============================================================
-- REMOVE TRESORIER GENERAL FROM APPROVAL PIPELINE
-- ============================================================
-- New 3-stage approval chain:
--   PENDING -> RH (RH) -> VALIDATED_RP
--   VALIDATED_RP -> Chef de Service (CHEF_SERVICE) -> VALIDATED_DC
--   VALIDATED_DC -> Directeur Executif (DIRECTEUR_EXECUTIF) -> APPROVED
--
-- VALIDATED_TG status is no longer used in the active pipeline.
-- The enum value and DB columns are kept for backward compatibility
-- with any historical records that used the old 4-stage flow.
-- ============================================================


-- ============================================================
-- 1. UPDATE approve_leave_request RPC FUNCTION
--    Remove VALIDATED_DC -> TRESORIER -> VALIDATED_TG step
--    Now: VALIDATED_DC -> DIRECTEUR_EXECUTIF -> APPROVED
-- ============================================================
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
  -- Fetch the request
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  -- Fetch the approver
  SELECT * INTO v_approver FROM utilisateurs WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver % not found', p_approver_id;
  END IF;

  -- 3-stage approval chain (Tresorier removed)
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

  -- Validate approver role (ADMIN can act at any step)
  IF v_approver.role != v_expected_role AND v_approver.role != 'ADMIN' THEN
    RAISE EXCEPTION 'Approver role % does not match expected role % for status %',
      v_approver.role, v_expected_role, v_request.status;
  END IF;

  -- RH step: optionally update dates
  IF v_field = 'rp' AND p_new_start_date IS NOT NULL AND p_new_end_date IS NOT NULL THEN
    UPDATE leave_requests SET
      start_date = p_new_start_date,
      end_date = p_new_end_date,
      days_count = COALESCE(p_new_days_count, v_request.days_count)
    WHERE id = p_request_id;

    -- Refresh the record
    SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  END IF;

  v_days := v_request.days_count;

  -- Update status and approval fields
  EXECUTE format(
    'UPDATE leave_requests SET status = $1, approved_by_%s = $2, approved_at_%s = NOW(), updated_at = NOW() WHERE id = $3',
    v_field, v_field
  ) USING v_next_status, p_approver_id, p_request_id;

  -- On final approval (APPROVED), deduct balance
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

  -- Return the updated request
  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================
-- 2. UPDATE reject_leave_request RPC FUNCTION
--    Remove VALIDATED_TG from allowed statuses
-- ============================================================
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
  -- Fetch the request
  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request % not found', p_request_id;
  END IF;

  -- Verify request is in an approvable status (3-stage chain only)
  IF v_request.status NOT IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC') THEN
    RAISE EXCEPTION 'Request % is in status %, cannot be rejected', p_request_id, v_request.status;
  END IF;

  -- Fetch the rejector
  SELECT * INTO v_rejector FROM utilisateurs WHERE id = p_rejector_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rejector % not found', p_rejector_id;
  END IF;

  -- Reason is required
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  -- Update the request
  UPDATE leave_requests SET
    status = 'REJECTED',
    rejected_by = p_rejector_id,
    rejected_at = NOW(),
    rejection_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Return the updated request
  RETURN (SELECT to_jsonb(lr.*) FROM leave_requests lr WHERE lr.id = p_request_id);
END;
$$;


-- ============================================================
-- 3. MIGRATE ANY EXISTING VALIDATED_TG REQUESTS
--    Move them forward to VALIDATED_DC so the Director can act
-- ============================================================
-- If there are any requests stuck at VALIDATED_TG from the old
-- 4-stage flow, move them to VALIDATED_DC so the Directeur
-- Executif can pick them up in the new 3-stage flow.
UPDATE leave_requests
SET status = 'VALIDATED_DC',
    updated_at = NOW()
WHERE status = 'VALIDATED_TG';


-- ============================================================
-- 4. GRANT RPC ACCESS (uncomment if not already done)
-- ============================================================
-- GRANT EXECUTE ON FUNCTION approve_leave_request TO authenticated;
-- GRANT EXECUTE ON FUNCTION reject_leave_request TO authenticated;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- Check no requests are stuck at VALIDATED_TG
SELECT status, COUNT(*)
FROM leave_requests
WHERE status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC', 'VALIDATED_TG', 'APPROVED', 'REJECTED')
GROUP BY status
ORDER BY status;

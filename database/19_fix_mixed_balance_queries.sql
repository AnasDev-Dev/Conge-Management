-- ==============================================================================
-- Migration: Fix mixed request balance calculations
-- Date: 2026-03-26
-- Description:
--   For mixed CONGE+RECUPERATION requests, the balance queries were using
--   days_count (total) instead of balance_conge_used/balance_recuperation_used
--   (the actual split). This caused récup days to be incorrectly counted as
--   congé usage, showing wrong available balance.
-- ==============================================================================

-- Fix calculate_leave_balance RPC
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

  -- Use COALESCE(balance_conge_used, days_count) to handle mixed requests correctly
  -- For mixed requests: balance_conge_used = actual congé portion, not total days_count
  SELECT COALESCE(SUM(COALESCE(balance_conge_used, days_count)), 0) INTO v_days_used_this_year
  FROM leave_requests
  WHERE user_id = p_user_id
    AND status = 'APPROVED'
    AND COALESCE(balance_conge_used, CASE WHEN request_type = 'CONGE' THEN days_count ELSE 0 END) > 0
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(COALESCE(balance_conge_used, days_count)), 0) INTO v_days_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND COALESCE(balance_conge_used, CASE WHEN request_type = 'CONGE' THEN days_count ELSE 0 END) > 0
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(COALESCE(balance_recuperation_used, days_count)), 0) INTO v_recup_used
  FROM leave_requests
  WHERE user_id = p_user_id
    AND status = 'APPROVED'
    AND COALESCE(balance_recuperation_used, CASE WHEN request_type = 'RECUPERATION' THEN days_count ELSE 0 END) > 0
    AND EXTRACT(YEAR FROM start_date) = v_current_year;

  SELECT COALESCE(SUM(COALESCE(balance_recuperation_used, days_count)), 0) INTO v_recup_pending
  FROM leave_requests
  WHERE user_id = p_user_id
    AND status IN ('PENDING', 'VALIDATED_RP', 'VALIDATED_DC')
    AND COALESCE(balance_recuperation_used, CASE WHEN request_type = 'RECUPERATION' THEN days_count ELSE 0 END) > 0
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

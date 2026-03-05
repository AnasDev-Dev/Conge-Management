-- Migration: Add period column and update submit_recovery_request function
-- Date: 2026-03-03
-- Description: Adds the period column (MORNING/AFTERNOON/FULL) to recovery_requests
--              and updates the submit_recovery_request RPC to accept p_period parameter.

-- 1. Add the period column to the table
ALTER TABLE public.recovery_requests
  ADD COLUMN IF NOT EXISTS period text DEFAULT 'FULL'
  CHECK (period IN ('MORNING', 'AFTERNOON', 'FULL'));

-- 2. Recreate the function with the p_period parameter
CREATE OR REPLACE FUNCTION submit_recovery_request(
  p_user_id    UUID,
  p_days       FLOAT,
  p_date_worked DATE,
  p_work_type  TEXT,
  p_reason     TEXT,
  p_period     TEXT DEFAULT 'FULL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user    utilisateurs%ROWTYPE;
  v_request recovery_requests%ROWTYPE;
  v_days    FLOAT;
BEGIN
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  IF p_period NOT IN ('MORNING', 'AFTERNOON', 'FULL') THEN
    RAISE EXCEPTION 'La periode doit etre MORNING, AFTERNOON ou FULL';
  END IF;

  IF p_days IS NULL OR p_days = 0 THEN
    IF p_period = 'FULL' THEN
      v_days := 1.0;
    ELSE
      v_days := 0.5;
    END IF;
  ELSE
    v_days := p_days;
  END IF;

  IF v_days <= 0 OR v_days > 5 THEN
    RAISE EXCEPTION 'Le nombre de jours doit etre entre 0.5 et 5';
  END IF;

  INSERT INTO recovery_requests (user_id, days, date_worked, work_type, period, reason)
  VALUES (p_user_id, v_days, p_date_worked, p_work_type::recovery_work_type, p_period, p_reason)
  RETURNING * INTO v_request;

  RETURN to_jsonb(v_request);
END;
$$;

-- 3. Fix the GRANT to match the new 6-param signature
GRANT EXECUTE ON FUNCTION submit_recovery_request(UUID, FLOAT, DATE, TEXT, TEXT, TEXT) TO authenticated;

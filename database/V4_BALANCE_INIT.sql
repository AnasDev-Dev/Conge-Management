-- ==============================================================================
-- V4: BALANCE INITIALIZATION RPC
-- ==============================================================================
-- Allows RH/ADMIN to manually set leave balance for employees.
-- Used when historical data is missing and balances need to be initialized.
-- ==============================================================================

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
  -- Validate user exists
  SELECT * INTO v_user FROM utilisateurs WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur % introuvable', p_user_id;
  END IF;

  -- Validate balance
  IF p_balance < 0 THEN
    RAISE EXCEPTION 'Le solde ne peut pas être négatif';
  END IF;

  -- Store old balance
  v_old_balance := v_user.balance_conge;

  -- Update balance
  UPDATE utilisateurs
  SET balance_conge = p_balance, updated_at = NOW()
  WHERE id = p_user_id;

  -- Record in balance history
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

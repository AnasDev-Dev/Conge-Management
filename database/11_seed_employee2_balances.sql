-- ============================================================================
-- Seed test balances for employee2@frmg.ma (Laila Benkirane)
-- 7 days conge + 8 days recuperation
-- Safe to re-run: cleans existing data first
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.utilisateurs WHERE email = 'employee2@frmg.ma';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User employee2@frmg.ma not found';
  END IF;

  -- ── Clean existing records to avoid duplication ──

  -- Remove any existing leave requests for this user
  DELETE FROM public.leave_requests WHERE user_id = v_user_id;

  -- Remove any existing recovery balance lots
  DELETE FROM public.recovery_balance_lots WHERE user_id = v_user_id;

  -- Remove any existing leave balance history
  DELETE FROM public.leave_balance_history WHERE user_id = v_user_id;

  -- Remove any monthly balance accrual records
  DELETE FROM public.monthly_balance_accrual WHERE user_id = v_user_id;

  -- ── Set balances ──

  UPDATE public.utilisateurs
  SET balance_conge = 7,
      balance_recuperation = 8,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- ── Create recovery balance lots (FIFO: earliest expiration consumed first) ──

  INSERT INTO public.recovery_balance_lots (user_id, days, remaining_days, year_acquired, expires_at, expired)
  VALUES
    (v_user_id, 5, 5, 2026, CURRENT_DATE + INTERVAL '30 days', false),
    (v_user_id, 3, 3, 2026, CURRENT_DATE + INTERVAL '55 days', false);

  RAISE NOTICE '';
  RAISE NOTICE '=== employee2@frmg.ma (Laila Benkirane) ===';
  RAISE NOTICE '  balance_conge:        7 days';
  RAISE NOTICE '  balance_recuperation: 8 days (lots: 5 + 3)';
  RAISE NOTICE '  Lot 1: 5 days — expires %', (CURRENT_DATE + INTERVAL '30 days')::DATE;
  RAISE NOTICE '  Lot 2: 3 days — expires %', (CURRENT_DATE + INTERVAL '55 days')::DATE;
  RAISE NOTICE '  Cleaned: leave_requests, recovery_lots, balance_history, monthly_accrual';
END;
$$;

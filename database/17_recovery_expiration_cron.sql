-- ==============================================================================
-- Migration: Automated recovery day expiration
-- Date: 2026-03-26
-- Description:
--   Recovery days from year N expire on 30/06/N+1.
--   This migration sets up pg_cron to run expire_recovery_days() daily.
--   If pg_cron is not available (Supabase free tier), call the function
--   manually or via an Edge Function / external cron.
-- ==============================================================================

-- ─── Option A: pg_cron (if available) ──────────────────────

-- Enable pg_cron extension (requires superuser / Supabase Pro plan)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily at 01:00 UTC
-- SELECT cron.schedule(
--   'expire-recovery-days',
--   '0 1 * * *',
--   $$SELECT public.expire_recovery_days()$$
-- );

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To remove:
-- SELECT cron.unschedule('expire-recovery-days');


-- ─── Option B: Callable function (for Edge Function / external cron) ────

-- The expire_recovery_days() function already exists in 05_new_features.sql.
-- Here we ensure it's up to date and also create a notification trigger
-- that warns users when their recovery days are about to expire.

-- Recreate expire_recovery_days with notification support
CREATE OR REPLACE FUNCTION public.expire_recovery_days()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot     RECORD;
  v_count   INT := 0;
  v_total   FLOAT := 0;
  v_user_name TEXT;
BEGIN
  FOR v_lot IN
    SELECT *
    FROM recovery_balance_lots
    WHERE expired = false
      AND expires_at <= CURRENT_DATE
      AND remaining_days > 0
  LOOP
    -- Deduct from user balance
    UPDATE utilisateurs
    SET balance_recuperation = GREATEST(balance_recuperation - v_lot.remaining_days, 0)
    WHERE id = v_lot.user_id;

    -- Mark lot as expired
    UPDATE recovery_balance_lots
    SET expired = true
    WHERE id = v_lot.id;

    -- Audit trail
    INSERT INTO leave_balance_history (user_id, type, amount, reason, year, date_from, date_to, expires_at)
    VALUES (
      v_lot.user_id, 'RECUPERATION', -v_lot.remaining_days,
      'Expiration recuperation (acquise en ' || v_lot.year_acquired || ', expiree le ' || v_lot.expires_at || ')',
      v_lot.year_acquired, NULL, NULL, v_lot.expires_at
    );

    -- Notify the user
    SELECT full_name INTO v_user_name FROM utilisateurs WHERE id = v_lot.user_id;

    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      v_lot.user_id,
      'Jours de récupération expirés',
      format('%s jour(s) de récupération acquis en %s ont expiré le %s. Ces jours ne sont plus disponibles.',
        v_lot.remaining_days, v_lot.year_acquired, to_char(v_lot.expires_at, 'DD/MM/YYYY')),
      'RECOVERY_EXPIRED'
    );

    v_total := v_total + v_lot.remaining_days;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'lots_expired', v_count,
    'days_expired', v_total,
    'date', CURRENT_DATE
  );
END;
$$;

-- ─── Expiration warning function (for approaching expirations) ────

CREATE OR REPLACE FUNCTION public.warn_expiring_recovery_days(p_days_before INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot     RECORD;
  v_count   INT := 0;
  v_cutoff  DATE := CURRENT_DATE + p_days_before;
BEGIN
  FOR v_lot IN
    SELECT rbl.*, u.full_name
    FROM recovery_balance_lots rbl
    JOIN utilisateurs u ON u.id = rbl.user_id
    WHERE rbl.expired = false
      AND rbl.remaining_days > 0
      AND rbl.expires_at <= v_cutoff
      AND rbl.expires_at > CURRENT_DATE
      -- Don't warn if we already warned in the last 7 days
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = rbl.user_id
          AND n.type = 'RECOVERY_EXPIRING_SOON'
          AND n.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      )
  LOOP
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      v_lot.user_id,
      'Récupération bientôt expirée',
      format('%s jour(s) de récupération acquis en %s expirent le %s. Utilisez-les avant cette date.',
        v_lot.remaining_days, v_lot.year_acquired, to_char(v_lot.expires_at, 'DD/MM/YYYY')),
      'RECOVERY_EXPIRING_SOON'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('warnings_sent', v_count, 'date', CURRENT_DATE);
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.expire_recovery_days() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_recovery_days() TO service_role;
GRANT EXECUTE ON FUNCTION public.warn_expiring_recovery_days(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warn_expiring_recovery_days(INT) TO service_role;

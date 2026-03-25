-- ============================================================================
-- 14_fix_holidays_rls_and_constraints.sql
-- Fix holidays RLS: scope SELECT to user's company, allow RH+DIR to manage
-- Add unique constraint to prevent duplicate holidays
-- ============================================================================

-- 1. Replace open SELECT policy with company-scoped one
DROP POLICY IF EXISTS "holidays_select_authenticated" ON holidays;
DROP POLICY IF EXISTS "holidays_select_company" ON holidays;

CREATE POLICY "holidays_select_company"
  ON holidays FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT ucr.company_id FROM user_company_roles ucr
      WHERE ucr.user_id = auth.uid() AND ucr.is_active = true
    )
    OR company_id = (SELECT company_id FROM utilisateurs WHERE id = auth.uid())
  );

-- 2. Replace ADMIN-only manage policy with ADMIN + RH + DIRECTEUR_EXECUTIF
DROP POLICY IF EXISTS "holidays_manage_admin" ON holidays;
DROP POLICY IF EXISTS "holidays_manage" ON holidays;

CREATE POLICY "holidays_manage"
  ON holidays FOR ALL TO authenticated
  USING (public.get_my_role() IN ('ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'))
  WITH CHECK (public.get_my_role() IN ('ADMIN', 'RH', 'DIRECTEUR_EXECUTIF'));

-- 3. Add unique constraint: no two holidays on the same date for the same company
CREATE UNIQUE INDEX IF NOT EXISTS holidays_company_date_unique
  ON holidays (company_id, date);

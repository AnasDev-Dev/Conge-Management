-- ============================================================================
-- FIX_MISSION_RLS.sql
-- Ensures mission_requests RLS policies exist and are correct.
-- Uses department-scoped can_manage_user() for CHEF_SERVICE scoping.
-- Safe to re-run (idempotent via DROP IF EXISTS + CREATE).
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.mission_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT policies
-- ============================================================================

-- Employees can see their own missions (self-requested or assigned to them)
DROP POLICY IF EXISTS "Users can view own missions" ON public.mission_requests;
CREATE POLICY "Users can view own missions"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = assigned_by
  );

-- Managers can see missions they can manage (department-scoped for chefs)
DROP POLICY IF EXISTS "Managers can view all missions" ON public.mission_requests;
CREATE POLICY "Managers can view all missions"
  ON public.mission_requests FOR SELECT
  TO authenticated
  USING (public.can_manage_user(user_id));

-- ============================================================================
-- INSERT policies
-- ============================================================================

-- Any authenticated user can create a mission for themselves
DROP POLICY IF EXISTS "Users can create own missions" ON public.mission_requests;
CREATE POLICY "Users can create own missions"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Managers can create missions on behalf of employees they manage
DROP POLICY IF EXISTS "Managers can create missions for others" ON public.mission_requests;
CREATE POLICY "Managers can create missions for others"
  ON public.mission_requests FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_user(user_id));

-- ============================================================================
-- UPDATE policy (approval workflow)
-- ============================================================================

DROP POLICY IF EXISTS "Managers can update missions" ON public.mission_requests;
CREATE POLICY "Managers can update missions"
  ON public.mission_requests FOR UPDATE
  TO authenticated
  USING (public.can_manage_user(user_id));

-- ============================================================================
-- DELETE policy (only own PENDING missions or admin)
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own pending missions" ON public.mission_requests;
CREATE POLICY "Users can delete own pending missions"
  ON public.mission_requests FOR DELETE
  TO authenticated
  USING (
    (auth.uid() = user_id AND status = 'PENDING')
    OR EXISTS (
      SELECT 1 FROM public.utilisateurs
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- ============================================================================
-- VERIFICATION: List all mission_requests policies
-- ============================================================================
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mission_requests'
ORDER BY policyname;

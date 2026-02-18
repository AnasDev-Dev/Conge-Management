-- ============================================================
-- ALLOW MANAGERS TO INSERT LEAVE REQUESTS ON BEHALF OF EMPLOYEES
-- ============================================================
-- Run this in Supabase SQL Editor.
--
-- Changes the leave_requests INSERT policy so that managers
-- (RH, CHEF_SERVICE, DIRECTEUR_EXECUTIF, ADMIN) can create
-- leave requests for any employee, not just for themselves.
-- ============================================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "leave_requests_insert_own" ON public.leave_requests;

-- Create the new policy allowing managers to insert for anyone
CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_manager()
  );

-- Verify
SELECT policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'leave_requests'
ORDER BY policyname;

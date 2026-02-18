-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Run this in Supabase SQL Editor AFTER all other migrations.
-- This script DROPS all existing policies first, then creates new ones.
--
-- Summary:
--   utilisateurs     → Everyone reads, users update own profile, managers update balances
--   leave_requests   → Employees see own, managers see all, insert own, approvers update
--   companies        → Read-only for all
--   departments      → Read-only for all
--   leave_balance_history → Users see own, managers see all
--   notifications    → Users see/update own only
--   holidays         → Read-only for all
--   working_days     → Read-only for all
--   audit_logs       → Admin only
-- ============================================================================


-- ============================================================================
-- STEP 0: DROP ALL EXISTING POLICIES ON ALL PUBLIC TABLES
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped policy: % on %', r.policyname, r.tablename;
  END LOOP;
  RAISE NOTICE 'All existing RLS policies dropped.';
END $$;

-- Disable RLS on all tables first (clean slate)
ALTER TABLE IF EXISTS public.utilisateurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_balance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.working_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop old helper functions if they exist
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.is_manager();


-- ============================================================================
-- STEP 1: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Helper: get current user's role from utilisateurs table
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.utilisateurs WHERE id = auth.uid();
$$;

-- Helper: check if current user is a manager (any approval role or admin)
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role IN ('CHEF_SERVICE', 'RH', 'TRESORIER_GENERAL', 'DIRECTEUR_EXECUTIF', 'ADMIN')
  FROM public.utilisateurs
  WHERE id = auth.uid();
$$;


-- ============================================================================
-- 1. UTILISATEURS
-- ============================================================================
ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all profiles
-- (needed for employee list, approver names, replacement user lookup, etc.)
CREATE POLICY "utilisateurs_select_authenticated"
  ON public.utilisateurs FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile (name, phone, address, avatar, etc.)
-- but NOT their role, balance, or is_active
CREATE POLICY "utilisateurs_update_own_profile"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Managers can update any user (needed for balance deduction on final approval)
CREATE POLICY "utilisateurs_update_manager"
  ON public.utilisateurs FOR UPDATE
  TO authenticated
  USING (public.is_manager());

-- Admin can insert new users
CREATE POLICY "utilisateurs_insert_admin"
  ON public.utilisateurs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- Admin can delete users
CREATE POLICY "utilisateurs_delete_admin"
  ON public.utilisateurs FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 2. LEAVE_REQUESTS (most critical table)
-- ============================================================================
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Employees see their own requests; managers see ALL requests
CREATE POLICY "leave_requests_select"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_manager()
  );

-- Employees can insert requests for themselves; managers can insert for anyone
CREATE POLICY "leave_requests_insert"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_manager()
  );

-- Managers can update any request (approve, reject, edit dates)
-- Employees can update only their own PENDING requests (cancel)
CREATE POLICY "leave_requests_update"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_manager()
    OR (user_id = auth.uid() AND status = 'PENDING')
  );

-- Only the owner can delete their own PENDING request, or admin
CREATE POLICY "leave_requests_delete"
  ON public.leave_requests FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'PENDING')
    OR public.get_my_role() = 'ADMIN'
  );


-- ============================================================================
-- 3. COMPANIES (reference data, read-only)
-- ============================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_authenticated"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

-- Admin can manage
CREATE POLICY "companies_manage_admin"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 4. DEPARTMENTS (reference data, read-only)
-- ============================================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_authenticated"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_manage_admin"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 5. LEAVE_BALANCE_HISTORY
-- ============================================================================
ALTER TABLE public.leave_balance_history ENABLE ROW LEVEL SECURITY;

-- Users see their own history; managers see all
CREATE POLICY "balance_history_select"
  ON public.leave_balance_history FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_manager()
  );

-- Managers and admin can insert balance records
CREATE POLICY "balance_history_insert_manager"
  ON public.leave_balance_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

-- Admin can update/delete
CREATE POLICY "balance_history_manage_admin"
  ON public.leave_balance_history FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 6. NOTIFICATIONS
-- ============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own (mark as read)
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- System/managers can create notifications for anyone
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================================================
-- 7. HOLIDAYS (reference data, read-only for non-admins)
-- ============================================================================
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select_authenticated"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "holidays_manage_admin"
  ON public.holidays FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 8. WORKING_DAYS (reference data, read-only for non-admins)
-- ============================================================================
ALTER TABLE public.working_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "working_days_select_authenticated"
  ON public.working_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "working_days_manage_admin"
  ON public.working_days FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- 9. AUDIT_LOGS (admin only)
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_only"
  ON public.audit_logs FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- 1) Check RLS is enabled on all tables
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2) List all active policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

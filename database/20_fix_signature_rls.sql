-- ==============================================================================
-- Migration: Allow managers to update signature columns on leave_requests
-- Date: 2026-03-26
-- Description:
--   The existing UPDATE policy only allows employees to update their own
--   PENDING requests. Managers need to save signatures when approving/rejecting
--   via the Kanban board, but the RPC doesn't handle signature storage.
--   This adds a policy allowing managers to update any leave_requests row.
-- ==============================================================================

-- Allow managers to update leave_requests (for signature storage and other management needs)
CREATE POLICY "leave_requests_update_manager"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

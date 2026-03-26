-- ==============================================================================
-- Migration: Per-request signatures on leave_requests
-- Date: 2026-03-26
-- Description: Store each signature (employee + each approver/rejector)
--              directly on the leave_requests row, not on the user profile.
-- ==============================================================================

-- Add signature columns to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS signature_employee TEXT,
  ADD COLUMN IF NOT EXISTS signature_rp TEXT,
  ADD COLUMN IF NOT EXISTS signature_dc TEXT,
  ADD COLUMN IF NOT EXISTS signature_de TEXT,
  ADD COLUMN IF NOT EXISTS signature_rejected_by TEXT;

-- Also add to mission_requests for consistency
ALTER TABLE public.mission_requests
  ADD COLUMN IF NOT EXISTS signature_employee TEXT,
  ADD COLUMN IF NOT EXISTS signature_rp TEXT,
  ADD COLUMN IF NOT EXISTS signature_dc TEXT,
  ADD COLUMN IF NOT EXISTS signature_de TEXT,
  ADD COLUMN IF NOT EXISTS signature_rejected_by TEXT;

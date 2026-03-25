-- ==============================================================================
-- Fix exceptional_leave_claims: add date range, nullable type, autre support
-- ==============================================================================
-- Date: 24 March 2026
-- Run AFTER 20260323_phase1_new_requirements_schema.sql
-- ==============================================================================

-- Add start_date and end_date columns
ALTER TABLE public.exceptional_leave_claims
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS days_count FLOAT,
  ADD COLUMN IF NOT EXISTS autre_type_name TEXT;

-- Make exceptional_leave_type_id nullable (for "Autre" type)
ALTER TABLE public.exceptional_leave_claims
  ALTER COLUMN exceptional_leave_type_id DROP NOT NULL;

-- Copy claim_date to start_date for existing rows
UPDATE public.exceptional_leave_claims
  SET start_date = claim_date, end_date = claim_date, days_count = days_granted
  WHERE start_date IS NULL;

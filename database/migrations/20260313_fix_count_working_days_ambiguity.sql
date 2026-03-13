-- ==============================================================================
-- FIX: count_working_days function overload ambiguity
-- ==============================================================================
-- Three overloads of count_working_days exist, all matching a 3-arg call:
--   1. (DATE, DATE, BIGINT)                                → from 03_rpcs.sql
--   2. (DATE, DATE, BIGINT, BIGINT, TEXT, TEXT)             → from 05_new_features.sql
--   3. (DATE, DATE, BIGINT, BIGINT, TEXT, TEXT, BIGINT)     → from 08_working_days_per_department.sql
--
-- When approve_leave_request() calls count_working_days(date, date, bigint),
-- PostgreSQL cannot choose between them → error 42725.
--
-- Fix: Drop overloads #1 and #2, keeping only #3 (the most complete version
-- with department support, half-day support, and category support).
-- ==============================================================================

-- Drop the old 3-parameter version (03_rpcs.sql)
DROP FUNCTION IF EXISTS count_working_days(DATE, DATE, BIGINT);

-- Drop the 6-parameter version (05_new_features.sql)
DROP FUNCTION IF EXISTS count_working_days(DATE, DATE, BIGINT, BIGINT, TEXT, TEXT);

-- Verify: only the 7-parameter version remains
-- count_working_days(DATE, DATE, BIGINT, BIGINT, TEXT, TEXT, BIGINT)

-- Grant execute to authenticated users (in case it was lost)
GRANT EXECUTE ON FUNCTION count_working_days(DATE, DATE, BIGINT, BIGINT, TEXT, TEXT, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';

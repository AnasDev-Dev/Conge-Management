-- ==============================================================================
-- PART 4/4: GRANTS + SEED DATA
-- ==============================================================================
-- Run AFTER 03_rpcs.sql.
-- Safe to re-run: GRANT is idempotent, seed uses NOT EXISTS checks.
-- ==============================================================================


-- ==============================================================================
-- GRANTS
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_user(UUID) TO authenticated, anon, service_role;

-- Leave RPCs
GRANT EXECUTE ON FUNCTION public.approve_leave_request(BIGINT, UUID, DATE, DATE, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_approve_leave_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_reject_leave_request(BIGINT, UUID) TO authenticated;

-- Mission RPCs
GRANT EXECUTE ON FUNCTION public.approve_mission_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_mission_request(BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_approve_mission_request(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_reject_mission_request(BIGINT, UUID) TO authenticated;

-- Moroccan labor law RPCs
GRANT EXECUTE ON FUNCTION count_working_days TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_annual_entitlement TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_leave_balance TO authenticated;
GRANT EXECUTE ON FUNCTION credit_recuperation TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_balances TO authenticated;
GRANT EXECUTE ON FUNCTION set_initial_balance TO authenticated;


-- ==============================================================================
-- SEED DATA (Working days + Moroccan public holidays)
-- ==============================================================================

-- Working days: Mon-Sat (Moroccan jours ouvrables default)
INSERT INTO public.working_days (company_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT c.id, true, true, true, true, true, true, false
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.working_days w WHERE w.company_id = c.id);

-- Moroccan public holidays
DO $$
DECLARE
  v_company_id BIGINT;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;

  IF v_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.holidays WHERE company_id = v_company_id) THEN
    INSERT INTO public.holidays (company_id, name, date, is_recurring) VALUES
      -- Fixed national holidays (recurring)
      (v_company_id, 'Nouvel An',                         '2025-01-01', true),
      (v_company_id, 'Manifeste de l''Independance',      '2025-01-11', true),
      (v_company_id, 'Yennayer (Nouvel An Amazigh)',       '2025-01-14', true),
      (v_company_id, 'Fete du Travail',                    '2025-05-01', true),
      (v_company_id, 'Fete du Trone',                      '2025-07-30', true),
      (v_company_id, 'Allegeance Oued Ed-Dahab',           '2025-08-14', true),
      (v_company_id, 'Revolution du Roi et du Peuple',     '2025-08-20', true),
      (v_company_id, 'Fete de la Jeunesse',                '2025-08-21', true),
      (v_company_id, 'Fete de l''Unite',                   '2025-10-31', true),
      (v_company_id, 'Marche Verte',                       '2025-11-06', true),
      (v_company_id, 'Fete de l''Independance',            '2025-11-18', true),

      -- Religious holidays 2025 (Hijri calendar)
      (v_company_id, 'Aid Al-Fitr (1er jour)',            '2025-03-30', false),
      (v_company_id, 'Aid Al-Fitr (2eme jour)',           '2025-03-31', false),
      (v_company_id, 'Aid Al-Adha (1er jour)',            '2025-06-06', false),
      (v_company_id, 'Aid Al-Adha (2eme jour)',           '2025-06-07', false),
      (v_company_id, '1er Moharram',                       '2025-06-26', false),
      (v_company_id, 'Aid Al Mawlid (1er jour)',          '2025-09-04', false),
      (v_company_id, 'Aid Al Mawlid (2eme jour)',         '2025-09-05', false),

      -- Religious holidays 2026
      (v_company_id, 'Aid Al-Fitr (1er jour)',            '2026-03-20', false),
      (v_company_id, 'Aid Al-Fitr (2eme jour)',           '2026-03-21', false),
      (v_company_id, 'Aid Al-Adha (1er jour)',            '2026-05-27', false),
      (v_company_id, 'Aid Al-Adha (2eme jour)',           '2026-05-28', false),
      (v_company_id, '1er Moharram',                       '2026-06-16', false),
      (v_company_id, 'Aid Al Mawlid (1er jour)',          '2026-08-25', false),
      (v_company_id, 'Aid Al Mawlid (2eme jour)',         '2026-08-26', false),

      -- Religious holidays 2027
      (v_company_id, 'Aid Al-Fitr (1er jour)',            '2027-03-10', false),
      (v_company_id, 'Aid Al-Fitr (2eme jour)',           '2027-03-11', false),
      (v_company_id, 'Aid Al-Adha (1er jour)',            '2027-05-17', false),
      (v_company_id, 'Aid Al-Adha (2eme jour)',           '2027-05-18', false),
      (v_company_id, '1er Moharram',                       '2027-06-06', false),
      (v_company_id, 'Aid Al Mawlid (1er jour)',          '2027-08-14', false),
      (v_company_id, 'Aid Al Mawlid (2eme jour)',         '2027-08-15', false);
  END IF;
END $$;


-- ==============================================================================
-- SCHEMA COMPLETE
-- ==============================================================================

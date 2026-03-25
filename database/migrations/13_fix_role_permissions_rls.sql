-- ============================================================================
-- 13_fix_role_permissions_rls.sql
-- Make permission management itself a DB-driven permission (settings.permissions)
-- ============================================================================

-- 1. Add settings.permissions to ADMIN's actions for all companies
UPDATE role_permissions
SET actions = actions || '["settings.permissions"]'::jsonb
WHERE role = 'ADMIN'
  AND NOT actions @> '["settings.permissions"]'::jsonb;

-- 2. Create SECURITY DEFINER function to check settings.permissions
--    (avoids circular RLS on role_permissions table)
CREATE OR REPLACE FUNCTION can_manage_permissions(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_company_roles ucr
    JOIN role_permissions rp
      ON rp.company_id = ucr.company_id AND rp.role = ucr.role
    WHERE ucr.user_id = p_user_id
      AND ucr.is_active = true
      AND rp.actions @> '["settings.permissions"]'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace the hardcoded-role RLS policy with DB-driven check
DROP POLICY IF EXISTS role_permissions_modify ON role_permissions;
CREATE POLICY role_permissions_modify ON role_permissions
  FOR ALL USING (can_manage_permissions(auth.uid()));

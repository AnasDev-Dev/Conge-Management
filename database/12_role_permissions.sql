-- ============================================================================
-- 12_role_permissions.sql
-- DB-driven role permissions table for admin UI control
-- ============================================================================

-- Table: stores one row per (company, role) with JSON permission data
CREATE TABLE IF NOT EXISTS role_permissions (
  id            SERIAL PRIMARY KEY,
  company_id    BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('EMPLOYEE','CHEF_SERVICE','RH','DIRECTEUR_EXECUTIF','ADMIN')),
  sidebar       JSONB NOT NULL DEFAULT '[]',   -- SidebarItem[]
  pages         JSONB NOT NULL DEFAULT '[]',   -- PageKey[]
  actions       JSONB NOT NULL DEFAULT '[]',   -- Action[]
  data_scope    TEXT NOT NULL DEFAULT 'own' CHECK (data_scope IN ('own','department','all')),
  updated_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_role_permissions_updated_at();

-- RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read (needed for sidebar/page checks)
DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT USING (true);

-- Only RH/ADMIN can insert/update/delete
DROP POLICY IF EXISTS role_permissions_modify ON role_permissions;
CREATE POLICY role_permissions_modify ON role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_company_roles ucr
      WHERE ucr.user_id = auth.uid()
        AND ucr.is_active = true
        AND ucr.role IN ('RH', 'ADMIN')
    )
  );

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE role_permissions_id_seq TO authenticated;

-- ============================================================================
-- Seed default permissions for all existing companies
-- ============================================================================

-- Helper function to seed permissions for a company
CREATE OR REPLACE FUNCTION seed_role_permissions_for_company(p_company_id BIGINT)
RETURNS VOID AS $$
BEGIN
  -- EMPLOYEE
  INSERT INTO role_permissions (company_id, role, sidebar, pages, actions, data_scope)
  VALUES (p_company_id, 'EMPLOYEE',
    '["dashboard","requests","missions","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '["dashboard","requests","request-detail","new-request","missions","mission-detail","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '[]'::jsonb,
    'own'
  ) ON CONFLICT (company_id, role) DO NOTHING;

  -- CHEF_SERVICE
  INSERT INTO role_permissions (company_id, role, sidebar, pages, actions, data_scope)
  VALUES (p_company_id, 'CHEF_SERVICE',
    '["dashboard","employees","validations","mission-validations","requests","missions","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '["dashboard","employees","employee-detail","validations","mission-validations","requests","request-detail","new-request","missions","mission-detail","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '["requests.createOnBehalf","requests.viewAll","missions.createOnBehalf","missions.viewAll","calendar.viewTeam","recovery.validate","approval.leaveStage2","approval.missionStage1"]'::jsonb,
    'department'
  ) ON CONFLICT (company_id, role) DO NOTHING;

  -- RH
  INSERT INTO role_permissions (company_id, role, sidebar, pages, actions, data_scope)
  VALUES (p_company_id, 'RH',
    '["dashboard","employees","validations","mission-validations","requests","missions","calendar","recovery-requests","settings","balance-init","profile","notifications"]'::jsonb,
    '["dashboard","employees","employee-detail","validations","mission-validations","requests","request-detail","new-request","missions","mission-detail","calendar","recovery-requests","settings","balance-init","profile","notifications"]'::jsonb,
    '["employees.create","employees.edit","employees.viewBalances","requests.createOnBehalf","requests.viewAll","missions.createOnBehalf","missions.viewAll","calendar.viewTeam","recovery.validate","recovery.creditManual","settings.workingDays","settings.holidays","settings.recovery","approval.leaveStage1","approval.missionStage2"]'::jsonb,
    'all'
  ) ON CONFLICT (company_id, role) DO NOTHING;

  -- DIRECTEUR_EXECUTIF
  INSERT INTO role_permissions (company_id, role, sidebar, pages, actions, data_scope)
  VALUES (p_company_id, 'DIRECTEUR_EXECUTIF',
    '["dashboard","employees","validations","mission-validations","requests","missions","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '["dashboard","employees","employee-detail","validations","mission-validations","requests","request-detail","new-request","missions","mission-detail","calendar","recovery-requests","profile","notifications"]'::jsonb,
    '["requests.createOnBehalf","requests.viewAll","missions.createOnBehalf","missions.viewAll","calendar.viewTeam","recovery.validate","employees.viewBalances","approval.leaveStage3","approval.missionStage3"]'::jsonb,
    'all'
  ) ON CONFLICT (company_id, role) DO NOTHING;

  -- ADMIN
  INSERT INTO role_permissions (company_id, role, sidebar, pages, actions, data_scope)
  VALUES (p_company_id, 'ADMIN',
    '["dashboard","employees","validations","mission-validations","requests","missions","calendar","recovery-requests","settings","balance-init","profile","notifications"]'::jsonb,
    '["dashboard","employees","employee-detail","validations","mission-validations","requests","request-detail","new-request","missions","mission-detail","calendar","recovery-requests","settings","balance-init","profile","notifications"]'::jsonb,
    '["employees.create","employees.edit","employees.delete","employees.viewBalances","requests.createOnBehalf","requests.viewAll","missions.createOnBehalf","missions.viewAll","calendar.viewTeam","recovery.validate","recovery.creditManual","settings.workingDays","settings.holidays","settings.recovery","approval.leaveStage1","approval.leaveStage2","approval.leaveStage3","approval.missionStage1","approval.missionStage2","approval.missionStage3"]'::jsonb,
    'all'
  ) ON CONFLICT (company_id, role) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed for all existing companies
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    PERFORM seed_role_permissions_for_company(comp.id);
  END LOOP;
END;
$$;

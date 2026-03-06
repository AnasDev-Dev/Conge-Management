# Multi-Company Roles & Combined Leave Requests

> Technical documentation for the multi-company role system and the combined conge/recuperation leave request flow.

---

## 1. Multi-Company Roles

### Problem

A single employee can work across multiple companies within the FRMG group. Each company may assign them a different role. For example:

- **Ahmed** is an `EMPLOYEE` at FRMG (his home company, where his leave balances live)
- **Ahmed** is a `CHEF_SERVICE` at ATH (where he manages and approves requests)

### Data Model

#### `user_company_roles` table

| Column          | Type     | Description                                              |
|-----------------|----------|----------------------------------------------------------|
| `id`            | SERIAL   | Primary key                                              |
| `user_id`       | UUID     | References `utilisateurs.id`                             |
| `company_id`    | BIGINT   | References `companies.id`                                |
| `role`          | UserRole | Role in this specific company (`EMPLOYEE`, `RH`, `CHEF_SERVICE`, `DIRECTEUR_EXECUTIF`, `ADMIN`) |
| `is_active`     | BOOLEAN  | Whether this assignment is active                        |
| `is_home`       | BOOLEAN  | Marks the home company (where balances are tracked). **Only one per user** (enforced by unique index). |
| `department_id` | BIGINT   | Department within this company (can differ per company)  |

#### Key constraint

```sql
CREATE UNIQUE INDEX idx_one_home_per_user
  ON user_company_roles(user_id) WHERE is_home = true;
```

Only **one home company** per user. Leave balances (`balance_conge`, `balance_recuperation`) live on the `utilisateurs` row and apply to the home company only.

### How Company Switching Works

#### Database Layer

1. **`set_active_company(p_company_id)`** — RPC called when the user switches company in the UI. Sets a PostgreSQL session variable:
   ```sql
   PERFORM set_config('app.active_company_id', p_company_id::TEXT, false);
   ```

2. **`get_active_company_id()`** — Reads the session variable. Used by RLS policies and triggers to scope data to the active company.

3. **`get_my_role()`** — Returns the user's role in the active company (from `user_company_roles`), falling back to `utilisateurs.role` if no company-specific role exists.

#### Frontend Layer

**`CompanyProvider`** (`lib/hooks/use-company-context.tsx`):
- Loads all companies and the user's `user_company_roles` on mount
- Defaults to the home company (or restores from `localStorage`)
- Calls `set_active_company` RPC when switching
- Exposes `activeCompany`, `activeRole`, `isHome`

**`useEffectiveRole`** (`lib/hooks/use-effective-role.ts`):
- Returns `activeRole` from company context, falling back to `utilisateurs.role`
- Provides `isManager`, `isHome`, `activeCompany`

### Behavior Rules

| Scenario | What happens |
|----------|-------------|
| User is on **home company** | Can create leave requests for themselves. Sees their own balances. |
| User is on **non-home company** as manager | Can only create requests **on behalf of** employees in that company. Cannot request leave for themselves (balances are on home company). |
| User is on **non-home company** as employee | Can view data but cannot create leave requests (no balance here). |
| Company switch | All data queries are scoped to the active company via RLS. Role changes to match the company-specific role. |

### Company Switcher UI

The `CompanySwitcher` component in the sidebar shows a dropdown (only visible if the user has roles in multiple companies). Switching triggers:
1. `setActiveCompany(company)` in context
2. `set_active_company` RPC to database
3. Page data refreshes with the new company scope

---

## 2. Combined Leave Requests (Conge + Recuperation)

### Problem

Previously, employees had to choose between "Conge" (annual leave) or "Recuperation" (recovery days) when creating a request. This was inflexible:
- Recovery days expire (60 days after acquisition)
- If an employee needs 10 days off but only has 3 recovery days, they had to create two separate requests

### Solution

A single leave request can now deduct from **both balances**. The system auto-suggests using recovery days first (since they expire), and the employee can adjust the split.

### Data Model Changes

New columns on `leave_requests`:

| Column                       | Type    | Description                                    |
|------------------------------|---------|------------------------------------------------|
| `is_mixed`                   | BOOLEAN | `true` if request uses both conge and recovery |
| `balance_conge_used`         | FLOAT   | Days deducted from conge balance               |
| `balance_recuperation_used`  | FLOAT   | Days deducted from recovery balance            |

The `request_type` field is still set for backward compatibility:
- `CONGE` — when any conge days are used (even if mixed)
- `RECUPERATION` — only when 100% recovery days

### Recovery Balance Lots

Recovery days are tracked in `recovery_balance_lots`:

| Column              | Type    | Description                              |
|---------------------|---------|------------------------------------------|
| `user_id`           | UUID    | Employee                                 |
| `days`              | FLOAT   | Original amount credited                 |
| `remaining_days`    | FLOAT   | Amount still available                   |
| `year_acquired`     | INT     | Year the days were earned                |
| `expires_at`        | DATE    | Expiration date (60 days after work)     |
| `expired`           | BOOLEAN | Set to `true` when past expiration       |
| `source_request_id` | BIGINT  | Links to the recovery credit request     |

Lots are consumed in **FIFO order** (earliest expiration first).

### Business Rules

| Rule | Value |
|------|-------|
| Max recovery days per single request | **5 days** (`MAX_CONSECUTIVE_RECOVERY_DAYS`) |
| Recovery priority | Recovery days are suggested first (they expire) |
| Max annual leave balance | **52 days** (`MAX_LEAVE_BALANCE`) |
| Monthly accrual | `annual_entitlement / 12` per month |
| Available conge | `(annual / 12 * current_month) - used - pending` |

### Auto-Split Logic (Frontend)

When the employee selects dates:

```
workingDays = countWorkingDays(startDate, endDate, config, holidays)
maxRecupForRequest = min(5, availableRecup, workingDays)

// Auto-suggest: use recovery first
recupDaysToUse = min(maxRecupForRequest, workingDays)
congeDaysToUse = workingDays - recupDaysToUse
```

The employee can manually adjust `recupDaysToUse` with +/- buttons (in 0.5 increments). `congeDaysToUse` auto-adjusts to fill the remainder.

### Database Functions

Three functions updated in `database/10_combined_leave_requests.sql`:

#### `handle_auto_approved_leave()` (trigger)

Fires on INSERT when `status = 'APPROVED'`. Deducts from both balances:
```sql
IF COALESCE(NEW.balance_conge_used, 0) > 0 THEN
  UPDATE utilisateurs SET balance_conge = GREATEST(balance_conge - NEW.balance_conge_used, 0) ...
END IF;
IF COALESCE(NEW.balance_recuperation_used, 0) > 0 THEN
  UPDATE utilisateurs SET balance_recuperation = GREATEST(balance_recuperation - NEW.balance_recuperation_used, 0) ...
END IF;
```

#### `approve_leave_request()` (RPC)

On final approval (`APPROVED` status):
1. Reads `balance_conge_used` and `balance_recuperation_used` from the request
2. Falls back to `request_type` for legacy requests (where both are 0)
3. Deducts from both balances
4. Records in `leave_balance_history`

#### `undo_approve_leave_request()` (RPC)

When undoing an approval:
1. Restores both balances using the stored split amounts
2. Same legacy fallback logic
3. Records reversal in `leave_balance_history`

### UI Flow (3 Steps)

#### Step 1: Demande (Period + Balances)

- **On-behalf selector** (managers only): choose self or employee
- **Balance bar**: compact horizontal pills showing conge + recovery balances with expiration dates
- **Date pickers**: start/end dates + half-day selectors
- **Working days calculation**: holiday-aware, shows excluded holidays
- **Split controls**: +/- buttons for recovery days, auto-calculated conge days
- **Balance after**: inline display of remaining balances after deduction

#### Step 2: Details

- Optional replacement employee
- Optional reason/comment

#### Step 3: Resume (Summary)

- Full request summary with all details
- Balance impact breakdown per type (conge section + recovery section)
- Submit button

### Submission Payload

```typescript
{
  user_id: targetUserId,
  request_type: recupDaysToUse > 0 && congeDaysToUse === 0 ? 'RECUPERATION' : 'CONGE',
  start_date, end_date,
  start_half_day, end_half_day,
  days_count: workingDays,
  return_date,
  replacement_user_id,
  reason,
  is_mixed: recupDaysToUse > 0 && congeDaysToUse > 0,
  balance_before: availableConge,
  balance_conge_used: congeDaysToUse,
  balance_recuperation_used: recupDaysToUse,
}
```

---

## 3. File Reference

| File | Purpose |
|------|---------|
| `database/06_multi_company_roles.sql` | Multi-company role tables, RPC, RLS updates |
| `database/10_combined_leave_requests.sql` | Updated approval/auto-approval/undo functions for mixed balances |
| `lib/hooks/use-company-context.tsx` | Company switching context provider |
| `lib/hooks/use-effective-role.ts` | Resolves role for active company |
| `lib/leave-utils.ts` | Working day calculation, monthly accrual, seniority |
| `lib/constants.ts` | `MAX_CONSECUTIVE_RECOVERY_DAYS = 5`, `MAX_LEAVE_BALANCE = 52` |
| `lib/types/database.ts` | TypeScript types for all tables |
| `app/dashboard/new-request/page.tsx` | Combined leave request form (3-step wizard) |
| `components/company-switcher.tsx` | Company dropdown in sidebar |

---

## 4. SQL Migration Order

```
01_schema.sql
02_rls_triggers.sql
03_rpcs.sql
04_seed.sql
05_new_features.sql
06_multi_company_roles.sql
07_seed_multi_company_test.sql  (test data only)
08_repair_rls_and_seeds.sql
09_fix_login.sql
10_combined_leave_requests.sql
```

Each file is safe to re-run (uses `CREATE OR REPLACE`, `IF NOT EXISTS`, etc.).

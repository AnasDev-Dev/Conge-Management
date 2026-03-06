# Monthly Balance Accrual — Client Requirements & Implementation

## Client Requirement

> The total leave days per year is decided by RH. That number is divided by 12 to calculate the monthly accrual. Each month, the employee earns a fraction of their annual leave. The available balance at any point in time is the cumulative monthly amount minus what has already been used or is pending approval.

### Business Rules

1. **RH sets the annual total** via the "Init. Soldes" page (e.g. 18, 22, 24 days/year)
2. **Monthly rate** = annual total / 12 (e.g. 22 / 12 = 1.83 days/month)
3. **Cumulative earned** = monthly rate x current month number (e.g. 1.83 x 3 = 5.49 by March)
4. **Available now** = cumulative earned - days used (approved) - days pending
5. **Maximum cap** = 52 days total (Moroccan labor law, Article 240)
6. Employee can only request leave up to their **available now** balance, not the full annual total

### Example

| Month | Monthly Rate | Cumulative Earned | Used | Pending | Available Now |
|-------|-------------|-------------------|------|---------|---------------|
| Jan   | 1.83        | 1.83              | 0    | 0       | 1.83          |
| Feb   | 1.83        | 3.66              | 0    | 0       | 3.66          |
| Mar   | 1.83        | 5.49              | 2    | 1       | 2.49          |
| Apr   | 1.83        | 7.32              | 2    | 1       | 4.32          |
| ...   | ...         | ...               | ...  | ...     | ...           |
| Dec   | 1.83        | 21.96             | 10   | 0       | 11.96         |

---

## Architecture — Single Source of Truth

```
utilisateurs.balance_conge  (SET BY RH)
        = Annual total (e.g. 22 days)
        = The ONLY place RH writes
        ↓
Frontend calculates:
  monthlyRate     = balance_conge / 12
  cumulativeEarned = monthlyRate × currentMonth
  availableNow    = cumulativeEarned - used - pending
        ↓
New request form checks:
  requested days <= availableNow
```

### Roles

| Component | Role | Who Controls It |
|-----------|------|-----------------|
| `utilisateurs.balance_conge` | Annual total (wallet) | RH via Init. Soldes |
| `calculateMonthlyAccrual()` | Monthly available calculator | System (automatic) |
| `monthly_balance_accrual` table | Audit trail (optional) | System (if cron runs) |
| New request form | Enforces monthly limit | System (automatic) |

### Key Design Decision

The `accrue_monthly_balance()` SQL function does **NOT** modify `utilisateurs.balance_conge`. It only writes audit records to `monthly_balance_accrual`. The RH is the sole authority on the annual total.

---

## Database Tables

### `utilisateurs` (existing)

| Column | Type | Description |
|--------|------|-------------|
| `balance_conge` | float | Annual leave total set by RH |
| `balance_recuperation` | float | Recovery days balance |

### `monthly_balance_accrual` (audit trail)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `user_id` | uuid | FK to utilisateurs |
| `year` | int | Accrual year |
| `month` | int | Accrual month (1-12) |
| `accrued_days` | float | Days earned this month (annual/12) |
| `cumulative_days` | float | Total earned up to this month |
| `annual_entitlement` | float | Annual total at time of calculation |
| `created_at` | timestamptz | Record creation time |

**Unique constraint:** `(user_id, year, month)` — one record per employee per month.

### `leave_balance_history` (existing)

Records every time RH changes an employee's balance via Init. Soldes, with old and new values for audit.

---

## Frontend Implementation

### 1. Utility Function — `lib/leave-utils.ts`

```typescript
calculateMonthlyAccrual(annualTotal, daysUsed, daysPending, month?)
```

Returns:
- `annualTotal` — RH-set balance (e.g. 22)
- `currentMonth` — 1-12
- `monthlyRate` — annualTotal / 12
- `cumulativeEarned` — monthlyRate x currentMonth
- `daysUsed` — approved CONGE days this year
- `daysPending` — pending CONGE days this year
- `availableNow` — cumulativeEarned - daysUsed - daysPending

### 2. New Request Form — `app/dashboard/new-request/page.tsx`

**What changed:**
- Fetches used/pending CONGE days for the target employee from `leave_requests`
- Calculates monthly accrual using `calculateMonthlyAccrual()`
- Available balance for CONGE = `accrual.availableNow` (not raw `balance_conge`)
- RECUPERATION balance check is unchanged (uses raw `balance_recuperation`)
- Step 1 (Type): Shows "Acquis ce mois: X / Y jours/an"
- Step 2 (Dates): Shows "Acquis" label with annual context
- Step 4 (Review): Shows full breakdown — annual, cumulative, used, available, requested, remaining

### 3. Init. Soldes — `app/dashboard/balance-init/page.tsx`

**What changed:**
- Fetches used/pending CONGE days per employee alongside employee data
- Computes `accrualMap` using `calculateMonthlyAccrual()` for each employee
- Desktop table: Added 3 new columns — `/mois`, `Cumulé`, `Disponible`
- Mobile cards: Added second stats row showing monthly breakdown
- Column "Solde actuel" renamed to "Solde RH" (clarifies it's the annual total)

### 4. Dashboard — `app/dashboard/page.tsx`

**What changed:**
- `balanceInfo` state extended with `monthly_accrued`, `monthly_rate`, `available_now`
- "Solde Congé" card shows available now instead of raw balance
- Shows monthly rate and cumulative as subtext
- Progress bar reflects monthly accrual progress

---

## SQL Functions

### `accrue_monthly_balance(p_year, p_month)` — Audit Trail

- Loops through all active employees
- Calculates `annual_entitlement / 12` as monthly rate
- Inserts/updates `monthly_balance_accrual` for audit
- Does **NOT** modify `utilisateurs.balance_conge`

### `calculate_leave_balance(p_user_id)` — Dashboard RPC

Returns JSON with:
- `balance_conge` — annual total (from utilisateurs)
- `monthly_accrued` — cumulative earned this year (`balance_conge / 12 * month`)
- `monthly_rate` — per-month rate (`balance_conge / 12`)
- `available_now` — monthly_accrued - used - pending
- `days_used_this_year` — approved CONGE days
- `days_pending` — pending CONGE days

---

## Data Flow Summary

```
                    Init. Soldes (RH)
                         │
                         ▼
             utilisateurs.balance_conge = 22
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      Dashboard     New Request    Init. Soldes
           │             │             │
           ▼             ▼             ▼
    22/12 × 3 = 5.5  22/12 × 3 = 5.5  Shows all 3 columns
    - used (2)        - used (2)       /mois | Cumulé | Dispo
    - pending (1)     - pending (1)
    = 2.5 available   = 2.5 available
                         │
                         ▼
                  Can request ≤ 2.5 days
```

---

## Files Modified

| File | Change |
|------|--------|
| `lib/leave-utils.ts` | Added `calculateMonthlyAccrual()` function |
| `app/dashboard/new-request/page.tsx` | Monthly accrual balance check + display |
| `app/dashboard/balance-init/page.tsx` | Monthly breakdown columns + usage data |
| `app/dashboard/page.tsx` | Dashboard card shows monthly accrual |
| `database/05_new_features.sql` | `accrue_monthly_balance()` no longer modifies balance_conge; `calculate_leave_balance()` returns monthly fields |
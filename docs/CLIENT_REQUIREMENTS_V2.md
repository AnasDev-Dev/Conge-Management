# Client Requirements V2 — April 2026

Source: Client feedback (French), translated and analyzed against current codebase.

---

## REQ-1: Link missions to recovery credits
**Status: ALREADY IMPLEMENTED**

> *"Lier les missions au credits recup"*

The recovery request form already auto-detects approved missions for the selected employee and links them (mission_request_id, auto-fill dates, reason, work type).

**File**: `app/dashboard/recovery-requests/page.tsx` lines 99-176
**No work needed.**

---

## REQ-2: Display recovery requests as table rows, not cards
**Status: NEEDS WORK**

> *"Affichage des recup comme les employes sous formes de lignes avec infos non pas cartes"*

**What the client wants**: Recovery requests currently display as cards in a grid. The client wants a table/row layout similar to the employees page — each recovery as a row with columns for employee name, dates, type, status, days, etc.

**File to modify**: `app/dashboard/recovery-requests/page.tsx` lines 478-539 (replace Card grid with table rows)

---

## REQ-3: Show recovery expiration details in profile
**Status: NEEDS WORK**

> *"Afficher date expiration de recup dans le profil (solde recuperation afficher chaque annee combien de recup avec detail chaque recup expire quand)"*

**What the client wants**: In the employee profile page, show the recovery balance broken down by year with expiration dates for each lot. For example:
- 2025: 3 days (expires 30/06/2026)
- 2026: 2 days (expires 30/06/2027)

The data already exists — `get_employee_balance()` RPC returns `recovery_lots` with `remaining_days`, `year_acquired`, `expires_at`, `is_expiring_soon`. It's just not displayed on the profile page.

**File to modify**: `app/dashboard/profile/page.tsx` — add recovery lots section

---

## REQ-4: Block recovery requests past expiration date + expiration alert
**Status: NEEDS WORK**

> *"Demande de conge/recup: impossible de demander recuperation si la date fin > date expiration"*
> *"Affichage alerte d'expiration de recup lors de la demande si ils expirent dans pas longtemps"*

**What the client wants (2 parts)**:
1. **Block**: When an employee requests recovery days (RECUPERATION type in leave request), if the end date of the request is AFTER the expiration date of their recovery lots, block the request.
2. **Alert**: When creating a leave request, if the employee has recovery lots expiring soon, show a warning banner (e.g., "Attention: 2 jours de recuperation expirent le 30/06/2026").

**Files to modify**: `app/dashboard/new-request/page.tsx` — add validation + alert using balance data from `useEmployeeBalance()`

---

## REQ-5: Negative balance derogation (max -3 days credit)
**Status: PARTIALLY EXISTS — NEEDS REWORK**

> *"Si solde conge > nombre de jours demandes, rendre possibilite de envoyer la demande quand meme, et possibilite de prendre 3 jours maximum en credit..."*

**What the client wants**: If an employee doesn't have enough leave balance, allow the request anyway IF the shortage is <= 3 days. The balance goes negative (minimum -3). Next monthly accrual absorbs it naturally.

Example: Employee has 2 days available, requests 5 days.
- Shortage = 3 days (<= 3 limit) → request is allowed
- Balance becomes -3 after approval
- Next month: -3 + 1.5 (monthly accrual) = -1.5
- Following month: -1.5 + 1.5 = 0
- Then: 0 + 1.5 = 1.5 (normal)

The request should be flagged as "derogation" and display: "Demande derogation, 5 jours, 3 jours indisponibles"

**Current state**: `is_derogation` flag exists in the schema and UI, but the actual negative balance logic (allow up to -3, monthly absorption) is NOT implemented. Currently the request is blocked if balance is insufficient.

**Files to modify**:
- `app/dashboard/new-request/page.tsx` — allow submit when shortage <= 3, set `is_derogation`
- `lib/leave-utils.ts` or `get_employee_balance()` RPC — handle negative `available_now`
- Validation pages — display derogation info clearly

---

## REQ-6: Holiday creation recalculates existing leave requests
**Status: NEEDS WORK**

> *"Une fois un jour ferie est cree, verifier toutes les demandes de conge, si le nouveau jour ferie existe dans une demande, recalculer la duree..."*

**What the client wants**: When an admin creates a new public holiday, the system should automatically:
1. Find all active leave requests (PENDING, VALIDATED_RP, VALIDATED_DC) that span that date
2. Recalculate their `days_count` (the new holiday reduces working days)
3. The employee effectively gets a day back in their balance

**Files to modify**:
- `app/dashboard/settings/page.tsx` or `app/api/holidays/` — after creating a holiday, trigger recalculation
- Likely needs a new SQL RPC: `recalculate_leave_for_holiday(p_holiday_date DATE)`

---

## REQ-7: Remove ADMIN role from employee creation/edit
**Status: NEEDS WORK (trivial)**

> *"Enlever role admin dans creation d'un employe ou modification"*

**What the client wants**: The ADMIN role should not be selectable when creating or editing an employee. Only: EMPLOYEE, CHEF_SERVICE, RH, DIRECTEUR_EXECUTIF.

**Files to modify**:
- `components/add-employee-dialog.tsx` line 28 — remove 'ADMIN' from ROLE_OPTIONS
- `components/edit-employee-dialog.tsx` line 28 — same

---

## REQ-8: Mission period calculated by nights, not days
**Status: NEEDS REWORK**

> *"Dans ordre de mission la periode se calcul par nuitee pas par jour, du 1 au 5 = 4 nuits (4.5 dans les calculs)"*

**What the client wants**: Mission duration should be counted as NIGHTS (nuitees), not calendar days. From the 1st to the 5th = 4 nights. For financial calculations, use 4.5 (half-day travel adjustment).

Current behavior counts calendar days: from 1st to 5th = 5 days, then adds 0.5 for travel = 5.5.

**Files to modify**:
- `app/dashboard/new-mission/page.tsx` — change days calculation to nights (end - start, not end - start + 1)
- Mission print/display — show "nuitees" label instead of "jours"

---

## REQ-9: Mission PEC/non-PEC date segments
**Status: NEEDS WORK**

> *"Creation d'ordre de mission, faire comme conge des segments de dates pour faire une date avec PEC, et une date sans PEC..."*

**What the client wants**: Like the leave request segment builder, create date segments for missions where each segment can be PEC (prise en charge = expenses covered) or non-PEC. Calculate each segment separately, then show the total.

Example:
- Segment 1: 1st to 3rd — WITH PEC → total X MAD
- Segment 2: 3rd to 5th — WITHOUT PEC → total Y MAD
- Grand total: X + Y MAD

**Current state**: Single PEC toggle for the entire mission. No segment support.

**Files to modify**:
- `app/dashboard/new-mission/page.tsx` — add segment builder similar to leave request segments
- `lib/types/database.ts` — possibly new types for mission segments
- `components/print-mission-document.tsx` — display per-segment totals

---

## REQ-10: Mission validation pipeline change (2 stages)
**Status: NEEDS REWORK**

> *"Validation de ordre mission (responsable administratif -> directeur executif)"*

**What the client wants**: Mission approval should be 2 stages only:
1. Responsable Administratif validates
2. Directeur Executif approves

This is different from the current 3-stage pipeline (RH → Chef → Director). The client wants to remove the middle stage for missions specifically.

**Files to modify**:
- `app/dashboard/mission-validations/page.tsx` — change MISSION_PIPELINE to 2 stages
- SQL RPC `approve_mission_request()` — adjust status transitions
- SQL RPC `reject_mission_request()` — same
- `compute_initial_mission_status()` trigger — adjust auto-skip logic
- Notification triggers — adjust next-validator notifications

**Important question**: Is "Responsable Administratif" a new role, or is it the existing RH role (Meryem HANINE)?

---

## REQ-11: Mission print redesign (2 pages)
**Status: NEEDS REWORK**

> *"Impression de ordre de mission supprimer avis et decision, faire 2 pages..."*

**What the client wants**:
- **PAGE 1**: Mission details WITHOUT prices, WITHOUT duration. Only: dates (du/au), city/country, requester, and the concerned employee.
- **PAGE 2**: Only the TOTAL amount (no breakdown of dotation/meals), and ONLY the Director's signature. Remove "avis" and "decision" sections.

**Current state**: Single page with all details, all signatures, avis/decision sections.

**File to modify**: `components/print-mission-document.tsx` — restructure into 2-page layout

---

## Summary — Priority Order

| # | Requirement | Effort | Status |
|---|---|---|---|
| REQ-1 | Mission → recovery link | - | Already done |
| REQ-7 | Remove ADMIN from role picker | Trivial | 2 lines |
| REQ-2 | Recovery as table rows | Small | UI change |
| REQ-3 | Recovery expiration in profile | Small | Display existing data |
| REQ-4 | Block expired recovery + alert | Medium | Validation logic |
| REQ-8 | Mission nights calculation | Medium | Calculation change |
| REQ-11 | Mission print 2 pages | Medium | Print redesign |
| REQ-10 | Mission 2-stage pipeline | Medium | Pipeline change |
| REQ-5 | Negative balance derogation | Large | Balance logic + UI |
| REQ-6 | Holiday recalculates requests | Large | New RPC + triggers |
| REQ-9 | Mission PEC segments | Large | Segment builder |

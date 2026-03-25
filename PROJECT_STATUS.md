# FRMG - Gestion des Congés | Project Status

> **Last updated:** 18 March 2026
> **Branch:** `main`
> **Build status:** Passing

---

## Overview

Leave management platform built for the **Federation Royale Marocaine de Golf (FRMG)**. Handles employee leave requests, mission orders, recovery day management, multi-stage approval workflows, monthly balance accrual, team calendar, and employee directory with multi-company support (FRMG + ATH).

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | 4 |
| Components | Radix UI + shadcn/ui | 1.4.3 |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) | Latest |
| Date handling | date-fns (French locale) | 4.1.0 |
| Icons | lucide-react | 0.564.0 |
| Toasts | sonner | 2.0.7 |
| Deployment | Dokploy (Docker, standalone output) | - |

---

## Features Built

### Authentication & Session
- [x] Supabase Auth login (email + password)
- [x] FRMG-branded login page — light warm theme, both logos side by side, feature pills
- [x] Session persistence via cookies (middleware) + localStorage
- [x] Auth state listener with auto-redirect on logout
- [x] Protected dashboard routes
- [x] **Login reminders** — toast notifications on login: unread notifications, pending validations (leave/mission/recovery), role-aware counts

### Dashboard (`/dashboard`)
- [x] Stats cards: balance congé, balance récupération, pending count, approved count — compact horizontal layout with icons, no progress bars
- [x] Monthly accrual display (earned so far this year, monthly rate, carry-over if > 0)
- [x] All balance displays rounded to nearest 0.5 via `roundHalf()` utility
- [x] Interactive month calendar with color-coded request bars
- [x] Recent requests list with tab filtering (all / pending / approved / rejected)
- [x] Role-aware: managers see all requests, employees see only their own

### Leave Request Creation (`/dashboard/new-request`)
- [x] 4-step wizard: Type > Dates > Details > Review
- [x] Type selection: CONGE or RECUPERATION
- [x] Date picker with automatic working-day calculation (category-aware, half-day support)
- [x] Balance validation (cannot exceed available days)
- [x] Overlap detection with existing requests
- [x] Replacement person selector (multi-employee search)
- [x] **On-behalf creation** — managers (RH, Chef de Service, Directeur, Admin) can create requests for any employee
- [x] Notification sent to employee when request is created on their behalf
- [x] 5-day consecutive récupération limit validation (client-side)
- [x] **Balance breakdown display** — carry-over (solde antérieur), monthly accrual (acquis), annual entitlement (dotation annuelle) shown separately
- [x] Mission tab hidden when missions disabled via DB permissions
- [x] Self-service leave requests blocked on non-home company for all roles

### Requests List (`/dashboard/requests`)
- [x] All requests with search and status filter
- [x] Manager view shows requester name and job title
- [x] Employee view shows only their own requests
- [x] Click to view full request details

### Request Details (`/dashboard/requests/[id]`)
- [x] Full request information: dates, type, status, reason, replacement
- [x] Approval timeline with approver names and timestamps per stage
- [x] Rejection reason display

### Kanban Validation Board (`/dashboard/validations`)
- [x] 3-stage pipeline: RH Personnel > Chef de Service > Directeur Exécutif
- [x] Drag-and-drop cards between columns
- [x] Approve / Reject buttons with confirmation
- [x] Reject dialog with mandatory reason input
- [x] Inline date editing on request cards
- [x] Search and type filters
- [x] Separate rejected section with **undo reject** (restore to PENDING)
- [x] **Undo approve** — revert a validated request to its previous stage
- [x] Visual amber "Annuler la validation" and blue "Restaurer la demande" buttons

### Mission Orders (`/dashboard/missions`)
- [x] Mission request creation (departure/arrival city, object, transport, scope)
- [x] Mission request list with status filtering
- [x] Mission detail view (`/dashboard/missions/[id]`)
- [x] On-behalf mission creation for managers

### Mission Validation Board (`/dashboard/mission-validations`)
- [x] 3-stage pipeline: Chef de Service > RH > Directeur Exécutif
- [x] Auto-skip RH step if creator is RH
- [x] Approve / Reject with undo support

### Recovery Requests (`/dashboard/recovery-requests`)
- [x] Employee submission form: days (0.5–5), date worked, work type, reason
- [x] Work types: Jour Férié, Jour de Repos, Samedi, Dimanche
- [x] Status tabs: All / Pending / Validated / Rejected
- [x] KPI cards: Total, Pending, Validated, Rejected
- [x] Manager validation/rejection with dialog and reason
- [x] Auto-credit of récupération balance on validation
- [x] **FIFO lot deduction** — `recovery_balance_lots.remaining_days` decremented on leave approval (earliest expiration first), restored on undo
- [x] API route (`/api/recovery-requests`) with service role key to bypass RLS connection pooling issue
- [x] Desktop table + mobile card responsive views

### Calendar (`/dashboard/calendar`)
- [x] Full-month view with day cells
- [x] Request bars color-coded by status
- [x] "+N more" indicator when multiple requests overlap a day
- [x] Click request bar to navigate to detail page
- [x] Day detail popup with max-height scroll and "Voir détails" link to requests page
- [x] Month navigation + "Today" button
- [x] Legend with status color key
- [x] **Dynamic status filters** (checkboxes: En cours, Refusé, Validé Chef, Validé RH, Approuvé)
- [x] Holiday indicators on calendar

### Employee Directory (`/dashboard/employees`)
- [x] Searchable list with fuzzy French-accent-aware search
- [x] Employee cards showing KPIs (total requests, approved days, pending)
- [x] Role badges with color coding
- [x] Click to view employee detail page
- [x] **Add Employee dialog** — button visible to all roles except EMPLOYEE
- [x] Full employee creation form: identity, role, job, company/department, dates, administrative info (matricule, CIN, CNSS, RIB), address, balances
- [x] **Balance breakdown per employee** — available days, carry-over, monthly accrual, récupération
- [x] Balance display gated by `employees.viewBalances` permission

### Employee Detail (`/dashboard/employees/[id]`)
- [x] Profile card: name, email, phone, job title, role
- [x] **Solde Congé** — available days with breakdown: carry-over (solde antérieur), monthly accrual (acquis), annual entitlement (dotation annuelle)
- [x] **Récupération** — separate display
- [x] Summary stats: total requests, requested days, approved days, pending, rejected
- [x] Full leave request history with status badges
- [x] Balance display gated by `employees.viewBalances` permission

### Balance Initialization (`/dashboard/balance-init`)
- [x] RH/manager-only access (page title: "Soldes globaux")
- [x] Search employees with department info (multi-token: name, job, department, balance, entitlement)
- [x] Display columns: Dotation annuelle, Solde antérieur (editable), /mois, Cumulé, Disponible
- [x] Editable carry-over per employee with bulk save, gated by `balance-init.edit` permission
- [x] Per-employee seniority, department entitlement, and monthly accrual calculations
- [x] 52-day cap enforcement
- [x] Uses `set_initial_balance()` RPC with audit trail
- [x] Mobile card view + desktop frozen-column table

### Settings (`/dashboard/settings`)
- [x] **Départements tab** — Department `annual_leave_days` configuration (default 18), bulk edit, add new, inline rename (Enter/Escape), delete with confirmation
- [x] **Categories tab** — Personnel category CRUD (Cadre Supérieur, Agent, Ouvrier, etc.)
- [x] **Working Days tab** — Per-department or company-default config via dropdown selector, 7-day grid with morning/afternoon toggles, summary bar (full/half/rest days, weekly total), inherits from company default when creating department-specific config
- [x] **Holidays tab** — Recurring vs variable (grouped by year), duplicate detection, calendar date picker, delete fix (`.select()` appended to avoid 204 proxy error)
- [x] **Récupération tab** — Manual recovery credit for RH
- [x] **Permissions Manager tab** — DB-driven role permissions editor (sidebar, pages, actions, data scope per role)
- [x] Sticky tabs on scroll (mobile + desktop)

### Permissions System
- [x] **DB-driven permissions** — `role_permissions` table with company-scoped rows, static fallback via `ROLE_PERMISSIONS`
- [x] **API route** (`/api/role-permissions`) — service role key bypasses RLS for read/write; auth-checked (ADMIN, RH, DIRECTEUR_EXECUTIF)
- [x] **DbPermissionsProvider** context — loads permissions from API, keeps `loading=true` until activeCompany is available, provides `permissionsMap` to all components
- [x] **usePermissions hook** — `can(action)`, `canSee(sidebar)`, `canAccess(page)` with DB-first, static fallback
- [x] **RoleGate / PageGuard** components — declarative permission gating with loading states
- [x] **Sub-page auto-sync** — toggling sidebar items auto-adds/removes related sub-pages (e.g., `requests` → `request-detail`, `new-request`)
- [x] **Permissions Manager UI** — per-role editor with sidebar toggles, action checkboxes, data scope selector, save single/all roles

### Profile (`/dashboard/profile`)
- [x] User info display with FRMG logo badge on avatar
- [x] Password change form with validation

### Notifications (`/dashboard/notifications`)
- [x] Notification list (up to 100) with timestamp, type-specific icons (leave, mission, recovery, approval, rejection, undo)
- [x] Mark as read (single or all) with toast feedback
- [x] **Real-time updates** — Postgres subscription on notifications table (INSERT, UPDATE, DELETE), new notifications appear instantly
- [x] **Smart navigation** — click notification marks as read and navigates to related resource (validations, missions, recovery, request details)
- [x] Notification badge count in sidebar and mobile header via `useNotifications` hook (real-time unread count)
- [x] Skeleton loaders and empty state

### Sidebar & Navigation
- [x] FRMG crest logo + "Federation Royale Marocaine de Golf" branding
- [x] Role-aware navigation (Validations, Valid. Missions, Paramètres, Init. Soldes — managers only)
- [x] **Tree connector lines** — vertical + horizontal lines connecting sub-menu items in expanded groups
- [x] "Nouvelle demande" quick-action button
- [x] Profile section with generic avatar and logout
- [x] Mobile hamburger menu with notification badge
- [x] Responsive collapse behavior
- [x] Loading guard prevents rendering sidebar with stale permissions before company context loads

### Branding & Assets
- [x] FRMG logo as favicon (`icon.png` + `apple-icon.png`), replaces default Next.js favicon
- [x] Login page: light warm theme with both logos (FRMG + ATH) side by side, feature pills

---

## Client Requirements Status (12 Exigences)

| # | Exigence | Statut | Notes |
|---|----------|--------|-------|
| 1 | Paramétrage jours de travail par catégorie | ✅ Fait | `working_days` table with `department_id`, department-aware `count_working_days()` (7-arg, priority: department → category → company default → hardcoded) |
| 2 | Demi-journées dans le paramétrage | ✅ Fait | Morning/afternoon toggles in working_days, `getDayWorkValue()` returns 0/0.5/1 |
| 3 | Nombre de jours de congé annuel par département | ✅ Fait | `departments.annual_leave_days` (default 18), configurable in Settings > Départements |
| 4 | Majoration après 5 ans d'ancienneté | ✅ Fait | +1.5 jour per 5yr period, max 30 total |
| 5 | Calcul mensuel du solde de congé | ✅ Fait | **Balance Model V2**: `available = carry_over + (entitlement/12 × month) - used - pending`. Carry-over fully available from Jan 1, entitlement accrues monthly |
| 6 | Report antérieur (carry-over) | ✅ Fait | `balance_conge` repurposed as carry-over. Editable in balance-init, shown across all pages |
| 7 | Plafond maximal du solde (52 jours) | ✅ Fait | `MAX_LEAVE_BALANCE = 52` enforced on carry-over in balance-init |
| 8 | Validation préalable des jours de récupération | ✅ Fait | `recovery_requests` table + full workflow (submit/validate/reject RPCs) + dedicated page |
| 9 | Demande combinée Congé + Récupération | ⚠️ Partiel | DB schema ready (`leave_request_details`, `is_mixed`), client-side 5-day rule. Missing: per-day type form, split deduction in approve RPC, detail view breakdown |
| 10 | Limite de validité des jours de récupération | ⚠️ Partiel | `recovery_balance_lots` + `expire_recovery_days()` RPC done. Missing: cron trigger, UI expiration display/warnings |
| 11 | Filtres dynamiques du calendrier | ✅ Fait | Status checkboxes (PENDING, VALIDATED_DC, VALIDATED_RP, APPROVED, REJECTED) |
| 12 | Gestion multi-sociétés et multi-profils | ✅ Fait | `user_company_roles` table with `is_home`/`department_id`, session-variable-based RLS (`set_active_company()` RPC), rewritten `get_my_role()`/`is_manager()`/`can_manage_user()` as company-aware, `CompanySwitcher` UI, company-scoped employee filtering, all pages use `effectiveRole` from company context |

---

## Database Schema

### Core Tables
| Table | Purpose |
|-------|---------|
| `companies` | Organization entities (FRMG, ATH) |
| `departments` | Department groupings per company, `annual_leave_days` (default 18) |
| `utilisateurs` | User profiles, roles, balances (`balance_conge` = carry-over), contact info, admin fields |
| `leave_requests` | Leave requests with full approval chain fields |
| `mission_requests` | Mission orders with approval chain |
| `leave_balance_history` | Audit trail for balance changes |
| `notifications` | In-app notification system |
| `holidays` | Company holidays (recurring + one-time) |
| `working_days` | Working day config per company or department (with half-day morning/afternoon, `department_id` FK) |
| `audit_logs` | General audit trail |

### New Feature Tables
| Table | Purpose |
|-------|---------|
| `personnel_categories` | Employee categories with annual leave entitlement |
| `monthly_balance_accrual` | Monthly accrual tracking per user/year/month |
| `recovery_requests` | Recovery day requests (employee → manager validation) |
| `recovery_balance_lots` | Recovery day expiration tracking (expires June 30 N+1) |
| `leave_request_details` | Per-day type breakdown for mixed CONGE+RECUPERATION requests |
| `user_company_roles` | Multi-company role assignment (with `is_home`, `department_id`) |
| `role_permissions` | DB-driven role permissions per company (sidebar, pages, actions, data_scope) |

### Leave Approval Chain
```
PENDING → VALIDATED_RP (RH) → VALIDATED_DC (Chef Service) → APPROVED (Directeur)
         (or REJECTED at any stage)
```

### Mission Approval Chain
```
PENDING → VALIDATED_DC (Chef Service) → VALIDATED_RP (RH) → APPROVED (Directeur)
         Auto-skip RH if creator is RH
```

### Balance Model V2 (March 2026)

**Architecture change:** Annual leave entitlement is now driven by `departments.annual_leave_days` (not `personnel_categories`). The `balance_conge` field is repurposed as **carry-over** (report antérieur) from the previous year.

**Formula:**
```
available = carry_over + (dept_entitlement + seniority_bonus) / 12 × current_month - days_used - days_pending
```

- **Carry-over** (`balance_conge`): Fully available from January 1st. Entered manually by RH in balance-init page.
- **Annual entitlement**: From `departments.annual_leave_days` (default 18) + seniority bonus (+1.5 per 5-year period, max 30 total). Accrues monthly (1/12 per month).
- **Double-counting fix**: `approve_leave_request()` no longer deducts from `balance_conge` for CONGE type — usage is tracked via `leave_requests` queries only. `handle_auto_approved_leave()` trigger also patched.
- **RECUPERATION tracking**: `balance_recuperation` still deducted on approve + FIFO lot deduction from `recovery_balance_lots` (earliest expiration first), restored on undo.
- **Rounding**: All balance displays use `roundHalf()` — floors to nearest 0.5 (e.g., 1.9→1.5, 2.3→2.0).
- **Frontend**: `calculateMonthlyAccrual(annualEntitlement, carryOver, daysUsed, daysPending, month?)` in `lib/leave-utils.ts`. `fetchWorkingDays()` now accepts optional `departmentId` with priority lookup (department → company default → hardcoded).

**Pages updated:**
| Page | What's shown |
|------|-------------|
| Dashboard | Available, monthly rate, cumulative earned, carry-over (if > 0) |
| New Request | Full breakdown: solde antérieur, acquis (rate × month), dotation annuelle |
| Balance Init | Columns: Dotation annuelle, Solde antérieur (editable), /mois, Cumulé, Disponible |
| Employees | Available + breakdown (solde antérieur, acquis, récup) |
| Employee Detail | Solde Congé (available + solde antérieur + acquis + dotation annuelle) + Récupération |
| Profile | Carry-over display (report antérieur) |

### Row-Level Security (RLS)
- Employees can only read/update their own requests
- Managers (`is_manager()`) can read all requests and validate
- Managers can insert leave/mission requests on behalf of employees
- CHEF_SERVICE scoped to same department via `can_manage_user()`
- Recovery requests: employees see own, managers validate
- Notification access restricted to the target user
- `role_permissions` bypassed via service role API route (`/api/role-permissions`)
- `recovery_requests` bypassed via service role API route (`/api/recovery-requests`) to avoid connection pooling session variable issues

### SQL Migration Files
| File | Purpose |
|------|---------|
| `01_tables.sql` | Enums, core tables, indexes, helper functions |
| `02_rls_triggers.sql` | All RLS policies and triggers |
| `03_rpcs.sql` | Approval/rejection RPCs for leave + mission workflows |
| `04_grants_seed.sql` | Permissions and seed data |
| `05_new_features.sql` | All Req #1–12 tables, RPCs, RLS, and indexes |
| `06_multi_company_roles.sql` | Multi-company multi-role: enhanced `user_company_roles`, session-variable RLS, rewritten helper functions, updated triggers |
| `07_balance_model_v2.sql` | **Balance Model V2**: `departments.annual_leave_days`, rewritten `calculate_annual_entitlement()`, `calculate_leave_balance()` (carry-over + monthly accrual), fixed double-counting in `approve_leave_request()` / `undo_approve_leave_request()` |
| `08_working_days_per_department.sql` | `department_id` column on `working_days`, 7-arg `count_working_days()` with department priority lookup, updated `approve_leave_request()` |

### Incremental Migrations (`database/migrations/`)
| File | Purpose |
|------|---------|
| `20260312_fix_recovery_lots_remaining_days.sql` | FIFO lot deduction in `approve_leave_request()`, `handle_auto_approved_leave()`, and `undo_approve_leave_request()` for recovery balance lots |
| `20260313_fix_count_working_days_ambiguity.sql` | Drop old 3-arg and 6-arg `count_working_days()` overloads, keep only 7-arg version (fixes PostgreSQL 42725 error) |
| `20260317_fix_balance_double_deduction.sql` | Remove CONGE balance deduction from approve/auto-approve/undo RPCs — `balance_conge` is carry-over only, available balance computed dynamically. Includes data repair SQL |

---

## User Roles

| Role | Access |
|------|--------|
| `EMPLOYEE` | Own requests, own calendar, own profile, recovery requests, notifications |
| `RH` | All requests, Kanban stage 1, employee directory, settings, balance init, recovery validation, notifications |
| `CHEF_SERVICE` | Department requests, Kanban stage 2, employee directory, recovery validation (dept), notifications |
| `DIRECTEUR_EXECUTIF` | All requests, Kanban stage 3 (final approval), employee directory, notifications |
| `ADMIN` | Full access, all Kanban stages, settings, employee creation |
| `TRESORIER_GENERAL` | Legacy role (removed from pipeline, still in DB enum) |

---

## Project Structure

```
app/
├── layout.tsx                        Root layout (fonts, metadata, toast)
├── page.tsx                          Redirect to /login
├── login/page.tsx                    FRMG-branded login
├── globals.css                       Theme, variables, animations
├── icon.png / apple-icon.png         FRMG logo favicon
├── api/health/route.ts               Health check endpoint
├── api/role-permissions/route.ts     Role permissions CRUD (service role, bypasses RLS)
├── api/recovery-requests/route.ts   Recovery requests API (service role, bypasses RLS)
└── dashboard/
    ├── layout.tsx                    Sidebar, auth guard, navigation
    ├── page.tsx                      Dashboard home (stats + calendar)
    ├── new-request/page.tsx          4-step leave wizard
    ├── requests/page.tsx             Requests list
    ├── requests/[id]/page.tsx        Request detail + print
    ├── validations/page.tsx          Kanban leave validation board
    ├── mission-validations/page.tsx  Kanban mission validation board
    ├── missions/page.tsx             Mission orders list
    ├── missions/[id]/page.tsx        Mission detail
    ├── recovery-requests/page.tsx    Recovery day requests + validation
    ├── calendar/page.tsx             Month calendar with status filters
    ├── employees/page.tsx            Employee directory + add employee
    ├── employees/[id]/page.tsx       Employee detail
    ├── balance-init/page.tsx         RH balance initialization
    ├── settings/page.tsx             Categories, working days, holidays, recovery
    ├── profile/page.tsx              User profile
    └── notifications/page.tsx        Notification center

components/
├── ui/                               shadcn/ui components (dialog, select, badge, etc.)
├── add-employee-dialog.tsx           Employee creation dialog
├── permissions-manager.tsx           DB-driven role permissions editor
└── role-gate.tsx                     RoleGate + PageGuard permission components

lib/
├── constants.ts                      Roles, statuses, labels, helpers
├── utils.ts                          cn() utility
├── leave-utils.ts                    Working day calc, half-day, seniority, accrual, roundHalf()
├── types/database.ts                 TypeScript types for all entities
├── hooks/use-current-user.ts         Current user hook with DB refresh
├── hooks/use-permissions.ts          usePermissions: can(), canSee(), canAccess()
├── hooks/use-db-permissions.tsx      DbPermissionsProvider + useDbPermissions (API-based)
├── hooks/use-company-context.tsx     Company context: activeCompany, activeRole, switcher
├── hooks/use-notifications.ts        Real-time unread notification count (Postgres subscription)
├── hooks/use-login-reminders.ts      Login toast reminders (unread notifs, pending validations)
├── permissions.ts                    Static ROLE_PERMISSIONS matrix, types, helpers
└── supabase/
    ├── client.ts                     Browser Supabase client
    └── server.ts                     Server Supabase client

database/
├── 01_tables.sql                     Enums, tables, indexes, helpers
├── 02_rls_triggers.sql               RLS policies
├── 03_rpcs.sql                       Approval workflow RPCs
├── 04_grants_seed.sql                Grants and seed data
├── 05_new_features.sql               Req #1-12 implementation
├── 06_multi_company_roles.sql        Multi-company multi-role support
├── 07_balance_model_v2.sql           Balance Model V2 (dept entitlement + carry-over)
├── 08_working_days_per_department.sql Working days per department, 7-arg count_working_days()
└── migrations/
    ├── 20260312_fix_recovery_lots_remaining_days.sql
    ├── 20260313_fix_count_working_days_ambiguity.sql
    └── 20260317_fix_balance_double_deduction.sql

middleware.ts                          Session refresh middleware
Dockerfile                             Multi-stage Docker build
```

---

## Deployment

- **Docker:** Multi-stage Dockerfile with Next.js standalone output
- **Platform:** Dokploy (self-hosted)
- **Port:** 3000
- **Health check:** `GET /api/health` → `{ ok: true, service: "smartflow-conge" }`
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (for API routes bypassing RLS)

---

## Pending / Not Yet Fully Implemented

| Item | Priority | Notes |
|------|----------|-------|
| Req #9: Per-day type selection in leave form | High | DB ready, needs form UI for mixed CONGE+RECUPERATION per day |
| Req #9: Split balance deduction on approve | High | `approve_leave_request()` needs to query `leave_request_details` |
| Req #9: Detail view per-day breakdown | Medium | Show which days are congé vs récupération |
| Req #10: Automated cron for `expire_recovery_days()` | Medium | SQL function exists, needs pg_cron or Edge Function trigger |
| Req #10: UI expiration warnings | Low | Show expiration date and approaching-expiry alerts |
| Req #12: Admin UI for assigning multi-company roles | Low | Currently requires DB insert; could add admin form in employee edit |
| ~~Real-time notifications~~ | ~~Done~~ | ✅ Implemented via Postgres subscriptions (INSERT/UPDATE/DELETE), real-time unread count badge |
| Export leave reports (PDF/CSV) | Low | HR reporting needs |
| Email notifications on approval/rejection | Low | Currently in-app only |
| Dark mode toggle | Low | Theme variables exist, no toggle UI |
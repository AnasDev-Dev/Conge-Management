# FRMG - Gestion des Congés | Project Status

> **Last updated:** 04 March 2026
> **Branch:** `claude/add-client-features-HF8WM`
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
- [x] FRMG-branded login page with golf-themed animated illustration
- [x] Session persistence via cookies (middleware) + localStorage
- [x] Auth state listener with auto-redirect on logout
- [x] Protected dashboard routes

### Dashboard (`/dashboard`)
- [x] Stats cards: balance congé, balance récupération, pending count, approved count
- [x] Monthly accrual display (earned so far this year, monthly rate)
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
- [x] Desktop table + mobile card responsive views

### Calendar (`/dashboard/calendar`)
- [x] Full-month view with day cells
- [x] Request bars color-coded by status
- [x] "+N more" indicator when multiple requests overlap a day
- [x] Click request bar to navigate to detail page
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

### Employee Detail (`/dashboard/employees/[id]`)
- [x] Profile card: name, email, phone, job title, role
- [x] Balance display: congé + récupération
- [x] Summary stats: total requests, requested days, approved days, pending, rejected
- [x] Full leave request history with status badges

### Balance Initialization (`/dashboard/balance-init`)
- [x] RH/manager-only access
- [x] Search employees with department info
- [x] Display: hire date, seniority, annual entitlement, monthly accrual
- [x] Bulk balance editing with confirmation dialog
- [x] 52-day cap enforcement
- [x] Uses `set_initial_balance()` RPC with audit trail

### Settings (`/dashboard/settings`)
- [x] **Categories tab** — Personnel category CRUD (Cadre Supérieur, Agent, Ouvrier, etc.) with annual leave days per category
- [x] **Working Days tab** — Full week config with morning/afternoon half-day toggles per day
- [x] **Holidays tab** — Recurring and non-recurring holiday management
- [x] **Récupération tab** — Manual recovery credit for RH
- [x] Sticky tabs on scroll (mobile + desktop)

### Profile (`/dashboard/profile`)
- [x] User info display with FRMG logo badge on avatar
- [x] Password change form with validation

### Notifications (`/dashboard/notifications`)
- [x] Notification list with timestamp, type icon, and message
- [x] Mark as read (single or all)
- [x] Type-based icons: success, warning, error, info
- [x] Notification badge count in sidebar and mobile header

### Sidebar & Navigation
- [x] FRMG crest logo + "Federation Royale Marocaine de Golf" branding
- [x] Role-aware navigation (Validations, Valid. Missions, Paramètres, Init. Soldes — managers only)
- [x] "Nouvelle demande" quick-action button
- [x] Profile section with generic avatar and logout
- [x] Mobile hamburger menu with notification badge
- [x] Responsive collapse behavior

---

## Client Requirements Status (12 Exigences)

| # | Exigence | Statut | Notes |
|---|----------|--------|-------|
| 1 | Paramétrage jours de travail par catégorie | ✅ Fait | `personnel_categories` table, category-aware `count_working_days()` |
| 2 | Demi-journées dans le paramétrage | ✅ Fait | Morning/afternoon toggles in working_days, `getDayWorkValue()` returns 0/0.5/1 |
| 3 | Nombre de jours de congé annuel par catégorie | ✅ Fait | `annual_leave_days` per category, override in entitlement calculation |
| 4 | Majoration après 5 ans d'ancienneté | ✅ Fait | +1.5 jour per 5yr period, max 30 total |
| 5 | Calcul mensuel du solde de congé | ✅ Fait | `monthly_balance_accrual` table, `accrue_monthly_balance()` RPC, frontend display |
| 6 | Solde initial de congé par employé | ✅ Fait | `balance-init` page, `set_initial_balance()` RPC |
| 7 | Plafond maximal du solde (52 jours) | ✅ Fait | `MAX_LEAVE_BALANCE = 52` enforced in RPC and frontend |
| 8 | Validation préalable des jours de récupération | ✅ Fait | `recovery_requests` table + full workflow (submit/validate/reject RPCs) + dedicated page |
| 9 | Demande combinée Congé + Récupération | ⚠️ Partiel | DB schema ready (`leave_request_details`, `is_mixed`), client-side 5-day rule. Missing: per-day type form, split deduction in approve RPC, detail view breakdown |
| 10 | Limite de validité des jours de récupération | ⚠️ Partiel | `recovery_balance_lots` + `expire_recovery_days()` RPC done. Missing: cron trigger, UI expiration display/warnings |
| 11 | Filtres dynamiques du calendrier | ✅ Fait | Status checkboxes (PENDING, VALIDATED_DC, VALIDATED_RP, APPROVED, REJECTED) |
| 12 | Gestion multi-sociétés et multi-profils | ⚠️ Partiel | `user_company_roles` table + `get_role_for_company()` RPC. Missing: company switcher UI, company-scoped data filtering |

---

## Database Schema

### Core Tables
| Table | Purpose |
|-------|---------|
| `companies` | Organization entities (FRMG, ATH) |
| `departments` | Department groupings per company |
| `utilisateurs` | User profiles, roles, balances, contact info, admin fields |
| `leave_requests` | Leave requests with full approval chain fields |
| `mission_requests` | Mission orders with approval chain |
| `leave_balance_history` | Audit trail for balance changes |
| `notifications` | In-app notification system |
| `holidays` | Company holidays (recurring + one-time) |
| `working_days` | Working day config per company (with half-day morning/afternoon) |
| `audit_logs` | General audit trail |

### New Feature Tables
| Table | Purpose |
|-------|---------|
| `personnel_categories` | Employee categories with annual leave entitlement |
| `monthly_balance_accrual` | Monthly accrual tracking per user/year/month |
| `recovery_requests` | Recovery day requests (employee → manager validation) |
| `recovery_balance_lots` | Recovery day expiration tracking (expires June 30 N+1) |
| `leave_request_details` | Per-day type breakdown for mixed CONGE+RECUPERATION requests |
| `user_company_roles` | Multi-company role assignment |

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

### Row-Level Security (RLS)
- Employees can only read/update their own requests
- Managers (`is_manager()`) can read all requests and validate
- Managers can insert leave/mission requests on behalf of employees
- CHEF_SERVICE scoped to same department via `can_manage_user()`
- Recovery requests: employees see own, managers validate
- Notification access restricted to the target user

### SQL Migration Files
| File | Purpose |
|------|---------|
| `01_tables.sql` | Enums, core tables, indexes, helper functions |
| `02_rls_triggers.sql` | All RLS policies and triggers |
| `03_rpcs.sql` | Approval/rejection RPCs for leave + mission workflows |
| `04_grants_seed.sql` | Permissions and seed data |
| `05_new_features.sql` | All Req #1–12 tables, RPCs, RLS, and indexes |

---

## User Roles

| Role | Access |
|------|--------|
| `EMPLOYEE` | Own requests, own calendar, own profile, recovery requests |
| `RH` | All requests, Kanban stage 1, employee directory, settings, balance init, recovery validation |
| `CHEF_SERVICE` | Department requests, Kanban stage 2, employee directory, recovery validation (dept) |
| `DIRECTEUR_EXECUTIF` | All requests, Kanban stage 3 (final approval), employee directory |
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
├── api/health/route.ts               Health check endpoint
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
└── add-employee-dialog.tsx           Employee creation dialog

lib/
├── constants.ts                      Roles, statuses, labels, helpers
├── utils.ts                          cn() utility
├── leave-utils.ts                    Working day calc, half-day, seniority, accrual
├── types/database.ts                 TypeScript types for all entities
├── hooks/use-current-user.ts         Current user hook with DB refresh
└── supabase/
    ├── client.ts                     Browser Supabase client
    └── server.ts                     Server Supabase client

database/
├── 01_tables.sql                     Enums, tables, indexes, helpers
├── 02_rls_triggers.sql               RLS policies
├── 03_rpcs.sql                       Approval workflow RPCs
├── 04_grants_seed.sql                Grants and seed data
└── 05_new_features.sql               Req #1-12 implementation

middleware.ts                          Session refresh middleware
Dockerfile                             Multi-stage Docker build
```

---

## Deployment

- **Docker:** Multi-stage Dockerfile with Next.js standalone output
- **Platform:** Dokploy (self-hosted)
- **Port:** 3000
- **Health check:** `GET /api/health` → `{ ok: true, service: "smartflow-conge" }`
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Pending / Not Yet Fully Implemented

| Item | Priority | Notes |
|------|----------|-------|
| Req #9: Per-day type selection in leave form | High | DB ready, needs form UI for mixed CONGE+RECUPERATION per day |
| Req #9: Split balance deduction on approve | High | `approve_leave_request()` needs to query `leave_request_details` |
| Req #9: Detail view per-day breakdown | Medium | Show which days are congé vs récupération |
| Req #10: Automated cron for `expire_recovery_days()` | Medium | SQL function exists, needs pg_cron or Edge Function trigger |
| Req #10: UI expiration warnings | Low | Show expiration date and approaching-expiry alerts |
| Req #12: Company switcher UI | Medium | DB structure ready, needs frontend company selector |
| Req #12: Company-scoped data filtering | Medium | Filter all queries by active company |
| Real-time notifications (Supabase subscriptions) | Low | Currently requires page refresh |
| Export leave reports (PDF/CSV) | Low | HR reporting needs |
| Email notifications on approval/rejection | Low | Currently in-app only |
| Dark mode toggle | Low | Theme variables exist, no toggle UI |

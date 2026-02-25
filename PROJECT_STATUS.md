# FRMG - Gestion des Conges | Project Status

> **Last updated:** 18 February 2026
> **Branch:** `codex/dokploy-ready`
> **Build status:** Passing

---

## Overview

Leave management platform built for the **Federation Royale Marocaine de Golf (FRMG)**. Handles employee leave requests, multi-stage approval workflows, balance tracking, team calendar, and employee directory.

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
- [x] Stats cards: balance conge, balance recuperation, pending count, approved count
- [x] Interactive month calendar with color-coded request bars
- [x] Recent requests list with tab filtering (all / pending / approved / rejected)
- [x] Role-aware: managers see all requests, employees see only their own

### Leave Request Creation (`/dashboard/new-request`)
- [x] 4-step wizard: Type > Dates > Details > Review
- [x] Type selection: CONGE or RECUPERATION
- [x] Date picker with automatic working-day calculation
- [x] Balance validation (cannot exceed available days)
- [x] Overlap detection with existing requests
- [x] Replacement person selector (multi-employee search)
- [x] **On-behalf creation** — managers (RH, Chef de Service, Directeur, Admin) can create requests for any employee
- [x] Notification sent to employee when request is created on their behalf

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
- [x] 3-stage pipeline: RH Personnel > Chef de Service > Directeur Executif
- [x] Drag-and-drop cards between columns
- [x] Approve / Reject buttons with confirmation
- [x] Reject dialog with mandatory reason input
- [x] Inline date editing on request cards
- [x] Search and type filters
- [x] Separate rejected section with **undo reject** (restore to PENDING)
- [x] **Undo approve** — revert a validated request to its previous stage
- [x] Visual amber "Annuler la validation" and blue "Restaurer la demande" buttons

### Calendar (`/dashboard/calendar`)
- [x] Full-month view with day cells
- [x] Request bars color-coded by status
- [x] "+N more" indicator when multiple requests overlap a day
- [x] Click request bar to navigate to detail page
- [x] Month navigation + "Today" button
- [x] Legend with status color key

### Employee Directory (`/dashboard/employees`)
- [x] Searchable list with fuzzy French-accent-aware search
- [x] Employee cards showing KPIs (total requests, approved days, pending)
- [x] Role badges with color coding
- [x] Click to view employee detail page

### Employee Detail (`/dashboard/employees/[id]`)
- [x] Profile card: name, email, phone, job title, role
- [x] Balance display: conge + recuperation
- [x] Summary stats: total requests, requested days, approved days, pending, rejected
- [x] Full leave request history with status badges

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
- [x] Role-aware navigation (Validations only visible to managers)
- [x] "Nouvelle demande" quick-action button
- [x] Profile section with generic avatar and logout
- [x] Mobile hamburger menu with notification badge
- [x] Responsive collapse behavior

---

## Database Schema

### Tables
| Table | Purpose |
|-------|---------|
| `companies` | Organization entities |
| `departments` | Department groupings |
| `utilisateurs` | User profiles, roles, balances, contact info |
| `leave_requests` | Leave requests with full approval chain fields |
| `leave_balance_history` | Audit trail for balance changes |
| `notifications` | In-app notification system |
| `holidays` | Company holidays |
| `working_days` | Working day configuration per company |

### Approval Chain Fields (on `leave_requests`)
```
status → PENDING → VALIDATED_RP → VALIDATED_DC → APPROVED
         (or REJECTED at any stage)

approved_by_rp / approved_at_rp  → RH Personnel
approved_by_dc / approved_at_dc  → Chef de Service
approved_by_de / approved_at_de  → Directeur Executif
rejected_by / rejected_at / rejection_reason
```

### Row-Level Security (RLS)
- Employees can only read/update their own requests
- Managers (`is_manager()` function) can read all requests and validate
- Managers can insert leave requests on behalf of employees
- Notification access restricted to the target user

### SQL Migrations (in order)
1. `FINAL_MIGRATION.sql` — schema, enums, tables, indexes
2. `FINAL_AUTH_MIGRATION.sql` — Supabase Auth user sync
3. `RLS_POLICIES.sql` — all RLS policies
4. `APPROVAL_RPC_MIGRATION.sql` — RPC functions for approval workflows
5. `REMOVE_TRESORIER_STAGE.sql` — removed Tresorier from pipeline
6. `ALLOW_MANAGER_INSERT_MIGRATION.sql` — enables on-behalf request creation

---

## User Roles

| Role | Access |
|------|--------|
| `EMPLOYEE` | Own requests, own calendar, own profile |
| `RH` | All requests, Kanban stage 1 (RH validation), employee directory |
| `CHEF_SERVICE` | All requests, Kanban stage 2 (Chef validation), employee directory |
| `DIRECTEUR_EXECUTIF` | All requests, Kanban stage 3 (final approval), employee directory |
| `ADMIN` | Full access, all Kanban stages |
| `TRESORIER_GENERAL` | Legacy role (removed from pipeline, still in DB) |

---

## Project Structure

```
app/
├── layout.tsx                    Root layout (fonts, metadata, toast)
├── page.tsx                      Redirect to /login
├── login/page.tsx                FRMG-branded login
├── globals.css                   Theme, variables, animations
├── api/health/route.ts           Health check endpoint
└── dashboard/
    ├── layout.tsx                Sidebar, auth guard, navigation
    ├── page.tsx                  Dashboard home (stats + calendar)
    ├── new-request/page.tsx      4-step leave wizard
    ├── requests/page.tsx         Requests list
    ├── requests/[id]/page.tsx    Request detail
    ├── validations/page.tsx      Kanban validation board
    ├── calendar/page.tsx         Month calendar view
    ├── employees/page.tsx        Employee directory
    ├── employees/[id]/page.tsx   Employee detail
    ├── profile/page.tsx          User profile
    └── notifications/page.tsx    Notification center

components/ui/                    12 shadcn/ui components
lib/
├── constants.ts                  Shared roles, statuses, helpers
├── utils.ts                      cn() utility
├── types/database.ts             TypeScript types for all entities
└── supabase/
    ├── client.ts                 Browser Supabase client
    └── server.ts                 Server Supabase client

database/                         8 SQL migration files
middleware.ts                     Session refresh middleware
Dockerfile                        Multi-stage Docker build
```

---

## Code Quality (Recent Cleanup)

- Extracted shared constants to `lib/constants.ts` — eliminated 6+ duplicate `MANAGER_ROLES` arrays and 4+ duplicate status helper functions
- Removed debug `console.log` / `console.warn` statements from production code
- Fixed React hooks ordering violation (useMemo before early return)
- Fixed native date picker accent color to match brand theme
- All branding updated from "SMARTFLOW" to "FRMG"
- Build passes cleanly with zero TypeScript errors

---

## Deployment

- **Docker:** Multi-stage Dockerfile with Next.js standalone output
- **Platform:** Dokploy (self-hosted)
- **Port:** 3000
- **Health check:** `GET /api/health` → `{ ok: true, service: "smartflow-conge" }`
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Pending / Not Yet Implemented

| Item | Priority | Notes |
|------|----------|-------|
| Run `ALLOW_MANAGER_INSERT_MIGRATION.sql` in production | High | Required for on-behalf feature to work |
| Migrate `middleware.ts` to Next.js 16 `proxy` convention | Medium | Deprecation warning on build |
| Real-time notifications (Supabase subscriptions) | Medium | Currently requires page refresh |
| Export leave reports (PDF/CSV) | Medium | HR reporting needs |
| Email notifications on approval/rejection | Low | Currently in-app only |
| Dark mode toggle | Low | Theme variables exist, no toggle UI |
| Holiday calendar integration | Low | Table exists, not used in day calculation |
| Balance auto-deduction on final approval | Low | Currently manual |

---

## Git History

```
8e74532 Redesign login with FRMG branding, warm neutral tones, golf accents
89bd449 Redesign login page with golf-themed illustration and animations
6c41bb6 Add approval workflow, validations page, RLS policies, and test data
980a21c Improve mobile UI, theme consistency, and multi-step leave request wizard
9103155 Add MDDF business and AI agent context guide
ae62ae7 Add Dokploy deployment setup guide
f8c0b6d Add Dokploy env template and CI image workflow
97d4b01 Prepare clean Dokploy-ready SmartFlow app
```

**Uncommitted changes (current session):**
- FRMG branding everywhere (sidebar, login, metadata)
- On-behalf leave creation for managers
- Kanban undo buttons restyled (amber/blue)
- Shared constants extraction + deduplication cleanup
- Generic person avatars with FRMG logo badge
- Date picker accent color fix
- Profile section redesign

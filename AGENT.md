# AGENT.md — SmartFlow Conge

> Context file for AI coding assistants working on this project.

## Project Overview

**SmartFlow Conge** is a leave-management platform built for the **Federation Royale Marocaine de Golf (FRMG)**. It handles employee leave requests, multi-stage approval workflows, mission orders, and leave balance tracking — all compliant with Moroccan labor law.

## Tech Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Framework      | Next.js 16 (App Router, standalone) |
| Language       | TypeScript 5 (strict mode)          |
| UI             | React 19 + Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Backend / DB   | Supabase (PostgreSQL + Auth + RLS)  |
| Dates          | date-fns 4 (French locale)         |
| Icons          | lucide-react                        |
| Deployment     | Docker (multi-stage) → Dokploy      |

## Project Structure

```
app/
├── layout.tsx                 # Root layout (fonts, metadata, toaster)
├── page.tsx                   # Redirects to /login
├── login/page.tsx             # FRMG-branded login page
├── api/health/route.ts        # Health check endpoint
└── dashboard/
    ├── layout.tsx             # Sidebar, auth guard, navigation
    ├── page.tsx               # Dashboard home (KPIs + calendar)
    ├── new-request/page.tsx   # 4-step leave request wizard
    ├── requests/              # Leave requests list + detail
    ├── validations/page.tsx   # Kanban approval board
    ├── calendar/page.tsx      # Full-month calendar view
    ├── employees/             # Employee directory + detail
    ├── missions/              # Mission list + detail
    ├── new-mission/page.tsx   # Mission creation wizard
    ├── profile/page.tsx       # User profile + password change
    ├── notifications/page.tsx # Notification center
    └── settings/page.tsx      # Settings (placeholder)

components/
├── ui/                        # 18 shadcn/ui components (button, card, badge, calendar, etc.)
├── print-leave-document.tsx   # Printable leave request (A4)
└── print-mission-document.tsx # Printable mission order (A4)

lib/
├── constants.ts               # Shared constants: roles, statuses, labels (French)
├── types/database.ts          # TypeScript types for all DB entities
├── utils.ts                   # Utility functions (cn)
├── leave-utils.ts             # Moroccan labor law calculations, working-day counting
└── supabase/
    ├── client.ts              # Browser Supabase client
    └── server.ts              # Server-side Supabase client

database/                      # SQL migrations (run in order)
```

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm start            # Start production server
```

Docker:
```bash
docker build -t smartflow-conge .
docker run -p 3000:3000 smartflow-conge
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Database

### Core Tables

- **`utilisateurs`** — User profiles (name, email, role, balances, HR identifiers like matricule/CIN/CNSS/RIB, hire date, department)
- **`leave_requests`** — Leave requests with 3-stage approval chain fields (`approved_by_rp`, `approved_by_dc`, `approved_by_de`)
- **`mission_requests`** — Mission/travel orders with same approval chain
- **`departments`** / **`companies`** — Organizational structure
- **`holidays`** — Company holidays (recurring or fixed date)
- **`working_days`** — Working day configuration per company (default: Mon-Sat)
- **`leave_balance_history`** — Audit trail of balance changes
- **`notifications`** — In-app notification system
- **`audit_logs`** — Change tracking

### Approval Chain

```
PENDING → VALIDATED_RP (RH) → VALIDATED_DC (Chef de Service) → APPROVED (Directeur Exécutif)
Any stage can → REJECTED (with reason)
```

### Roles

```
EMPLOYEE | CHEF_SERVICE | RH | DIRECTEUR_EXECUTIF | ADMIN
```

Manager roles (`CHEF_SERVICE`, `RH`, `DIRECTEUR_EXECUTIF`, `ADMIN`) have elevated read/write access via RLS policies.

### Migrations

Run in order from `database/`:
1. `FINAL_MIGRATION.sql` — Schema, enums, tables, indexes
2. `FINAL_AUTH_MIGRATION.sql` — Auth user sync
3. Additional migrations as needed (RLS, approval RPCs, missions, Moroccan labor law, etc.)

## Key Domain Logic

### Moroccan Labor Law (`lib/leave-utils.ts`)

- **Base entitlement**: 18 working days/year (Article 231)
- **Seniority bonus**: +1.5 days per 5-year period, max 30 days total (Article 232)
- **Working days**: Monday–Saturday (Moroccan standard, configurable per company)
- **Holidays** excluded from day counts
- Functions: `countWorkingDays()`, `calculateSeniority()`, `isWorkingDay()`, `isHoliday()`

### Leave Request Creation (`app/dashboard/new-request/page.tsx`)

4-step wizard:
1. Type selection (CONGE or RECUPERATION)
2. Date picker with automatic working-day calculation
3. Details (reason, replacement person, comments)
4. Review and submit

Includes overlap detection, balance validation, and on-behalf creation by managers.

### Validation Kanban (`app/dashboard/validations/page.tsx`)

3-column board: RH Personnel → Chef de Service → Directeur Exécutif. Supports approve/reject with confirmation, inline date editing, undo actions, search and type filtering.

## Architecture Patterns

- **All UI text is in French** — labels, validation messages, date formats, role names
- **No separate API layer** — pages fetch directly from Supabase client-side using `@supabase/supabase-js`
- **Auth**: Supabase Auth with cookie-based sessions (`@supabase/ssr`), refreshed by `middleware.ts`
- **State**: React hooks only (no Redux/Zustand) — `useState`, `useEffect`, `useMemo`
- **Path aliases**: `@/*` maps to project root
- **Component variants**: `class-variance-authority` (cva) for button/badge variants
- **Styling**: Tailwind utility classes; CSS custom properties for theme tokens in `globals.css`
- **FRMG branding**: Warm neutral tones, golf-themed elements on login page

## Conventions

- Shared constants (roles, statuses, labels) live in `lib/constants.ts` — do not duplicate
- Types for all DB entities live in `lib/types/database.ts`
- Use `isManagerRole(role)` from constants to check elevated access
- Use `getStatusLabel()` / `getStatusClass()` for consistent status rendering
- Date formatting uses `date-fns` with `fr` locale — never raw `toLocaleDateString`
- New UI components should use shadcn/ui patterns (`components/ui/`)
- Leave calculations must use `lib/leave-utils.ts` functions — do not manually count days

## What's Not Yet Implemented

- Real-time notifications (Supabase subscriptions — currently requires page refresh)
- Export reports (PDF/CSV)
- Email notifications (currently in-app only)
- Dark mode toggle UI (theme CSS vars exist)
- Automatic balance deduction on approval (currently manual)
- Middleware migration to Next.js 16 `proxy` convention

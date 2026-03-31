# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SmartFlow Conge** is a leave-management platform for the Federation Royale Marocaine de Golf (FRMG) and affiliated companies (ATH). It handles leave requests, 3-stage approval workflows, mission orders, recovery day management, and monthly balance accrual — all compliant with Moroccan labor law.

## Commands

```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npm test                 # Run all tests (vitest)
npm run test:watch       # Vitest watch mode
npx vitest run __tests__/leave-utils.test.ts  # Run a single test file
```

Docker:
```bash
docker build -t smartflow-conge .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... smartflow-conge
```

## Tech Stack

- **Next.js 16** (App Router, standalone output) + **React 19** + **TypeScript 5** (strict)
- **Supabase** (PostgreSQL + Auth + RLS) — no separate API layer, pages query Supabase directly
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives) for components
- **date-fns 4** with French locale for all date formatting
- **Vitest** for testing (`__tests__/**/*.test.ts`)
- Docker multi-stage build deployed via Dokploy

## Architecture

### Authentication

Supabase Auth with cookie-based sessions via `@supabase/ssr`. `middleware.ts` refreshes sessions on every request. The browser client (`lib/supabase/client.ts`) proxies through `/api/supabase-proxy` to avoid SSL issues. The server client (`lib/supabase/server.ts`) uses `SUPABASE_INTERNAL_URL` for Docker internal networking. Fixed auth storage key: `sb-conge-auth-token`.

### Multi-Company Role System

Users can belong to multiple companies with different roles at each. The `user_company_roles` table maps user -> company -> role (with `is_home` flag). `CompanyProvider` (`lib/hooks/use-company-context.tsx`) manages the active company, calling `set_active_company()` RPC to set a PostgreSQL session variable. All RLS policies scope data via `get_active_company_id()`.

### Permission System (Two-Layer)

1. **Static config** (`lib/permissions.ts`): `ROLE_PERMISSIONS` matrix mapping roles to sidebar items, pages, actions, and data scopes
2. **DB overrides** (`role_permissions` table): runtime customization per company, loaded by `use-db-permissions.tsx`

Five roles: `EMPLOYEE` < `CHEF_SERVICE` < `RH` < `DIRECTEUR_EXECUTIF` < `ADMIN`. Use `isManagerRole(role)` from constants to check elevated access. Guards: `RoleGate` (conditional render), `PageGuard` (full-page protection).

### Leave Request Workflow

Status pipeline: `PENDING -> VALIDATED_RP (RH) -> VALIDATED_DC (Chef) -> APPROVED (Director)`. Any stage can reject with reason + signature.

The new-request wizard (`app/dashboard/new-request/page.tsx`) uses **segment-based** creation — users build ordered blocks mixing CONGE + RECUPERATION types. Each segment has its own date range, half-day support, and working-day count.

Validation happens on a Kanban board (`app/dashboard/validations/page.tsx`) with 3 columns, drag-and-drop, approve/reject with digital signatures, and undo actions.

### Monthly Balance Accrual

`utilisateurs.balance_conge` stores the annual total set by RH. The frontend calculates availability: `availableNow = (annualTotal / 12 * currentMonth) - used - pending`. The `calculateMonthlyAccrual()` function in `lib/leave-utils.ts` handles this. The SQL `accrue_monthly_balance()` only writes audit records — it never modifies `balance_conge`.

### Moroccan Labor Law (`lib/leave-utils.ts`)

- Base: 18 working days/year (Article 231)
- Seniority: +1.5 days per 5-year period, max 30 total (Article 232)
- Max balance cap: 52 days (Article 240)
- Working days default Mon-Sat (configurable per company/department)
- Key functions: `countWorkingDays()`, `calculateSeniority()`, `calculateMonthlyAccrual()`, `isWorkingDay()`

### Recovery Days

Recovery requests (for weekend/holiday work) are tracked in `recovery_balance_lots` with 1-year expiration. Types: `JOUR_FERIE`, `JOUR_REPOS`, `SAMEDI`, `DIMANCHE`. Max 5 consecutive recovery days per segment.

### Mission Orders

Separate 3-stage pipeline (Chef -> RH -> Director). Created via wizard with transport type, tariff grid, LOCAL/INTERNATIONAL scope. Validated on a separate Kanban board (`app/dashboard/mission-validations/page.tsx`).

## Key Conventions

- **All UI text is French** — labels, validation messages, date formats, role names
- **State management**: React hooks only (no Redux/Zustand)
- **Path alias**: `@/*` maps to project root
- **Constants**: roles, statuses, labels in `lib/constants.ts` — do not duplicate
- **Types**: all DB entity interfaces in `lib/types/database.ts`
- **Status rendering**: use `getStatusLabel()` / `getStatusClass()` from constants
- **Leave calculations**: always use `lib/leave-utils.ts` — never count days manually
- **Balance rounding**: use `roundHalf()` (nearest 0.5)
- **UI components**: follow shadcn/ui patterns from `components/ui/`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL (browser + server)
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key
SUPABASE_INTERNAL_URL           # Docker internal URL (server-side only, bypasses SSL)
```

## Database Migrations

Sequential SQL files in `database/` — run in numbered order (01 through 20). `COMPLETE_SCHEMA.sql` is a reference snapshot. Mission-specific schema is in `database/missions_tables/`.

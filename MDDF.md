# MDDF - SmartFlow Conge Business + AI Agent Context

## 1) Business Context

SmartFlow Conge is a leave-management platform used to manage employee leave requests, approval workflows, balances, and visibility across teams.

Primary goals:
- Reduce manual HR/manager coordination for leave.
- Standardize approval flow and status tracking.
- Give employees clear visibility on leave balances and request history.
- Provide leadership with clean, actionable operational visibility.

Business value:
- Faster decision cycle for requests.
- Fewer approval mistakes.
- Better workforce planning and absence transparency.
- Auditable process for HR and finance.

## 2) Users and Roles

Current role model (from database/application):
- `EMPLOYEE`: Creates and tracks own leave requests.
- `CHEF_SERVICE`: First-level manager validation.
- `RESPONSABLE_PERSONNEL`: HR validation stage.
- `TRESORIER_GENERAL`: Finance/control stage.
- `DIRECTEUR_EXECUTIF`: Final executive approval stage.
- `ADMIN`: Platform/system administration.

## 3) Core Functional Flows

### Authentication
- Users log in through Supabase Auth (`/login`).
- User profile data is fetched from `utilisateurs`.

### Leave Request Lifecycle
- User creates request (`CONGE` or `RECUPERATION`).
- Request moves through validation statuses.
- Final states: `APPROVED` or `REJECTED`.

### Employee Visibility
- Employee list view with search/filter.
- Detail view shows leave history and summary KPIs.

### Dashboards
- Personal and operational KPI cards.
- Recent requests and quick actions.

## 4) Status Model (Operational)

Key statuses used in app:
- `PENDING`
- `VALIDATED_DC`
- `VALIDATED_RP`
- `VALIDATED_TG`
- `VALIDATED_DE`
- `APPROVED`
- `REJECTED`

Interpretation:
- `PENDING` + `VALIDATED_*` are in-progress.
- `APPROVED` means accepted/consumed.
- `REJECTED` means denied.

## 5) Data and System Context

Stack:
- Frontend/App: Next.js (App Router), React, Tailwind.
- Backend/Data/Auth: Supabase (Postgres + Auth).
- Hosting: Dokploy (Docker-based deployment).

Important tables:
- `utilisateurs`
- `leave_requests`
- `departments`
- `companies`
- `notifications`
- `leave_balance_history`

Migration files:
- `database/FINAL_MIGRATION.sql`
- `database/FINAL_AUTH_MIGRATION.sql`

## 6) Design Language Context

Current UI direction:
- Soft, clean enterprise UI.
- Neutral gray base, reduced visual noise.
- Brand accent color: `#a3754a` (used sparingly).
- Better border visibility, less heavy shadows.
- Responsive behavior across desktop/mobile.

## 7) AI Agent Framework (Who Does What)

Use specialized AI roles to keep execution fast and clear:

### Product/PM Agent
Scope:
- Clarifies feature requirements and acceptance criteria.
- Prioritizes backlog by business impact.
Outputs:
- User stories, acceptance criteria, rollout scope.

### UX/UI Agent
Scope:
- Designs page behavior and component consistency.
- Maintains visual language and responsive behavior.
Outputs:
- UI specs, spacing/typography/color decisions, screen states.

### Frontend Agent
Scope:
- Implements pages/components and client logic.
- Handles state, filtering, table UX, loading/error states.
Outputs:
- Production-ready React/Next code with tests where possible.

### Backend/Data Agent
Scope:
- DB schema changes, SQL scripts, Supabase policies/functions.
- Query correctness and data integrity.
Outputs:
- Safe migrations, rollback notes, data contracts.

### QA Agent
Scope:
- Regression tests for critical flows (login, request creation, approvals).
- UI responsiveness checks and smoke tests after deploy.
Outputs:
- Test checklist + pass/fail report.

### DevOps Agent
Scope:
- Docker build reliability, deployment config, health checks.
- Environment variable and release process hardening.
Outputs:
- Dokploy-ready configuration and deployment runbooks.

## 8) Agent Collaboration Rules

- Single source of truth: this file + codebase + migration scripts.
- Every change must state:
  - Business reason
  - Technical change
  - Validation done
  - Risk/rollback if needed
- No direct production DB change without migration script.
- Never expose secrets in repo or logs.

## 9) Prompt Templates for AI Agents

### Product Clarification Prompt
```
You are the PM agent for SmartFlow Conge.
Given this feature request: <request>,
return:
1) business objective
2) user roles impacted
3) acceptance criteria
4) scope for this sprint vs later
```

### Frontend Implementation Prompt
```
You are the frontend agent for SmartFlow Conge.
Implement <feature> in Next.js app router.
Constraints:
- Preserve current design system
- Fully responsive
- No backend contract breaking changes
Return:
- files changed
- behavior summary
- edge cases handled
```

### Backend/Migration Prompt
```
You are the data/backend agent for SmartFlow Conge.
Need: <schema or logic change>.
Return:
- forward migration SQL
- rollback SQL
- data safety notes
- compatibility impact on existing pages
```

### QA Prompt
```
You are QA for SmartFlow Conge.
Test <feature> across desktop + mobile.
Include:
- positive cases
- validation failures
- regression checks
- final pass/fail summary
```

## 10) Deployment and Operations Checklist

Before deploy:
- `npm run build` passes.
- Env vars configured in Dokploy:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Health endpoint responds: `/api/health`.

For first production setup:
1. Run `database/FINAL_MIGRATION.sql`.
2. Run `database/FINAL_AUTH_MIGRATION.sql`.
3. Verify one test login.

After deploy:
- Smoke test: login, dashboard, new request, employee list/details.
- Verify no console/runtime errors in production logs.

## 11) Security and Governance

- Do not commit `.env`/secrets.
- Keep service-role keys outside frontend runtime.
- Limit DB write access to intended paths only.
- Preserve auditability for approval decisions and timestamps.

## 12) Current Priority Roadmap

1. Stabilize production deployment in Dokploy.
2. Complete role-based filtering/reporting enhancements.
3. Add stronger request lifecycle notifications.
4. Add automated regression test suite for key user journeys.

# SmartFlow Conge (Dokploy Ready)

Modern leave-management app (Next.js + Supabase), prepared for Dokploy deployment.

## 1) Required Environment Variables

Set these in Dokploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

You can copy from `.env.example`.

## 2) Database Setup (Supabase)

Run SQL in this order from `database/`:

1. `FINAL_MIGRATION.sql`
2. `FINAL_AUTH_MIGRATION.sql`

This creates required tables/data and auth users used by `/login`.

## 3) Local Run

```bash
npm install
npm run dev
```

## 4) Production Build Check

```bash
npm ci
npm run build
```

## 5) Dokploy Deployment (Recommended)

Use a Dokploy **Application** from Git with **Dockerfile** build type.

- Repository: this repo
- Branch: `main` (or your deploy branch)
- Build Type: `Dockerfile`
- Dockerfile Path: `./Dockerfile`
- Exposed/Internal Port: `3000`
- Health Check Path: `/api/health`

The app image is built with multi-stage Docker and runs a standalone Next.js server.

## 6) Post-Deploy Smoke Tests

- Open `/login`
- Authenticate with a migrated user
- Open `/dashboard`
- Create a leave request
- Open `/dashboard/employees` and employee details


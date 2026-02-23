# Dokploy Deployment Setup

## Recommended Method (Production)

Use prebuilt Docker images from CI, then deploy image in Dokploy.

Why:
- Faster deploys
- Reproducible builds
- Matches Dokploy production guidance

This repo includes: `.github/workflows/docker-publish.yml`

It publishes:
- `ghcr.io/<owner>/<repo>:latest`
- `ghcr.io/<owner>/<repo>:<commit-sha>`

## Dokploy Configuration

### Option A: Deploy from Docker Image (recommended)

1. In Dokploy, create an app with **Docker** source.
2. Image: `ghcr.io/<owner>/<repo>:latest`
3. Port: `3000`
4. Health check path: `/api/health`
5. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Option B: Deploy from Git + Dockerfile

1. In Dokploy, create an app with **Git** source.
2. Build type: **Dockerfile**
3. Dockerfile path: `./Dockerfile`
4. Port: `3000`
5. Health check path: `/api/health`
6. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Database Migration (once, before first production login)

Run in Supabase SQL editor:
1. `database/FINAL_MIGRATION.sql`
2. `database/FINAL_AUTH_MIGRATION.sql`

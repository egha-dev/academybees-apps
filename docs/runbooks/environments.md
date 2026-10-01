# Runbook — Environments, deploys and secrets

Decisions: OD-03 (vendors), OD-21 (Sentry, remote cache), C-44 (free GitHub plan), C-48 (deploy mechanics).
**Secrets are listed by name only. Never paste a value into the repository, an issue or a PR.**

## Environments

| | local | ci | staging | production |
| --- | --- | --- | --- | --- |
| `APP_ENV` | `local` | `ci` | `staging` | `production` |
| Web | `next dev` :3000 | `next start` (E2E) | Vercel project *academybee-staging* | Vercel project *academybee* (Phase 7P) |
| API / worker | `pnpm dev` :4000 | built `dist/` | Render Docker services, Singapore | Render (India region re-checked before 7P) |
| PostgreSQL 17 | compose | Testcontainers / compose | Supabase, Mumbai | Supabase |
| Redis | compose | Testcontainers / compose | Upstash, Mumbai | Upstash |
| Deployed by | — | — | `deploy-staging.yml` after green CI on `main` | `deploy-production.yml`, PO-only `workflow_dispatch` of a `v*` tag |

## How a staging deploy works (C-48)

1. A PR merges to `main` → **CI** runs → on success **Deploy staging** starts (only if `STAGING_ENABLED` is `true`).
2. **build images**: `apps/api/Dockerfile` and `apps/worker/Dockerfile` → `ghcr.io/egha-dev/academybee-{api,worker}:<sha>` and `:staging`.
3. **migrate**: `pnpm db:deploy` as `ab_migrator` (direct connection) — migrations and `prisma/sql/*.sql` grants run **before** new code.
4. **backend**: Render deploy hooks pull the new images.
5. **web**: Vercel CLI builds and deploys the web app (prebuilt).
6. **smoke**: waits until `<web>/api/v1/health/live` reports the new commit, then checks `/api/health/ready` (DB + Redis through the web origin), `/`, `/offline`, and that `/flag-probe` is **404** (release flag off).

Rollback: re-run *Deploy staging* (`workflow_dispatch`) on the previous good commit, or redeploy the previous image tag from the Render dashboard. Migrations are forward-only (expand → migrate → contract), so the previous code keeps working against the newer schema.

## GitHub repository variables (Settings → Secrets and variables → Actions → Variables)

| Name | Example | Purpose |
| --- | --- | --- |
| `STAGING_ENABLED` | `true` | Turns the staging deploy on (unset = skipped with a notice) |
| `STAGING_WEB_URL` | `https://staging.academybee.com` | Smoke-check target |
| `PRODUCTION_ENABLED` | *(unset until 7P)* | Allows `deploy-production.yml` |
| `PRODUCTION_WEB_URL` | `https://academybee.com` | Smoke-check target |
| `PO_LOGIN` | `egha-dev` | The only account allowed to deploy production |
| `TURBO_TEAM` | *(Vercel team slug)* | Turborepo remote cache (optional) |

## GitHub repository secrets

| Name | Used by | Notes |
| --- | --- | --- |
| `STAGING_MIGRATOR_DATABASE_URL` | migrate | `ab_migrator`, **direct** Postgres connection (port 5432) |
| `STAGING_RENDER_DEPLOY_HOOK_API` | backend | Render → API service → Settings → Deploy hook |
| `STAGING_RENDER_DEPLOY_HOOK_WORKER` | backend | Render → worker service → Deploy hook |
| `STAGING_VERCEL_PROJECT_ID` | web | Vercel project settings |
| `VERCEL_TOKEN` | web | Vercel account token (scoped to the team) |
| `VERCEL_ORG_ID` | web | Vercel team ID |
| `TURBO_TOKEN` | CI | Turborepo remote cache (optional) |
| `PRODUCTION_*` | production | Same names with the `PRODUCTION_` prefix (Phase 7P) |

`GITHUB_TOKEN` pushes images to GHCR; no extra secret is needed.

## Render services (staging)

Both services: **Deploy an existing image** from `ghcr.io/egha-dev/academybee-<app>:staging`, with a GHCR registry credential (a GitHub token with `read:packages`). Region: Singapore. Auto-deploy **off** (the workflow triggers deploys).

**academybee-api-staging** — Web Service, port `4000`, health check path `/api/v1/health/live`.

| Env var | Value / source |
| --- | --- |
| `APP_ENV` | `staging` |
| `PORT` | `4000` |
| `DATABASE_URL` | `ab_app` via the Supabase **transaction pooler** (port 6543) |
| `REDIS_URL` | Upstash `rediss://…` |
| `TRUSTED_PROXY_SECRET` | random ≥ 32 chars; **same value** as on Vercel |
| `TRUSTED_PROXY_IPS` | empty (the secret header is used instead) |
| `PLATFORM_ROOT_DOMAIN` | `staging.academybee.com` (C-52) |
| `ANALYTICS_HASH_SALT` | random ≥ 32 chars |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | optional (no-op adapter when empty) |
| `SENTRY_DSN` | optional (off when empty) |
| `PAYMENT_PROVIDERS` | `manual` (the simulator is refused in production by config validation) |

**academybee-worker-staging** — Background Worker.

| Env var | Value / source |
| --- | --- |
| `APP_ENV` | `staging` |
| `DATABASE_URL` | `ab_app` via the transaction pooler |
| `PLATFORM_DATABASE_URL` | `ab_platform` via the transaction pooler |
| `REDIS_URL` | same Upstash database as the API |
| `ANALYTICS_HASH_SALT` | same value as the API |
| `POSTHOG_API_KEY`, `POSTHOG_HOST`, `SENTRY_DSN` | optional |

## Vercel project (staging)

*academybee-staging*: import the GitHub repo, **Root Directory `apps/web`**, framework Next.js; `apps/web/vercel.json` sets install/build. Git auto-deploys **off** (the workflow deploys).

| Env var (Production scope of this project) | Value |
| --- | --- |
| `APP_ENV` | `staging` |
| `API_ORIGIN` | the Render API URL, e.g. `https://academybee-api-staging.onrender.com` |
| `TRUSTED_PROXY_SECRET` | same value as the API |
| `PLATFORM_ROOT_DOMAIN` | `staging.academybee.com` (C-52) |
| `NEXT_PUBLIC_APP_ENV` | `staging` |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` | optional (off when empty; the browser DSN is fixed at build time) |

Domains: `staging.academybee.com` now; `*.staging.academybee.com` wildcard arrives with Phase 1 (Vercel DNS, C-31).

## Supabase (staging)

1. Create the project in Mumbai (PostgreSQL 17).
2. Create the roles once: `infra/postgres/managed/roles.sql` (instructions in the file), with three new random passwords stored only in the secret store.
3. Connection strings: **direct** (5432) for `ab_migrator` (GitHub secret); **transaction pooler** (6543) for `ab_app` / `ab_platform` (Render env).
4. First deploy runs the migrations; verify with `pnpm db:drift` from a machine that has the migrator URL.

## Upstash (staging)

Redis database in Mumbai with TLS. Set **eviction off** (`noeviction`): BullMQ must never lose queued jobs.

## Turning staging on

1. Create the accounts and services above; add the secrets and variables.
2. Set `STAGING_ENABLED=true`.
3. Run **Deploy staging** manually once (Actions → Deploy staging → Run workflow) and watch the smoke job.
4. From then on every green merge to `main` deploys automatically.

## Local Docker check

```bash
docker build -f apps/api/Dockerfile -t academybee-api .
docker build -f apps/worker/Dockerfile -t academybee-worker .
pnpm infra:up
docker run --rm --network academybee_default -e APP_ENV=staging \
  -e DATABASE_URL=postgresql://ab_app:ab_app_local@postgres:5432/academybee \
  -e REDIS_URL=redis://redis:6379 -e TRUSTED_PROXY_SECRET=local-check-secret-0123 \
  -e ANALYTICS_HASH_SALT=local-check-salt academybee-api
```

Images run as the non-root `node` user with `tini` as PID 1, so `SIGTERM` on deploy shuts the API and worker down gracefully.

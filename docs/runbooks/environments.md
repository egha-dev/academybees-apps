# Runbook — Environments, deploys and secrets

Decisions:
- C-69: staging and hosting (Railway, Cloudflare DNS, Vercel and Cloudflare Pages policy);
- C-70: media;
- C-71: custom domains and capacity;
- OD-22: production database;
- C-44: free GitHub plan;
- C-48: image build, migrate-before-deploy, smoke checks;
- OD-21: Sentry, remote cache.

**Secrets are listed by name only. Never paste a value into the repository, an issue or a PR.**

## Environments

| | local | ci | staging | production (from Phase 7P) |
| --- | --- | --- | --- | --- |
| `APP_ENV` | `local` | `ci` | `staging` | `production` |
| Web (Next.js) | `next dev` :3000 | `next start` (E2E) | Railway service `web` | Railway `web`; Vercel Pro from ~10 academies (C-69) |
| API / worker | `pnpm dev` :4000 | built `dist/` | Railway services `api`, `worker` | Railway |
| PostgreSQL 17 | compose | Testcontainers / compose | Railway service `postgres` | Railway Postgres with HA + PITR, or managed (OD-22, before 7P) |
| Redis | compose | Testcontainers / compose | Railway service `redis` (persistent volume) | Railway |
| Region | — | — | **Singapore**, everything in one project | Singapore (an India region is re-checked before 7P) |
| Email | Mailpit :8025 | Mailpit | Resend, `mail.staging.academybees.com` | Resend, `mail.academybees.com` |
| Media | SeaweedFS (C-45) | SeaweedFS | ImageKit when uploads ship (C-70) | ImageKit |
| DNS | `*.localhost` | `*.localhost` | Cloudflare (DNS-only records) | Cloudflare |
| Marketing site | in the web app | in the web app | — | Cloudflare Pages, if built (C-69) |
| Railway plan | — | — | Hobby | **Pro** (before the first real academy, C-71) |

## Railway staging project (S7b, C-75)

One project, **`academybees-staging`** (ID `ec0b3a3d-3b6c-4381-a2db-0abdf4b748f2`; its single environment keeps Railway's default name `production`), every service in **Southeast Asia (Singapore)** (C-55).

| Service | Source | Notes |
| --- | --- | --- |
| `postgres` | Railway PostgreSQL template, version **17** | Public TCP proxy on (`DATABASE_PUBLIC_URL`) so GitHub Actions can create roles and migrate. The app roles are created by the deploy workflow (`infra/postgres/managed/ensure-roles.sql`) |
| `redis` | Railway Redis template | Persistent volume. Redis's default `maxmemory-policy` is `noeviction`, which BullMQ needs; don't change it |
| `api` | GitHub repo `egha-dev/academybees-apps`, branch `main`, **Wait for CI**; `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` | Private only. Health check `/api/v1/health/live` |
| `worker` | Same repo and branch, **Wait for CI**; `apps/worker/Dockerfile` | Private only, no health check (Redis heartbeat) |
| `web` | Same repo and branch, **Wait for CI**; `apps/web/Dockerfile` (Next.js standalone) | Public: `staging.academybees.com` and `*.staging.academybees.com` on port 3000. Health check `/offline` |

**How deploys work (C-76):**
- Railway builds each service from its Dockerfile in the GitHub repo, once **every check on the `main` commit has passed** (Wait for CI).
- The last CI job on `main` applies the staging migrations, so new code never starts before its migrations, and a failed migration means no deploy.
- The Dockerfiles use no BuildKit cache mounts (Railway accepts only its own cache IDs).
- The running commit comes from Railway's `RAILWAY_GIT_COMMIT_SHA`.
- `railway up` from Actions was abandoned: Railway answered 404 to every upload, with project and account tokens alike (C-75, C-76).

### Secrets: generate locally, paste directly (never in chat, issues or PRs)

`scripts/staging/secrets.sh` generates every staging secret once into `~/.academybee-staging-secrets/` (mode 700), copies one value at a time to the clipboard, and can set GitHub secrets with the `gh` CLI. Values never appear on screen.

```bash
scripts/staging/secrets.sh generate                       # once
scripts/staging/secrets.sh copy SECRETS_MASTER_KEY        # → clipboard, then paste in Railway
scripts/staging/secrets.sh gh DB_APP_PASSWORD STAGING_DB_APP_PASSWORD   # → GitHub secret
scripts/staging/secrets.sh wipe                           # when everything is set
```

To rotate a value: delete its file, run `generate`, update Railway and GitHub, then redeploy. The deploy workflow re-applies database passwords on every run.

### Railway variables

Step-by-step checklist with every Raw Editor block: [`staging-variables.md`](staging-variables.md).

**Shared variables** (project → **Settings → Shared Variables**):

| Name | Value |
| --- | --- |
| `APP_ENV` | `staging` |
| `PLATFORM_ROOT_DOMAIN` | `staging.academybees.com` |
| `TRUSTED_PROXY_SECRET` | `copy TRUSTED_PROXY_SECRET` |
| `SECRETS_MASTER_KEY` | `copy SECRETS_MASTER_KEY` |
| `ANALYTICS_HASH_SALT` | `copy ANALYTICS_HASH_SALT` |
| `DB_APP_PASSWORD` | `copy DB_APP_PASSWORD` |
| `DB_PLATFORM_PASSWORD` | `copy DB_PLATFORM_PASSWORD` |

`copy X` means `scripts/staging/secrets.sh copy X` and paste. The `ab_migrator` password is only in GitHub. The runtime services never need it.

**`api`** (service → **Variables → Raw Editor**, paste, **Update Variables**):

```text
APP_ENV=${{shared.APP_ENV}}
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgresql://ab_app:${{shared.DB_APP_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}?family=0
TRUSTED_PROXY_SECRET=${{shared.TRUSTED_PROXY_SECRET}}
SECRETS_MASTER_KEY=${{shared.SECRETS_MASTER_KEY}}
ANALYTICS_HASH_SALT=${{shared.ANALYTICS_HASH_SALT}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
COOKIE_MODE=secure
CUSTOM_DOMAINS_ENABLED=false
PAYMENT_PROVIDERS=manual
```

Then add **`AUTH_SIGNING_KEYS`** as its own variable (**New Variable**, `copy AUTH_SIGNING_KEYS`). It is JSON: paste it as is, without quotes. `CONSOLE_IP_ALLOWLIST` stays unset on staging (sign-in still needs password + TOTP).

**`worker`**:

```text
APP_ENV=${{shared.APP_ENV}}
LOG_LEVEL=info
DATABASE_URL=postgresql://ab_app:${{shared.DB_APP_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
PLATFORM_DATABASE_URL=postgresql://ab_platform:${{shared.DB_PLATFORM_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}?family=0
SECRETS_MASTER_KEY=${{shared.SECRETS_MASTER_KEY}}
ANALYTICS_HASH_SALT=${{shared.ANALYTICS_HASH_SALT}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
WEB_PUBLIC_PROTOCOL=https
EMAIL_FROM=AcademyBee <no-reply@mail.staging.academybees.com>
SMTP_URL=smtps://resend:${{RESEND_API_KEY}}@smtp.resend.com:465
```

Then add **`RESEND_API_KEY`** as its own variable and paste the Resend sending-only key. `SMTP_URL` references it, so the key is stored in one place.

**`web`**:

```text
APP_ENV=${{shared.APP_ENV}}
PORT=3000
API_ORIGIN=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
TRUSTED_PROXY_SECRET=${{shared.TRUSTED_PROXY_SECRET}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
CUSTOM_DOMAINS_ENABLED=false
TRUSTED_CLIENT_IP_HEADER=x-real-ip
NEXT_PUBLIC_APP_ENV=staging
```

Notes:
- **Service names in references:** `${{postgres…}}`, `${{redis…}}` and `${{api…}}` are the service names. If yours differ in case (`Postgres`), match them.
- **`?family=0`:** lets ioredis use IPv6 on Railway's private network.
- **Client IP:** Railway's edge sets `X-Real-IP`. It is verified after the first deploy (review M1).
- **Optional:** `SENTRY_DSN` / `POSTHOG_*`.

### GitHub (repository → Settings → Secrets and variables → Actions)

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `STAGING_ADMIN_DATABASE_URL` | Railway `postgres` → Variables → `DATABASE_PUBLIC_URL` (copy icon) |
| Secret | `STAGING_DB_MIGRATOR_PASSWORD` | `gh DB_MIGRATOR_PASSWORD STAGING_DB_MIGRATOR_PASSWORD` |
| Secret | `STAGING_DB_APP_PASSWORD` | `gh DB_APP_PASSWORD STAGING_DB_APP_PASSWORD` |
| Secret | `STAGING_DB_PLATFORM_PASSWORD` | `gh DB_PLATFORM_PASSWORD STAGING_DB_PLATFORM_PASSWORD` |
| Variable | `STAGING_WEB_URL` | `https://staging.academybees.com` |
| Variable | `STAGING_ENABLED` | `true`. Set it last: from then on every merge to `main` deploys |

### Deploys (CI → Railway → `deploy-staging.yml`)

1. **CI on `main`** (`ci.yml`): verify, integration, build and E2E, then **`migrate staging`** (`db-migrate.yml`):
   - `ensure-roles.sql` as the admin user (idempotent, re-applies passwords);
   - `pnpm db:deploy` as `ab_migrator` over the public endpoint.
2. **Railway** sees every check on the commit pass and builds `api`, `worker` and `web` from GitHub. A failed build keeps the previous deployment serving.
3. **Smoke checks** (`deploy-staging.yml` → `deploy.yml`, through `STAGING_WEB_URL`). It waits up to 30 minutes for the new commit, then checks:
   - DB and Redis are ready;
   - the shell and offline page load;
   - `/t/*` is not reachable.

**Manual run:** **Actions → Deploy staging → Run workflow** re-applies roles and migrations, then runs the smoke checks against whatever is serving. To rebuild without a new commit, use **Redeploy** on the service in Railway.

**First console admin (after the first deploy):** see "Turning staging on". **Academies on staging:** dev seeds refuse to run outside local/ci. A reviewed staging bootstrap (the two gate academies and one user per role, with no shared demo password) follows in a separate S7b PR.

## DNS on Cloudflare

The registrar stays **Namecheap** (auto-renew and domain lock on); only the nameservers move to Cloudflare.

### Moving academybees.com from Namecheap to Cloudflare

1. **Cloudflare account:** sign up at `dash.cloudflare.com` and verify your email.
2. **Add the domain:** **Add a domain** → enter `academybees.com` → choose **Quick scan for DNS records** → **Continue** → select the **Free** plan.
3. **Review the scanned records:**
   - Delete Namecheap's parking records: the `www` CNAME to `parkingpage.namecheap.com` and any URL-redirect `A` records.
   - Keep anything you actually use.
   - Note whether there are **MX** records for Namecheap email forwarding. They stop working after the switch; see step 9.
   - Click **Continue to activation**.
4. **Copy the two Cloudflare nameservers** shown (they look like `xxx.ns.cloudflare.com`).
5. **Check DNSSEC at Namecheap first:**
   - Sign in at `namecheap.com` → **Domain List** → **Manage** next to `academybees.com` → **Advanced DNS** tab → **DNSSEC**.
   - If it is on, **turn it off** and wait about 30 minutes. A stale DS record breaks resolution after the switch.
6. **Switch the nameservers:**
   - **Domain** tab → **Nameservers** → change *Namecheap BasicDNS* to **Custom DNS**.
   - Enter the two Cloudflare nameservers.
   - Click the **green check mark** to save.
7. **Wait for activation:** usually under an hour, at most 24–48 hours. In Cloudflare, use **Check nameservers now** on the overview page. Cloudflare emails you when the zone is **Active**.
8. **After activation:**
   - **SSL/TLS** → mode **Full (strict)**, which applies to proxied records only.
   - **DNS → Settings → Enable DNSSEC**, then add the DS record Cloudflare shows at Namecheap under **Advanced DNS → DNSSEC → Add new DS**. Copy key tag, algorithm, digest type and digest exactly.
9. **Email forwarding:** **Namecheap email forwarding stops when the nameservers change.** If you need `hello@academybees.com`-style forwarding, use **Cloudflare Email Routing**:
   - **Email → Email Routing → Get started**.
   - Add and verify the destination inbox.
   - Create the custom addresses. Cloudflare adds the MX and SPF records at the apex.
10. **Keep at Namecheap:** auto-renew and domain lock stay on there, because Namecheap is still the registrar.

### Record layout

Explicit records always win over the `*` wildcard. Every label used explicitly is a **reserved slug** (`packages/tenant/src/reserved.ts`: `www`, `staging`, `mail`, `app`, `console`, …), so no academy can be shadowed by a DNS record.

| Name | Type | Target | Proxy | When |
| --- | --- | --- | --- | --- |
| `staging` | CNAME | Railway `web` target | DNS-only | S7b |
| `*.staging` | CNAME | Railway `web` target | DNS-only | S7b (Universal SSL covers only one wildcard level; Railway issues the certificate) |
| `_acme-challenge.staging` | CNAME | as shown by Railway for the wildcard | DNS-only | S7b |
| `mail.staging` | Resend's DKIM/SPF/MX records | as shown by Resend | DNS-only | S7b |
| `@` and `www` | CNAME (flattened) | Cloudflare Pages project | Proxied | Only if a marketing site is built (C-69) |
| `*` | CNAME | Railway production `web` target | DNS-only to start | 7P |
| `_acme-challenge` | CNAME | as shown by Railway for `*.academybees.com` | DNS-only | 7P |
| `mail` | Resend records | as shown by Resend | DNS-only | 7P |
| MX / TXT at `@` | Cloudflare Email Routing | automatic | — | If forwarding is needed |

**Moving the web app to Vercel Pro later (C-69):**
1. Add `*.academybees.com` to the Vercel project.
2. Delegate **`_acme-challenge`** to Vercel with NS records (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) instead of moving DNS.
3. Point `*` at Vercel and set the functions region to **`sin1`**.

This replaces Railway's `_acme-challenge` record, so cut the wildcard over in one step. Then check that the Cloudflare-served apex certificate still renews: Cloudflare uses HTTP validation for proxied names. Staging's `_acme-challenge.staging` is a separate name and is unaffected.

## Email (Resend)

Sign up when S7b starts. Add the domain `mail.staging.academybees.com` and paste the DKIM, SPF and MX records it shows into Cloudflare (DNS-only). Create an API key with **sending access only** and put it in the worker's `SMTP_URL`.

Sending from the `mail.` subdomain keeps the apex free for Email Routing, and `mail` is a reserved slug.

## Capacity and upgrade triggers (C-71)

**Assumptions:**
- About **200 users per academy** (staff, parents, students).
- About 40 % active on a given day; the busiest hour carries 20 % of them at about 30 API requests each, with short bursts of 5× that.
- Every request makes about 3 queries.
- Prices are 2026-10 list prices and the costs are **estimates**. Railway bills per use: about $20 per vCPU-month, $10 per GB-month of RAM, $0.15 per GB-month of volume and $0.05 per GB of egress, against the plan's included credit.

| | 10 academies | 50 academies | 200 academies |
| --- | --- | --- | --- |
| Users / daily active | 2,000 / 800 | 10,000 / 4,000 | 40,000 / 16,000 |
| Busiest hour → burst | ≈ 1.5 → 7 req/s | ≈ 7 → 35 req/s | ≈ 27 → 130 req/s |
| Railway plan | Pro (from the first real academy) | Pro | Pro |
| Services | 1 each of web, api, worker; Postgres 0.5–1 GB RAM | web ×2, api ×2, worker ×1; Postgres 2 GB | web ×3, api ×3, worker ×2; Postgres 4–8 GB + HA replica; PgBouncer |
| Postgres connections (pool 10 per API, 7 per worker) | ≈ 17 | ≈ 27 | ≈ 45 direct → PgBouncer in transaction mode (safe, C-55) |
| RLS overhead | +3 round trips per statement; in-region about 1–3 ms per query, flat with academy count (re-measure on staging, C-55) | same | same; indexes lead with `tenant_id` |
| Redis / worker | well under 1 job/s | ≈ 1 job/s | a few jobs/s at peak (notifications from Phase 10); one worker handles hundreds/s |
| Email per month (Resend) | ≈ 4k → **Pro $20** (the free 100/day cap is too low for real use) | ≈ 20k → Pro $20 | ≈ 80k → **Pro 100k $90** |
| Media (ImageKit, from Phase 3) | ≈ 2 GB stored, 5 GB/month → **Lite ≈ $9** (Free stops at its caps: not for production) | ≈ 6 GB, 25 GB/month → Lite ≈ $10–25 | ≈ 15–25 GB, 100 GB/month → Lite ≈ $60 or **Pro $89** (225 GB included) |
| Academy custom domains | 0–2 → Railway Pro native | ≈ 5–15 → Railway Pro native (20 per service, more on request) | ≈ 40–60 → **Cloudflare for SaaS + Worker** (100 included, then $0.10 each; Workers Paid $5) |
| Railway usage | ≈ $25–35 | ≈ $80–110 | ≈ $220–300 (incl. Postgres HA) |
| Other | Cloudflare $0; Sentry free | Sentry Team ≈ $26; Vercel Pro ≈ $20–50 if moved | Sentry ≈ $26–80; Vercel Pro ≈ $40–100 |
| **Estimated total per month** | **≈ $55–65** | **≈ $160–230** | **≈ $450–650** (≈ $2–3 per academy) |

**Custom domains for academies** (e.g. `learn.sunriseacademy.in`, PRD v3.1 §G; off until `CUSTOM_DOMAINS_ENABLED`):

| | Railway Pro native | Cloudflare for SaaS + Worker |
| --- | --- | --- |
| Academy's DNS | CNAME to Railway's target; Railway issues the certificate | CNAME to our fallback hostname; Cloudflare issues the certificate |
| Scale | 20 per service, more on request | 100 included, up to 50,000 |
| Cost | Included in Pro | $0.10 per hostname per month after 100; Workers Paid $5/month |
| Gotchas | Each domain is added through Railway's API; requests go straight to Railway | Below Enterprise, no Host/SNI rewrite and no apex proxying. A Worker on `*/*` forwards to our Railway domain and passes the original host in a header the web trusts only with the proxy secret. Academies must use a **subdomain** |
| Use when | Up to about 20 custom domains | More than about 20, or self-serve setup at scale |

**Upgrade triggers:**

| Component | Upgrade when |
| --- | --- |
| Railway Hobby → **Pro** | Before the first real academy (7P), or earlier for more than 2 domains on a service, volumes over 5 GB, more than 3 team members, or logs older than 7 days |
| Web on Railway → **Vercel Pro** (`sin1`) | About 10 academies, or PR preview deploys or web performance needed; **never Vercel Hobby** with real academies |
| More `api` / `web` replicas | p95 API latency > 300 ms or CPU > 70 % for 15 minutes in the busiest hour |
| **PgBouncer** (transaction mode) | Over 60 % of Postgres `max_connections` in use, or more than 2 API replicas |
| Postgres size / **HA + PITR** | Before real data (OD-22); resize when CPU > 70 % or the cache-hit ratio drops below 99 % |
| More `worker`s | Outbox lag > 30 s, or a BullMQ queue waiting > 1 minute |
| Redis memory | Over 70 % used |
| Resend Free → Pro → Pro 100k | The first real academy; then more than 50k emails/month |
| ImageKit Free → Lite → Pro | Uploads go live (Free halts at its caps); Lite overage costs more than Pro ($89) |
| Railway native domains → **Cloudflare for SaaS** | About 20 academy custom domains, or self-serve domain setup |
| Sentry free → Team | Error volume above the free quota, or a second developer |
| India region | A data-residency requirement, or latency from India above budget (re-checked before 7P) |

## GitHub repository variables (Settings → Secrets and variables → Actions → Variables)

| Name | Example | Purpose |
| --- | --- | --- |
| `STAGING_ENABLED` | `true` | Turns the staging deploy on (unset = skipped with a notice) |
| `STAGING_WEB_URL` | `https://staging.academybees.com` | Smoke-check target |
| `PRODUCTION_ENABLED` | *(unset until 7P)* | Allows `deploy-production.yml` |
| `PRODUCTION_WEB_URL` | `https://academybees.com` | Smoke-check target |
| `PO_LOGIN` | `egha-dev` | The only account allowed to deploy production |
| `TURBO_TEAM` | *(team slug)* | Turborepo remote cache (optional) |

Staging secrets are listed under "Railway staging project → GitHub". Production uses the same names with `PRODUCTION_` from 7P; how production deploys from a release tag on Railway Pro is decided then (C-76).

## Turning staging on (S7b)

1. Railway project, Cloudflare records and Resend domain: done 2026-10-04.
2. Merge the S7b PRs (web image, roles script, CI migrations, GitHub-connected services: `staging-variables.md` section G).
3. Generate the secrets, then fill in the Railway variables, the health-check paths and the GitHub secrets/variables above.
4. Set `STAGING_ENABLED=true`. The next merge to `main` migrates in CI and Railway deploys after it; **Deploy staging** smoke-checks it.
5. Check on a phone:
   - `https://demo-a.staging.academybees.com` answers with a valid certificate (until the staging bootstrap, "We couldn't find this academy" is the expected page);
   - `https://staging.academybees.com/api/v1/health/ready` reports `ok`.
6. First console admin: comes with the staging bootstrap PR, which runs `platform:create-admin` where `PLATFORM_DATABASE_URL` is available. Until then the console has no staff.
7. Re-measure the RLS overhead in the same region (C-55).

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

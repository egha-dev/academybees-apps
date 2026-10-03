# Staging proposal (Phase 2, before S8)

> **Approved by the PO on 2026-10-03 → C-69.** Railway Hobby, one project in Singapore (web, api, worker, postgres, redis), Cloudflare DNS-only. It supersedes the staging parts of OD-03, C-31 and C-48 and ends the C-50 deferral early. The PO's additions on the same day are recorded as:
> - **C-69:** web stays on Railway; Vercel Pro from about 10 academies; marketing site on Cloudflare Pages; Vercel Hobby never with real academies.
> - **C-70:** ImageKit for media.
> - **C-71:** custom domains and the capacity analysis.
> - **OD-22:** production database, decided before 7P.
>
> Setup steps, the Namecheap → Cloudflare move and the upgrade triggers are in `docs/runbooks/environments.md`.

## Goal

Sign in on your phone over **https** on real academy subdomains (`demo-a.staging.academybees.com`, `app.staging…`, `console.staging…`) before Phase 2 closes, at low monthly cost, with the **API, worker, database and Redis in one region** (C-55: each RLS round trip is paid three times per query).

## Options considered

| | Render **free** | Render paid | **Railway Hobby** (recommended) | Current OD-03 plan (Vercel + Render + Supabase + Upstash) |
| --- | --- | --- | --- | --- |
| Region | Singapore | Singapore | Singapore (Southeast Asia — confirm at sign-up) | Web on Vercel edge, API Singapore, DB/Redis **Mumbai** (cross-region, ~30–60 ms per trip) |
| Always on | **No** — services sleep after 15 min idle, about 1 min to wake | Yes | Yes | Yes |
| Postgres | Free DB **expires after 30 days**; custom `ab_*` roles uncertain | Paid DB | Postgres container with superuser, so our role/RLS bootstrap runs unchanged | Supabase (custom roles OK) |
| Redis for BullMQ | Free Key Value has **no persistence** (jobs lost on restart) | Persistent | Redis service (persistent volume) | Upstash |
| Background worker | Not free | Paid | Included (usage-based) | Render paid |
| Wildcard `*.staging.academybees.com` with Cloudflare DNS | Possible on paid | Yes | Yes: DNS-only CNAME + `_acme-challenge` CNAME + TXT; Railway issues the certificate | Needs **Vercel DNS** (C-31), not Cloudflare |
| Rough cost | ₹0 but unusable for phone tests (cold starts, expiring DB) | ≈ $30–40/month (3 services + DB + KV) | **≈ $5–15/month** ($5 plan includes $5 usage; small services idle cheaply) | ≈ $25–45/month across four vendors |

**Recommendation: Railway Hobby, one project in Singapore**, with five services:
- `web` (Next.js standalone Docker image);
- `api`;
- `worker`;
- `postgres`;
- `redis`.

Cloudflare (free plan) runs DNS for `academybees.com` in **DNS-only** mode for the staging records. Proxying `*.staging` through Cloudflare would need a paid Advanced Certificate, because Universal SSL covers only one wildcard level.

Why it fits:
- everything sits in one region (C-55);
- our role/RLS SQL runs as-is;
- jobs survive restarts;
- the web tier is a plain Node server, so `proxy.ts` behaves exactly as in E2E;
- it is the cheapest always-on option.

The Hobby limit of 2 custom domains per service fits exactly: `staging.academybees.com` + `*.staging.academybees.com` on `web`.

## What changes in the repo (slice S7b `p2/staging`, after you sign up)

- Web Docker image (`next build` standalone), like the API/worker images (C-48).
- `deploy-staging.yml` switches from Render hooks + Vercel CLI to Railway (`railway up` with `RAILWAY_TOKEN`, or image deploys from GHCR). It keeps "migrate before deploy" (as `ab_migrator`) and the smoke checks.
- One-off staging bootstrap: create the `ab_*` roles (`infra/postgres/managed/roles.sql`) and the two gate academies plus one user per role, through a reviewed script (dev seeds stay local/ci-only).
- Config:
  - `PLATFORM_ROOT_DOMAIN=staging.academybees.com`;
  - `TRUSTED_CLIENT_IP_HEADER` = whatever Railway's edge sets (verified in S7b; M1);
  - `CUSTOM_DOMAINS_ENABLED=false`;
  - signing keys and `SECRETS_MASTER_KEY` as Railway secrets.
- Runbook rewritten for Railway + Cloudflare. DECISIONS: a new C- entry superseding the staging parts of OD-03/C-31/C-48.

## What you need to sign up for (no accounts are created by me)

| When | What |
| --- | --- |
| **Any time now** (propagation can take up to 48 h) | **Cloudflare** (free): add `academybees.com` and switch Namecheap's nameservers to Cloudflare. Steps: runbook → *Moving academybees.com from Namecheap to Cloudflare*. Namecheap email forwarding stops at the switch; use Cloudflare Email Routing if you need it |
| **When S7b starts** (I will tell you) | **Railway Hobby** ($5/month, card required): sign in with GitHub `egha-dev`, create the empty project `academybee-staging` in Singapore, create a project token and save it as the GitHub secret `RAILWAY_TOKEN` |
| **When S7b starts** | **Resend** (free to start; Pro $20/month before the first real academy): add the domain `mail.staging.academybees.com` and paste its DNS records into Cloudflare |
| Optional | **Sentry** (free developer plan) for staging error reports |

Not needed for staging any more: Vercel, Render, Supabase, Upstash (OD-03). Production choices: Railway Pro before the first real academy (C-71); the production database per OD-22, before 7P.

## Risks

| Risk | Mitigation |
| --- | --- |
| Railway region/pricing details change | Confirm the Singapore region and the current Hobby terms at sign-up; the workflow only deploys Docker images, so moving later is a workflow change |
| Wildcard certificate validation stuck | Cloudflare records must be DNS-only (grey cloud), and no CAA record may block Let's Encrypt; the runbook has a checklist |
| Hobby plan resource limits | Staging only; the Pro plan or another vendor before 7P if needed |
| Real emails from staging | Only to addresses you invite; demo users use a domain you control |

# Staging proposal (Phase 2, before S8)

> **Proposal for PO approval (2026-10-02).** Nothing is created until you approve and sign up. If approved, it supersedes the staging parts of OD-03, C-31 and C-48 (production hosting is still decided before Phase 7P), and it ends the C-50 deferral early.

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

1. **Cloudflare** (free): add `academybees.com` and change the nameservers at your domain registrar to the two Cloudflare gives you. Tell me the registrar if you want click-by-click steps.
2. **Railway** (Hobby, $5/month, card required): sign in with the GitHub account `egha-dev`. Create an empty project named `academybee-staging` in the Singapore region. Then create a **project token** and add it as the GitHub secret `RAILWAY_TOKEN` (I'll give exact steps when S7b starts).
3. **Transactional email** for invites and password resets on staging. Recommended: **Resend** (free tier ≈ 3,000 emails/month) or Amazon SES. Verify `staging.academybees.com` as a sending domain; it gives you SPF/DKIM records to paste into Cloudflare. This is also A6 in the EXECUTION_GUIDE.
4. Optional: **Sentry** (free developer plan) if you want staging error reports.

Not needed any more for staging if approved: Vercel, Render, Supabase, Upstash (OD-03). Production choices are revisited before Phase 7P.

## Risks

| Risk | Mitigation |
| --- | --- |
| Railway region/pricing details change | Confirm the Singapore region and the current Hobby terms at sign-up; the workflow only deploys Docker images, so moving later is a workflow change |
| Wildcard certificate validation stuck | Cloudflare records must be DNS-only (grey cloud), and no CAA record may block Let's Encrypt; the runbook has a checklist |
| Hobby plan resource limits | Staging only; the Pro plan or another vendor before 7P if needed |
| Real emails from staging | Only to addresses you invite; demo users use a domain you control |

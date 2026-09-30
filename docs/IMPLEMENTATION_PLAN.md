# AcademyBee — Implementation Plan

> Status: **Baseline v1.5** (incorporates PRD v3.2 Addendum incl. G-30 payments, G-31 Family Hub, G-32 multilingual; slice workflow ADR-041; P-00 orientation decisions C-29…C-41, OD-14/19/20/21) · Last updated: 2026-09-30 · Current phase: **Phase 0 — Foundation (🟨 in progress; plan approved 2026-09-30 → `docs/plans/phase-0.md`)**
> Build order is the Product Owner's 17-phase sequence (DECISIONS C-01) plus **Phase 7P — Pilot Readiness Pack** (C-21). `G-xx` = gap requirement from `docs/PRD_ADDENDUM_v3.2.md`. Items pulled forward to satisfy dependencies are marked **⤴ pulled forward** with their decision reference.
> A phase is DONE only when its exit gate and the Common Phase Gate (§2) pass. Never mark a phase complete because screens render.
> Work lands on `main` in small **slices** (1–5 tasks per PR, auto-merged when CI is green) behind release flags; a phase starts with tag `phase-<id>-start` and closes with tag `phase-<id>` (ADR-041).

---

## 1. Phase tracker

| # | Phase | Status | Pulled-forward slices | Key decisions |
| --- | --- | --- | --- | --- |
| 0 | Foundation | 🟨 In progress | Outbox, audit, idempotency tables; English-only i18n foundation, multilingual-ready (G-08, G-32), analytics port, perf budgets (G-09, G-24) | ADR-001/002/012/013/014/015/016/022/030/031/032/035/040 |
| 1 | Multi-Tenant + Wildcard Domain | ⬜ | Default branch per tenant; `app.` Family Hub host reserved + classified (G-31) | ADR-003/004/005/039, C-07 |
| 2 | Authentication + RBAC | ⬜ | Transactional email; Super Admin CLI bootstrap; optional 2FA + devices (G-11); `HUB` session audience for parents/students (G-31) | ADR-006/007/008/039, C-02, C-04, C-25, C-27 |
| 3 | Academy Provisioning + Onboarding | ⬜ | Provisioning Console slice; Plans/Entitlements/Trial (G-25); minimal People & Scheduling create commands; legal acceptance (G-06) | C-02, C-03, C-08, C-09, ADR-028/034 |
| 4 | Students + Parents + Teachers | ⬜ | Command palette, Global Add, activity timeline; import (G-02); full profile (G-05); consent (G-06); parent invites into the Family Hub, Join QR poster, Join requests queue (G-31) | ADR-026/027/034/036/039, C-22 |
| 5 | Courses + Batches + Timetable | ⬜ | Owner Today v1; terminology; holidays (G-03); transfer (G-27) | ADR-024/029/037 |
| 6 | Attendance + Offline Sync | ⬜ | Teacher PWA core; outbox → in-app notifications; teacher nudge (G-16) | ADR-016/017, C-04, C-06 |
| 7 | Finance | ⬜ | Onboarding fee step; fee-reminder intents (in-app); **all payment methods enabled without a gateway (G-30)**; gateway-ready provider layer + simulator (G-01); fee rules (G-04); opening balances (G-02); share receipts (G-18) | ADR-010/018/033/038, C-08, C-18, C-19, C-24, C-26 |
| **7P** | **Pilot Readiness Pack** | ⬜ | Parent Core **as the multi-academy Family Hub** (from 11, G-31); help & support (G-10); consent live (G-06); activation dashboard (G-09); demo academy (G-13); pilot runbook (G-29) | C-21, C-23 |
| 8 | CRM | ⬜ | Public enquiry form; academy public page (G-19) | C-10, C-12 |
| 9 | Learning | ⬜ | Teacher learning tab; offline drafts/notes; file storage | ADR-021 |
| 10 | Communication | ⬜ | Phone OTP login on the Family Hub (OD-04, G-31); India compliance (G-07); nudges on channels (G-16) | ADR-020, OD-15 |
| 11 | Parent + Student (complete) | ⬜ | Leave requests (G-17); child grouping across academies, unified calendar, students on the hub (G-31); builds on 7P | C-05, C-21, C-27 |
| 12 | Reports | ⬜ | Metric registry, Owner Dashboard full; full academy export (G-15); teacher accountability (G-16) | — |
| 13 | SaaS Billing | ⬜ | Self-serve signup (OD-06); GST invoices (G-21); lifecycle comms (G-20); pricing (G-25) | C-03, C-13 |
| 14 | Super Admin | ⬜ | — | C-02 |
| 15 | Security + Performance + Production Hardening | ⬜ | Service commitments (G-22); recovery runbook (G-26); privacy workflows (G-06) | OD-09 |
| 16 | AI | ⬜ | — | PRD v3 §22 |
| L | Multilingual Rollout (deferred — run any time after Phase 11; launch is English only) | ⬜ | Language switcher + settings UI, per-language editors, first languages per OD-18 (Family Hub, Teacher PWA, notifications, receipts, legal, help, then management screens), AI translation drafts | ADR-040, C-28, OD-18 |
| G | Gateway Activation (deferred — run when OD-02/OD-13 are ready; may run any time after 7P) | ⬜ | Razorpay adapter for academy fees + SaaS auto-renew | ADR-033/038, OD-02, OD-13 |

Legend: ⬜ not started · 🟨 in progress · 🟦 in review (gate running) · ✅ done (PO acceptance recorded)

### 1.1 Release milestones

| Milestone | After phase | Meaning |
| --- | --- | --- |
| M0 Foundation Release | 2 | Platform core: tenancy, auth, RBAC, PWA shell, CI/CD to staging |
| M1 Academy Alpha (internal) | 6 | A provisioned academy can onboard, schedule and take online+offline attendance |
| M2 Operations MVP | 7 | + fees/invoices/payments/receipts (staff-side) |
| **M2P Pilot Start** | 7P | Two real academies live with owners, teachers and parents; pilot runs alongside Phases 8–16 |
| M3 Growth | 11 | CRM, learning, communication channels, parent & student portals |
| M4 Commercial | 14 | Reports, SaaS billing, full platform console |
| M5 Production GA | 15 | Hardened, load-tested, DR-drilled |
| M6 Intelligence | 16 | AI assistive features |

### 1.2 Parallel non-engineering tracks (start now — PRD v3.2 G-28, G-14)

| Track | Items | Must be ready by |
| --- | --- | --- |
| Business & legal | Entity, bank, GST registration, domain + DNS, lawyer (Terms, Privacy, DPA, DPDP, fee-collection model OD-13), CA (GST on SaaS) | Terms: Phase 3 · Payment model: Phase 7 · GST: Phase 13 |
| Payments | Nothing needed for Phase 7 (UPI/manual, G-30). For Phase G: AcademyBee Razorpay account (KYC), lawyer sign-off OD-13, pilot academies' own gateway accounts | Phase G (whenever ready) |
| Messaging | Email provider + SPF/DKIM/DMARC; Meta Business verification + WhatsApp Cloud API number; TRAI DLT entity/headers/templates | Email: Phase 2 · WA/SMS: Phase 10 |
| Go-to-market | Marketing site (value prop, pricing hypothesis G-25, demo/pilot forms), pilot academy recruitment + agreement (OD-16) | Before Phase 7P |
| Support content | 15 help articles with screenshots, support WhatsApp number, support hours | Phase 7P |

---

## 2. Common Phase Gate (applies to every phase)

From PRD v3 §24, §33 and CLAUDE.md §13. A phase moves to ✅ only when all apply:

- [ ] PRD + UX sections for the phase re-read; deviations recorded in DECISIONS.md
- [ ] Prisma migration(s) + RLS policies for new tenant tables; migration drift check clean
- [ ] API: validation, authorization (capability + scope), tenant isolation, error codes, idempotency where retryable, audit where required, OpenAPI updated
- [ ] UI: matches UX spec; loading / empty / error / permission / success (+ offline where applicable) states; responsive (phone, tablet, desktop); keyboard + screen-reader pass on core flows; status never colour-only
- [ ] Tests: unit (domain rules/state machines), integration (DB + RLS), **cross-tenant suite extended to every new endpoint**, E2E for the phase journeys; offline tests where applicable (offline create, restart, reconnect, retry, conflict)
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` green in CI
- [ ] Observability: logs, metrics and alerts hooks for new async work / sync / webhooks
- [ ] Product analytics events for the phase emitted (no PII) (G-09); UI strings externalised and formatted via `Intl` helpers (G-08); performance budgets pass for touched Tier-1 screens (G-24)
- [ ] Deployed to staging; smoke-tested on a real phone (teacher/parent flows)
- [ ] Docs updated: this plan (status + exit notes), ARCHITECTURE (if changed), DECISIONS (new ADRs/conflicts)
- [ ] Rollback path known (migration is expand-only or has a contract step scheduled)
- [ ] Release flags for this phase's work are either on (feature complete) or listed with an owner and removal date (ADR-041)
- [ ] Product Owner acceptance recorded in the phase's **Exit notes**

---

## 3. Phases

### Phase 0 — Foundation

**Goal.** A working, tested, deployable skeleton with every cross-cutting convention in place, so later phases add domain code only.
**Status.** 🟨 since 2026-09-30 (`phase-0-start` = `72a4078`). Approved slice plan: [`docs/plans/phase-0.md`](plans/phase-0.md).

**Slices (each = one PR, ADR-041)**

| Slice | Branch | Tasks | State |
| --- | --- | --- | --- |
| S0 | `p0/bootstrap` | plan update, 0.1, minimal CI | 🟨 |
| S1 | `p0/governance` | 0.18 files + `apply-governance.sh` (applied when the paid plan is active, OD-19) | ⬜ |
| S2 | `p0/infra-local` | 0.2 | ⬜ |
| S3 | `p0/contracts` | 0.3 | ⬜ |
| S4 | `p0/database-testing` | 0.4, 0.11 | ⬜ |
| S5 | `p0/api-core` | 0.5 | ⬜ |
| S6 | `p0/worker` | 0.6 | ⬜ |
| S7 | `p0/i18n-analytics` | 0.15 (core), 0.16 | ⬜ |
| S8 | `p0/ui` | 0.7 + logical-CSS lint | ⬜ |
| S9 | `p0/web-shell` | 0.8, 0.9, 0.15 (web); release flag `p0-flag-probe` (owner PO, remove in Phase 1) | ⬜ |
| S10 | `p0/sync` | 0.10 | ⬜ |
| S11 | `p0/e2e-ci` | 0.12, 0.17, full 0.13 | ⬜ |
| S12 | `p0/staging` | 0.14 (workflows off until `STAGING_ENABLED`) | ⬜ |
| S13 | `p0/docs` | 0.19 | ⬜ |
**Refs.** PRD v2 §15, v3 §14–18; UX §4–7, §24, §26; ARCHITECTURE §3, §4, §9.1, §10.5, §11, §15, §18–19.

**Tasks**

| ID | Task | Output |
| --- | --- | --- |
| 0.1 | Monorepo: pnpm workspaces, Turborepo, Node 24 `.nvmrc`, `packages/config` (tsconfig bases, ESLint flat config incl. boundaries + restricted `@mui/*` imports, Prettier), commit hooks (lint-staged), conventional commits | Root scripts `dev, lint, typecheck, test, build, e2e, db:*` |
| 0.2 | `infra/docker-compose.yml`: Postgres 17, Redis 7, Mailpit, MinIO; `.env.example` for each app | `pnpm infra:up` |
| 0.3 | `packages/contracts`: Zod setup, `ErrorCode` enum, error envelope schema, pagination schemas, permission catalogue skeleton, sync op base schema | Shared types build |
| 0.4 | `packages/database`: Prisma multi-file schema, client factory, DB roles (`ab_migrator`, `ab_app`, `ab_platform`) bootstrap SQL, first migration with `AuditLog`, `IdempotencyRecord`, `OutboxEvent`, `FeatureFlag`, `FeatureFlagOverride` (nullable `tenantId`; FK + RLS in Phase 1, C-35); seed runner restricted to `local`/`ci` | `pnpm db:migrate`, `pnpm db:seed` |
| 0.5 | `apps/api` (NestJS): Zod-validated config (fail fast), pino logger + redaction, request ID middleware, global Zod pipe, exception filter (envelope + Prisma error mapping), `/health/live` `/health/ready`, OpenAPI at `/api/docs` (non-prod), `@Idempotent()` interceptor + store, `AuditService`, `OutboxService`, CLS module | API boots, contract tests pass |
| 0.6 | `apps/worker`: NestJS standalone + BullMQ, `system` queue, heartbeat job, outbox relay (`SKIP LOCKED`), graceful shutdown | Worker processes a test outbox event |
| 0.7 | `packages/ui`: tokens (UX §5–6), MUI theme, CSS variables, Inter via `next/font`; components: Button, IconButton, TextField, Select, Card, StatusBadge, EmptyState, Skeleton, Toast, ConfirmDialog, Drawer/BottomSheet, AppShell (sidebar/topbar/bottom-nav variants), OfflineBanner, SyncIndicator (stub states) | `/dev/design-system` page |
| 0.8 | `apps/web` (Next.js App Router): MUI App Router cache provider, `/api` rewrite to API, route groups `(marketing)`, `(console)`, `(tenant)`, `(hub)` with a placeholder host-routing file (`proxy.ts` on Next.js 16+, C-34; host classification stub), TanStack Query provider, error boundary + global error page in AcademyBee style | Web boots on `localhost:3000` |
| 0.9 | PWA: Serwist SW (precache shell, runtime cache static/fonts, offline fallback page), static manifest (dynamic in Ph 1), install prompt handling, SW update prompt | Installable; offline fallback works |
| 0.10 | `packages/sync`: Dexie DB class (v1 skeleton: `meta`, `syncQueue`, `syncLog`), connectivity detector (online/offline + API heartbeat), queue engine (enqueue, list, status transitions, backoff calculator), Web Lock runner shell, React hooks `useConnectivity`, `useSyncStatus` | Unit tests with `fake-indexeddb` |
| 0.11 | `packages/testing`: Vitest presets (SWC), Testcontainers helpers (Postgres w/ roles, Redis), factories skeleton | `pnpm test` runs all |
| 0.12 | Playwright: config for `*.localhost`, web+api webServer orchestration, smoke specs (home renders, SW registers, offline fallback, API health), axe helper | `pnpm e2e` |
| 0.13 | CI: GitHub Actions workflow (install → lint → typecheck → unit → integration → migrate diff → build → e2e), caching, artifacts on failure; Dependabot/Renovate | Green pipeline |
| 0.14 | Staging deploy skeleton per OD-03 (web + api + worker + DB + Redis), env/secrets management, migrate-before-deploy job | Staging URL serving health + shell |
| 0.15 | i18n foundation, **English only** (ADR-031, ADR-040, G-32): `packages/i18n` with an `en-IN` catalogue per namespace shared by web/API/worker, locale context fixed to `en-IN`, `formatMoney/formatDate/formatTime` with Indian grouping, ICU plurals, lint for hard-coded strings, ICU validation, pseudo-locale `en-XA` + long-text CI builds, CSS logical-properties lint, Inter + one Noto fallback font, Unicode-aware name validators + NFC | `₹1,00,000` renders; `en-XA` build shows no raw strings |
| 0.16 | Analytics port (ADR-032): `AnalyticsPort` + no-op/PostHog adapters, event Zod schemas, outbox-driven server events, PII guard test | First event visible in dev |
| 0.17 | Client support & budgets (ADR-035): browserslist, Playwright Chromium-Android + WebKit-iOS projects, Lighthouse CI + bundle budgets in CI | Budget check runs in CI |
| 0.18 | Repository governance (ADR-041), configured by Claude with `gh`: `main` ruleset (PR, required checks, linear history, no force-push), auto-merge + delete-branch-on-merge, CODEOWNERS, PR template with DoD checklist, issue templates (bug, pilot feedback, decision), commitlint on PR titles, release-please, Renovate, secret scanning + push protection, GitHub Environments `staging` (auto) and `production` (PO approval), pnpm catalogs, Turborepo remote cache + `--affected` CI + nightly full run; `FeatureFlag` release-flag module | A test PR shows required checks and auto-merges when green |
| 0.19 | Docs: README (setup), update this plan with pinned versions and exit notes | — |

**Exit gate (Phase 0 specific)**
- `pnpm infra:up && pnpm db:migrate && pnpm dev` works from a clean clone in < 10 min.
- CI green; staging serves web shell and `/api/health/ready` = 200.
- Error envelope contract test: validation error, unknown route, thrown domain error, Prisma unique violation → correct codes, no internals.
- Idempotency test: same key + same body returns stored response; same key + different body → `IDEMPOTENCY_KEY_REUSED`.
- Outbox test: event written in a rolled-back transaction is never dispatched; committed event dispatched exactly once to the queue.
- Dexie queue test: items persist across DB close/reopen (simulated restart); backoff schedule correct.
- PWA: Lighthouse installability passes; offline reload shows AcademyBee offline page.
- Design system page reviewed against UX §4–6 by PO.
- Pseudo-locale and +40% long-text builds show no hard-coded strings or broken layouts in the shell and design-system page; `formatMoney(10000000, 'INR')` → `₹1,00,000.00` and with `{ compact: true }` → `₹1,00,000` (C-40); a Tamil name (`ஆரவ்`) and a Hindi name (`आरव`) pass validation and round-trip through the API unchanged (G-08, G-32).
- Analytics: event with an email/phone property is rejected by the PII guard test (G-09).
- Repository: a direct push to `main` is rejected; a PR with a failing check cannot merge; a green PR auto-merges and deploys to staging; a release flag hides an unfinished screen on staging (ADR-041).

---

### Phase 1 — Multi-Tenant + Wildcard Domain

**Goal.** Any request knows its tenant safely; the database refuses cross-tenant reads/writes; academy hosts show branded shells or polished status pages.
**Refs.** PRD v2 §27, v3 §13, v3.1 §C–G; UX v1.1 §1, §7, §8; ARCHITECTURE §5, §8.2.

**Scope**
- DB: `Tenant`, `TenantDomain`, `TenantBranding`, `TenantSettings`, `Branch` (default branch auto-created) ⤴ C-07. RLS policy template + migration helper that applies it to every table flagged tenant-owned; `ab_app`/`ab_platform` grants.
- `packages/tenant`: hostname normaliser/classifier, slug validator, reserved list — shared by web middleware and API (property-based tests).
- API: `TenantResolverMiddleware` (Redis cache + negative cache), `TenantContext` (CLS), `TenantStatusGuard`, tenant-bound Prisma client extension (`set_config` + `tenantId` injection), platform Prisma client confined by lint to `platform/**`; public `GET /tenant/context`.
- ⤴ C-35 `FeatureFlagOverride.tenantId` gets its FK to `Tenant` and RLS.
- Web: real host-routing file (`proxy.ts`, C-34) (classify host → rewrite to `/t/[slug]`, `/console`, `/hub` (Family Hub on `app.`), marketing; 301 for `REDIRECT` domains); dynamic per-tenant `manifest.ts` + favicon; tenant-branded placeholder shell; status pages **Unknown academy**, **Suspended**, **Archived**, **Setting up**, **Access denied** (UX v1.1 §7 — designed, not raw errors).
- ⤴ G-31 `app.` host reserved and classified as `hub` (placeholder hub page until Phase 7P); academy/console/hub host matrix tests.
- Dev seed: tenants `demo-a` (ACTIVE), `demo-b` (ACTIVE), `paused` (SUSPENDED).
- Benchmark: RLS + extension overhead (target < 2 ms p95 per simple query) — record in exit notes.
- Wildcard DNS/TLS for staging per OD-03/OD-07.

**Tests**
- Host classification matrix: apex, `www`, `console`, `app` (Family Hub), valid tenant, uppercase, port, trailing dot, IP, punycode, nested subdomain, unknown, `REDIRECT` domain, custom domain (mock).
- Integration (Testcontainers): with context A, `findMany` over every tenant table returns only A; raw SQL without `app.tenant_id` returns zero rows; writing a row with tenant B while context A → rejected by `WITH CHECK`.
- Lint test: importing the platform client outside `platform/**` fails.
- E2E: `demo-a.localhost` shows Demo A branding & manifest name; `nope.localhost` → Unknown page (404); `paused.localhost` → Suspended page.

**Exit gate.** All above green; staging `*.staging.academybee.com` resolves two seeded tenants with correct branding and TLS.

---

### Phase 2 — Authentication + RBAC

**Goal.** Staff sign in on their academy's URL and parents/students on the Family Hub; everyone gets exactly their capabilities and cannot use a session anywhere else.
**Refs.** PRD v2 §4, §16 (auth), v3 §5, §13; UX §29 (Login Tier 1), v1.1 §8; ARCHITECTURE §6, §7.

**Scope**
- DB: `User`, `UserCredential`, `Membership`, `Role`, `RolePermission`, `MembershipRole`, `PlatformStaff`, `AuthSession`, `Invitation`, `PasswordResetToken`.
- Permission catalogue complete in `@academybee/contracts` (all capabilities, including future modules, so roles are stable); system role templates (Owner, Admin, Teacher, Accountant, Receptionist, Parent, Student) and platform roles.
- API: login, refresh (rotation + reuse detection), logout (current / all devices), me, forgot/reset password, invitation view/accept (sets password, activates membership); guards `AuthGuard` (aud + `tid == resolved tenant`), `MembershipGuard`, `PermissionGuard` (`@Can`), scope-policy framework, `@Public`, `@PlatformOnly`; Redis rate limiting + progressive lockout; CSRF double-submit; auth audit events.
- ⤴ C-04 Transactional email: `EmailPort` + SMTP adapter (Mailpit locally, provider in staging), templates for invite and password reset (tenant-branded).
- ⤴ C-02 CLI `pnpm platform:create-admin` to bootstrap Super Admin; console login on `console.` host (console audience, 7-day refresh; TOTP arrives Phase 14 — until then console accounts are CLI-created and IP-allow-listed in staging/prod).
- Web: premium tenant-branded **Login** (UX Tier 1), Forgot/Reset, Invite accept, session-expiry handling (silent refresh, re-login modal preserving context), role-home redirect, capability-filtered navigation config, `PermissionState` component, experience switcher for multi-role users, logout (with pending-sync guard hook from `packages/sync`).
- ⤴ G-32 (invisible): `User.preferredLocale` column and locale in session/request context, always `en-IN` for now (no switcher UI until Phase L); auth emails rendered from the i18n catalogue.
- ⤴ G-31 / ADR-039: `HUB` session audience (user-bound, no `tid`) accepted only on `app.` host; Parent/Student logins on an academy URL are redirected to the hub; hub, tenant and console tokens are mutually rejected (security tests).
- ⤴ G-11: optional TOTP 2FA (enrol, verify, recovery codes; tenant setting to require for Owner/Accountant, strong prompt by default), **Devices & sessions** page (sign out one / all), email alerts on new-device sign-in and password change.
- Dev seed: one user per role in `demo-a`, one teacher also a member of `demo-b`. (Seeds are `local`/`ci` only; from the phase that adds `ConsentRecord`, every seeded active parent gets a consent record — C-37.)

**Tests**
- Unit: password policy, token rotation, capability resolution, scope policies.
- Security: token from `demo-a` on `demo-b.localhost` → 401 `TENANT_MISMATCH` + audit; console token on tenant host and vice-versa rejected; refresh reuse revokes family; disabled membership → 401 on next request; privilege escalation (teacher calling owner endpoints) → 403; rate limit returns 429 with `Retry-After`; CSRF missing header → 403.
- E2E: invite → accept → login → lands on role home; forgot → Mailpit link → reset → login; staff member in two academies signs in separately on each host; parent login on an academy URL is redirected to `app.localhost` and gets a `HUB` session.

**Exit gate.** Above green; **M0 Foundation Release** declared.

---

### Phase 3 — Academy Provisioning + Onboarding

**Goal.** Super Admin creates an academy and hands over a URL; the owner opens it and is guided to a ready-to-run academy.
**Refs.** PRD v3.1 §A–J, v3 §6, §19, §20; UX §22, v1.1 §2–6, §9–10; DECISIONS C-02, C-03, C-08, C-09.

**Scope**
- ⤴ C-03 `Plan`, `PlanEntitlement`, `Subscription` (TRIAL only), `EntitlementService`, `@Feature/@Limit` guards, seeded plans per G-25 hypothesis (OD-12). Limits enforced (e.g. student cap) with friendly `ENTITLEMENT_LIMIT_REACHED` UI.
- ⤴ G-32 (invisible): `TenantSettings.i18n` stored with defaults (`en-IN`, no UI until Phase L); onboarding texts from the catalogue; `LegalDocument` stored locale-keyed with `en-IN` only.
- ⤴ G-06 `LegalDocument`, `LegalAcceptance` (ADR-034): owner must accept current Terms/Privacy/DPA on first login before onboarding; re-acceptance on version change.
- `ProvisioningService` (idempotent, single transaction + outbox): validate slug (format, reserved, availability, impersonation list) → create `Tenant` (SETUP) → `TenantDomain` PRIMARY → branding/settings defaults (by academy type & terminology, ADR-029) → default `Branch` → copy system roles → owner `User`/`Invitation` → TRIAL subscription → `TenantOnboarding` → audit → outbox (`tenant.provisioned` → owner invitation email).
- ⤴ C-02 **Provisioning Console slice** (`console.academybee.com`): Academies list (search/filter/status), **Create Academy** guided form with live slug availability, **Provisioning Success** (URL prominent, Copy URL, Open Academy, owner invite status, plan/trial, onboarding progress), Academy detail (Overview + Domain tabs), suspend / reactivate / archive (reason + confirm + audit), change subdomain (old → REDIRECT, audit), resend owner invite. Console visual variant (UX §21).
- ⤴ C-09 Schema for People (`Student` with the full G-05 field set incl. emergency contact, restricted medical notes, custom fields; `Parent` with WhatsApp flag, preferred language, pickup-authorised; `ParentStudent`, `Teacher`, `ConsentRecord`) and Scheduling (`Course`, `CourseLevel`, `Batch`, `BatchTeacher`, `BatchEnrolment`, `ScheduleRule`, `ClassSession`) designed in full; **minimal create commands** exposed to onboarding.
- Onboarding API + UI (UX v1.1 §4–5, C-08): First Visit **Welcome** (branded, progress, estimated time, Continue/Resume later) → **Academy Profile** (name, logo upload to storage, contact, timezone/currency) → **Academy Type** (sets terminology & templates) → **First Course** → **First Teacher** (add self as teacher or invite) → **First Batch** (course, teacher, capacity) → **First Students** (quick multi-add, optional parent contact) → **First Timetable** (weekly slots → ScheduleRules; sessions generated synchronously for the first 14 days until Phase 5 job exists) → **Ready** (checklist + "Take first attendance" CTA placeholder → wired in Phase 6). Resumable, per-step persistence, back navigation, skippable steps except Profile & Type. Completion sets tenant `ACTIVE`.
- Tenant **Settings → Academy** and **Branding & Domain** (name, logo, favicon, primary colour with contrast check, subdomain display, custom-domain section "coming soon" hidden behind flag, public profile toggle stored).
- Minimal object storage (logo/favicon) ⤴ from Phase 9 (ADR-021 subset).

**Tests**
- Provisioning idempotency (same `Idempotency-Key` twice → one tenant); concurrent same slug → one wins, other gets `CONFLICT` with suggestion; reserved/invalid slugs rejected; transaction rollback leaves no partial tenant; audit rows present.
- Entitlement guard unit/integration tests.
- Onboarding: resume after logout at each step; abandon & continue on another device; tenant B cannot read tenant A onboarding.
- E2E (critical journey): Super Admin creates "Gurushethra" → success shows `gurushethra.localhost` → owner accepts invite → welcome → completes all steps → Ready → tenant ACTIVE → suspend in console → academy shows Suspended page.

**Exit gate.** Journey E2E green; PO walkthrough of console slice + onboarding on phone and desktop.

---

### Phase 4 — Students + Parents + Teachers

**Goal.** Core people and relationships are managed through contextual workspaces, not CRUD tables.
**Refs.** PRD v2 §17, v3 §9; UX §9–11.4, §24; ARCHITECTURE §7, §8.

**Scope**
- Students: list (search with `pg_trgm`, filters: status, batch, course; keyset pagination, virtualised), **Add Student** drawer (minimum fields, optional parent, optional batch), **Student 360** (Overview, Activity tabs now; Attendance/Fees/Learning/Progress/Communication/Documents tabs appear as their phases land — no placeholders), status changes (ON_HOLD, COMPLETED, LEFT) with reason; archive.
- Parents: create/link, relationship type, primary contact, many-to-many (one parent ↔ many children; one child ↔ many parents), dedupe by phone/email with merge suggestion (no auto-merge), portal invite action (account created now; parent UI arrives on the Family Hub in Phase 7P).
- Teachers: list/profile (skills/subjects, contact, status), invite as member with Teacher role, link existing member.
- Team & Roles settings: members list, invite staff with role, change role, deactivate (session revocation), last owner protection.
- ⤴ Command palette (Cmd/Ctrl+K) over students/parents/teachers + quick actions; **Global Add** (Student, Parent, Teacher; others added per phase).
- `ActivityEvent` projection + Timeline component on Student/Teacher.
- Student limit entitlement enforced on create/import.
- ⤴ G-02 **Import students & parents** (ADR-036): template download, mapping, validation preview, dedupe, optional batch assignment (batches from onboarding), dry-run → commit, error report; also offered in the onboarding Students step.
- G-05 profile: all fields, custom fields (≤10, typed), medical notes restricted to Owner/Admin/assigned Teacher with read audit.
- G-06 consent: `ConsentRecord` model and API enforced at parent account activation (the parent-facing consent screen ships with the Family Hub in 7P; until then the activation API refuses without a consent record); academy privacy notice page generated from template; consent history on Student 360.
- G-26 archive/restore within 90 days; Undo toast for safe operational changes.
- ⤴ G-31 parent side of the Family Hub (academy staff screens): parent invites create/attach the global account and link to the hub (existing account → "add this academy"); **Settings → Parent app** with printable Join QR poster (`app.academybee.com/join/<slug>`); **Join requests** queue (approve by linking to student(s) / reject); `AcademyLinkAttempt`, `JoinRequest` tables and verification-code API (hub UI arrives in 7P).

**Tests.** Join/link: code sent only to identifiers the academy already holds; uniform responses (no enumeration); rate limits; approved join request links only the chosen students. Import: 500 rows with 20 invalid → 480 created, 20 reported; re-upload corrected file → no duplicates; plan limit respected. Medical notes hidden from receptionist/accountant and reads audited. Parent activation impossible without consent record. Scope policies (receptionist create/update, accountant read, teacher denied until assignments exist in Ph 5, parent denied); IDOR on `/students/:id` across tenants and across scopes; parent-child many-to-many; dedupe; archiving preserves history; search latency with 50K seeded students < 300 ms p95 (local benchmark).

**Exit gate.** Common gate + E2E: add student with two parents → Student 360 shows both → parent invite email sent.

---

### Phase 5 — Courses + Batches + Timetable

**Goal.** Every teacher has a reliable daily schedule made of concrete class sessions.
**Refs.** PRD v2 §17, v3 §9 (time-aware membership, recurring sessions), UX §11.5–11.6; ADR-024, ADR-029.

**Scope**
- Courses & levels management; Batches (course, level, branch, capacity, start/end, status); teachers per batch (primary/assistant); **time-aware enrolments** (join/leave dates, move between batches preserves history); capacity warnings.
- `ScheduleRule` editor (weekly slots, effective dates); worker job `scheduling.generateSessions` (rolling 28 days, idempotent) replacing Phase 3's synchronous generation; rule edits regenerate only untouched future sessions; session cancel / reschedule / ad-hoc session; teacher double-booking warnings.
- **Batch Workspace** (UX §11.5): Students, Schedule, Activity tabs; primary action "Take Attendance" (wired Phase 6).
- **Timetable** (UX §11.6): Day, Week, Teacher views on desktop (grid; drag-to-reschedule optional stretch), chronological timeline on mobile; filters by branch/course/teacher.
- ⤴ **Owner Today v1** (UX §11.1): welcome, today's classes, attention items available so far (unassigned teachers, batches at capacity, sessions without teacher).
- Configurable terminology (`useTerm`) applied across Phases 3–5 screens.
- ⤴ G-03 **Holidays & calendar** (ADR-037): holidays/closures, generation skips them, impact preview + bulk cancel + one parent notification intent per child, make-up sessions; shown on timetable and Teacher Today.
- ⤴ G-27 **Transfer student** between batches on a date (ends/starts enrolments, history kept); status change dialogs show schedule consequences.
- Teacher `ASSIGNED` scope now live for students/batches/sessions.

**Tests.** Holiday over existing sessions cancels exactly those sessions and generation never recreates them; transfer keeps past attendance on old batch. Session generation idempotency & regeneration rules; enrolment history (student leaves batch → past sessions still show them, future don't); teacher sees only assigned batches/students; timezone correctness of "today" for tenant timezone vs server UTC; cancelled session excluded from generation re-runs.

**Exit gate.** Common gate + E2E: create batch with weekly schedule → sessions appear in timetable week view → cancel one → teacher login sees only their batches.

---

### Phase 6 — Attendance + Offline Sync

**Goal.** A teacher can take attendance in seconds, online or offline, and it reaches the server exactly once. This is AcademyBee's differentiator.
**Refs.** PRD v2 §7–13, §18, v3 §10–11, v2.1 §18.6, §18.8; UX §12, §14, §24, §29; ARCHITECTURE §11; ADR-016, ADR-017.

**Scope**
- DB: `Attendance` (+ `version`, denormalised `batchId`, `sessionDate`, `branchId`), `SyncOperation`, `AttendanceDailySummary`, `StudentMonthlyAttendance`; session status transitions (Scheduled → Started → Completed).
- API: `GET/PUT /sessions/:id/attendance` (bulk, idempotent), `PATCH /attendance/:id`, history & percentages, `/attendance/overview`; `sync/bootstrap`, `sync/pull`, `sync/push` with op registry (`attendance.markSession`, `attendance.update`); acceptance/edit windows (OD-11); conflict detection (ADR-017).
- ⤴ C-06 **Teacher PWA core**: shell + bottom nav (Home · Classes · Students · Learning (hidden until Ph 9) · More), **Teacher Today** (UX Tier 1: today's classes, next class, Take Attendance), Classes list (today/upcoming/past 7 days), **Attendance screen** (UX Tier 1: large toggles, Mark All Present, exceptions, Late/Leave, counts, save → confirmation), Students (assigned), Sync Center (`/teach/sync`).
- Offline: Dexie schema v1 full (ARCHITECTURE §11.2), bootstrap on login, incremental pull, queue + runner (triggers, backoff, Web Lock), persistent storage request, OfflineBanner/SyncIndicator/SyncCenter states per UX §12.1, conflict resolution UI, logout guard, cache wipe on logout/revocation.
- Owner/admin: Attendance overview (today's completion by batch, missing roll-calls in Owner Today attention), Student 360 **Attendance** tab, Batch Workspace **Attendance** tab, monthly %.
- ⤴ C-04 Notifications foundation: `NotificationIntent`, `Notification` (in-app), outbox → worker fan-out, notification bell/centre for staff; `attendance.absent/late` intents for parents stored (visible to parents on the Family Hub from Phase 7P; WhatsApp/push channels from Phase 10).
- Metrics: sync push results by status, queue age reported by clients (beacon), conflict rate.
- ⤴ G-16 in-app nudge to teacher 30 min after session end without attendance; Owner Today "attendance not taken" list.

**Tests**
- Unit: queue state machine, backoff, entityKey ordering/blocking, conflict rule truth table.
- Integration: duplicate `opId` → `DUPLICATE` with original result; 50 concurrent retries of the same op → one row; op for unassigned batch → `REJECTED`; op for cancelled session → `REJECTED` and visible; cross-tenant op → `TENANT_MISMATCH`.
- E2E offline (Playwright): login → bootstrap → `setOffline(true)` → mark 25 students → reload page while offline (data persists, pending = 25) → close & reopen context (restart) → `setOffline(false)` → auto-sync → "All changes synced" → server has 25 rows → parent absence intents created once. Two-device conflict scenario → conflict surfaced and resolved.
- Performance smoke: bulk write of a 60-student session < 300 ms p95 locally.

**Exit gate.** Common gate incl. offline suite; real-phone test on Android Chrome and iOS Safari (installed PWA) with airplane mode; **M1 Academy Alpha**.

---

### Phase 7 — Finance

**Goal.** Invoice → payment → receipt is authoritative, auditable and impossible to double-count.
**Refs.** PRD v2 §19, §30, v3 §9, §12; UX §13, §29; ARCHITECTURE §12; ADR-010, ADR-018; OD-02, OD-10.

**Scope**
- Fee plans (monthly/quarterly/half-yearly/annual/custom, components), student fee assignments with discounts (percent/fixed, validity), recurring invoice generation job + manual invoice, invoice issue/cancel, `NumberSequence` numbering, optional tax config (OD-10).
- Payments (**G-30, ADR-038 — all enabled, no gateway**): staff-recorded Cash, UPI (UTR), Bank transfer, Cheque (pending → cleared/bounced), Card-on-POS; partial payments, allocations across invoices, receipts (worker PDF → storage → signed URL), payment history; **parent-reported UPI API** (domain service + hub route `/hub/academies/:slug/invoices/:id/reported-payments` behind a release flag, tested with a `HUB` session; the parent UI arrives in 7P — C-38) with staff **Verify payments** queue (confirm/reject with reason) and duplicate-UTR detection; manual refunds (`payment.refund`, reason, method + reference); gateway-ready layer: `PaymentProvider` interface, `ManualProvider` (prod default), `SimulatorProvider` (non-prod only), `TenantPaymentAccount`, webhook endpoint, `GatewayEvent` idempotency, status polling, reconciliation job + exceptions list — all exercised via the simulator; **never client-confirmed**.
- Offline: Dexie v2 (`invoices` read cache for permitted roles, pending cash payments); `payment.recordCash` sync op with `clientRef = opId`; "Pending sync — receipt number assigned when synced" UI; over-payment → unallocated credit flagged (ADR-018/§11.5).
- Overdue derivation job; **fee reminder intents** (in-app now) ⤴ C-04.
- UI: **Finance Dashboard** (UX Tier 1: Collected · Pending · Overdue · trend · Needs attention), Invoices list, **Invoice workspace** (student, components, total, paid, balance, Collect/Send/Download), Collect Payment drawer, Payments list, Fee Plans, Student 360 **Fees** tab, Batch **Fees** tab, Owner Today financial pulse, Global Add (Invoice, Payment).
- ⤴ C-08 Onboarding **Fee Setup** step (optional) for new tenants.
- ⤴ G-01/G-30 **Academy payment setup**: Settings → Payments → UPI ID + payee name + QR preview, bank details for invoices, payment methods on/off, cheque handling; "Online gateway — not connected yet" card (connection UI built behind the simulator; live in Phase G). AcademyBee never holds fee money.
- ⤴ G-04 **Fee rules**: mid-cycle policy (full/prorated by days/by sessions/next cycle), sibling discount, credit balance auto-applied, late-fee suggestion with approval, fee pause on ON_HOLD, write-off with reason, one-time fees, instalments.
- ⤴ G-02 **Opening balances** import/entry as `OPENING_BALANCE` invoices at cut-over date.
- ⤴ G-32 documents rendered HTML → PDF with headless Chromium + Noto fallback font (non-Latin student/parent names print correctly; document language/bilingual options come in Phase L).
- ⤴ G-18 receipts/invoices: A4 + mobile PDF, signed expiring share link (7 days, revocable), prefilled WhatsApp/email share, reprint; issued documents immutable.
- ⤴ G-27 fee effect of transfer/status change (switch plan next cycle or prorate per policy).
- Audit on every financial mutation.

**Tests.** Reported UPI: pending never issues a receipt; verify → one receipt; reject → parent notified with reason; same UTR twice flagged; cheque clear/bounce transitions; production config with `SimulatorProvider` fails to boot. Fee-rule maths unit tests (proration, sibling, credit, instalments); webhook (simulator) for tenant A's account can never affect tenant B; gateway credentials never in logs/responses (log scan test); share link expiry/revocation. State machine exhaustive tests; allocation property tests (never over-allocate, sums balance); concurrent payments on one invoice (row lock); webhook replay ×10 → one confirmation; forged webhook signature → 401 + alert metric; client attempt to set status → rejected; offline cash op retried → one payment; receipt numbers unique & sequential under concurrency; refund without permission → 403; cross-tenant invoice access → 404.

**Exit gate.** Common gate + E2E: assign fee plan → invoice generated → partial cash → receipt → parent-reported UPI (via API) → staff verify → PAID → receipt PDF; cheque bounce; manual refund; online path via `SimulatorProvider` (success, failure, duplicate webhook); offline cash E2E. **M2 Operations MVP.**

---

### Phase 7P — Pilot Readiness Pack

**Goal.** Two real academies (one tuition, one activity) run daily operations on AcademyBee — owners, teachers **and parents** — with support and measurement in place.
**Refs.** PRD v3 §8, §19, §25, §27; PRD v3.2 §1, G-06, G-09, G-10, G-12, G-13, G-29; UX §15, §25, §29 (Parent Home Tier 1).

**Scope**
- ⤴ C-21 / G-31 **Parent Core on the Family Hub** (`app.academybee.com`, ADR-039): one login for all linked academies; add academy by QR / typed URL or code / invite (verification code or join request; consent per academy); "All academies" Home (today's classes across academies tagged by academy, children cards, dues per academy, merged notifications) and single-academy mode with that academy's branding; My academies (consent, leave); sign-in via invite (with consent capture, G-06), child selector, **Parent Home** (child status, next class, attendance this month, dues, latest notifications), child attendance history, fees: invoices, receipts download/share, **Pay** via academy UPI (QR + one-tap `upi://` link → "I've paid" + UTR → "Awaiting academy confirmation" → confirmed + receipt; G-30), status of reported payments (pending / confirmed / rejected with reason), in-app notification centre (absence alerts, fee reminders from Phases 6–7), basic offline read cache with "Last updated".
- ⤴ C-23 **Help & support** (G-10): Help entry in every shell, help centre (15 articles), Contact support (WhatsApp/email, prefilled academy + page context, no PII), feedback form with optional screenshot, What's new.
- **Activation dashboard** (G-09): internal page on the console (platform-only) or PostHog dashboard showing per-academy funnel and pilot metrics (G-29).
- **Demo academy** (G-13): `demo` tenant (reserved slug, allowed only as a platform-owned tenant — C-36), realistic seed, role login panel, nightly reset job, messaging sink.
- **Pilot runbook** in `docs/runbooks/pilot.md`: provisioning checklist, import session script, teacher training (15 min), parent invitation message templates, weekly feedback call agenda, triage rules (P0 fixed within 48 h), success criteria (G-29).
- Production environment stood up (subset of Phase 15): production DB with automated backups, Sentry, uptime monitor, on-call phone for the founder, staging → production release process.

**Tests.** Family Hub: parent linked to demo-a and demo-b sees both in one Home; every per-academy hub call runs under that tenant's context (integration test asserting `app.tenant_id` per call); unlinking at demo-b removes it on next refresh; scanning demo-b QR without verification grants nothing; hub token rejected on academy URL. Parent IDOR (other child, other tenant); parent-reported UPI pending → confirmed / rejected paths; parent cannot report a payment on another family's invoice; consent required before parent activation; demo reset leaves no data from previous day and sends no real messages; production smoke suite.

**Exit gate.** Common gate passes and the PO accepts on staging → merge → production go-live (PROMPTS.md P7P-6) → both pilot academies provisioned in production, students imported, teachers taking attendance, parents invited. **M2P Pilot Start.** From here, every later phase gate includes "pilot feedback triaged".

---

### Phase 8 — CRM

**Goal.** Lead → trial → admission is fast and measurable, with no data re-entry.
**Refs.** PRD v2 §23, v3 §6–7; UX §10, §17; C-10, C-12.

**Scope.** Leads (source, contact, interested course, notes, owner), pipeline board (desktop kanban, mobile list) with v3 stages and lost reasons; follow-ups with due dates (Owner Today attention); lead cards with next action (Call `tel:`, WhatsApp `wa.me` deep link, Schedule Trial); **Trial workspace** (session, teacher, reminder intent, attendance on the teacher's session list flagged "Trial", feedback, follow-up, Convert to Student); **Admission** conversion reusing lead/trial data → Student + Parent + enrolment + optional first invoice, idempotent; CRM dashboard & conversion funnel; ⤴ public enquiry form `{slug}.academybee.com/enquire` (rate-limited + Turnstile) creating leads; Global Add (Lead); ⤴ G-19 optional **academy public page** at the tenant root for signed-out visitors (about, courses, timings, contact, WhatsApp, enquiry form, SEO metadata; owner controls every field; off by default).

**Tests.** Conversion idempotency (double submit → one student); duplicate lead detection by phone; receptionist scope; public form abuse (rate limit, captcha fail); trial attendee appears offline on teacher device and syncs.

**Exit gate.** Common gate + E2E: public enquiry → lead → trial scheduled → teacher marks trial present → feedback → convert → Student 360 shows lead history.

---

### Phase 9 — Learning

**Goal.** Homework, assessments and progress that fit tuition and skill academies alike.
**Refs.** PRD v2 §22, v3 §9; UX §14 (teacher learning), §18; ADR-021, ADR-029.

**Scope.** Object storage full (ADR-021: presigned upload/download, attachment confirm, image re-encode); Homework (create, assign to batch/students, due date, attachments), submissions (student/parent upload or teacher marks complete), completion tracking; **offline homework drafts & teacher notes** (Dexie v3, `homework.saveDraft`, `note.upsert` ops; publish is online); Assessment templates per academy type (tuition subjects, karate Technique/Discipline/Fitness/Forms, dance Rhythm/Technique/Expression/Performance, music Theory/Technique/Rhythm/Performance) editable per tenant; grading scales (marks, grades, rubric levels); results & remarks; **Progress timeline** in Student 360; Teacher **Learning** tab (Homework · Assessments · Drafts); Batch **Learning** tab.

**Tests.** File access scoped (teacher of other batch → 404; expired URL fails); upload type/size limits; draft offline → restart → sync; grading calculations; template changes don't alter historical results.

**Exit gate.** Common gate + E2E: teacher drafts homework offline → publishes online → assessment for karate template → progress timeline shows it.

---

### Phase 10 — Communication

**Goal.** Automated, multi-channel, provider-independent communication with delivery visibility and cost control.
**Refs.** PRD v2 §24, v2.1 §18.7, v3 §7; UX §19; ADR-020; OD-04.

**Scope.** Channel adapters: email (provider), **web push** (VAPID, subscription management, SW push handler), **SMS** (DLT-registered templates), **WhatsApp Cloud API** (approved templates, opt-in capture, webhook delivery status); tenant channel configuration & sender identity; template library (system defaults + tenant overrides, variables validated against intent schema, per-channel variants, preview); **Communication Center** (All · Parents · Teachers · System) and **Composer** (audience → channels → template → preview → schedule/send); Announcements (academy-wide, batch-level by teachers); message history & per-recipient delivery status; automated triggers wired to existing intents (attendance absent/late, fee reminders/overdue, trial reminders, homework due) with tenant toggles, quiet hours, dedupe; contact preferences & opt-out; per-tenant usage meter (feeds entitlements); ⤴ OD-04 **phone OTP login** for parents/students.
- ⤴ G-07 compliance: SMS templates stored with DLT template IDs (unregistered sends blocked); WhatsApp approved templates by category, opt-in records, opt-out handling, sender strategy per OD-15; email via authenticated domain with academy display name + reply-to.
- ⤴ G-16 teacher session reminders and missed-attendance nudges via push/WhatsApp (tenant setting).
- ⤴ G-32 (invisible): templates and announcements stored locale-keyed with `en-IN` only; recipient locale resolution in place (always `en-IN` for now). Per-language variants, WhatsApp/DLT registrations per language and Unicode SMS pricing come in Phase L.

**Tests.** No duplicate sends under retry/replay (dedupe keys); template variable validation; provider failure → retry → failover/visible failure; opt-out respected; tenant isolation in fan-out jobs; quiet hours; OTP brute-force limits.

**Exit gate.** Common gate + E2E (provider sandboxes/mocks behind adapter): absent student triggers WhatsApp + push once; scheduled announcement delivers at time.

---

### Phase 11 — Parent + Student (complete)

**Builds on Phase 7P Parent Core (Family Hub).** Adds everything not in the core, polishes offline, delivers the student experience on the hub, and completes G-31: parent-private **child grouping** across academies (suggested by name + DOB; needs a user-bound DB client setting `app.user_id` for the `HubChildGroup` RLS policy — new ADR, C-39), unified schedule/calendar across academies, per-academy notification preferences, offline cache per academy with its own "Last updated".

**Goal.** Parents need no training: child status, next class, attendance, fees and homework at a glance; paying is safe and clear.
**Refs.** PRD v2 §20, v3 §8, §10; UX §15–16, §25, §29; C-05; OD-01, OD-08.

**Scope.** Parent experience on the Family Hub `app.academybee.com` (mobile-first): **Parent Home** (UX Tier 1: greeting → child status → next class → attendance → fees → homework → notifications), child selector, child detail, Schedule, **Payments** (due, invoices, receipts download, **Pay** via UPI → awaiting confirmation → confirmed UX, never premature success; online gateway option appears automatically once Phase G connects one), homework view/submit, progress, notification centre, profile & contact preferences; offline read cache (Dexie scope `parent`: own children, timetable, attendance, invoices, recent notifications) with "Last updated …"; installable Family Hub PWA prompt (selected academy's logo shown inside); ⤴ G-17 **leave requests** (future date/range + reason → pre-marked "Leave (parent informed)" on teacher roll, teacher can override). Student experience `/me` (if enabled per tenant): Home, Classes, Homework (submit), Progress, Profile — lighter, motivational tone.

**Tests.** IDOR across siblings/non-linked children and tenants; reported payment pending → confirmed and rejected paths; simulator online path shows "processing" then "confirmed"; offline cache shows timestamp and no stale-as-fresh; student disabled tenant → `/me` access denied state.

**Exit gate.** Common gate + E2E: parent with two children switches child, pays invoice via reported UPI → staff confirms → downloads receipt; student submits homework. **M3 Growth.**

---

### Phase 12 — Reports

**Goal.** Owners trust the numbers and know what to do next.
**Refs.** PRD v2 §33, v3 §21, §27; UX §11.2, §20; `docs/METRICS.md`.

**Scope.** `docs/METRICS.md` metric registry (definition, formula, timezone, scope) implemented once in a metrics module used by dashboards, reports and exports; summary tables (attendance already, finance daily, CRM daily, enrolment snapshots) maintained by worker; Reports hub: Academy, Students, Attendance, Finance, Admissions, Teachers, Retention — each with date range, timezone, branch/course filters and "What happened / Why / What next" insight line; **Owner Dashboard** full executive briefing (UX Tier 1); retention risk list (attendance drop, overdue, lapsed enrolment); async CSV/XLSX exports (worker, notification when ready, signed URL, permission-scoped); ⤴ G-15 **full academy data export** (ZIP of CSVs + attachment manifest, available in every subscription state); ⤴ G-16 teacher accountability report (classes held vs scheduled, attendance on time).

**Tests.** Dashboard vs report vs export consistency for the same metric; exports respect scope (accountant finance only, teacher own batches); large export (100K rows) completes async without API timeouts; summary refresh idempotent.

**Exit gate.** Common gate + PO validation of numbers against a hand-calculated fixture academy.

---

### Phase 13 — SaaS Billing

**Goal.** AcademyBee earns revenue safely, with humane grace periods and no data hostage-taking.
**Refs.** PRD v2 §14 (Ph 14), v3 §6 (subscription lifecycle), §20; C-03, C-13; OD-02, OD-06, OD-12.

**Scope.** Subscription lifecycle `Trial → Active → Past Due → Grace → Suspended → Cancelled → Expired` as a state machine with scheduled transitions (`billing` queue); plan pricing & intervals; SaaS invoices (separate number series & tables from academy finance), payments (G-30): AcademyBee invoice shows AcademyBee UPI/bank details → owner reports payment with UTR → Super Admin verifies in console → Active (gateway auto-renew in Phase G; simulator drives lifecycle tests); dunning emails/in-app banners; upgrade (immediate, prorated) / downgrade (next cycle, limit check with guidance); cancellation with export path; suspension = read-only + billing + export (never blocks data export); academy **Settings → Subscription** screen; limit-reached upgrade prompts; ⤴ OD-06 self-serve signup + trial reusing `ProvisioningService` (email verification, slug choice, abuse controls).
- ⤴ G-21 **GST-compliant subscription invoices** (AcademyBee GSTIN, SAC confirmed by CA, CGST/SGST vs IGST by place of supply, customer GSTIN optional); e-invoicing if turnover requires (CA to confirm).
- ⤴ G-20 lifecycle communications to owners (welcome, onboarding nudges, trial ending, payment failed, grace, suspension warning, monthly summary).
- G-25 prices set from pilot-validated hypothesis.

**Tests.** State machine incl. clock-driven transitions (fake timers); owner-reported payment verify/reject; simulator webhook idempotency; downgrade over limits blocked with clear path; suspended tenant can still export; SaaS and academy invoice number spaces never collide.

**Exit gate.** Common gate + E2E: trial → pay → active → failed renewal → past due → grace → recovery.

---

### Phase 14 — Super Admin

**Goal.** A professional platform operations console, visually distinct from academies, where every cross-tenant action is explicit and audited.
**Refs.** PRD v2 §16, v3 §13; UX §21, v1.1 §2–3, §9; ARCHITECTURE §6.3–6.4.

**Scope.** Console TOTP 2FA (mandatory) + session management; **Overview** (academies, active, students, MRR, growth, recent activity); Academies full detail (Overview · Users · Students (counts/aggregates) · Subscription · Payments · Activity · Support), entitlement overrides; Users (search, filter, deactivate, force reset, memberships); Plans management UI; Payments (SaaS transactions: success/failed/pending/refunded); Growth analytics (acquisition, usage, retention, MRR/ARR/churn/trial conversion); Support tickets (+ academy-side Help → ticket, conversations, SLA fields); Platform announcements to academies; Platform settings (payment, notification, security); **Audit log viewer** (filters by tenant/actor/action/object, before/after); failed-jobs ops view with replay; **Login as Academy** (reason, time-box, banner, dual-identity audit, blocked sensitive actions).

**Tests.** Every console endpoint requires `aud=CONSOLE` + platform capability; impersonation audit and restrictions; support agent vs super admin capability differences; analytics numbers vs fixture.

**Exit gate.** Common gate + PO review of console; **M4 Commercial.**

---

### Phase 15 — Security + Performance + Production Hardening

**Goal.** Production-grade confidence: secure, fast, observable, recoverable. (Security and tests are built in every phase — this phase is the formal gate, not the first pass.)
**Refs.** PRD v2 §29, v2.1 §18.9–18.11, v3 §16–18, §23, §28; OD-09.

**Scope**
- Security: OWASP ASVS L2 review; threat model per module; automated DAST on staging; dependency & secret scanning in CI; CSP nonce hardening, HSTS preload; session & rate-limit review; file upload malware scanning hook; webhook abuse tests; external penetration test.
- Privacy/compliance: data retention & deletion policy (OD-09), tenant offboarding & export, DPDP review (consent for minors' data, grievance contact), privacy notice.
- Performance: k6 load tests at Stage-4 volumes (attendance bulk writes, dashboards, lists, exports, sync push); `pg_stat_statements` review, index tuning, N+1 elimination; attendance partitioning decision (ADR if enabled); CDN/cache headers; Web Vitals budgets on Tier-1 screens (mid-range Android, 4G).
- Reliability: backup automation + **restore drill** (RPO ≤ 24h, RTO ≤ 8h documented), DR runbook, blue-green/rolling deploy verification, rollback drill, chaos tests for Redis/worker outage (outbox guarantees).
- Offline reliability: long-offline (7-day) soak, storage-eviction behaviour on iOS, multi-tab, SW update during pending ops.
- Observability: dashboards and actionable alerts (API errors, p95, DB saturation, queue age, sync failure/conflict rate, webhook failures, reconciliation exceptions, backups) routed to on-call; status page; cost observability per component (PRD v2.1 §18.11).
- Accessibility audit (axe + manual screen reader) on Tier-1 screens.
- Runbooks in `docs/runbooks/`.
- ⤴ G-22 support hours, response targets per plan, uptime target, status page, incident template, maintenance policy.
- ⤴ G-26 tenant-scoped data recovery runbook (restore to sandbox, selective audited copy).
- ⤴ G-06 data-rights workflows complete (export, correction, erasure-by-anonymisation that preserves legally required finance records), breach response runbook.

**Exit gate.** All PRD v2.1 §18.11 scalability acceptance criteria demonstrated; no open critical/high security findings; restore drill evidence; **M5 Production GA**.

---

### Phase 16 — AI

**Goal.** Assistive intelligence with measurable value, built on trusted data — never the system of record.
**Refs.** PRD v2 §14 (Ph 16), v3 §22; ADR-028 (entitlement-gated).

**Scope.** AI gateway module (provider abstraction, prompt templates versioned, PII minimisation/redaction, per-tenant opt-in, request logging `AiRequestLog`, cost metering, rate limits); features in value order: attendance insights (drop-off detection, at-risk students), fee insights (likely-late payers, collection suggestions), lead follow-up assistant (next best action, draft follow-up), parent message drafting (**human review before send**), natural-language questions over the **metrics layer** (read-only, scoped, cites the metric used — never raw SQL over tenant data), report summaries. Evaluation datasets and acceptance thresholds per feature; kill switch per feature.

**Tests.** AI never writes attendance/payment/assessment facts; outputs cite source metrics; scoped data only (cross-tenant prompts impossible by construction); review-before-send enforced; eval thresholds met.

**Exit gate.** Each feature shows measured business value in pilot (PRD v3 §22) before GA; **M6 Intelligence**.

---

### Phase L — Multilingual Rollout (deferred; run any time after Phase 11)

**When.** After Phase 11 (Family Hub complete), when OD-18 is settled and native-speaker reviewers are available. Can repeat per language wave. Until then AcademyBee is English only; this phase also builds the deferred language UI (see G-32 table).
**Refs.** PRD v3.2 G-32; ADR-031, ADR-040; UX §31 (accessibility).
**Scope.**
- Deferred language UI: language switcher (profile), academy language settings (enabled, default, document language), per-language variant editors (composer, templates, public page, legal, help), per-script font loading, bilingual receipts, WhatsApp/DLT per-language registrations and Unicode SMS pricing, AI-assisted translation drafts for academy content (human review).
- Translation workflow per OD-18: glossary per language, machine-translation drafts allowed, native-speaker review mandatory (money/consent/legal always human), completeness report per locale.
- Wave 1 languages (OD-18) across, in order: **Family Hub** (parents & students) → **Teacher PWA** → notifications (in-app, push, email, WhatsApp/SMS templates registered and approved per language) → receipts/invoices (document language or bilingual) → consent, privacy notice and Terms per language → help centre articles → academy management screens.
- Academy settings: enable languages, choose default and document language; per-language variants in the announcement composer, message templates and public page (with `/<lang>/` URLs + `hreflang`).
- Cross-script search: transliteration column populated by the worker so Latin input finds native-script names.
- Fonts per script loaded on demand; performance budgets re-verified in each new locale.
**Tests.** Completeness report 100% for Tier-1 namespaces per released locale; Playwright visual checks per locale on Tier-1 screens; recipient-language resolution tests; PDF snapshot tests for each script; WhatsApp/SMS template-per-locale mapping; fallback-to-English per missing key never shows raw keys.
**Exit gate.** Common gate + native-speaker sign-off per language + a parent completes the core Family Hub journey (join academy, view attendance, pay via UPI, download receipt) entirely in the new language + adding the next language is demonstrated as content-only.

---

### Phase G — Gateway Activation (deferred; run when ready)

**When.** Any time after Phase 7P, once OD-02 (gateway choice) and OD-13 (legal sign-off) are settled and the AcademyBee Razorpay account is live. Everything else was built in Phases 7 and 13 (ADR-038), so this phase is an adapter plus configuration.
**Scope.** `RazorpayProvider` implementing `PaymentProvider` (orders, checkout params, webhook signature verification, status fetch, refunds, settlements for reconciliation); academy **Connect gateway** flow in Settings → Payments (per-tenant keys or partner OAuth per OD-13, encrypted per ADR-033, test → live switch, verification ping); parent **Pay online** option shown next to UPI when an academy's gateway is verified; gateway refunds; reconciliation against real settlements; AcademyBee SaaS auto-renew via Razorpay Subscriptions or payment links; bank-statement CSV matching of UTRs (optional).
**Tests.** Everything already covered for the simulator re-run against Razorpay test mode; forged signature rejected; webhook for unknown account rejected; replay ×10 → one confirmation; tenant A's account can never confirm tenant B's invoice; live-mode keys never in logs.
**Exit gate.** Common gate + a real ₹1 live payment to a pilot academy's own account, confirmed by webhook, receipt issued, and reconciliation matched.

---

## 4. Deferred backlog (not scheduled — see OD-05)

- Multi-branch UI: branch management, branch staff assignment, branch switcher, branch reports (data model ready since Phase 1).
- Expenses & profitability (PRD v2 §14 Ph 13; `expense.manage` reserved).
- Certificates & Events (certificates, workshops, competitions, parent meetings).
- Custom domains activation (model ready since Phase 1; edge API integration).
- Custom tenant roles UI (`role.manage`).
- Staff "My academies" launcher on the Family Hub with single sign-on into each academy URL (teachers working at several academies) (G-31 §10).
- Right-to-left languages (e.g. Urdu, Arabic for Gulf academies): layout is RTL-ready from Phase 0 (G-32); activation is a future wave.
- Play Store listing via Trusted Web Activity (G-23); native wrappers only if PWA limits are proven.

---

## 5. Cross-phase dependency map

```text
Main line:
P0 ─▶ P1 ─▶ P2 ─▶ P3 ─▶ P4 ─▶ P5 ─▶ P6 ─▶ P7 ─▶ P7P (pilot starts) ─▶ P8 ─▶ P9 ─▶ P10 ─▶ P11 ─▶ P12 ─▶ P13 ─▶ P14 ─▶ P15 ─▶ P16

Deferred, run when the PO decides:
P7P ─▶ G  (Gateway Activation — after Razorpay KYC + legal sign-off)
P11 ─▶ L  (Multilingual Rollout — after first languages + reviewers are ready)

Pulled-forward dependencies:
P1 app. host ─▶ P2 HUB session ─▶ P4 invites/QR/join requests ─▶ P7P Family Hub ─▶ P11 hub completion (G-31)
P3 plans/entitlements/trial (C-03) ───────────────────────────────▶ P13 billing
P2 console login + CLI admin ─▶ P3 provisioning console slice (C-02) ─▶ P14 full console
P6 in-app notifications + P7 fee-reminder intents ─▶ P7P parents see them ─▶ P10 external channels
P0 i18n groundwork (en-IN only) ──────────────────────────────────▶ L languages (G-32)
P7 payment provider layer + simulator (ADR-038) ──────────────────▶ G Razorpay adapter
```

---

## 6. Exit notes (fill in as phases complete)

### P-00 Orientation (2026-09-30)
- All docs read; contradictions/gaps recorded as C-29…C-41 and resolved by the PO; OD-14, OD-19, OD-20, OD-21 closed; OD-03 default confirmed (vendors proposed in P0-1).
- Pack moved to the repository root (C-29).
- Pre-Phase-0 blockers for the PO: toolchain in WSL2 (OD-20), paid GitHub plan for rulesets (OD-19), staging accounts (OD-03).

### Phase 0
- Pinned versions: _tbd_
- Deviations: _none yet_
- PO acceptance: _pending_

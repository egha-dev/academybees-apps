# AcademyBee — Implementation Plan

> Status: **Baseline v1.5** (incorporates PRD v3.2 Addendum incl. G-30 payments, G-31 Family Hub, G-32 multilingual; slice workflow ADR-041; P-00 orientation decisions C-29…C-41, OD-14/19/20/21) · Last updated: 2026-10-07 · Current phase: **Phase 3 — Academy Provisioning + Onboarding (🟨 in progress since 2026-10-07)** · Phase 0 ✅ 2026-10-01 (tag `phase-0`) · Phase 1 ✅ 2026-10-02 (tag `phase-1`) · Phase 2 ✅ 2026-10-07 (tag `phase-2`; **M0 Foundation Release**)
> Build order is the Product Owner's 17-phase sequence (DECISIONS C-01) plus **Phase 7P — Pilot Readiness Pack** (C-21). `G-xx` = gap requirement from `docs/PRD_ADDENDUM_v3.2.md`. Items pulled forward to satisfy dependencies are marked **⤴ pulled forward** with their decision reference.
> A phase is DONE only when its exit gate and the Common Phase Gate (§2) pass. Never mark a phase complete because screens render.
> Work lands on `main` in small **slices** (1–5 tasks per PR, auto-merged when CI is green) behind release flags; a phase starts with tag `phase-<id>-start` and closes with tag `phase-<id>` (ADR-041).

---

## 1. Phase tracker

| # | Phase | Status | Pulled-forward slices | Key decisions |
| --- | --- | --- | --- | --- |
| 0 | Foundation | ✅ 2026-10-01 | Outbox, audit, idempotency tables; English-only i18n foundation, multilingual-ready (G-08, G-32), analytics port, perf budgets (G-09, G-24) | ADR-001/002/012/013/014/015/016/022/030/031/032/035/040 |
| 1 | Multi-Tenant + Wildcard Domain | ✅ 2026-10-02 | Default branch per tenant; `app.` Family Hub host reserved + classified (G-31) | ADR-003/004/005/039, C-07 |
| 2 | Authentication + RBAC | ✅ | Transactional email; Super Admin CLI bootstrap; optional 2FA + devices (G-11); `HUB` session audience for parents/students (G-31) | ADR-006/007/008/039, C-02, C-04, C-25, C-27 |
| 3 | Academy Provisioning + Onboarding | 🟨 | Provisioning Console slice; Plans/Entitlements/Trial (G-25); minimal People & Scheduling create commands; legal acceptance (G-06) | C-02, C-03, C-08, C-09, ADR-028/034 |
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
**Status.** ✅ 2026-10-01 — PO acceptance recorded below (started 2026-09-30, `phase-0-start` = `72a4078`; closed with tag `phase-0`). Approved slice plan: [`docs/plans/phase-0.md`](plans/phase-0.md).

**Slices (each = one PR, ADR-041)**

| Slice | Branch | Tasks | State |
| --- | --- | --- | --- |
| S0 | `p0/bootstrap` | plan update, 0.1, minimal CI | ✅ #2 |
| S1 | `p0/governance` | 0.18 files + `apply-governance.sh` (applied when the paid plan is active, OD-19) | ✅ (#3); script applied on the free plan 2026-09-30 — ruleset, secret scanning, production environment skipped (C-44) |
| S2 | `p0/infra-local` | 0.2 | ✅ #4 (local S3 = SeaweedFS, C-45) |
| S3 | `p0/contracts` | 0.3 | ✅ #6 |
| S4 | `p0/database-testing` | 0.4, 0.11 | ✅ #7 |
| S5 | `p0/api-core` | 0.5 | ✅ #8 |
| S6 | `p0/worker` | 0.6 | ✅ #9 |
| S7 | `p0/i18n-analytics` | 0.15 (core), 0.16 | ✅ #10 |
| S8 | `p0/ui` | 0.7 + logical-CSS lint | ✅ #11 |
| S9 | `p0/web-shell` | 0.8, 0.9, 0.15 (web); release flag `p0-flag-probe` (owner PO, remove in Phase 1) | ✅ #12 |
| S10 | `p0/sync` | 0.10 | ✅ #13 |
| S11 | `p0/e2e-ci` | 0.12, 0.17, full 0.13 | ✅ #14 |
| S12 | `p0/staging` | 0.14 (workflows off until `STAGING_ENABLED`) | ✅ #15 merged; staging goes live when the accounts exist (runbook) |
| S13 | `p0/docs` | 0.19 | ✅ #16 |
| G1 | `p0/gate-fixes` | P0-3 gate: `pnpm dev` and `db:seed` from a clean clone | ✅ #17 |
| S14 | `p0/dark-theme` | PO design review: Light / Dark / System themes (C-49, UX V1.2 addendum) | ✅ #18 |
| R1 | `p0/review-fixes` | P0-4 independent review: H1 idempotency key released after a committed handler | ✅ #19 |
| C1 | `p0/close` | P0-5: exit notes, C-50, tracker | ✅ |
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
- Repository: a direct push to `main` is rejected; a PR with a failing check cannot merge; a green PR auto-merges and deploys to staging; a release flag hides an unfinished screen on staging (ADR-041). *(C-44: while on the free GitHub plan, the first two items are waived by the PO and evidenced by the C-43 merge process.)*


**Exit notes (2026-10-01 — Phase 0 ✅)**

*PO acceptance.* **Accepted by the Product Owner on 2026-10-01**, with two recorded conditions: the C-44 waiver of the repository-rule gate items is re-confirmed (solo developer, every change via PR), and staging is **deferred** to a later phase as a known open item (**C-50** — must be live no later than the Phase 6 gate). Acceptance was done locally.

*Delivered.* Monorepo and toolchain; local infra (Postgres, Redis, Mailpit, SeaweedFS); contracts (error envelope, `ErrorCode`, pagination, permissions skeleton, sync op base); database roles/grants, first migration (audit, idempotency, outbox, feature flags) and local/ci-only seeds; NestJS API core (config, pino + redaction, request IDs, Zod pipe, error filter, health, OpenAPI, `@Idempotent()`, `@Audited()`, outbox, CLS, trusted proxy host); worker (BullMQ, heartbeat, outbox relay); English-only i18n with Intl formatters and pseudo-locale/long-text builds; analytics port with PII guard; `@academybee/ui` design system with Light/Dark/System themes (C-49); web shell with host-routing stub, PWA (Serwist, offline page, install and update prompts) and release flags; Dexie sync queue and runner; Playwright E2E on desktop, Android and iPhone projects; CI with performance budgets; Docker images and staging/production workflows (off); governance files and README.

*Pinned toolchain (pnpm catalog, C-42).* Node 24.21 (`.nvmrc` 24) · pnpm 12.8.1 · Turborepo 2.11.5 · TypeScript 5.9.3 · ESLint 9.39.5 · Vitest 5.0.3 · Next.js 16.3.8 (`proxy.ts`, C-34) · React 19.3 · MUI 9.4 · next-intl 4.14.8 · TanStack Query 5.104 · Serwist 9.5.12 (`@serwist/turbopack`) · NestJS 12.1.2 (ESM) · Prisma 7.10.0 (pg adapter) · Zod 4.6.5 · BullMQ 6.3.10 · ioredis 6.0 · pino 10.3 · Dexie 4.4.6 · Sentry 11.1 · Playwright 1.63 · axe-core 4.13 · Lighthouse CI 0.15.1 (Lighthouse 12.6) · Testcontainers 12.2 · images `postgres:17-alpine`, `redis:7-alpine`, `axllent/mailpit:v1.31`, `chrislusf/seaweedfs:4.48`, runtime `node:24-alpine`.

*Deviations from the plan, each recorded before coding.* C-42 toolchain majors (NestJS 12 ⇒ all-ESM; source export condition `@academybee/source`) · C-43 merge only after all required checks · C-44 stay on the free GitHub plan (ruleset, secret scanning and production environment skipped; repository gate items waived) · C-45 SeaweedFS instead of MinIO locally · C-46 Serwist on Turbopack, `/api` proxy with shared secret in `proxy.ts`, self-hosted Inter · C-47 installability via Chromium in Playwright, Lighthouse for LCP/CLS/a11y, own route-JS budget script · C-48 staging deploy mechanics (GHCR, Render hooks, migrate-before-deploy, Vercel CLI) and Sentry wiring. · **C-49** (PO design review, 2026-10-01) light and dark themes: semantic colour roles, follows the device with a Light / Dark / System toggle, no flash on load, AA in both themes.

*Release flags.* `p0-flag-probe` — owner PO — off in every environment — expires 2026-12-31 — **remove in Phase 1** (`pnpm flags:check` fails CI after expiry).

*Evidence for the exit gate (P0-3 re-runs all of it).*

| Gate item | Evidence |
| --- | --- |
| Clean clone → infra → migrate → dev | README "Local setup (WSL2)"; `pnpm dev` verified 2026-10-01 (web, API via proxy, worker heartbeat in ≈55 s); timed clean clone is P0-3 |
| CI green | PRs #2–#16, all required checks green before merge |
| Staging serves `/api/health/ready` | **DEFERRED (C-50)** — workflows merged off; needs the OD-03 accounts (`docs/runbooks/environments.md`) |
| Error envelope | `apps/api/test/contract/error-envelope.int.spec.ts` |
| Idempotency | `apps/api/test/integration/idempotency.int.spec.ts` |
| Outbox | `apps/worker/test/integration/outbox-relay.int.spec.ts`, `worker.int.spec.ts` |
| Dexie restart + backoff | `packages/sync/src/queue.spec.ts`, `backoff.spec.ts`, `runner.spec.ts` |
| PWA installable + offline page | `e2e/specs/pwa.spec.ts` (Chromium installability + offline reload) |
| Design system reviewed by PO | `/dev/design-system`; screenshots in CI artifact `e2e-artifacts` (`screenshots/design-system-*.png`) — reviewed by the PO 2026-10-01 (led to C-49) |
| Light and dark themes (C-49) | `packages/ui/src/tokens.spec.ts` (AA contrast, both palettes); `e2e/specs/theme.spec.ts` (follows device, no flash with app JS blocked, toggle remembered); `design-system.a11y.spec.ts` runs axe in both themes |
| Pseudo-locale, long text, money, names | `e2e/specs/i18n-pseudo.spec.ts`; `packages/i18n/src/format.spec.ts`, `name.spec.ts`; Tamil/Hindi round trip in `error-envelope.int.spec.ts` |
| Analytics PII guard | `apps/api/src/core/analytics/pii-guard.spec.ts`, `packages/contracts/src/analytics/pii-guard.spec.ts` |
| Repository rules | Push to `main` / failing-PR block **waived (C-44)**; green PRs merged by the C-43 process; flag hides `/flag-probe` (`e2e/specs/flag.spec.ts`; staging smoke check once live) |
| Independent review (P0-4) | No CRITICAL; 1 HIGH (H1) fixed in #19 with a regression test (`idempotency.int.spec.ts` → "a failure to store the response … keeps the key locked"); MEDIUM/LOW findings assigned below |
| Budgets (G-24) | `pnpm perf:budget` shell 196 KB / 200 KB; Lighthouse LCP 1.9 s, a11y 100 (local, mobile 4G) |

*Open items and follow-ups.*
- **PO:** staging accounts + `STAGING_ENABLED` (runbook) — **deferred, C-50** (no later than the Phase 6 gate); release PR #5 (first version, `v0.1.0`) is yours to merge when you want a version tag; optional GitHub Pro → `scripts/github/apply-governance.sh`.
- **Phase 1:** remove `p0-flag-probe`; FK to `Tenant` + RLS on `feature_flag_override` (C-35) **and on `outbox_event`, `audit_log`, `idempotency_record`** (they carry `tenant_id` but have no policy yet); cross-tenant suite scaffold in `packages/testing`; real host routing replaces the `proxy.ts` stub; dynamic manifest; review **M4** (take the client IP from `X-Forwarded-For` once the proxy secret validates — audit IPs and the Phase 2 throttler depend on it) with an integration test of forwarded host + secret through the CLS middleware.
- **Before the staging go-live (C-50):** review **M6** — staging `workflow_dispatch` only from `refs/heads/main`, `environment: staging` on deploy jobs with `STAGING_*` as environment secrets; **L5** production guard on `github.triggering_actor` + CI-green check for the tag SHA. `/api/docs` is public on staging (non-production only) — acceptable until then.
- **Phase 2 (before any finance or provisioning endpoint uses `@Idempotent()`):** review **M1** stale IN_PROGRESS lease (today a crash or a failed `complete()` locks the key for 24 h — safe, but blocks retries); **M2** store the schema-filtered response, not the raw handler output (fix interceptor order); **M3** no extra audit row on an idempotent replay; **L2** log URLs without query strings, deep redaction paths; **L1** mask `Error` messages/stacks and drop Prisma `meta` in logs; **L4** unmapped 4xx statuses become 500 without being logged.
- **Phase 6 (sync goes live):** review **M5** — validate the push response, `markRetry` on any post-transport error, transport timeout, tests for a malformed response and a throwing `applyResult`; **L8** run `recoverInterrupted()` inside the Web Lock.
- **Phase 15 (or earlier when volume warrants):** **L6** purge expired idempotency records and dispatched outbox events; **L7** outbox relay backoff + dead-letter for poison rows. Small: **L3** PII guard also checks long numbers; **L9** token shadows in `pwa-prompts`/`theme-toggle`, `ConfirmDialog` focuses Cancel.
- **Phase 15:** trim API/worker images (~730 MB: `@prisma/client`'s peer pulls the Prisma CLI, Studio and TypeScript into production deps); total blocking time ≈ 350 ms on simulated mobile (Lighthouse warning only); OpenTelemetry tracing.
- **Watch:** the shell has ≈4 KB of route-JS headroom (React DOM + Next router ≈ 114 KB); teacher/hub screens in Phases 6–7P must import from `@academybee/ui/components/*` and lazy-load heavy UI.


---

### Phase 1 — Multi-Tenant + Wildcard Domain

**Goal.** Any request knows its tenant safely; the database refuses cross-tenant reads/writes; academy hosts show branded shells or polished status pages.
**Refs.** PRD v2 §27, v3 §13, v3.1 §C–G; UX v1.1 §1, §7, §8; ARCHITECTURE §5, §8.2.
**Status.** ✅ 2026-10-02 — PO acceptance recorded below (started 2026-10-01, `phase-1-start` = `f965f1d`; closed with tag `phase-1`). Approved slice plan: [`docs/plans/phase-1.md`](plans/phase-1.md) (decisions C-51…C-58).

**Slices (each = one PR, ADR-041)**

| Slice | Branch | Tasks | State |
| --- | --- | --- | --- |
| S1 | `p1/tenant-package` | 1.1 plan + decisions, 1.2 `packages/tenant` (host/slug/reserved, property tests) | ✅ #21 |
| S2 | `p1/tenant-schema` | 1.3 tenant tables + migration, 1.4 RLS applier + coverage test, 1.5 seeds + factories | ✅ #22 |
| S3 | `p1/tenant-client` | 1.6 tenant-bound Prisma client + lint, 1.7 isolation suite, 1.8 RLS benchmark | ✅ #23 |
| S4 | `p1/tenant-api` | 1.9 resolver + context, 1.10 guards + `GET /tenant/context`, 1.11 security tests, M4, cross-tenant scaffold | ✅ #24 |
| S5 | `p1/web-routing` | 1.12 `proxy.ts` routing, 1.13 status pages | ✅ #25 |
| S6 | `p1/web-branding` | 1.14 branding + manifest + icons (flag `p1-tenant-home`), 1.15 hub/console + remove `p0-flag-probe` (flag `p1-hub-placeholder`), 1.16 E2E + analytics (C-56: none) | ✅ #26 |
| S7 | `p1/docs` | 1.17 as-built docs | ✅ #27 |
| X1 | `fix/domain-academybees` | P1-3: product domain is `academybees.com` everywhere (C-57) | ✅ #28 |
| X2 | `ci/apt-timeouts` | CI: apt timeouts + retries for the Playwright browser install (hung twice) | ✅ #29 |
| R1 | `p1/review-fixes-1` | P1-4 M1–M3; C-55 accepted; C-58 Lighthouse median of 5; untrack stray agent-skill files | ✅ #30 |
| R2 | `p1/review-fixes-2` | P1-4 L3, L4, L5, L8, L9; review follow-ups by phase | ✅ #31 |
| C1 | `p1/close` | P1-5: exit notes, `.gitignore` for local agent-skill installs, tracker | ✅ (this PR) |

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

**Exit gate.** All above green; staging `*.staging.academybees.com` resolves two seeded tenants with correct branding and TLS.

**Independent review (P1-4, 2026-10-01).** No CRITICAL or HIGH. Fixed in Phase 1: M1 client IP through the web proxy, M2 tenant column grants + slug CHECK, M3 junk hosts (custom domains off, LRU) — #30; L3 route prefixes, L4 brand colour CHECK, L5 exact policy coverage, L8 platform audit rows insert-only, L9 spoof tests — R2. Assigned to later phases:
- **Phase 2:** L6 lint-restrict `createMigratorClient` and the `PrismaClient` constructor in app code; L7 reset `app.tenant_id` on the no-context path (or lint-ban `set_config` outside `packages/database`); API returns 404, not 500, if a mismatching tenantId ever reaches the client from request input.
- **Phase 3 (console: suspend/activate, domains):** L1 status changes visible within about 2 min (shorter web TTL for non-ACTIVE, per-tenant cache epoch, invalidation race); REDIRECT to a CUSTOM primary must check `verification`.
- **Staging go-live (C-50):** L2 namespace Redis tenant keys by root domain if Redis is ever shared; require `https:` `API_ORIGIN` and a non-local proxy secret in staging too; validate `PLATFORM_ROOT_DOMAIN` at web boot and check that web and API agree; apex link port on custom hosts.
- **Phase 15 (or when the check flaps again):** C-58 bring `/` LCP comfortably under 2.5 s.

**Gate evidence (P1-3, re-run 2026-10-02 on `main` = `cade406` after the review fixes; CI on `cade406` green)**

| Gate item | Evidence |
| --- | --- |
| Host classification matrix (apex, www, console, app, tenant, uppercase, port, trailing dot, IP, punycode, nested, unknown, REDIRECT, custom) | `packages/tenant/src/host.spec.ts`, `host.property.spec.ts` (fast-check), `slug.spec.ts`; `apps/web/src/lib/routing.spec.ts`; `apps/api/test/security/tenant-resolution.int.spec.ts` |
| Context A sees only A on every tenant table; raw SQL without context → 0 rows; writing B under A rejected by WITH CHECK | `packages/database/test/tenant-isolation.int.spec.ts` (generated from the Prisma models), `rls-coverage.int.spec.ts`, `tenant-schema.int.spec.ts` |
| Platform client only under `platform/**` (+ raw app client only in the database providers) | `packages/config/test/eslint-rules.spec.js` |
| Client-supplied tenantId / forged host never trusted; every tenant route registered | `apps/api/test/security/cross-tenant.int.spec.ts` + `cross-tenant.registry.ts`; `client-ip.int.spec.ts` (M4) |
| E2E: demo-a branding + manifest name; `nope` → 404 Unknown; `paused` → Suspended (+ archived, setup, redirect, hub, console) | `e2e/specs/tenant-hosts.spec.ts`, `tenant-status.a11y.spec.ts`, `i18n-pseudo.spec.ts`, `flag.spec.ts` |
| RLS overhead (budget amended to ≈ 2.5 ms p95 locally, C-55) | `pnpm --filter @academybee/database bench`: 2.2–2.5 ms p95 on 2026-10-01 (1.9–3.3 ms on a busy machine 2026-10-02, baseline itself noisy) — **accepted by the PO 2026-10-01**; re-measure on staging, same region |
| Staging `*.staging.academybees.com` + TLS | **DEFERRED (C-50)**; runbook *Academy hosts on staging* |
| Common gate commands | lint, typecheck, unit **407**, integration **190** (database 90, api 91, worker 9), build, `db:drift` clean, `perf:budget` (`/` 198.6 KB gz / 200), `i18n:check`, `flags:check`, E2E **180 passed** (desktop, Android, iPhone, en-XA, +40 % text), Lighthouse median LCP 2.05 s on `/` and `/offline`, a11y 100 |


**Exit notes (2026-10-02 — Phase 1 ✅)**

*PO acceptance.* **Accepted by the Product Owner on 2026-10-02**, locally (EXECUTION_GUIDE Part F, Phase 1). The staging item ("two academy URLs over https") stays **deferred under C-50**. The PO also decided C-55 (full RLS kept, ≈ 2.5 ms p95 accepted locally) and C-57 (domain `academybees.com`).

*Delivered.*
- `packages/tenant`: host classification (marketing / console / hub / tenant / custom / invalid), slug rules and reserved names, with property tests.
- Tenant tables (`Tenant`, `TenantDomain`, `TenantBranding`, `TenantSettings`, default `Branch`).
- **FORCE RLS on every table with `tenant_id`**, applied automatically after each migration:
  - narrow host-lookup policy (C-51);
  - platform-row policies (C-53), with platform audit rows insert-only for the app role;
  - column-level grants (status and slug are platform-only);
  - slug, hostname and colour CHECKs.
- **Tenant-bound Prisma client.** The tenant context is set in the pg driver adapter per statement and transaction (C-55). The client scopes arguments, fails closed without an academy, and routes `findUnique` through `findFirst`. An isolation suite is generated from the Prisma models.
- **API:**
  - `TenantGuard` + `TenantResolver` (Redis cache, negative cache, invalidation);
  - host policies (academy host by default);
  - `GET /api/v1/tenant/context`;
  - per-tenant release-flag cache;
  - `TenantContext.run`;
  - client IP only behind the trusted proxy;
  - cross-tenant suite with a route registry and 9 spoof attempts per route.
- **Web:**
  - `proxy.ts` routing (academy, 301 for old slugs, status pages with 404/503/410, Family Hub `app.`, console, marketing; fails closed when the API is down);
  - designed status pages (unknown, suspended, archived, setting up, access denied, temporarily unavailable);
  - branded academy home;
  - per-academy manifest and generated icons;
  - brand tint only at ≥ 4.5:1 contrast (C-49).
- **Seeds:** `demo-a`, `demo-b`, `paused`, `setup-demo`, `closed-demo`, `old-demo-a` (C-54). `p0-flag-probe` removed.

*Pinned toolchain.* Unchanged from Phase 0, plus `fast-check` 4.10.2 and `@prisma/driver-adapter-utils` 7.10.0 (pnpm catalog).

*Deviations, each recorded before coding.*
- **C-51:** host-lookup RLS policy.
- **C-52:** subdomains stored as labels + `PLATFORM_ROOT_DOMAIN`.
- **C-53:** NULL-tenant core rows.
- **C-54:** extra local seeds.
- **C-55:** driver-level tenant context; RLS budget ≈ 2.5 ms p95, accepted by the PO.
- **C-56:** no product analytics events in Phase 1.
- **C-57:** domain `academybees.com`.
- **C-58:** Lighthouse median of 5 runs.
- New config: `PLATFORM_ROOT_DOMAIN`, `TENANT_CACHE_MS`, `TENANT_NEGATIVE_CACHE_MS`, `CUSTOM_DOMAINS_ENABLED` (web + API, off), `TRUSTED_CLIENT_IP_HEADER` (web; `x-real-ip` on Vercel).

*Known limitations.*
- RLS adds ≈ 2–3 ms p95 per query locally (three extra round trips). **Before staging goes live, run API and database in the same region** (OD-03's Singapore ↔ Mumbai split would cost 100–180 ms per query) and re-measure.
- `/` LCP sits at about 2.0–2.1 s locally, close to the 2.5 s budget on CI runners (C-58).
- Custom domains are modelled and tested but switched off.
- Status changes can take up to about 2 minutes to show (two 60 s caches).
- Staging deferred (C-50).

*Release flags (ADR-041).*
- `p1-tenant-home`: owner PO; on in local/ci, off in staging/production; **removed in Phase 2 S6** (sign-in replaced it, C-68).
- `p1-hub-placeholder`: owner PO; on in local/ci, off in staging/production (`app.` → marketing); **remove in Phase 7P** (expires 2027-06-30).

*Review follow-ups.* Listed above under **Independent review (P1-4)**, by phase: Phase 2 (L6, L7, 404 for tenant mismatch), Phase 3 (L1, custom-domain REDIRECT verification), staging go-live (L2, https `API_ORIGIN`, secret check, root-domain validation, apex port), Phase 15 (C-58 LCP headroom).

*Process notes.*
- PR #28 accidentally committed local agent-skill files (`packages/database/.agents|.claude|.windsurf`, `skills-lock.json`) through a broad `git add -A`. They were untracked in #30, and are now ignored by pattern (`.gitignore`, this PR).
- Slices stage explicit paths from now on.
- CI's browser install hung twice on a stalled Ubuntu mirror; fixed with apt timeouts and retries (#29).

Phase 2 is **not** started.

---

### Phase 2 — Authentication + RBAC

**Goal.** Staff sign in on their academy's URL and parents/students on the Family Hub; everyone gets exactly their capabilities and cannot use a session anywhere else.
**Refs.** PRD v2 §4, §16 (auth), v3 §5, §13; UX §29 (Login Tier 1), v1.1 §8; ARCHITECTURE §6, §7.
**Status.** ✅ 2026-10-07 — PO acceptance recorded below (started 2026-10-02, `phase-2-start` = `be3e1a2`; closed with tag `phase-2`). Approved slice plan: [`docs/plans/phase-2.md`](plans/phase-2.md) (decisions C-59…C-66; staging proposal [`docs/plans/staging-proposal.md`](plans/staging-proposal.md) approved 2026-10-03 → C-69).

**Slices (each = one PR, ADR-041)**

| Slice | Branch | Tasks | State |
| --- | --- | --- | --- |
| S1 | `p2/identity-schema` | 2.1 plan + decisions, 2.2 identity schema + RLS (phone-ready), 2.3 capability catalogue + role templates, 2.4 seeds + factories | ✅ #33 |
| S2 | `p2/auth-core` | 2.5 `packages/auth`, 2.6 config + keys | ✅ #34 |
| S3 | `p2/sessions` | 2.7 sessions + endpoints, 2.8 guards, 2.9 rate limits + lockout | ✅ #35 |
| S4 | `p2/rbac` | 2.10 capabilities + `@Can`, 2.11 scope policies, 2.12 cross-tenant suite + Phase 1 L6/L7 | ✅ #36 |
| S5 | `p2/email-invites` | 2.13 email (worker), 2.14 invitations, reset, team API (C-67) | ✅ #37 |
| S6 | `p2/web-auth` | 2.15 web auth plumbing (cookie spike), 2.16 Login, forgot/reset, invite accept (C-68; flag `p2-role-homes` added, `p1-tenant-home` removed) | ✅ #38 |
| S7 | `p2/web-shell` | 2.17 signed-in shell (flag `p2-role-homes`), 2.18 Team page (C-72) | ✅ #40 |
| S7b | `p2/staging` | staging on Railway + Cloudflare DNS (C-69, C-75, C-77): web image, roles, `railway up` deploys; staging bootstrap (C-78); email over Resend HTTPS (C-79) — staging live 2026-10-05, PO signed in on staging | ✅ #43–#48 |
| S8 | `p2/hub-console` | 2.19 HUB sessions + handoff, 2.20 console + mandatory TOTP (flag `p2-console-home`; C-73) | ✅ #41 |
| S9 | `p2/account-security` | 2.21 TOTP 2FA on every host + academy rule, 2.22 devices & sessions, password change, alerts (C-80) | ✅ #50 |
| S10 | `p2/hardening-e2e` | 2.23 idempotency lease + fencing, interceptor order, log safety (C-82), 2.24 E2E + docs | ✅ #52 |
| G1 | `p2/gate-fixes` | P2-3 gate: "try again in N minutes" after too many attempts; gate evidence | ✅ #53 |
| R1 | `p2/review-fixes-1` | P2-4 M3 link tokens out of URLs, M1 real sign-out, M4 atomic refresh, L1 lock answer; Security page actions load on use (C-83) | ✅ #54 |
| R2 | `p2/review-fixes-2` | P2-4 M2 read-only claims release, L4 inviter re-check, L8 2FA signs out others (C-84) | ✅ #55 |

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

**Gate evidence (P2-3, 2026-10-07 on `main` = `c31426a`; re-run after the review fixes on `7a9360a`: CI green on every PR and on `main`, staging serving `7a9360a`)**

| Gate item | Evidence |
| --- | --- |
| Unit: password policy, capability resolution, scope policies, tokens | `packages/auth/src/password.spec.ts`, `jwt.spec.ts`, `misc.spec.ts` (TOTP, recovery codes, sealing), `packages/contracts/src/roles.spec.ts`, `permissions.spec.ts`, `apps/api/src/modules/team/team.policy.spec.ts`; token **rotation** is covered at integration level (`sessions.int.spec.ts › refresh rotation`) |
| Security: `demo-a` token on `demo-b` → 401 `TENANT_MISMATCH` + audit | `sessions.int.spec.ts › a session from academy A on academy B → 401 TENANT_MISMATCH, recorded on the platform audit` |
| Console/hub/tenant tokens mutually rejected | `sessions.int.spec.ts › a tenant session is rejected on the Family Hub and console hosts` / `a hub or console token is rejected on an academy host`; `hub-console.int.spec.ts › a forged token of another audience is refused` |
| Refresh reuse revokes the family | `sessions.int.spec.ts › reusing a rotated token later revokes the whole family` |
| Disabled membership → 401 on the next request | `sessions.int.spec.ts › a disabled membership is refused on the next request`; `team.int.spec.ts` |
| Privilege escalation → 403; IDOR → 404 | `rbac.int.spec.ts › a teacher cannot call owner-only endpoints`, `SELF scope …`, `BRANCH scope …`; cross-tenant suite (`cross-tenant.int.spec.ts`, every tenant route registered, incl. the 15 S9 routes) |
| Rate limit 429 + `Retry-After`; lock-out | `sessions.int.spec.ts › rate-limits sign-in attempts with Retry-After`, `locks the account after repeated failures`; staging: 6th attempt → `429`, `Retry-After: 58` |
| CSRF missing header → 403; cross-origin anonymous post refused | `sessions.int.spec.ts › a mutation with session cookies but no CSRF header → 403`, `refuses an anonymous cross-origin sign-in post`; staging: `Origin: https://evil.example` → `403` |
| 2FA, devices, alerts (G-11) | `account-security.int.spec.ts` (15 tests); E2E `security.spec.ts` (desktop, Android, iPhone; axe light/dark) |
| Idempotency/logging follow-ups (Phase 0 M1–M3, L1, L2, L4) | `idempotency.int.spec.ts › stored responses, audit and stale claims` (7 tests); `map-error.spec.ts`; `privacy.spec.ts › log safety` (C-82) |
| E2E: invite → accept → login → role home | `auth.spec.ts › invite → accept → signed in; then forgot → reset → sign in with the new password` |
| E2E: forgot → Mailpit → reset → login | same spec (worker + Mailpit) |
| E2E: staff member in two academies signs in separately on each host | `auth.spec.ts › a teacher of two academies signs in to each one separately` |
| E2E: parent on an academy URL → `app.` with a HUB session | `hub-console.spec.ts › a parent signing in on the academy URL continues on the Family Hub` |
| E2E: console admin (mandatory TOTP, C-66) | `hub-console.spec.ts › a new console admin sets a password, enrols TOTP and signs in again with a recovery code` |
| "Try again in …" after too many attempts (PO checklist) | Fixed in the gate (#53): `labels.spec.ts`, E2E `auth.spec.ts › too many wrong passwords say when to try again` |
| UI states, a11y, i18n | axe light/dark: `auth.spec.ts` (login, forgot, reset, invite), `team.spec.ts`, `security.spec.ts`, `hub-console.spec.ts`; pseudo-locale + 40 % text: `i18n-pseudo.spec.ts` (sign-in screens, Security, Team) |
| OpenAPI | `/api/docs` (non-production) lists all 28 Phase 2 routes (auth, MFA, sessions, password, invitations, team, settings) |
| Migrations, RLS, rollback | 3 Phase 2 migrations, all expand-only (`identity_and_sessions`, `tenant_security_settings`, `idempotency_lease`); identity tables user-bound RLS (C-59); `db:drift` clean; `rls-coverage.int.spec.ts` |
| Analytics (no PII) | `team.invitation_sent`, `team.invitation_accepted`, `auth.password_reset`, `auth.mfa_enabled`, `auth.mfa_disabled`, `auth.password_changed`, `academy.mfa_rule_changed` (strict schemas + PII guard) |
| Release flags | `p2-role-homes` (PO, remove Phase 5/6, expires 2027-03-31), `p2-console-home` (PO, remove Phase 3, 2027-01-31), `p1-hub-placeholder` (PO, remove 7P, 2027-06-30); `flags:check` OK |
| Common gate commands | lint, typecheck, unit, integration (API 434, database 150, worker), build, `db:drift`, `i18n:check`, `flags:check`, `perf:budget` (all routes ≤ 200 KB; `/settings/security` 198.9), E2E **294 passed** locally (2 workers) + CI green; Lighthouse in CI (`e2e` job) green — the local run can't start Chrome under WSL |
| Staging + TLS | `https://{staging, demo-a, demo-b, app, console}.staging.academybees.com` valid TLS; health `ok` (DB, Redis); release `c31426a`; deploys on every merge (C-77) |
| Real phone | PO tested S9 on staging (2026-10-07: "looks good"); PO acceptance checklist pending |


**Independent review (P2-4, 2026-10-07).** A fresh reviewer read `phase-2-start..main`: **no CRITICAL or HIGH**. It found tenant isolation, 2FA gating on every path to a session, RBAC/IDOR, the Family Hub fan-out, email tokens, logging and frontend conventions sound.
- Fixed in Phase 2:
  - #54 (C-83): M3 link tokens out of URLs (fragment + body); M1 sign-out ends the server session (refresh cookie; disabled offline); M4 atomic refresh rotation; L1 a locked account answers like a wrong password.
  - #55 (C-84): M2 read-only transactions don't mark idempotency claims; L4 invitations re-check their sender and are revoked when the sender is disabled; L8 turning 2FA on signs out other devices.
- **Assigned to Phase 15:** L2 a daily cap on re-authentication attempts; L3 recovery-code hashes with a server pepper; L5 lock the owner rows when disabling (two owners disabling each other); L6 forgot-password limit keyed per academy + IP with equalised work; L7 a revocation tombstone for the 60 s session cache.
- **Assigned to Phase 3:** sign-in on a SUSPENDED/ARCHIVED academy should show its status page, not create a session (with console suspend/activate).
- **Assigned to Phase 14:** user-level `DISABLED`, checked by the AuthGuard and hub refresh (no disable path exists yet).

**Exit notes (2026-10-07 — Phase 2 ✅)**

*PO acceptance.* **Accepted by the Product Owner on 2026-10-07** ("All looks fine"), after trying the flows locally and on staging (`https://*.staging.academybees.com`, real email, 2FA). **M0 Foundation Release** is declared: tenancy, auth, RBAC, PWA shell, CI/CD to staging.

*Delivered.*
- **Identity and sessions** (C-59, C-63, C-65): one global user, memberships per academy, roles copied from code templates, user-bound RLS on identity tables, phone-ready identifiers. Access/refresh tokens with rotation, reuse detection and atomic rotation; CSRF double-submit; rate limits and lock-out.
- **Sign-in on every host** (C-61, C-73): academy (TENANT), Family Hub `app.` (HUB, handoff in the URL fragment), console (CONSOLE, mandatory TOTP, IP allow-list). Each host's sessions are refused everywhere else.
- **Team** (C-67, C-72): members, roles and access with privilege-escalation rules, invitations (fragment links, sender re-checked), password recovery.
- **Account security** (G-11, C-80): optional 2FA on every host, the academy 2FA rule, the strong prompt for Owner/Accountant, recovery codes, password change, devices & sessions, new-device / 2FA-off / password-changed emails.
- **Web**: academy-branded sign-in screens, signed-in shell with capability-filtered navigation, Team, Security, re-login dialog, console and hub sign-in.
- **Platform**: transactional email (Mailpit locally, Resend HTTPS on staging, C-79); `pnpm platform:create-admin`; **staging on Railway + Cloudflare** with deploy on every merge and a bootstrap workflow (C-69, C-75…C-78); the `academybees.com` marketing site (C-74).
- **Phase 0/1 follow-ups**: idempotency lease + commit marker + fencing (C-82, C-84), interceptor order, log safety (C-82); lint bans on client construction and `set_config` (L6, L7); tenantId mismatch → 404.

*Pinned toolchain.* Unchanged, plus (pnpm catalog) `jose` 6.2.12, `@node-rs/argon2` 2.2.1, `otpauth` 9.5.2, `qrcode` 1.5.4, `nodemailer` 10.0.13.

*Deviations, each recorded before or while coding.* C-59…C-84. The main ones:
- C-61/C-73: one login endpoint, handoff code in the URL fragment.
- C-66: console TOTP mandatory now, not in Phase 14.
- C-69/C-75…C-79: Railway staging, deployed with `railway up`; Resend over HTTPS.
- C-80: 2FA asked on every host; the strong prompt is a page section.
- C-81: **repository public until stable** (GitHub Actions billing); self-hosted runner parked.
- C-82/C-84: idempotency lease, commit marker and fencing.
- C-83: link secrets only in fragments and bodies.

*Known limitations.*
- **Route JS budget headroom is thin.** The signed-in shell is ≈ 198 KB gz of 200 on every academy page, and `/settings/security` ≈ 199.5 KB in CI (its actions load on first use). Phase 15's shell diet (or earlier, if a Tier-1 teacher/parent screen in Phases 5–7 needs room) must find space before those screens grow (G-24).
- Parents and students have no Security page until Parent Core (7P); 2FA set up as staff protects their hub sign-in too.
- The Family Hub placeholder is off on staging (`app.` → marketing) until 7P.
- Phone OTP sign-in is designed, not built (Phase 10).
- Emails sent before 2026-10-07 have path-style links that no longer open (staging only).
- Lighthouse can't start Chrome under WSL; it runs in CI.
- Local E2E reuses servers already on ports 3000/4000 (stop `pnpm dev` first, or use the parked isolated-ports setup on `ci/self-hosted-runner`).

*Release flags (ADR-041).*
- `p2-role-homes`: owner PO; on in local/ci/staging, off in production (staff land on `/settings/security`); **remove in Phase 5/6** when Owner Today and Teacher Today ship (expires 2027-03-31).
- `p2-console-home`: owner PO; **remove in Phase 3** when the academies list ships (expires 2027-01-31).
- `p1-hub-placeholder`: owner PO; off in staging/production; **remove in Phase 7P** (expires 2027-06-30).

*Review follow-ups.* Listed above under **Independent review (P2-4)**, by phase: Phase 3 (sign-in on suspended/archived academies), Phase 14 (user-level disable), Phase 15 (L2, L3, L5, L6, L7, route-budget headroom).

*Process notes.*
- `.railwayignore`: a bare `docs` pattern matches at any depth; anchor root-only paths (`/docs`).
- Railway variable edits are staged until applied.
- GitHub runners → Singapore database need interactive transactions longer than Prisma's 5 s default.
- Startup errors show connection URLs only in redacted form.
- Prisma's adapter `rollback()` only returns the connection to the pool. Code that aborts a transaction itself must send `ROLLBACK` (C-82).
- `import { type X }` keeps a side-effect import under `verbatimModuleSyntax`. Use `import type` for types of lazily loaded modules, and don't mark lazy modules `'use client'` (C-80).
- Poll CI sparingly: tight `gh` loops exhausted the GitHub API rate limit once.

---

### Phase 3 — Academy Provisioning + Onboarding

**Goal.** Super Admin creates an academy and hands over a URL; the owner opens it and is guided to a ready-to-run academy.
**Refs.** PRD v3.1 §A–J, v3 §6, §19, §20; UX §22, v1.1 §2–6, §9–10; DECISIONS C-02, C-03, C-08, C-09.
**Status.** 🟨 started 2026-10-07 (`phase-3-start` = `afd72c2`). Approved slice plan: [`docs/plans/phase-3.md`](plans/phase-3.md) (decisions C-85…C-97; logos on Cloudflare R2, C-97).

**Slices (each = one PR, ADR-041)**

| Slice | Branch | Tasks | State |
| --- | --- | --- | --- |
| S1 | `p3/plans-legal` | 3.1 plan + decisions, 3.2 plans/entitlements/trial, 3.3 legal documents + acceptance | ✅ #57 |
| S2 | `p3/people-scheduling-schema` | 3.4 people schema, 3.5 scheduling + onboarding schema, 3.6 RLS, seeds, factories | ✅ #58 |
| S3 | `p3/provisioning-api` | 3.7 ProvisioningService, 3.8 console academy management API, 3.9 status enforcement (C-86, C-96) + tests | ✅ #59 |
| S4 | `p3/console-ui` | 3.10 console shell + Academies list (removes `p2-console-home`), 3.11 Create Academy + Provisioning Success, 3.12 academy detail | ✅ #60 |
| S5 | `p3/onboarding-api` | 3.13 onboarding state, 3.14 minimal create commands, 3.15 SETUP routing (flag `p3-onboarding`) | ✅ #61 |
| S6 | `p3/media-branding` | 3.16 media storage (R2 / SeaweedFS, C-97), 3.17 Settings → Academy, Branding & Domain, 3.18 logo everywhere | ✅ #62 |
| S7 | `p3/onboarding-ui` | 3.19 legal + Welcome, 3.20 Profile/Type/Course/Teacher, 3.21 Batch/Students/Timetable/Ready (flag `p3-onboarding`) | 🟨 |
| S8 | `p3/journey-e2e` | 3.22 journey E2E, 3.23 flag removal + docs | ⬜ |

**Scope**
- ⤴ C-03 `Plan`, `PlanEntitlement`, `Subscription` (TRIAL only), `EntitlementService`, `@Feature/@Limit` guards, seeded plans per G-25 hypothesis (OD-12). Limits enforced (e.g. student cap) with friendly `ENTITLEMENT_LIMIT_REACHED` UI.
- ⤴ G-32 (invisible): `TenantSettings.i18n` stored with defaults (`en-IN`, no UI until Phase L); onboarding texts from the catalogue; `LegalDocument` stored locale-keyed with `en-IN` only.
- ⤴ G-06 `LegalDocument`, `LegalAcceptance` (ADR-034): owner must accept current Terms/Privacy/DPA on first login before onboarding; re-acceptance on version change.
- `ProvisioningService` (idempotent, single transaction + outbox): validate slug (format, reserved, availability, impersonation list) → create `Tenant` (SETUP) → `TenantDomain` PRIMARY → branding/settings defaults (by academy type & terminology, ADR-029) → default `Branch` → copy system roles → owner `User`/`Invitation` → TRIAL subscription → `TenantOnboarding` → audit → outbox (`tenant.provisioned` → owner invitation email).
- ⤴ C-02 **Provisioning Console slice** (`console.academybees.com`): Academies list (search/filter/status), **Create Academy** guided form with live slug availability, **Provisioning Success** (URL prominent, Copy URL, Open Academy, owner invite status, plan/trial, onboarding progress), Academy detail (Overview + Domain tabs), suspend / reactivate / archive (reason + confirm + audit), change subdomain (old → REDIRECT, audit), resend owner invite. Console visual variant (UX §21).
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
- ⤴ G-31 parent side of the Family Hub (academy staff screens): parent invites create/attach the global account and link to the hub (existing account → "add this academy"); **Settings → Parent app** with printable Join QR poster (`app.academybees.com/join/<slug>`); **Join requests** queue (approve by linking to student(s) / reject); `AcademyLinkAttempt`, `JoinRequest` tables and verification-code API (hub UI arrives in 7P).

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
- ⤴ C-21 / G-31 **Parent Core on the Family Hub** (`app.academybees.com`, ADR-039): one login for all linked academies; add academy by QR / typed URL or code / invite (verification code or join request; consent per academy); "All academies" Home (today's classes across academies tagged by academy, children cards, dues per academy, merged notifications) and single-academy mode with that academy's branding; My academies (consent, leave); sign-in via invite (with consent capture, G-06), child selector, **Parent Home** (child status, next class, attendance this month, dues, latest notifications), child attendance history, fees: invoices, receipts download/share, **Pay** via academy UPI (QR + one-tap `upi://` link → "I've paid" + UTR → "Awaiting academy confirmation" → confirmed + receipt; G-30), status of reported payments (pending / confirmed / rejected with reason), in-app notification centre (absence alerts, fee reminders from Phases 6–7), basic offline read cache with "Last updated".
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

**Scope.** Leads (source, contact, interested course, notes, owner), pipeline board (desktop kanban, mobile list) with v3 stages and lost reasons; follow-ups with due dates (Owner Today attention); lead cards with next action (Call `tel:`, WhatsApp `wa.me` deep link, Schedule Trial); **Trial workspace** (session, teacher, reminder intent, attendance on the teacher's session list flagged "Trial", feedback, follow-up, Convert to Student); **Admission** conversion reusing lead/trial data → Student + Parent + enrolment + optional first invoice, idempotent; CRM dashboard & conversion funnel; ⤴ public enquiry form `{slug}.academybees.com/enquire` (rate-limited + Turnstile) creating leads; Global Add (Lead); ⤴ G-19 optional **academy public page** at the tenant root for signed-out visitors (about, courses, timings, contact, WhatsApp, enquiry form, SEO metadata; owner controls every field; off by default).

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

**Scope.** Parent experience on the Family Hub `app.academybees.com` (mobile-first): **Parent Home** (UX Tier 1: greeting → child status → next class → attendance → fees → homework → notifications), child selector, child detail, Schedule, **Payments** (due, invoices, receipts download, **Pay** via UPI → awaiting confirmation → confirmed UX, never premature success; online gateway option appears automatically once Phase G connects one), homework view/submit, progress, notification centre, profile & contact preferences; offline read cache (Dexie scope `parent`: own children, timetable, attendance, invoices, recent notifications) with "Last updated …"; installable Family Hub PWA prompt (selected academy's logo shown inside); ⤴ G-17 **leave requests** (future date/range + reason → pre-marked "Leave (parent informed)" on teacher roll, teacher can override). Student experience `/me` (if enabled per tenant): Home, Classes, Homework (submit), Progress, Profile — lighter, motivational tone.

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

### Phases 0 and 1
- Exit notes live in each phase's section above (Phase 0 ✅ 2026-10-01, Phase 1 ✅ 2026-10-02).

# AcademyBee — Claude Code Engineering Instructions

> Read this file at the start of every session. It tells you **how** to work. What to build lives in the PRD and UX spec; how it fits together lives in `docs/ARCHITECTURE.md`; why lives in `docs/DECISIONS.md`; where we are lives in `docs/IMPLEMENTATION_PLAN.md`. The Product Owner drives phases with the prompts in `PROMPTS.md` (their own checklist is `docs/EXECUTION_GUIDE.md`) — expect them and follow their structure (plan → build in slices → gate → review → close).

## 1. Mission

Build AcademyBee — **"The operating system for coaching academies." / "Manage Your Academy. Grow Together."** — as a production-grade, multi-tenant, offline-capable SaaS for tuition, dance, music, karate, sports, fitness, language and other academies.

Every feature must serve one of five outcomes: **acquire students · run classes · collect money · communicate with parents · retain & grow**. If it serves none, don't build it.

## 2. Sources of truth and authority

1. `docs/PRD_ADDENDUM_v3.2.md` + `docs/source/PRD_v3.1.md` — WHAT (scope, rules, acceptance). The v3.2 addendum (gap requirements `G-01…G-32`, Phase 7P) overrides earlier PRD text.
2. `docs/source/UX_SPEC_v1.1.md` — HOW it looks and behaves (includes the V1.2 Light/Dark theme addendum, C-49)
3. `CLAUDE.md` (this file) — HOW you work
4. `docs/ARCHITECTURE.md` — system design
5. `docs/DECISIONS.md` — conflicts, open decisions, ADRs
6. Existing code

- Within the PRD/UX files, **later versions/addenda override earlier sections** (PRD v3.2 addendum > v3.1 addendum > v3.0 > v2.1 > v2.0; UX v1.1 > v1.0). The `docs/source/*.md` files are plain-text copies of the original .docx files; the .docx files remain the formal originals. Cite as `PRD v3 §12`, `PRD v3.1 §C`, `UX v1.1 §7` (see ARCHITECTURE §0).
- Product Owner directions recorded in DECISIONS.md carry PRD-level authority (e.g. the phase order, C-01).
- If requirements conflict: check DECISIONS.md first. If not covered, choose the safest interpretation that preserves security, tenant isolation, financial integrity and the documented UX, **record it as a new C-/ADR entry**, and continue. Stop and ask only when it materially changes scope, security, architecture, financial correctness, tenant isolation or UX and no safe default exists.

## 3. Current state

- **Current phase:** Phase 3 — Academy Provisioning + Onboarding, **🟨 in progress** since 2026-10-07 (`phase-3-start` = `afd72c2`; plan `docs/plans/phase-3.md`, decisions C-85…C-96) (see `docs/IMPLEMENTATION_PLAN.md` §1 tracker). Phase 2 ✅ 2026-10-07 (tag `phase-2`; **M0 Foundation Release**; exit notes assign review follow-ups to Phases 3, 14 and 15, and flag thin route-budget headroom). Phase 1 ✅ 2026-10-02 (tag `phase-1`; exit notes list review follow-ups for Phase 2, Phase 3, staging go-live and Phase 15). Phase 0 ✅ 2026-10-01 (tag `phase-0`). P-00 orientation done 2026-09-30 (C-29…C-41).
- **Staging (C-69):** live since 2026-10-05 at `https://*.staging.academybees.com` — Railway (Singapore) + Cloudflare DNS + Resend; every merge to `main` deploys (C-77); demo data via the Staging bootstrap workflow (C-78, runbook `docs/runbooks/staging-variables.md`). Gate items use real staging from Phase 2 on. Media: ImageKit (C-70). Capacity and upgrade triggers: C-71 and `docs/runbooks/environments.md`.
- **Open decisions with defaults applied:** DECISIONS.md §B (OD-02, OD-04 … OD-13, OD-15, OD-16, OD-18, OD-22). Closed: OD-01, OD-03 (staging), OD-14, OD-17, OD-19, OD-20, OD-21. Do not re-litigate; follow the default until the PO changes it.
- **Repository:** `egha-dev/academybees-apps` (OD-19) on the **free GitHub plan** (C-44), **public until the product is stable** (C-81: free GitHub-hosted Actions; never attach a self-hosted runner while public): no ruleset, so Claude merges only after all checks pass (C-43) and never pushes to `main`. Development runs in WSL2 Ubuntu with the repo cloned inside Linux (OD-20).

## 4. Build order (Product Owner, 2026-09-29)

```text
0  Foundation
1  Multi-Tenant + Wildcard Domain
2  Authentication + RBAC
3  Academy Provisioning + Onboarding
4  Students + Parents + Teachers
5  Courses + Batches + Timetable
6  Attendance + Offline Sync
7  Finance
7P Pilot Readiness Pack   (PRD v3.2 §1 — Parent Core, help, consent, activation dashboard, demo academy)
8  CRM
9  Learning
10 Communication
11 Parent + Student (complete)
12 Reports
13 SaaS Billing
14 Super Admin
15 Security + Performance + Production Hardening
16 AI
L  Multilingual Rollout — deferred; run only when the PO says (after 11)
G  Gateway Activation — deferred; run only when the PO says (after 7P)
```

Dependency slices pulled forward (do not treat as scope creep; do not build more than listed):
- Phase 0: English-only i18n groundwork (G-32); analytics port (G-09); repository governance + release flags (ADR-041)
- Phase 1: default Branch per tenant, `branchId` on branch-scoped tables (C-07); `app.` Family Hub host reserved (G-31)
- Phase 2: transactional email adapter (invite/reset) (C-04); Super Admin CLI bootstrap + console login (C-02); `HUB` session audience (G-31); optional 2FA (G-11)
- Phase 4: academy side of the Family Hub — invites, Join QR poster, Join requests (G-31); student import (G-02)
- Phase 3: Provisioning Console slice (C-02); Plans/Entitlements/Trial subscription (C-03); full People & Scheduling schema with minimal create commands for onboarding (C-09)
- Phase 6: Teacher PWA core (C-06); outbox → in-app notifications foundation (C-04)
- Phase 7: onboarding Fee Setup step (C-08); fee-reminder intents delivered in-app (C-04)
- Phase 7P: Parent Core on the Family Hub from Phase 11 (C-21, G-31); basic help/support from Phase 14 (C-23)

Gap requirements from PRD v3.2 are assigned to phases in IMPLEMENTATION_PLAN §1 (e.g. import G-02 → Ph 4, holidays G-03 → Ph 5, academy gateway accounts G-01 and fee rules G-04 → Ph 7). Treat them exactly like PRD requirements.

Work on **one phase at a time**. Leave the repo green (lint, typecheck, tests, build) after every task. Never mark a phase ✅ without its exit gate + the Common Phase Gate (IMPLEMENTATION_PLAN §2) and PO acceptance.

## 5. Non-negotiables

- **Academy = tenant.** Every tenant-owned row has `tenantId`; branch-scoped rows also `branchId`.
- **Never trust a client-supplied `tenantId`** (body, query, URL, header, local storage). Tenant context comes from the resolved host **and** the authenticated membership (`token.tid` must equal the resolved tenant).
- **Server is authoritative.** Clients propose; the server validates and decides.
- **Tenant isolation is a release blocker.** Every new tenant-scoped endpoint is added to the cross-tenant test suite in the same PR.
- **Financial correctness beats offline convenience.** No client can set a payment to Confirmed. No blind last-write-wins on money. Never delete financial history.
- **AcademyBee never holds academy fee money.** Online fee payments go to the academy's own connected gateway account (G-01, ADR-033). Tenant gateway secrets are envelope-encrypted and never logged or returned.
- **Payments are fully enabled without a gateway in this release** (G-30, ADR-038): staff-recorded methods, parent-reported UPI with staff verification, cheque clear/bounce, manual refunds. Build the `PaymentProvider` layer with `ManualProvider` + `SimulatorProvider` (never allowed in production). Do **not** integrate Razorpay until the PO runs Phase G.
- **Children's data needs consent.** No parent account activates without a `ConsentRecord`; medical notes are restricted and every read is audited (G-05, G-06).
- **No personal data in product analytics** (G-09, ADR-032).
- **Family Hub aggregation is per-tenant and user-only** (G-31, ADR-039): hub requests fan out per ACTIVE membership inside `TenantContext.run(tenantId)` with the tenant-bound client; never use the platform client for hub reads; never expose one academy's existence or data to another; scanning a QR or typing an academy URL never grants access without verification or staff approval.
- **Offline is selective** (PRD v3 §10). Never silently discard offline work.
- **No fake success.** No mock data or fake APIs in production paths; seeds only in `local`/`ci`.
- **Modular monolith.** No microservices, no new infrastructure components, no stack changes without an ADR.

## 6. Stack (see ADR-001/002)

pnpm workspaces + Turborepo · Node 24 LTS · TypeScript strict · Next.js App Router (web + PWA via Serwist) · NestJS (api, worker) · PostgreSQL + Prisma (+ RLS) · Redis + BullMQ · Dexie (IndexedDB) · Zod contracts · MUI themed behind `@academybee/ui` · TanStack Query · React Hook Form · Vitest · Testcontainers · Playwright · pino · Sentry · S3-compatible storage (R2; SeaweedFS locally, C-45).

## 7. Repository map

```text
apps/web        Next.js: console, academy experiences (manage, teach), Family Hub (parents, students), PWA
apps/marketing  academybees.com — static Next.js export for Cloudflare Pages (C-74)
apps/api        NestJS: src/core (tenant, auth, rbac, audit, idempotency, outbox, errors),
                src/modules/<domain>, src/platform (Super Admin, cross-tenant — only place using ab_platform client)
apps/worker     NestJS standalone BullMQ processors
packages/contracts  Zod schemas, ErrorCode, permissions catalogue, sync op schemas
packages/database   Prisma schema (multi-file), migrations, RLS SQL, client factories, dev seeds
packages/tenant     hostname parsing, slug rules, reserved names (shared web+api)
packages/auth       token/cookie/password helpers
packages/sync       Dexie DB, sync queue engine, connectivity, runner
packages/ui         design tokens, theme, components
packages/i18n       message catalogues (en-IN), locale context, Intl formatters
packages/testing    factories, Testcontainers helpers, cross-tenant suite
packages/config     tsconfig/eslint/prettier/vitest presets
e2e/                Playwright specs      infra/  docker-compose, k6
```

Boundaries: apps → packages only. API modules talk to each other through exported services, never through another module's Prisma models. App code imports UI only from `@academybee/ui` (never `@mui/*`).

## 8. Commands

```bash
pnpm install             # also installs git hooks (no commits/pushes on main)
pnpm env:init            # .env files from the committed examples
pnpm infra:up            # postgres, redis, mailpit (http://localhost:8025), seaweedfs S3 (C-45) — infra:down | infra:reset | infra:logs
pnpm db:migrate          # prisma migrate dev + grants/RLS SQL (as ab_migrator) — db:deploy in CI/deploys
pnpm db:seed             # local/ci only: release-flag definitions + academies demo-a, demo-b (ACTIVE), paused, setup-demo, closed-demo, old-demo-a → demo-a (C-54); Phase 2 adds one user per role
pnpm db:drift            # committed migrations == Prisma schema
pnpm dev                 # web :3000, api :4000, worker (packages rebuild in watch mode)
pnpm lint | pnpm typecheck | pnpm test | pnpm test:integration | pnpm build
pnpm e2e                 # builds web (en-IN + en-XA + en-LONG) + API, then Playwright; needs infra:up + db:deploy
pnpm e2e:run             # Playwright only, against existing builds
pnpm perf:budget         # route JS budget (< 200 KB gz, G-24) — after build
pnpm perf:lighthouse     # Lighthouse CI: LCP/CLS/a11y budgets — after build
pnpm i18n:check | pnpm flags:check
pnpm platform:create-admin --email you@example.com   # console admin + set-password link (C-66)
pnpm --filter @academybee/marketing dev  # academybees.com on :3100 (build → out/, preview serves out/)
```

Phase 0: web `http://localhost:3000` (design system at `/dev/design-system`), API `http://localhost:4000/api/docs`. From Phase 1: academies `http://demo-a.localhost:3000`, `http://demo-b.localhost:3000` · Family Hub (parents/students): `http://app.localhost:3000` · Console: `http://console.localhost:3000`. (Keep these scripts accurate; update this section when they change. Verified 2026-10-02.)

## 9. Backend conventions

- Module layout: `modules/<name>/{<name>.module.ts, <name>.controller.ts, <name>.service.ts, <name>.policy.ts, domain/, dto via @academybee/contracts, <name>.spec.ts}`.
- Pipeline: `TenantResolver → Throttler → Auth → Membership → TenantStatus → @Can(capability) → Entitlement → ZodValidation → service`.
- Always use the **tenant-bound Prisma client**; it sets `app.tenant_id` for RLS and injects `tenantId`. The platform client is allowed only under `src/platform/**` and platform jobs, and every use is audited.
- Scope via `<module>.policy.ts` (TENANT/BRANCH/ASSIGNED/LINKED/SELF) for both list `where` and single-record checks. Out-of-scope → `404 NOT_FOUND`.
- Validate with shared Zod schemas; respond with response schemas (never raw Prisma models).
- Errors: envelope `{ error: { code, message, details?, requestId } }` with `ErrorCode` enum; never leak stack/DB text.
- Use transactions for multi-record invariants; write `OutboxEvent` inside the same transaction for async side effects.
- `@Idempotent()` (Idempotency-Key) on financial writes, provisioning and bulk operations. Optimistic concurrency with `version` on editable aggregates.
- `@Audited()` / `AuditService` for sensitive admin, auth, finance and platform actions.
- Keyset pagination for lists; whitelisted filters/sorts.
- IDs are UUIDv7 generated in code. Money = `amountMinor Int` + `currency`. Instants = UTC `timestamptz`; calendar dates = `date` in tenant timezone.
- Jobs carry `tenantId` (or `platform`), `requestId`, `actor`; processors re-establish tenant context and re-check permissions/state.

## 10. Frontend conventions

- Separate experiences, not one UI with hidden buttons: Manage (`/today…`) and Teacher (`/teach`) on each academy URL; **Parent and Student on the Family Hub `app.academybees.com`** (G-31, ADR-039); Console (`console.` host). Navigation per UX §8 and §25.
- Every screen answers: Where am I? What needs attention? What can I do now? What happened recently? (UX §10). Prefer contextual drawers/sheets and workspaces (Student 360, Batch Workspace, Invoice workspace) over CRUD tables.
- Every screen ships **loading (skeleton), empty (with next action), error (what happened + next step), permission, success** states, plus **offline** where applicable.
- Mobile is designed, not shrunk. Teacher and parent flows are phone-first; touch targets ≥ 48 px; status is never colour-only.
- Design tokens from UX §5–6 and the UX V1.2 theme addendum only; components use semantic roles (`ab.*`), never raw colours, so **Light and Dark themes** both work (C-49); Bee Gold is an accent. Avoid purple gradients, glassmorphism, KPI walls, decorative animation, dense ERP tables.
- Labels come from configurable terminology (`useTerm`), never hard-coded academy-type assumptions.
- **English-only launch, multilingual-ready code** (G-32, ADR-040). Do not build a language switcher, language settings UI or per-language editors before Phase L. But always: no hard-coded UI, email, notification, PDF or error text; use `packages/i18n` keys with ICU plurals, and never concatenate translated fragments. Format money/dates/times only via the `Intl` helpers (Indian grouping ₹1,00,000, user locale, tenant timezone). Use CSS logical properties (`margin-inline-start`), never `left/right`. Allow text to grow 40% without breaking. Validate names with Unicode-aware rules (any script). Store content that academies may translate as locale-keyed variants.
- Respect performance budgets on teacher/parent screens (ADR-035): target a 3 GB Android phone on 4G.
- Offline-capable mutations always go through the sync queue (even when online); online-only actions are disabled offline with a reason.
- Hide navigation for modules not yet built — no "coming soon" pages in production navigation.
- Never display internal IDs, tenant IDs or raw errors to academy users.

## 11. Offline rules (PRD v3 §10–11, ARCHITECTURE §11)

- Offline read: teacher timetable, assigned batches/students, recent attendance, announcements/notifications, fees/invoices (role-scoped).
- Offline write (queued): attendance, homework drafts, teacher notes, cash payment (only with `payment.record_cash`).
- Online only: online payments, refunds, subscriptions, admin/configuration, publishing.
- Each op has a client `opId` (idempotency key), survives restart, retries with backoff, gets a definitive server result (`APPLIED | DUPLICATE | REJECTED | CONFLICT`), and failures stay visible in the Sync Center.
- UI always shows connection state, pending count, last successful sync and failures. Logout with pending ops requires explicit confirmation.
- Cache only the role's working set; no tokens or passwords in IndexedDB; wipe local data on logout/revocation.
- Do not rely on the Background Sync API (iOS). Sync on start, online, visibility, enqueue and interval.

## 12. Finance rules (PRD v3 §12, ADR-018)

- Invoice: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, `CANCELLED`; overdue is derived. Payment: `INITIATED → PENDING → CONFIRMED | FAILED`, `CONFIRMED → PARTIALLY_REFUNDED → REFUNDED`.
- Transitions only through the domain state machine; each writes an audit record.
- Invoice/receipt numbers are generated server-side (row-locked sequence). Gateway confirmation only via verified, idempotent webhook or server-side status fetch.
- UI never says "Payment successful" before the server confirms. Parent- or owner-reported payments show "Awaiting academy confirmation" until a user with `payment.verify` confirms them. Refunds need `payment.refund` and connectivity.
- Academy finance and AcademyBee SaaS billing are separate tables and number series.

## 13. Definition of Done (per feature)

Database + migration + RLS · API + validation + authorization (capability & scope) + tenant isolation test · idempotency/audit where required · product analytics events (no PII) · UI strings externalised · frontend matching UX with loading/empty/error/permission/success (+offline) states · responsive · accessibility considered · unit + integration + E2E tests · lint, typecheck, test, build green · docs updated (plan status, ARCHITECTURE if changed, DECISIONS for any decision).

Offline features additionally: local schema/migration · sync op schema · retry · acknowledgement · conflict behaviour · offline UI · restart recovery · network-interruption tests.

## 14. Testing expectations

- Unit: domain rules, state machines, calculations, permissions, sync queue.
- Integration (Testcontainers, real RLS): APIs, tenant isolation, auth, finance.
- Security: cross-tenant, IDOR, privilege escalation, token audience/tenant mismatch, webhook forgery, rate limits, malicious input.
- E2E journeys (grow as phases land): create academy → subdomain → owner invite/login → onboarding → student → batch → timetable → attendance → offline attendance → invoice → payment → lead → trial → admission → parent access.
- Never declare a phase complete with failing critical tests. Never skip tests because a screen looks right.

## 15. Working method (every phase)

1. Read the phase in IMPLEMENTATION_PLAN and its PRD/UX references.
2. Inspect existing code; identify dependencies.
3. Update the plan (status 🟨, task breakdown if needed).
4. Implement in small, reviewable steps; keep the build green.
5. Test (unit → integration → security → E2E).
6. Review security, tenant isolation, UX against spec, mobile.
7. Run `lint`, `typecheck`, `test`, `build`, `e2e`.
8. Update docs: plan status + exit notes, ARCHITECTURE (if design changed), DECISIONS (new C-/ADR/OD).
9. Request PO acceptance; only then ✅ and move on.

Make sensible engineering choices without asking. Ask only for material decisions (see §2). Don't rewrite working code without reason. Don't delete functionality because it's inconvenient.

## 16. Repository workflow (ADR-041)

- One monorepo; `main` is protected and always deployable. Never push to `main` directly.
- At phase start, tag `main` as `phase-<id>-start`. Work in **slices**: branch `p<phase>/<slice>` from latest `main` → 1–5 tasks, each committed green → push → PR (Conventional Commit title, DoD checklist) → enable auto-merge (squash) → after merge, pull `main` and start the next slice. Fix CI failures on the same branch.
- Hide unfinished user-visible work behind a release flag (`FeatureFlag`); remove flags within one phase of full rollout.
- Phase gates and reviews look at `git diff phase-<id>-start..main`. Closing a phase tags `main` as `phase-<id>` (never deploys). Production deploys only from `v*` release tags approved by the PO.
- Keep one version per dependency (pnpm catalogs). Never commit secrets, `.env` files or binaries.

## 17. Do not

- Build generic CRUD where the UX defines a contextual workflow.
- Use a frontend `tenantId` for authorization or bypass the tenant-bound client.
- Trust client-reported payment success; blind last-write-wins on money.
- Silently discard offline changes.
- Hard-code academy types or fork code per academy type.
- Duplicate auth/role implementations per role.
- Add microservices, new infra, or change the stack without an ADR.
- Import `@mui/*` directly in app code; replace the design system with generic components.
- Add ERP scope (payroll, general accounting, university SIS, marketplace, social network, workflow engine) — PRD v3 §4 non-goals.
- Route academy fee money through an AcademyBee account, or send SMS/WhatsApp with unregistered/unapproved templates (G-01, G-07).
- Put mock/seed data in production paths.
- Generate the whole application in one uncontrolled pass.
- Prematurely optimise for 100K students at the expense of current usability — build for 100K, pay for today.

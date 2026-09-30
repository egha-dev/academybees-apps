# AcademyBee — Prompts to Execute (in order)

> Execute these **one by one, top to bottom**, in Claude Code from the repository root. Tick ☐ → ☑ as you go (edit this file, or keep a copy).
> Each phase: **Kickoff (plan mode) → Build → Gate → Independent review → your Acceptance → Close**. Don't start the next phase until the current one is ✅.
> Your non-prompt tasks (business paperwork, accounts, acceptance checklists) are in `docs/EXECUTION_GUIDE.md`. Helpers (Continue, Handover, Resume, Fix…) are at the end of this file.
> **Payments:** in this release every payment feature is built and enabled **without** a gateway integration (PRD v3.2 G-30). The gateway is connected later with **Phase G**, which you run only when your Razorpay account and legal sign-off are ready.

## Order at a glance

| Step | What | Where |
| --- | --- | --- |
| S1 | Business paperwork started | EXECUTION_GUIDE Part A (you) |
| S2 | Computer set up | EXECUTION_GUIDE Part C (you) |
| S3 | Repository created with these docs | EXECUTION_GUIDE Part D (you) |
| S4 | **P-00 Orientation** | below |
| S5 | Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → **7P** | below |
| S6 | Pilot starts — run **H5 Pilot triage** every week from here | below |
| S7 | Phase 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 | below |
| S8 | **Phase L — Multilingual Rollout** (any time after 11) and **Phase G — Gateway Activation** (any time after 7P), whenever ready | below |
| S9 | **L-1 Launch** | below |

---

## P-00 · Orientation (once, before Phase 0)  ☐

**Terminal (you):**
```bash
cd academybee
claude
```
Press **Shift+Tab** until **plan mode** is on, then paste:

```text
You are the engineering team for AcademyBee. Before any code:
1. Read CLAUDE.md, then every file in docs/ (ARCHITECTURE, DECISIONS, IMPLEMENTATION_PLAN, PRD_ADDENDUM_v3.2, EXECUTION_GUIDE) and both files in docs/source/.
2. Summarise in 15 bullet points what AcademyBee is, the build order (Phases 0–16 plus 7P, L and G), and the non-negotiable rules.
3. List any contradictions or gaps you find between these documents, with your recommended resolution (don't change files yet).
4. Confirm the payment approach for this release (PRD v3.2 G-30: all payment features enabled, no gateway integration until Phase G), the Family Hub on app.academybee.com (G-31), and that the launch is English only with multilingual-ready code, languages delivered in Phase L (G-32).
5. Tell me what you need from me before Phase 0 (accounts, decisions), with sensible defaults for each.
```
Read the summary. If Claude found contradictions, answer with **H6 Record a decision** for each one you decide. Then start Phase 0.

---

## Phase 0 — Foundation

**Before you start (your inputs):** GitHub repo created (EXECUTION_GUIDE Part D). Staging accounts from Part B ready, or tell Claude to leave deploy config for later. Defaults for OD-03 (hosting) and OD-14 (analytics) are fine.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 0 — Foundation.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P0-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 0 — Foundation.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 0 — Foundation section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- pnpm + Turborepo monorepo exactly as ARCHITECTURE §3, Node 24, strict TypeScript, ESLint boundaries + ban on direct `@mui/*` imports
- `infra/docker-compose.yml` (Postgres, Redis, Mailpit, MinIO) and `.env.example` files; config validated at boot (fail fast)
- `packages/contracts` (ErrorCode, error envelope, pagination, permission catalogue skeleton, sync op base) and `packages/database` (DB roles `ab_migrator`/`ab_app`/`ab_platform`, first migration: AuditLog, IdempotencyRecord, OutboxEvent; seeds only in local/ci)
- `apps/api` skeleton (logger with redaction, request IDs, Zod pipe, error filter, health, OpenAPI, @Idempotent, AuditService, OutboxService) and `apps/worker` (BullMQ, outbox relay with SKIP LOCKED)
- `packages/ui` tokens + components and the `/dev/design-system` page; `apps/web` shell, `/api` rewrite, Serwist PWA with offline fallback
- `packages/sync` Dexie skeleton + queue engine + connectivity; **English-only** but multilingual-ready `packages/i18n` (ADR-031/040, G-32: `en-IN` catalogue per namespace for web+API+worker, locale context fixed to `en-IN`, Indian-grouping formatters, hard-coded-string lint, ICU validation, pseudo-locale `en-XA` + long-text CI builds, CSS logical-properties lint, Inter + one Noto fallback font, Unicode-aware name validation — no language switcher); AnalyticsPort with PII guard (ADR-032); browser matrix + Lighthouse/bundle budgets (ADR-035)
- Vitest + Testcontainers + Playwright (`*.localhost`), GitHub Actions CI, staging deploy skeleton; pin exact versions and record them in the exit notes
- Repository governance with `gh` (ADR-041): `main` ruleset (PR + required checks + linear history), auto-merge, CODEOWNERS, PR/issue templates, commitlint, release-please, Renovate, secret scanning, `staging`/`production` environments (production needs my approval), pnpm catalogs, Turborepo remote cache + affected-only CI, `FeatureFlag` release flags. Until the ruleset exists, work directly on short branches and merge by PR

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P0-2.

### P0-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-0-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 0 — Foundation 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p0/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P0-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 0 — Foundation exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-0-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P0-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-0-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 0 — Foundation and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P0-5 · Close  ☐
```text
I have accepted Phase 0 — Foundation. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-0 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 1 — Multi-Tenant + Wildcard Domain

**Before you start (your inputs):** DNS for academybee.com with a wildcard-capable provider (A2) if you want staging subdomains now; otherwise local `*.localhost` is enough to build.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 1 — Multi-Tenant + Wildcard Domain.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P1-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 1 — Multi-Tenant + Wildcard Domain.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 1 — Multi-Tenant + Wildcard Domain section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Tenant, TenantDomain, TenantBranding, TenantSettings, Branch (default branch auto-created) — ARCHITECTURE §5
- PostgreSQL RLS FORCED on every tenant table for `ab_app`; tenant-bound Prisma client extension (set_config + tenantId injection); platform client usable only under `src/platform/**` (lint rule) — ADR-005; benchmark the overhead and record it
- `packages/tenant` host parser/slug rules/reserved list shared by web middleware and API, with property-based tests
- Web middleware rewrites (tenant / console / marketing, 301 for REDIRECT domains), dynamic per-tenant manifest + favicon, designed status pages (unknown, suspended, archived, setting up, access denied)
- Seeds demo-a, demo-b, paused; integration tests proving tenant A can never read or write tenant B (including raw SQL without context)
- Reserve and classify the Family Hub host `app.` (placeholder page until 7P) — G-31, ADR-039

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P1-2.

### P1-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-1-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 1 — Multi-Tenant + Wildcard Domain 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p1/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P1-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 1 — Multi-Tenant + Wildcard Domain exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-1-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P1-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-1-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 1 — Multi-Tenant + Wildcard Domain and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P1-5 · Close  ☐
```text
I have accepted Phase 1 — Multi-Tenant + Wildcard Domain. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-1 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 2 — Authentication + RBAC

**Before you start (your inputs):** Email provider API key available as an environment variable in staging (A6). Locally Mailpit is used.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 2 — Authentication + RBAC.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P2-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 2 — Authentication + RBAC.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 2 — Authentication + RBAC section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Identity model: User, UserCredential, Membership, Role, RolePermission, MembershipRole, PlatformStaff, AuthSession, Invitation, PasswordResetToken — ADR-006
- Tokens and cookies exactly per ARCHITECTURE §6.2 (JWT access, rotating refresh with reuse detection, `__Host-`/`__Secure-` host-only cookies, CSRF double-submit, argon2id, Redis rate limits + lockout)
- Guards: token `tid` must equal the resolved tenant (TENANT_MISMATCH, audited), membership, @Can(capability) with scope policies; full permission catalogue incl. `payment.verify` and `payment.report`
- Transactional email adapter (invite, reset) — C-04; Super Admin CLI `platform:create-admin` + console login (C-02)
- Premium tenant-branded Login, forgot/reset, invite accept, role-home redirect, capability-filtered navigation, permission state, experience switcher
- Optional TOTP 2FA (strong prompt for Owner/Accountant), Devices & sessions page, new-device/password-change alerts — G-11
- `User.preferredLocale` column + locale in request context, always `en-IN` (no switcher UI until Phase L); auth emails from the i18n catalogue — G-32
- `HUB` session audience (user-bound, no tid) valid only on `app.` host; parents/students signing in on an academy URL are redirected to the hub; hub/tenant/console tokens mutually rejected — G-31, ADR-039
- Security tests: cross-tenant token, console↔tenant audience, refresh reuse, privilege escalation, rate limit, CSRF

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P2-2.

### P2-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-2-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 2 — Authentication + RBAC 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p2/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P2-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 2 — Authentication + RBAC exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-2-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P2-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-2-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 2 — Authentication + RBAC and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P2-5 · Close  ☐
```text
I have accepted Phase 2 — Authentication + RBAC. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-2 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 3 — Academy Provisioning + Onboarding

**Before you start (your inputs):** Placeholder Terms/Privacy/DPA text is fine for staging (real ones before 7P). Plan names from PRD v3.2 G-25.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 3 — Academy Provisioning + Onboarding.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P3-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 3 — Academy Provisioning + Onboarding.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 3 — Academy Provisioning + Onboarding section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Plan, PlanEntitlement, Subscription(TRIAL), EntitlementService, @Feature/@Limit guards; seed plans per G-25 with all payment features on for every plan (G-30) — C-03
- LegalDocument (locale variants) / LegalAcceptance: owner accepts Terms/Privacy/DPA before onboarding — G-06, ADR-034; `TenantSettings.i18n` stored with `en-IN` defaults, no UI (G-32)
- Idempotent ProvisioningService in one transaction + outbox (tenant, primary domain, defaults by academy type, default branch, roles, owner invite, trial, onboarding state, audit)
- Provisioning Console slice on console host: academies list, Create Academy with live slug availability, Provisioning Success (Copy URL / Open Academy), detail (overview + domain), suspend/reactivate/archive, change subdomain → REDIRECT — C-02
- Full schema for People (with G-05 fields, ConsentRecord) and Scheduling, with minimal create commands for onboarding — C-09
- Onboarding per UX v1.1 §5: Welcome → Profile → Type → Course → Teacher → Batch → Students → Timetable → Ready; resumable, back navigation, phone-first; completion sets tenant ACTIVE
- Settings → Academy and Branding & Domain (logo/favicon upload via object storage subset, colour with contrast check)

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P3-2.

### P3-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-3-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 3 — Academy Provisioning + Onboarding 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p3/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P3-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 3 — Academy Provisioning + Onboarding exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-3-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P3-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-3-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 3 — Academy Provisioning + Onboarding and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P3-5 · Close  ☐
```text
I have accepted Phase 3 — Academy Provisioning + Onboarding. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-3 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 4 — Students + Parents + Teachers

**Before you start (your inputs):** An anonymised copy of a pilot academy's student spreadsheet (A10) — put it in `e2e/fixtures/` or tell Claude where it is.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 4 — Students + Parents + Teachers.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P4-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 4 — Students + Parents + Teachers.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 4 — Students + Parents + Teachers section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Students list (trigram search, filters, keyset pagination, virtualised), Add Student drawer, Student 360 (Overview + Activity now; other tabs appear with their phases)
- Parents many-to-many with children, dedupe suggestions, parent invite with consent capture (ConsentRecord) and academy privacy notice page — G-06
- Teachers and Team & Roles settings (invite staff, change role, deactivate, last-owner protection)
- G-05 profile fields incl. custom fields; medical notes visible only to Owner/Admin/assigned Teacher with read audit
- Import students & parents from CSV/XLSX (ADR-036): template, mapping, preview, dedupe, batch assignment, dry run → commit, error report; also offered in the onboarding Students step — G-02
- Command palette (Cmd/Ctrl+K) + Global Add; ActivityEvent timeline; archive/restore 90 days + Undo — G-26
- Family Hub, academy side (G-31): parent invites attach to the global account (existing account → add this academy), Settings → Parent app with printable Join QR poster, Join requests queue (approve by linking students / reject), AcademyLinkAttempt + JoinRequest + verification-code API with uniform responses and rate limits

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P4-2.

### P4-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-4-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 4 — Students + Parents + Teachers 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p4/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P4-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 4 — Students + Parents + Teachers exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-4-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P4-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-4-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 4 — Students + Parents + Teachers and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P4-5 · Close  ☐
```text
I have accepted Phase 4 — Students + Parents + Teachers. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-4 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 5 — Courses + Batches + Timetable

**Before you start (your inputs):** The pilot's weekly timetable and holiday list (A10).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 5 — Courses + Batches + Timetable.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P5-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 5 — Courses + Batches + Timetable.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 5 — Courses + Batches + Timetable section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Courses, levels, batches (capacity, branch, dates), batch teachers, time-aware enrolments
- ScheduleRule editor + worker job generating ClassSessions for a rolling 28 days (idempotent; regenerate only untouched future sessions) — ADR-024
- Holidays & closures with impact preview, bulk cancel, one parent notification intent per child, make-up sessions — G-03, ADR-037
- Transfer student between batches on a date, history preserved — G-27
- Batch Workspace (UX §11.5), Timetable Day/Week/Teacher views (desktop grid, mobile timeline), Owner Today v1, configurable terminology (`useTerm`) — ADR-029
- Teacher ASSIGNED scope live everywhere; timezone-correct 'today'

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P5-2.

### P5-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-5-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 5 — Courses + Batches + Timetable 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p5/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P5-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 5 — Courses + Batches + Timetable exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-5-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P5-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-5-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 5 — Courses + Batches + Timetable and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P5-5 · Close  ☐
```text
I have accepted Phase 5 — Courses + Batches + Timetable. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-5 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 6 — Attendance + Offline Sync

**Before you start (your inputs):** One Android phone and one iPhone for testing. OD-11 defaults (48 h edit window, 7-day offline acceptance) are fine.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 6 — Attendance + Offline Sync.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P6-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 6 — Attendance + Offline Sync.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 6 — Attendance + Offline Sync section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Attendance entity + bulk idempotent API, history, monthly %, summaries — ARCHITECTURE §11, ADR-016/017
- Sync push/pull/bootstrap endpoints with SyncOperation ledger, per-entityKey ordering, APPLIED/DUPLICATE/REJECTED/CONFLICT results
- Dexie schema v1, sync runner (start/online/visibility/enqueue/interval triggers, backoff, Web Lock; no Background Sync API), persistent storage request, cache wipe on logout/revocation
- Teacher PWA: shell + bottom nav, Teacher Today, Classes, Attendance screen (≥48 px targets, Mark all present, exceptions, Late/Leave), Students, Sync Center — UX §12, §14
- Offline UX: banner, pending count, last sync, failures, conflict resolution, logout guard — UX §12.1
- Notifications foundation (NotificationIntent, in-app centre, absence intents) — C-04; teacher nudge 30 min after a session without attendance — G-16
- Offline E2E: offline marking, reload, context restart, reconnect, duplicate retries → one row, two-device conflict

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P6-2.

### P6-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-6-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 6 — Attendance + Offline Sync 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p6/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P6-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 6 — Attendance + Offline Sync exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-6-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P6-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-6-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 6 — Attendance + Offline Sync and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P6-5 · Close  ☐
```text
I have accepted Phase 6 — Attendance + Offline Sync. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-6 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 7 — Finance

**Before you start (your inputs):** Pilot fee structures (A10) and a UPI ID for testing. Decide OD-10 (GST lines on academy invoices) — default is fine. **No gateway keys are needed** (G-30).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 7 — Finance.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P7-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 7 — Finance.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 7 — Finance section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Fee plans, components, assignments, discounts and FeePolicy rules: mid-cycle proration, sibling discount, credit balance, late fee with approval, pause on hold, write-off, one-time fees, instalments — G-04
- Invoices (DRAFT→ISSUED→PARTIALLY_PAID→PAID/CANCELLED, derived overdue), server numbering via NumberSequence, optional tax lines, opening balances import/entry — G-02
- **All payment methods enabled without a gateway (G-30, ADR-038):** staff-recorded Cash, UPI with UTR, Bank transfer, Cheque (pending → cleared/bounced), Card-on-POS; parent-reported UPI API; **Verify payments** queue (confirm/reject with reason); duplicate-UTR detection; manual refunds with reason
- Gateway-ready layer: PaymentProvider interface, ManualProvider (prod default), SimulatorProvider (local/CI/staging/demo only — production boot must fail if enabled), TenantPaymentAccount (encrypted, ADR-033), webhook endpoint, GatewayEvent idempotency, reconciliation job. **Do not integrate Razorpay** (that is Phase G)
- Settings → Payments: UPI ID + payee + QR preview, bank details, methods on/off, 'Online gateway — not connected yet' card
- Receipts (A4 + mobile PDF rendered HTML → PDF by headless Chromium with a Noto fallback font so non-Latin names print correctly — G-32), signed expiring share links, reprint; offline cash recording via sync op; Finance Dashboard, Invoice workspace, Collect Payment drawer, Student 360 Fees tab; onboarding Fee Setup step; audit on every financial mutation

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P7-2.

### P7-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-7-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 7 — Finance 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p7/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P7-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 7 — Finance exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-7-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P7-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-7-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 7 — Finance and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P7-5 · Close  ☐
```text
I have accepted Phase 7 — Finance. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-7 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 7P — Pilot Readiness Pack

**Before you start (your inputs):** Pilot academies signed (A9). Real Terms/Privacy/DPA from your lawyer. A support WhatsApp number. Production accounts ready (Part B).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 7P — Pilot Readiness Pack.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P7P-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 7P — Pilot Readiness Pack.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 7P — Pilot Readiness Pack section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- **Family Hub** on `app.academybee.com` (G-31, ADR-039): one login for all linked academies; add an academy by QR / typed URL or code / invite (verification code or join request, consent per academy); All-academies Home (today across academies tagged by academy, children cards, dues per academy, merged notifications) and single-academy mode with that academy's branding; My academies (consent, leave); every per-academy call runs inside TenantContext.run(tenantId) — never the platform client
- Parent Core on the hub: invite + consent, child selector, Parent Home, attendance, invoices, receipts, **Pay via UPI** (QR + one-tap `upi://` link → 'I've paid' + UTR → 'Awaiting academy confirmation' → confirmed + receipt), reported-payment status, notifications, offline read cache with 'Last updated' — C-21, G-30
- Help & support in every shell: help centre (15 articles), Contact support (WhatsApp/email with context, no PII), feedback form, What's new — G-10
- Activation dashboard (platform-only) with the G-29 pilot metrics — G-09
- Demo academy (`demo` tenant) with realistic seed, role login panel, nightly reset, messaging sink, SimulatorProvider allowed — G-13
- `docs/runbooks/pilot.md` (provisioning checklist, import session, teacher training, parent invite templates, printing the Join QR poster, triage rules, success criteria)
- Production environment: DB with automated backups, Sentry, uptime monitor, release process staging → production

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P7P-2.

### P7P-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-7p-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 7P — Pilot Readiness Pack 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p7p/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P7P-2a · Draft the help centre articles  ☐
```text
Draft the 15 help centre articles for Phase 7P (the most common owner, teacher, accountant and parent tasks built so far: sign in, finish onboarding, import students, set up a batch and timetable, add a holiday, take attendance, take attendance offline, record a payment, verify a UPI payment, handle a cheque bounce, share a receipt, invite parents, parent pays by UPI, parent downloads a receipt, get help). Write in plain, friendly English for non-technical users, short steps, and mark where screenshots go. Save them as the help content source used by the Help centre, and list them for my review.
```

### P7P-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 7P — Pilot Readiness Pack exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-7p-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P7P-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-7p-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 7P — Pilot Readiness Pack and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P7P-5 · Close  ☐
```text
I have accepted Phase 7P — Pilot Readiness Pack. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-7p and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

### P7P-6 · Go live in production and provision the pilots (after merging 7P)  ☐
```text
Phase 7P is closed. We are ready to go live for the pilot. Walk me through setting up production step by step (I will do anything that needs my accounts), then create the first production release (v0.1.0 via release-please) and tell me when its deployment is waiting for my approval in GitHub → Actions. Then verify: production health, backups scheduled, Sentry receiving events, uptime monitor, SimulatorProvider disabled. Then prepare the provisioning of the two pilot academies: give me the exact console steps, the import checklist for their spreadsheets, and the parent invitation message templates from docs/runbooks/pilot.md.
```

Then follow the pilot runbook with your two academies. When both are live (students imported, teachers taking attendance, parents invited), the pilot has started → **M2P**.

---

## 🚩 Pilot starts here

From now on, run **H5 Pilot triage** once a week (see the end of this file) alongside the phases below.

---

## Phase 8 — CRM

**Before you start (your inputs):** The pilots' lead sources and trial process (walk-in, Instagram, referral, …).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 8 — CRM.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P8-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 8 — CRM.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 8 — CRM section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Leads, sources, pipeline board (desktop kanban, mobile list) with the v3 stages and lost reasons — C-10
- Follow-ups with due dates feeding Owner Today; lead cards with Call / WhatsApp deep link / Schedule Trial
- Trial workspace: trial on a real session (flagged 'Trial' on the teacher roll, works offline), attendance, feedback, follow-up
- Convert to Student reusing lead/trial data (student, parent, enrolment, optional first invoice), idempotent — C-12
- Optional academy public page + public enquiry form with rate limiting and Turnstile — G-19; CRM dashboard and conversion funnel

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P8-2.

### P8-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-8-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 8 — CRM 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p8/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P8-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 8 — CRM exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-8-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P8-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-8-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 8 — CRM and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P8-5 · Close  ☐
```text
I have accepted Phase 8 — CRM. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-8 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 9 — Learning

**Before you start (your inputs):** How each pilot assesses students (A10), e.g. karate criteria or tuition test marks.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 9 — Learning.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P9-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 9 — Learning.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 9 — Learning section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Object storage complete (presigned upload/download, confirm, image re-encode) — ADR-021
- Homework (assign to batch/students, due date, attachments), submissions and completion tracking
- Offline homework drafts and teacher notes (Dexie v3, sync ops); publishing is online
- Assessment templates per academy type (editable per tenant), grading scales, results, remarks — ADR-029
- Progress timeline on Student 360; Teacher Learning tab; Batch Learning tab

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P9-2.

### P9-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-9-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 9 — Learning 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p9/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P9-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 9 — Learning exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-9-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P9-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-9-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 9 — Learning and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P9-5 · Close  ☐
```text
I have accepted Phase 9 — Learning. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-9 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 10 — Communication

**Before you start (your inputs):** WhatsApp Cloud API number and DLT templates approved (A7, A8), if available. If not, Claude builds the adapters against sandboxes/mocks and keeps those channels switched off until approvals arrive. Sender strategy OD-15.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 10 — Communication.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P10-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 10 — Communication.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 10 — Communication section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Channel adapters: email, web push (VAPID), SMS (DLT template IDs, unregistered sends blocked), WhatsApp Cloud API (approved templates, opt-in, delivery webhooks) — ADR-020, G-07
- Template library (system defaults + tenant overrides, validated variables, per-channel variants, preview)
- Communication Center + Composer (audience → channels → template → preview → schedule/send), announcements, message history with per-recipient delivery status
- Automated triggers wired to existing intents (absence, fee reminders/overdue, reported payment confirmed/rejected, trial reminders, homework due) with dedupe, quiet hours, preferences, opt-out
- Per-tenant usage metering; phone OTP login for parents/students on the Family Hub (OD-04, G-31); templates/announcements stored locale-keyed with `en-IN` only (per-language variants come in Phase L, G-32); notification links point to `app.academybee.com/a/<slug>/...`; teacher reminders and missed-attendance nudges on channels — G-16

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P10-2.

### P10-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-10-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 10 — Communication 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p10/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P10-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 10 — Communication exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-10-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P10-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-10-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 10 — Communication and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P10-5 · Close  ☐
```text
I have accepted Phase 10 — Communication. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-10 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 11 — Parent + Student (complete)

**Before you start (your inputs):** Decide whether students get logins by default (OD-08; default off). Collect the pilot parents' feedback so far.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 11 — Parent + Student (complete).

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P11-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 11 — Parent + Student (complete).

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 11 — Parent + Student (complete) section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Complete parent experience on top of the 7P core: Schedule, homework view/submit, progress, profile & contact preferences, installable branded PWA prompt
- Leave requests → pre-marked 'Leave (parent informed)' on the teacher roll — G-17
- Family Hub completion (G-31): parent-private child grouping across academies (suggest by name + DOB), unified calendar across academies, per-academy notification preferences, per-academy offline cache with its own 'Last updated'; student experience served on the hub
- Offline parent cache polish with 'Last updated'; the online gateway option appears automatically only when Phase G has connected one
- Student experience `/me` on the Family Hub (if enabled): Home, Classes, Homework submit, Progress, Profile
- Address pilot parent feedback logged in IMPLEMENTATION_PLAN

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P11-2.

### P11-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-11-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 11 — Parent + Student (complete) 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p11/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P11-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 11 — Parent + Student (complete) exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-11-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P11-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-11-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 11 — Parent + Student (complete) and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P11-5 · Close  ☐
```text
I have accepted Phase 11 — Parent + Student (complete). In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-11 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 12 — Reports

**Before you start (your inputs):** The 10 questions the pilot owners ask most (e.g. 'who hasn't paid?', 'which batch is dropping?').
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 12 — Reports.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P12-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 12 — Reports.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 12 — Reports section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- `docs/METRICS.md` metric registry implemented once and used by dashboards, reports and exports
- Summary tables maintained by the worker; Reports hub (Academy, Students, Attendance, Finance incl. pending verifications and cheque bounces, Admissions, Teachers, Retention) with range/timezone/scope
- Owner Dashboard executive briefing (UX Tier 1) and retention risk list
- Async CSV/XLSX exports; full academy data export ZIP available in every subscription state — G-15
- Teacher accountability report (classes held vs scheduled, attendance on time) — G-16

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P12-2.

### P12-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-12-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 12 — Reports 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p12/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P12-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 12 — Reports exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-12-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P12-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-12-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 12 — Reports and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P12-5 · Close  ☐
```text
I have accepted Phase 12 — Reports. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-12 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 13 — SaaS Billing

**Before you start (your inputs):** Final prices validated with the pilots, the CA-approved GST invoice format (A11), and AcademyBee's own UPI ID + bank details. No gateway needed (G-30).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 13 — SaaS Billing.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P13-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 13 — SaaS Billing.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 13 — SaaS Billing section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Subscription state machine Trial → Active → Past Due → Grace → Suspended → Cancelled → Expired with scheduled transitions
- GST-compliant AcademyBee invoices, separate tables and number series from academy finance — G-21
- Payments without a gateway (G-30): invoice shows AcademyBee UPI/bank → owner reports payment with UTR → Super Admin verifies in the console → Active; SimulatorProvider drives lifecycle tests
- Dunning banners/emails, upgrade/downgrade with limit checks, cancellation with export path, suspension = read-only + billing + export
- Settings → Subscription screen, limit-reached prompts, lifecycle communications — G-20; self-serve signup + trial reusing ProvisioningService — OD-06

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P13-2.

### P13-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-13-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 13 — SaaS Billing 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p13/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P13-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 13 — SaaS Billing exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-13-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P13-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-13-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 13 — SaaS Billing and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P13-5 · Close  ☐
```text
I have accepted Phase 13 — SaaS Billing. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-13 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 14 — Super Admin

**Before you start (your inputs):** Your support process (who answers, hours).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 14 — Super Admin.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P14-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 14 — Super Admin.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 14 — Super Admin section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Mandatory console TOTP 2FA and session management
- Overview dashboard; Academies full detail (users, student counts, subscription, payments, activity, support); entitlement overrides (audited)
- Users, Plans management UI, SaaS payments list incl. the owner-reported verification queue, Growth analytics (MRR, ARR, churn, trial conversion, usage)
- Support tickets (academy Help → ticket → console conversation), platform announcements, settings, audit log viewer, failed-jobs view with replay
- Login as Academy: reason, time-box, red banner, dual-identity audit, money and credential actions blocked

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P14-2.

### P14-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-14-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 14 — Super Admin 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p14/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P14-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 14 — Super Admin exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-14-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P14-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-14-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 14 — Super Admin and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P14-5 · Close  ☐
```text
I have accepted Phase 14 — Super Admin. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-14 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 15 — Security + Performance + Production Hardening

**Before you start (your inputs):** An external penetration tester booked. Lawyer's retention policy (OD-09).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 15 — Security + Performance + Production Hardening.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P15-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 15 — Security + Performance + Production Hardening.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 15 — Security + Performance + Production Hardening section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- OWASP ASVS L2 review, threat model per module, DAST on staging, dependency/secret scanning, CSP/HSTS hardening, fixes for pen-test findings
- Privacy workflows: export, correction, erasure-by-anonymisation, retention jobs, tenant offboarding, breach runbook — G-06, OD-09
- k6 load tests at 50–100K-student volumes (attendance bulk writes, sync push, dashboards, lists, exports); index tuning; attendance partitioning decision recorded as an ADR
- Backups + restore drill, DR runbook, rollback drill, Redis/worker outage chaos tests, long-offline soak and iOS storage checks
- Dashboards and actionable alerts, status page, support hours and incident template (G-22), tenant recovery runbook (G-26), accessibility audit of Tier-1 screens

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P15-2.

### P15-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-15-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 15 — Security + Performance + Production Hardening 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p15/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P15-2a · Backup restore drill  ☐
```text
Run a backup restore drill: restore the latest production backup into an isolated environment, verify row counts and a sample of tenants against production, measure the time taken (RTO) and the data age (RPO), and write the results into docs/runbooks/restore-drill.md. Tell me exactly which steps need my account access.
```

### P15-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 15 — Security + Performance + Production Hardening exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-15-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P15-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-15-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 15 — Security + Performance + Production Hardening and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P15-5 · Close  ☐
```text
I have accepted Phase 15 — Security + Performance + Production Hardening. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-15 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Phase 16 — AI

**Before you start (your inputs):** Choose an AI provider and approve a data policy (what may be sent; no raw personal data by default).
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase 16 — AI.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### P16-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase 16 — AI.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase 16 — AI section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- AI gateway module: provider abstraction, versioned prompts, PII minimisation, per-tenant opt-in, request logging, cost metering, rate limits, per-feature kill switch
- Attendance insights, fee insights, lead follow-up assistant, parent message drafting (human review before send), questions over the metrics layer (scoped, cites the metric)
- Guardrails from PRD v3 §22: AI never writes attendance, payment or assessment facts
- Evaluation datasets and thresholds per feature; entitlement-gated

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run P16-2.

### P16-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-16-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase 16 — AI 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch p16/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### P16-3 · Gate  ☐
```text
Pull the latest main. Run the Phase 16 — AI exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-16-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### P16-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-16-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase 16 — AI and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### P16-5 · Close  ☐
```text
I have accepted Phase 16 — AI. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-16 and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## ⏸ Deferred: run Phase L when you are ready for more languages

Phase L can run any time after Phase 11 is ✅ (even between Phases 12–16). Until then AcademyBee is English only, with multilingual-ready code (G-32). Repeat Phase L for each later language wave.

---

## Phase L — Multilingual Rollout

**Before you start (your inputs):** Run ONLY after Phase 11 is ✅. First languages decided (OD-18; default Hindi + your pilots' regional language), one native-speaker reviewer per language (A12), a glossary of academy terms, and budget for WhatsApp/SMS template registrations per language.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase L — Multilingual Rollout.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### PL-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase L — Multilingual Rollout.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase L — Multilingual Rollout section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- Deferred language UI (G-32 table): language switcher, academy language settings, per-language editors (composer, templates, public page, legal, help), per-script fonts, bilingual receipts, WhatsApp/DLT per-language registrations + Unicode SMS pricing, AI-assisted translation drafts (human review)
- Translation workflow per OD-18: glossary, machine-translated drafts allowed, native-speaker review mandatory (money, consent and legal always human), locale completeness report
- Wave order: Family Hub (parents & students) → Teacher PWA → notifications (in-app, push, email, WhatsApp/SMS templates registered per language) → receipts/invoices (document language or bilingual) → consent, privacy notice, Terms → help articles → academy management screens; console stays English
- Academy settings: enable languages, default and document language; per-language variants in composer, templates and public page (`/<lang>/` + hreflang)
- Cross-script search via worker-filled transliteration column; fonts loaded per script; performance budgets re-verified per locale
- Prove that adding the next language is content-only (catalogues, font entry, template/legal/help translations, registrations) — no code change

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run PL-2.

### PL-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-l-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase L — Multilingual Rollout 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch pl/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### PL-2a · Prepare translation drafts for review  ☐
```text
For each Phase L language: generate draft translations for all Tier-1 namespaces, notification templates, receipt template, consent/privacy/Terms texts and help articles, using the glossary. Mark every string as DRAFT. Produce one review file per language (source, draft, context/screenshot link) that my native-speaker reviewer can edit, and a script to import their corrections. Money, consent and legal strings must be flagged 'must review'.
```

### PL-3 · Gate  ☐
```text
Pull the latest main. Run the Phase L — Multilingual Rollout exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-l-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### PL-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-l-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase L — Multilingual Rollout and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### PL-5 · Close  ☐
```text
I have accepted Phase L — Multilingual Rollout. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-l and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## ⏸ Deferred: run Phase G only when ready

Phase G can run any time after 7P — even between other phases — once Razorpay KYC and legal sign-off (OD-13) are done. Until then, payments work via UPI and manual recording (G-30).

---

## Phase G — Gateway Activation

**Before you start (your inputs):** Run ONLY when: Razorpay KYC done (A4), lawyer signed off the payment model (OD-13), and a pilot academy has its own gateway account. Keep keys out of the chat — put them in .env / the hosting dashboard and tell Claude the variable names.
**Your acceptance checklist:** `docs/EXECUTION_GUIDE.md` → Part F → Phase G — Gateway Activation.

**Terminal (you):**
```bash
git checkout main && git pull
claude
```
Then type `/clear`, and press **Shift+Tab** until **plan mode** is on. (No branch needed: Claude creates short slice branches itself.)

### PG-1 · Kickoff  *(plan mode)*  ☐
```text
We are starting Phase G — Gateway Activation.

First confirm the previous phase is ✅ in docs/IMPLEMENTATION_PLAN.md §1 (Phase 0 has no predecessor; Phase L may run any time after 11; Phase G any time after 7P). If it is not, stop and tell me.

Read, in this order: CLAUDE.md; docs/IMPLEMENTATION_PLAN.md (§1 tracker, §2 Common Phase Gate, and the full Phase G — Gateway Activation section); the PRD v3.2 gap items it references (docs/PRD_ADDENDUM_v3.2.md); the PRD and UX sections it references (docs/source/PRD_v3.1.md, docs/source/UX_SPEC_v1.1.md); docs/ARCHITECTURE.md; docs/DECISIONS.md.

Must-haves for this phase (all detailed in the docs):
- RazorpayProvider implementing the existing PaymentProvider interface (orders, checkout, webhook signature verification, status fetch, refunds, settlements)
- Academy 'Connect gateway' flow in Settings → Payments (per-tenant credentials encrypted per ADR-033, test → live, verification ping)
- Parent 'Pay online' shown next to UPI only when the academy's gateway is verified; gateway refunds; reconciliation against settlements
- AcademyBee SaaS auto-renew through the platform gateway account
- Re-run all simulator-based tests against Razorpay test mode; forged/unknown-account webhooks rejected; live keys never logged

Inspect the current code, then produce a plan for THIS PHASE ONLY — no code yet:
1. Numbered tasks small enough to finish and commit one at a time, grouped into slices of 1–5 tasks (each slice = one PR into main, ADR-041), noting which unfinished screens need a release flag
2. Per task: modules/files, migrations, API endpoints, screens, tests
3. Dependencies on earlier phases and anything missing from them
4. Risks, and any decision you need from me (only the kinds listed in CLAUDE.md §2), each with your recommended default
5. How you will prove the exit gate (tests and commands)
```

Read the plan. If you want changes, say so in plain words. When happy, switch plan mode **off** (Shift+Tab) and run PG-2.

### PG-2 · Build  ☐
```text
Plan approved. First tag the current main as phase-g-start and push the tag. Then, in the first slice, update docs/IMPLEMENTATION_PLAN.md: mark Phase G — Gateway Activation 🟨 and add the task list (grouped into slices) under the phase.
Work slice by slice (CLAUDE.md §16, ADR-041): create branch pg/<slice-name> from the latest main; implement task by task — after each task run lint, typecheck and the relevant tests, fix failures, and commit with a Conventional Commit message; then push, open a PR (Conventional Commit title, DoD checklist from the template), enable auto-merge (squash), wait until it merges, pull main, and start the next slice. If CI fails, fix it on the same branch. Hide unfinished user-visible work behind a release flag so main stays deployable.
Record any new decision or conflict in docs/DECISIONS.md before coding it.
Stay inside this phase — if something belongs to a later phase, note it in the plan instead of building it.
Only stop to ask me about decisions of the kind listed in CLAUDE.md §2. Otherwise continue until all slices are merged, then summarise what was built, which release flags are still off, and how I can see it on staging and locally.
```

If Claude stops before finishing, use **H1 Continue**. If the session gets long, use **H2 Handover** → `/clear` → **H3 Resume**.

### PG-3 · Gate  ☐
```text
Pull the latest main. Run the Phase G — Gateway Activation exit gate and the Common Phase Gate (docs/IMPLEMENTATION_PLAN.md §2) for everything merged since the tag phase-g-start.
Execute: pnpm lint, pnpm typecheck, pnpm test, pnpm test:integration, pnpm build, pnpm e2e.
Report every checklist item as PASS or FAIL with evidence (command results, test names, E2E spec names, screenshots saved under e2e/artifacts/).
Fix anything that fails in a new slice (branch + PR + auto-merge) and re-run. Confirm staging is running the latest main. Do NOT mark the phase ✅ — that is my decision.
Finally give me the exact staging and local URLs, demo logins and steps for my acceptance checklist in docs/EXECUTION_GUIDE.md Part F for this phase.
```

### PG-4 · Independent review  ☐
```text
Use a subagent that has NOT seen this conversation to review the full diff `git diff phase-g-start..main` (everything this phase merged).
It must check: tenant isolation (every query scoped, RLS on new tables, cross-tenant tests added), authorization (capability + scope on every endpoint, no IDOR), financial rules (CLAUDE.md §12, incl. nothing reported becomes CONFIRMED without verification), offline rules (§11), secrets and personal data in logs/analytics, error leakage, missing loading/empty/error/permission states, hard-coded UI strings, and missing tests.
Report findings ranked by severity with file and line. Then fix every critical and high finding in new slices (branch + PR + auto-merge) and re-run the gate.
```

### ✋ You · Acceptance  ☐

Open `docs/EXECUTION_GUIDE.md` → Part F → Phase G — Gateway Activation and click through every item yourself on **staging** (on a real phone where it says so). For each problem, use **H4 Fix a problem**. Move on only when every box is ticked.

### PG-5 · Close  ☐
```text
I have accepted Phase G — Gateway Activation. In a final slice (branch + PR + auto-merge): update docs/IMPLEMENTATION_PLAN.md — mark it ✅ and fill in its Exit notes (what was delivered, pinned versions if changed, deviations, known limitations, release flags still off with owner and removal date, PO acceptance date today); update ARCHITECTURE.md / DECISIONS.md if anything changed. After it merges, tag main as phase-g and push the tag (milestone only — it does not deploy).
If production exists (from Phase 7P on): prepare a production release — merge the release-please PR so it creates the next v* tag with plain-language release notes — and tell me when the production deployment is waiting for my approval in GitHub → Actions.
```

Nothing to type in the terminal. From Phase 7P on, open GitHub → Actions and click **Approve** on the production deployment when you're happy.

---

## Pilot and launch

### H5 · Pilot triage (every week from 7P)  ☐ ☐ ☐ …
```text
Here is this week's pilot feedback:
<paste notes from the pilot calls, WhatsApp messages, screenshots>

For each item: 1) restate the underlying problem, 2) classify P0 (data wrong, can't take attendance, can't collect or record money, security) / P1 / P2, 3) say which phase it belongs to. Fix every P0 now on a branch `pilot-fix/<short-name>` with a failing test first, run the gate checks, open a PR with auto-merge, and then prepare a patch release (v* tag) that I approve for production. Add P1/P2 items to docs/IMPLEMENTATION_PLAN.md under the right phase marked "pilot feedback". Also report this week's pilot metrics against PRD v3.2 G-29 from the activation dashboard.
```

### L-1 · Launch (after Phase 15, pilot targets met)  ☐
```text
Prepare the v1.0.0 launch. Check every item of docs/EXECUTION_GUIDE.md Part H and report PASS/FAIL with evidence. Confirm SimulatorProvider is disabled in production and state clearly whether Phase G (online gateway) is done or postponed. Confirm no expired release flags remain. Write release notes for academies (plain language), then, after I confirm, create the v1.0.0 release via release-please and tell me when the production deployment awaits my approval.
```

---

## Helpers (use any time)

### H1 · Continue
```text
Continue with the next unfinished task or slice in the current phase's task list. Same rules as the Build prompt (slices, PRs with auto-merge, release flags).
```

### H2 · Handover (before `/clear` in a long session)
```text
We are going to clear context. Write a handover in docs/IMPLEMENTATION_PLAN.md under the current phase → "Working notes": tasks done, the task in progress with the exact next step, open problems, decisions made. Commit it.
```

### H3 · Resume (after `/clear`)
```text
Read CLAUDE.md and the current phase section of docs/IMPLEMENTATION_PLAN.md including "Working notes". Resume from the next step listed there. Same rules as the Build prompt.
```

### H4 · Fix a problem you found
```text
During acceptance I found this problem: <what I did> → <what happened> → <what I expected>. (Screenshot attached if useful.)
Reproduce it with a failing test first, then fix it, then re-run the affected gate checks and tell me how to re-check it.
```

### H6 · Record a product decision
```text
Product Owner decision: <your decision in plain words>.
Record it in docs/DECISIONS.md (new C- entry or close the relevant OD-), update any affected phase in docs/IMPLEMENTATION_PLAN.md and CLAUDE.md if needed, and commit. Don't change code yet.
```

### H7 · Scope guard
```text
Stop — that belongs to a later phase. Note it under that phase in docs/IMPLEMENTATION_PLAN.md and continue with the current phase only.
```

### H8 · Stuck (same bug after two attempts)
```text
Stop changing code. Explain the root-cause hypotheses you have ranked by likelihood, what evidence supports each, and propose two different approaches with trade-offs. Wait for my choice.
```

### H9 · Where are we?
```text
Give me a short status: current phase and task, what's done, what's left in this phase, anything blocked on me, and whether the repository is green (run lint, typecheck and tests).
```

### H10 · Explain it to me
```text
Explain what you just built in plain, non-technical language: what a user can now do, where to click to see it, and anything that is not finished yet.
```

# P0-1 · Phase 0 — Foundation: plan

> **Approved by the PO on 2026-09-30.** Execute with P0-2 from a Claude Code session in WSL2. `phase-0-start` = `72a4078`. S0 task 1 is done on branch `p0/bootstrap`; continue S0 from task 2 there.

## Context

Phase 0 has no predecessor. P-00 is done, and its decisions (C-29…C-41, OD-14/19/20/21) are merged to `main` in egha-dev/academybees-apps#1. The repo contains only docs, so there is no code to reuse.

Phase 0 goal (IMPLEMENTATION_PLAN §3): a tested, deployable skeleton in which every cross-cutting convention exists, so that later phases only add domain code.

This plan covers **Phase 0 only**. It maps tasks 0.1–0.19 into **13 slices**. Each slice is one PR into `main` (ADR-041).

### Constraints I'm planning around

| Constraint | Effect on the plan |
|---|---|
| This Windows session has no Node, pnpm, Docker or `gh` (OD-20) | **P0-2 must run from a Claude Code session in WSL2**, in `~/academybees-apps`. I will not write code here that I can't lint or test. |
| No paid GitHub plan yet (OD-19) | Slice S1 commits all governance files. The ruleset, secret scanning and environments are applied with `scripts/github/apply-governance.sh` as soon as the plan is active. Until then, slices still use branch + PR. PR #1 was a merge commit; squash-only starts with the ruleset. |
| No staging accounts yet (OD-03) | S12 merges the deploy workflows switched off (`if: vars.STAGING_ENABLED == 'true'`). They go live when the accounts and secrets exist. The Phase 0 gate can't pass until staging serves `/api/health/ready`. |

## Decision from you (CLAUDE.md §2) — answered

**OD-03 vendors for staging: approved by the PO on 2026-09-30.** S0 records this in DECISIONS.md.

| Piece | Choice |
|---|---|
| Web | **Vercel** |
| API + worker | **Render** Docker services, Singapore region (nearest simple managed option; revisit for an India region before production in 7P) |
| Postgres 17 | **Supabase**, Mumbai region. Allows custom roles (`ab_app` without BYPASSRLS) and has transaction pooling. |
| Redis | **Upstash**, Mumbai region |
| Files | Cloudflare R2 (Phase 3) |

I'll check each vendor's region availability when the accounts are created. The deploy workflows are written against Docker images plus env vars, so swapping vendors only means editing the workflow.

Everything else uses documented defaults.

## Pinned toolchain (resolved at scaffold and recorded in the exit notes)

- Node 24 LTS; pnpm (latest 10.x, via `packageManager`; catalogs need pnpm ≥ 9.5); Turborepo latest 2.x.
- TypeScript 5.x with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Next.js latest stable (16.x → `proxy.ts`, C-34); React 19; MUI latest + `@mui/material-nextjs`.
- NestJS latest stable 11.x (Express); Prisma latest stable (7.x, multi-file schema, `prisma.config.ts`, pg driver adapter).
- BullMQ; Dexie 4; Serwist latest; Zod latest 4.x; next-intl.
- Vitest (+ unplugin-swc for Nest decorators); Testcontainers; Playwright; pino / nestjs-pino; nestjs-cls; `@sentry/*` (off without a DSN).
- Every version is held once in the pnpm catalog.

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + the relevant tests → Conventional Commit.
Each slice: branch `p0/<slice>` → PR → auto-merge (squash, once the ruleset exists) → pull `main`.

### S0 `p0/bootstrap` — tasks 0.1 + plan update
1. **Plan status.** `docs/IMPLEMENTATION_PLAN.md`: Phase 0 → 🟨, and this slice list goes under Phase 0 (P0-2 requirement). `docs/DECISIONS.md`: OD-03 moves to closed with the approved vendors.
2. **Root workspace.**
   - Files: `package.json` (scripts `dev, lint, typecheck, test, test:integration, build, e2e, infra:up/down, db:migrate/seed`; pinned `packageManager`/`engines`), `pnpm-workspace.yaml` with **catalogs**, `turbo.json`, `.nvmrc` (24), `.gitattributes` (`* text=auto eol=lf`, fixes the CRLF warning), `.gitignore` (`.env*` except `.env.example`), `.editorconfig`.
3. **`packages/config`.**
   - tsconfig bases (base / node / nest / next / lib).
   - ESLint flat config: `eslint-plugin-boundaries` (app / package / api-module tags per ARCHITECTURE §3), `no-restricted-imports` for `@mui/*` outside `packages/ui`, and the platform-client restriction (the rule exists now; the client arrives in Phase 1).
   - Prettier config; Vitest presets (node, SWC, jsdom).
4. **Hooks.** `lefthook` + lint-staged; `commitlint.config.ts` (Conventional Commits).
5. **Minimal CI** `.github/workflows/ci.yml`: install → lint → typecheck → unit, so required checks exist from the start. Later slices extend it.

Tests: lint fails on a fixture importing `@mui/material` from an app, and on a fixture that crosses a boundary.

### S1 `p0/governance` — task 0.18 (files; applied when the plan is active)
1. `.github/CODEOWNERS` (`@egha-dev` for `docs/`, `infra/`, `packages/database/`, `.github/`); `pull_request_template.md` with the DoD checklist (CLAUDE §13); issue templates for bug, pilot feedback and decision.
2. `.github/workflows/pr-title.yml` (commitlint on PR titles); `release-please` config + workflow (one product version, `CHANGELOG.md`); `renovate.json` (weekly, grouped, auto-merge for patch updates).
3. `scripts/github/apply-governance.sh` (idempotent, uses `gh api`):
   - `main` ruleset: PR required, required checks, linear history, no force-push or deletion, conversation resolution;
   - auto-merge on; delete branch after merge;
   - secret scanning + push protection; Dependabot alerts;
   - environments `staging` (auto) and `production` (PO reviewer; if the plan doesn't support that, the `workflow_dispatch` fallback).
   - Documented in `docs/runbooks/github-governance.md`.

Tests: a script dry-run mode prints the planned API calls. The real proof is in the exit gate.

### S2 `p0/infra-local` — task 0.2
1. `infra/docker-compose.yml`: Postgres 17, Redis 7, Mailpit (:8025), MinIO + a bucket-init sidecar. Healthchecks on each.
2. `infra/postgres/init/00-roles.sql`: creates `ab_migrator` (owner), `ab_app` (NOBYPASSRLS), `ab_platform`, plus separate `_test` databases.
3. `.env.example` for `apps/api`, `apps/worker`, `apps/web`, `packages/database`. Root scripts `infra:up` / `infra:down` / `infra:reset`.

### S3 `p0/contracts` — task 0.3
Package `packages/contracts/src/`:
- `errors.ts`: `ErrorCode` enum (ARCHITECTURE §9.1 core codes) and the envelope schema.
- `pagination.ts`: cursor request/response schemas.
- `permissions.ts`: catalogue skeleton (capability type + areas; full list in Phase 2).
- `sync.ts`: `SyncOp` base, op-result enum.
- `analytics/`: event schema registry skeleton.
- `ids.ts`: UUIDv7 helper.

Unit tests for every schema.

### S4 `p0/database-testing` — tasks 0.4 + 0.11
1. `packages/database`:
   - `prisma.config.ts`; multi-file `prisma/schema/{core,flags}.prisma`.
   - First migration: `AuditLog`, `IdempotencyRecord`, `OutboxEvent`, `FeatureFlag`, `FeatureFlagOverride` (nullable `tenantId`, C-35).
   - SQL: `REVOKE UPDATE, DELETE ON audit_log FROM ab_app`; grants for `ab_app` / `ab_platform`.
2. Client factories:
   - `createAppClient` (as `ab_app`);
   - `createPlatformClient` (`ab_platform`; the lint rule confines it to `platform/**`);
   - `createMigratorClient`.
   - The tenant-bound extension is Phase 1; a `withTransaction` helper is included now.
3. Seed runner that refuses to run unless `APP_ENV ∈ {local, ci}`; `db:migrate` (migrate + RLS SQL folder); `db:drift` (`prisma migrate diff --exit-code`).
4. `packages/testing`:
   - Testcontainers helpers: Postgres with the roles and migrations applied, and Redis;
   - Vitest global setup; factories skeleton;
   - `pnpm test` runs unit tests only, and `test:integration` runs the container tests.

Tests (integration):
- `ab_app` cannot UPDATE or DELETE `audit_log`.
- The seed refuses with `APP_ENV=production`.
- The drift check is clean.

### S5 `p0/api-core` — task 0.5
`apps/api` (NestJS):
- `core/config`: Zod env schema, fails fast at boot; config validation also refuses `SimulatorProvider` when `APP_ENV=production` (ADR-038 hook, used in Phase 7).
- `core/logging`: nestjs-pino with a redaction list and masked phone/email.
- `core/request-id` + CLS (nestjs-cls), and the global `ZodValidationPipe`.
- `core/errors`: exception filter that returns the envelope, maps Prisma errors (P2002 → `CONFLICT` with the field) and never exposes internals; messages come from `packages/i18n` by `ErrorCode` (S7 wires this in; S5 uses a temporary en map that S7 replaces).
- `/api/v1/health/live` and `/health/ready` (DB + Redis).
- OpenAPI 3.1 generated from Zod at `/api/docs`, non-prod only.
- `core/idempotency`: `@Idempotent()` interceptor plus a store on `IdempotencyRecord` (request hash, response snapshot, 24 h TTL).
- `core/audit`: `AuditService` + `@Audited()`.
- `core/outbox`: `OutboxService.write(tx, event)`.
- `core/flags`: `FeatureFlagService` (env default + override).
- Trusted-proxy config: `X-Forwarded-Host` accepted only from configured proxies or with a shared secret.

Tests:
- **Contract tests (exit gate):** a validation error, an unknown route, a thrown domain error and a Prisma unique violation each give the correct code and no internals.
- **Idempotency (exit gate):** the same key + same body replays the stored response; the same key + a different body → `409 IDEMPOTENCY_KEY_REUSED`; concurrent duplicates → one execution.
- The app refuses to boot on invalid config.

### S6 `p0/worker` — task 0.6
`apps/worker` (Nest standalone + BullMQ):
- `system` queue, heartbeat job;
- outbox relay (`FOR UPDATE SKIP LOCKED`, batch 100, sets `dispatchedAt`, stable BullMQ `jobId = outboxEventId` for dedupe);
- job payload envelope `{tenantId|platform, requestId, actor}`;
- graceful shutdown; failed-job retention.

Tests (integration, **exit gate**):
- An event written in a rolled-back transaction is never dispatched.
- A committed event is dispatched exactly once, including with 2 relay instances running concurrently.

### S7 `p0/i18n-analytics` — tasks 0.15 (core) + 0.16
1. `packages/i18n`:
   - `messages/en-IN/<namespace>.json` (common, errors, shell, design-system, offline);
   - a locale context fixed to `en-IN` (resolution chain stubbed per ADR-040);
   - `formatMoney` (2 decimals, `{compact}` per C-40), `formatDate`, `formatTime`, all with tenant timezone;
   - ICU plural helpers; server renderer used by the API and worker;
   - `validateName` (Unicode `\p{L}\p{M}`, NFC);
   - scripts: `i18n:check` (ICU syntax, unused/missing keys) and `i18n:pseudo` (generates `en-XA` and a +40% long-text catalogue).
2. The API error filter switches to catalogue messages.
3. `AnalyticsPort` in the API and worker:
   - adapters: no-op (default, and always in `ci`) and PostHog (`posthog-node`, active only with a key);
   - events validated against contracts;
   - hashed tenant and user IDs; a PII guard that rejects email- or phone-shaped values and name-like keys;
   - emitted through the outbox after commit.

Tests:
- `formatMoney(10000000,'INR')` → `₹1,00,000.00`, and `compact` → `₹1,00,000`.
- `ஆரவ்` and `आरव` pass validation; round-trip through an API echo test endpoint (test-only module) unchanged.
- PII guard rejects `{email}` and `{phone}` (**exit gate**).
- ICU check fails on a broken fixture.

### S8 `p0/ui` — task 0.7 + logical-CSS lint
`packages/ui`:
- **Tokens (UX §5–6):** ivory/ink/gold palette, status colours, type scale, radii 6/10/14, 4-pt spacing, motion 120–200 ms with reduced motion respected.
- **Theme:** MUI theme + CSS variables. Inter via `next/font` is exported for web; one Noto Sans fallback.
- **Components:** Button, IconButton, TextField, Select, Card, StatusBadge (icon + text), EmptyState (requires an action), Skeleton, Toast, ConfirmDialog, Drawer/BottomSheet, AppShell (sidebar / topbar / bottom-nav variants), OfflineBanner, SyncIndicator (stub states), PermissionState.
- **Rules:** components take already-translated strings or i18n keys, never literal English. Stylelint / ESLint rule bans physical `left/right/margin-left…` in favour of logical properties.

Tests: component unit tests (Vitest + Testing Library), and an axe check on a render of each component.

### S9 `p0/web-shell` — tasks 0.8 + 0.9 + 0.15 (web)
`apps/web` (Next.js App Router):
- **Providers:** MUI App Router cache, TanStack Query, next-intl backed by `packages/i18n`.
- **Routing:** `/api/*` rewrite to the API (dev: `:4000`) that forwards the host; route groups `(marketing)`, `(console)`, `(tenant)`, `(hub)`; `src/proxy.ts` host-classification **stub** (C-34; real logic in Phase 1).
- **Error handling:** `error.tsx`, `global-error.tsx` and `not-found.tsx` in AcademyBee style.
- **Home placeholder:** the marketing root shows an AcademyBee page in the new colours.
- **`/dev/design-system`:** every component with its states; returns 404 when `APP_ENV=production`.
- **PWA:** Serwist SW (precache the shell, runtime cache for static assets and fonts, offline fallback `/offline`; `/api/*` is never cached); static manifest (dynamic in Phase 1); install prompt; "Update available" prompt.
- **Release flag probe (exit gate):** page `/flag-probe` behind flag `p0-flag-probe`. Default off on staging; owner PO; expires by the end of Phase 1; removed in Phase 1.
- **Language builds:** `NEXT_PUBLIC_LOCALE_OVERRIDE=en-XA` and a long-text build mode for the pseudo and long-text checks. ESLint forbids hard-coded JSX strings in `apps/web/src`.

Tests: a unit test for the flag helper, plus the E2E checks in S11.

### S10 `p0/sync` — task 0.10
`packages/sync`:
- Dexie `AcademyBeeDB` v1 (`meta`, `syncQueue`, `syncLog`), with explicit version migrations;
- connectivity detector (`online`/`offline` events + API heartbeat to `/api/v1/health/live`);
- queue engine: enqueue, list, status transitions `pending → processing → synced | failed | conflict`, `entityKey` blocking;
- backoff with jitter (2 s → 5 min cap);
- Web Lock runner shell (triggers per ARCHITECTURE §11.4);
- React hooks `useConnectivity` and `useSyncStatus`, plus a logout pending-ops guard hook.

Tests (`fake-indexeddb`, **exit gate**):
- Items persist across a DB close/reopen.
- The backoff schedule table is correct.
- A blocked `entityKey` holds later ops.
- Only one runner holds the lock.

### S11 `p0/e2e-ci` — tasks 0.12 + 0.17 + full 0.13
1. **Playwright:**
   - base URL `http://localhost:3000` with `*.localhost` support; `webServer` starts the built web app and API;
   - projects: desktop Chromium, Chromium Android emulation, WebKit iPhone emulation;
   - axe helper.
   - Specs (`e2e/`):
     - `smoke.spec` — home renders, and `/api/v1/health/ready` = 200;
     - `pwa.spec` — the SW registers; going offline and reloading shows the AcademyBee offline page;
     - `design-system.a11y.spec`;
     - `i18n-pseudo.spec` — in the `en-XA` and long-text builds, no un-accented text and no horizontal overflow on the shell and design-system pages;
     - `flag.spec` — the flag hides `/flag-probe`.
2. **Budgets:** `browserslist` per G-24; Lighthouse CI (installability + LCP budget on the shell); `size-limit` / bundle analyser budgets (route JS < 200 KB gz for future `/teach` and hub; enforced on the shell now).
3. **Full CI pipeline:**
   - order: install (pnpm cache) → commitlint → lint → typecheck → unit → integration (Testcontainers) → `db:drift` → build → e2e → Lighthouse / bundle;
   - artifacts (traces, screenshots in `e2e/artifacts/`) on failure;
   - `turbo --affected` on PRs + Vercel Remote Cache (OD-21; skipped gracefully without a token);
   - `nightly.yml` full run;
   - expired-flag check script.

### S12 `p0/staging` — task 0.14
1. Dockerfiles for `apps/api` and `apps/worker` (multi-stage, `turbo prune`); a Vercel project config for `apps/web` (monorepo root, rewrite `/api` → API URL through env).
2. `deploy-staging.yml` runs on push to `main`: build images → **migrate job as `ab_migrator`** → deploy API + worker → Vercel deploy → smoke check against `/api/health/ready`. Guarded by the `STAGING_ENABLED` variable.
3. `deploy-production.yml` runs on a `v*` tag, through the `production` environment (PO approval) or a `workflow_dispatch` fallback. Present but unused until 7P.
4. Secrets documented by **name only** in `docs/runbooks/environments.md`. Sentry is wired in all three apps and off without a DSN.

### S13 `p0/docs` — task 0.19
- README "Local setup (WSL2)"; CLAUDE.md §8 commands verified against reality.
- Exit notes: pinned versions, deviations, the flag list (`p0-flag-probe`, owner PO, remove in Phase 1).
- Phase 1 is **not** started.

### Release flags
Phase 0 has no product screens. `/dev/design-system` is gated by environment (non-prod), not by a flag. The only flag is `p0-flag-probe`, which exists to prove the mechanism.

## Dependencies and gaps

- **No earlier phase.**
- **Missing inputs from you:**
  - WSL2 toolchain (before P0-2);
  - paid GitHub plan (before the S1 script and the governance part of the gate);
  - staging accounts + secrets per the OD-03 decision (before the S12 go-live and the gate);
  - optional: Vercel token for the remote cache, PostHog key, Sentry DSN.
- **Deliberately not in Phase 0** (later phases): tenant resolution and RLS policies (1), auth and sessions (2), object storage beyond MinIO in compose (3/9), dynamic manifest (1).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Serwist with Next 16's default Turbopack build | Use Serwist's supported build path (the webpack build for production, or its Turbopack integration if it's stable at pin time). Record the choice as a C- entry. |
| Prisma 7 changes (config file, driver adapters) + RLS pattern | Phase 0 only proves roles, grants and the migrator/app split. The tenant-extension spike and benchmark are Phase 1 (ADR-005). |
| Nest decorators under Vitest | `unplugin-swc` preset in `packages/config`, proven in S5. |
| Testcontainers / Docker in WSL | Docker Desktop WSL integration is required (OD-20). CI runs on ubuntu-latest. |
| The governance gate can't be proven without a paid plan | Files merge now. The gate items for the ruleset and auto-merge stay FAIL, with evidence, until the plan is active. |
| Staging vendor regions | Chosen at account creation. The workflows are vendor-thin. |

## How I'll prove the exit gate (P0-3)

| Gate item | Evidence |
|---|---|
| Clean clone < 10 min | `git clone` → `pnpm install && pnpm infra:up && pnpm db:migrate && pnpm dev`, timed in WSL |
| CI green + staging health | GitHub Actions run link; `curl https://<staging>/api/v1/health/ready` → 200 |
| Error envelope | `apps/api/test/contract/error-envelope.spec.ts` (4 cases) |
| Idempotency | `apps/api/test/integration/idempotency.spec.ts` |
| Outbox | `apps/worker/test/integration/outbox-relay.spec.ts` |
| Dexie restart + backoff | `packages/sync/src/*.spec.ts` |
| PWA installable + offline page | Lighthouse CI report; `e2e/pwa.spec.ts` |
| Design system | You review `/dev/design-system` (screenshots in `e2e/artifacts/`) |
| Pseudo / long text, `formatMoney`, Tamil/Hindi names | `e2e/i18n-pseudo.spec.ts`, `packages/i18n` unit tests, API name round-trip test |
| Analytics PII guard | `apps/api/src/core/analytics/pii-guard.spec.ts` |
| Repository rules | Direct push to `main` rejected; a failing-check PR blocked; a green PR auto-merges and deploys to staging; `/flag-probe` hidden on staging. Screenshots / links. |

Full commands: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e`, plus the Common Phase Gate checklist.

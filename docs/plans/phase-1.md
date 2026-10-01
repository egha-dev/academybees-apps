# P1-1 · Phase 1 — Multi-Tenant + Wildcard Domain: plan

> **Approved by the PO on 2026-10-01** (no changes to the decisions). `phase-1-start` = `f965f1d`.

## Context

- **Predecessor:** Phase 0 is ✅ (2026-10-01, tag `phase-0`). Phase 1 may start.
- **Goal (IMPLEMENTATION_PLAN §3 Phase 1):** every request knows its tenant safely; the database refuses cross-tenant reads and writes; academy hosts show a branded shell or a designed status page.
- **Refs read:** CLAUDE.md; IMPLEMENTATION_PLAN §1, §2, Phase 1; PRD v2 §27, v3 §13, v3.1 §A–G and §J; PRD v3.2 G-31; UX v1.1 addendum §1, §4, §7, §8, §10, UX §24, UX V1.2 §5; ARCHITECTURE §4, §5, §8.2, §10.2–10.4, §19, §20; DECISIONS (C-00…C-50, ADR-003/004/005/015/039/041).

### What exists from Phase 0

| Area | State today | Phase 1 change |
| --- | --- | --- |
| `packages/database` | `createAppClient` (raw `ab_app`), `createPlatformClient` (`/platform` export), core tables with nullable `tenant_id` and **no RLS** (`audit_log`, `outbox_event`, `idempotency_record`, `feature_flag_override`), post-migrate SQL runner (`prisma/sql/*.sql`) | Tenant tables, RLS applier, tenant-bound client, seeds |
| Roles | `ab_migrator` (owner, **no BYPASSRLS**), `ab_app` (NOBYPASSRLS), `ab_platform` (BYPASSRLS) | With `FORCE`, the seed (as migrator) must set tenant context too |
| Lint | Platform-client import confined to `apps/{api,worker}/src/platform/**` (rule + fixture test exist) | Also confine `createAppClient` to the database module |
| API | CLS context with trusted effective host (C-46); `APP_DB` raw client used by audit, outbox, idempotency, flags, health | Tenant resolver, context, guards; core services move to the tenant-bound client |
| `FeatureFlagService` | Caches **all** overrides globally | Under RLS it must cache global + per-tenant overrides separately |
| Web | `proxy.ts` forwards `/api/*`; `lib/host.ts` is a stub; empty `(tenant)`, `(hub)`, `(console)` route groups; static `manifest.ts`; build-time icons; `p0-flag-probe` | Real routing, status pages, per-tenant manifest and icons |
| Testing | Testcontainers Postgres with roles; minimal factories | Tenant factories, isolation matrix, cross-tenant suite scaffold |
| Follow-ups assigned to Phase 1 (Phase 0 exit notes) | — | Remove `p0-flag-probe`; FK + RLS on overrides (C-35) and RLS on `outbox_event`, `audit_log`, `idempotency_record`; cross-tenant suite scaffold; real host routing; dynamic manifest; review **M4** (client IP from `X-Forwarded-For` behind the trusted proxy + integration test) |

`packages/tenant` does not exist yet.

## Decisions I will record before coding (safe defaults, CLAUDE.md §2)

No decision blocks the plan. These four touch tenant isolation, so I'm listing them for you to see. Each gets a C- entry in S1 before the code lands.

| New ID | Question | Default I'll apply | Why it's safe |
| --- | --- | --- | --- |
| **C-51** | Tenant resolution has to read `tenant_domain` / `tenant` **before** a tenant context exists. Under FORCE RLS, `ab_app` would see nothing. | A narrow **host-lookup policy**: `ab_app` may SELECT only the `tenant_domain` row whose hostname equals the transaction-local `app.lookup_host`, plus that row's `tenant`. The resolver sets the GUC with `set_config(…, true)` in its own transaction. No platform client is used on the request path, and there is no SECURITY DEFINER function. | You can only see a row whose exact hostname you already know. That is the same information the public `/tenant/context` returns. Raw SQL without any GUC still sees zero rows. |
| **C-52** | How are subdomain hostnames stored when each environment has a different root domain (`academybees.com`, `staging.academybees.com`, `localhost`)? | `TenantDomain.hostname` stores the **label only** for `kind=SUBDOMAIN` (`demo-a`) and the full hostname for `kind=CUSTOM`. The resolver strips the configured `PLATFORM_ROOT_DOMAIN` (new env var for web + API) before the lookup. A label has no dot and a custom hostname always has one, so a single unique index still works. | The same data works in every environment, with no rewriting of hostnames on restore. |
| **C-53** | The core tables (`audit_log`, `outbox_event`, `idempotency_record`) also hold platform/system rows with `tenant_id NULL`, and `feature_flag_override` has global rows. | Tenant rows use the standard policy. `NULL`-tenant rows are visible and writable only when **no** tenant context is set (`app.tenant_id` unset). Flag overrides: `ab_app` can SELECT global rows plus the current tenant's rows, and stays read-only (Phase 0 grants). | A tenant context can never read platform rows or another tenant's rows. Platform rows carry no tenant data. |
| **C-54** | Local seeds beyond `demo-a`, `demo-b` and `paused` are needed so every status page has E2E coverage. | Also seed `setup-demo` (SETUP), `closed-demo` (ARCHIVED) and a REDIRECT domain `old-demo-a` → `demo-a`. All seeds are `local`/`ci` only. | Test data only. |

**OD-07 (domain + staging wildcard TLS, "needed by end of Phase 1"):** this moves with **C-50** (staging deferred). I'll report "staging `*.staging.academybees.com` resolves two tenants with TLS" as **DEFERRED (C-50)** with local evidence. If you want it, I'll add a runbook section for Vercel wildcard + DNS.

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + the relevant tests → Conventional Commit.
Each slice: branch `p1/<slice>` from the latest `main` → PR → all required checks green → squash merge (C-43) → pull `main`.

### S1 `p1/tenant-package` — plan + shared host rules

**1.1 Docs.**
- IMPLEMENTATION_PLAN: Phase 1 → 🟨, add this slice table, link this plan.
- DECISIONS: C-51…C-54.

**1.2 `packages/tenant`.**
- `normalizeHost` (lower-case, strip port and trailing dot, reject IP v4/v6, empty labels, over-long names).
- `classifyHost(host, rootDomain)` → `marketing | console | hub | tenant(label) | custom(host) | invalid`. Covers apex, `www`, `console`, `app`, a nested label under the root (→ invalid), and punycode `xn--` (→ invalid).
- `validateSlug` per ARCHITECTURE §4.1 (regex, no `--`, length) with `isReserved` (`reserved.ts` list incl. `app`, `hub`, `demo`, plus anything shorter than 3 characters).
- Exports are dependency-free (they run in `proxy.ts` and in the API).
- Tests: unit host matrix (every case in the Phase 1 test list) + **fast-check** property tests (normalise is idempotent; a valid slug always round-trips through classify; no reserved word or `xn--` is ever classified `tenant`; random junk never throws).
- New devDependency: `fast-check` (catalog).
- `apps/web/src/lib/host.ts` stub replaced by the package. No routing behaviour change yet.

### S2 `p1/tenant-schema` — tables, RLS, seeds

**1.3 Prisma `tenant.prisma` + migration.**
- `Tenant` (status `SETUP|ACTIVE|SUSPENDED|ARCHIVED|PENDING_APPROVAL`, C-11; timezone, locale, currency, academyType).
- `TenantDomain` (kind, role `PRIMARY|REDIRECT|ALIAS`, verification; unique `hostname`; partial unique "one PRIMARY per tenant").
- `TenantBranding`, `TenantSettings` (JSONB sections per ARCHITECTURE §5.1; `i18n` default `en-IN`).
- `Branch` (`isDefault`, partial unique "one default per tenant").
- FK `feature_flag_override.tenant_id → tenant` (C-35).
- UUIDv7 from code. Expand-only migration.

**1.4 RLS.**
- `prisma/sql/010-tenant-rls.sql` (idempotent, applied after every `db:migrate` / `db:deploy`):
  - a `ab_enable_tenant_rls(regclass)` helper;
  - a loop that applies ENABLE + **FORCE** + `tenant_isolation` (USING / WITH CHECK `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`) to **every table with a `tenant_id` column**;
  - `tenant` itself keyed on `id`;
  - the C-51 host-lookup policies and the C-53 nullable-row policies.
- `NULLIF(…, '')` matters: once a session has set the GUC, it reads `''` afterwards, and `''::uuid` would throw.
- **RLS coverage test:** every table with `tenant_id` has `relforcerowsecurity` and a policy, read from `pg_class` / `pg_policies`. New tables get RLS automatically, and the test fails if one ever doesn't.

**1.5 Seeds and factories.**
- `seed/tenants.ts` (local/ci guard), as migrator inside a per-tenant transaction that sets `app.tenant_id`.
- Tenants: `demo-a` (ACTIVE, Demo A branding), `demo-b` (ACTIVE, distinct colour), `paused` (SUSPENDED) + C-54 extras. Each gets a default Branch, Settings and Branding.
- Idempotent re-run.
- `packages/testing`: `buildTenant`, `createTenantFixture(db, overrides)`.

### S3 `p1/tenant-client` — tenant-bound Prisma client, proof, benchmark

**1.6 Tenant-bound client** (`packages/database/src/tenant.ts`).
- `createTenantBoundClient(base, getTenantId)` is a Prisma client extension:
  - every model operation runs as `$transaction([set_config('app.tenant_id', id, true), op])`;
  - it injects `tenantId` into `where` / `data` (create, createMany, upsert) for models that have it;
  - a mismatching `tenantId` → throws `TenantMismatchError`;
  - **no tenant context → throws** (fail closed). There is an explicit `withoutTenant()` only for the C-53 platform-row cases.
- `withTenantTransaction(fn)` handles interactive transactions (one `set_config` at the start).
- `$queryRaw` through the bound client is also wrapped.
- Lint: `createAppClient` importable only from `apps/api/src/core/database/**` and the worker equivalent (fixture test added to `packages/config`).

**1.7 Isolation suite** (`packages/database/test/tenant-isolation.int.spec.ts`, Testcontainers, real RLS). Generated from the Prisma DMMF for **every model with `tenantId`**:
- (a) context A `findMany` returns only A's rows;
- (b) raw SQL as `ab_app` with no context returns 0 rows;
- (c) writing a row with tenant B under context A is rejected by `WITH CHECK`;
- (d) update/delete of B's rows under A affects 0 rows;
- (e) the C-51 lookup GUC exposes only the exact hostname;
- (f) context A cannot see NULL-tenant rows (C-53).

**1.8 Benchmark** (`packages/database/bench/rls.bench.ts`, `pnpm --filter @academybee/database bench`): p50/p95 of a simple `findUnique` / `findMany` via the bound client vs raw `ab_app` without RLS on the Testcontainers DB. Target **< 2 ms p95 overhead**. Results recorded in the exit notes. If it misses, ADR-005's fallback is raised with you, not taken silently.

### S4 `p1/tenant-api` — resolver, context, guards, public endpoint

**1.9 `apps/api/src/core/tenant`.**
- `TenantResolverMiddleware`: effective host (C-46) → `@academybee/tenant` classify → lookup.
- Redis cache, TTL 60 s; negative cache 30 s; `TenantCache.invalidate(host|tenantId)` for Phase 3.
- `TenantContext` in CLS: `{ hostKind, tenant?: {id, slug, status}, domainRole }`.
- `APP_DB` is replaced by `TENANT_DB` (the bound client) in audit / outbox / idempotency / flags. `FeatureFlagService` caches global and per-tenant overrides separately.
- `TenantContext.run(tenantId, fn)` helper for jobs / hub fan-out later.

**1.10 Guards and endpoint.**
- `@HostKinds(...)` guard: default **tenant host required**; unknown host → `404 NOT_FOUND`, and health/docs are exempt.
- `TenantStatusGuard` with `@AllowTenantStatus(...)`, per ARCHITECTURE §5.3: SUSPENDED/ARCHIVED → `403 TENANT_UNAVAILABLE` for operational endpoints. New `ErrorCode`s plus en-IN messages.
- Public `GET /api/v1/tenant/context`, with a Zod response in `@academybee/contracts`:
  - ACTIVE / SETUP → slug, status, displayName, branding colours, `hasLogo`;
  - SUSPENDED → status + displayName;
  - ARCHIVED → status only;
  - unknown → 404;
  - REDIRECT → `{ redirectTo: primary host }`.
  - Never any IDs.
- OpenAPI updated. `/api/v1/flags` becomes tenant-aware.

**1.11 Security tests and M4.**
- Client IP from `X-Forwarded-For` only when the proxy secret / IP validates, with an integration test through the real CLS middleware.
- `apps/api/test/security/tenant-resolution.int.spec.ts`:
  - a forged `X-Forwarded-Host` without the secret is ignored;
  - `?tenantId=`, a body `tenantId` and an `x-tenant-id` header never change the tenant;
  - a REDIRECT host resolves to the primary;
  - a suspended host is blocked on an operational probe endpoint.
- **Cross-tenant suite scaffold** in `packages/testing/src/cross-tenant`: a registry where every tenant-scoped endpoint declares itself, a generator that runs host-A vs tenant-B checks, and a test that **fails if a tenant-scoped route is not registered**. Phase 1 registers `/tenant/context` and `/flags`; Phase 2 adds sessions.

### S5 `p1/web-routing` — host routing + status pages

**1.12 `proxy.ts`.**
- Classify the host with `@academybee/tenant` (`PLATFORM_ROOT_DOMAIN`), then fetch `/api/v1/tenant/context` with the forwarded host + secret. In-memory LRU, 60 s; negative 30 s.
- Rewrites:
  - tenant → `/t/<slug>/<path>`;
  - REDIRECT → **301** to the primary host (same path + query);
  - `console.` → `/console/...`;
  - `app.` → `/hub/...`;
  - apex/`www` → marketing;
  - invalid/unknown → Unknown page.
- If the API is unreachable, fail **closed**: a designed "temporarily unavailable" page (503). It is never shown as "unknown".
- Resolved context goes to server components in an `x-ab-tenant` request header. **Any client-supplied `x-ab-*` header is stripped first.**
- The matcher now also covers `manifest.webmanifest` and the tenant icon/favicon paths.
- Unit tests for the rewrite table.

**1.13 Status pages** (UX v1.1 §7, UX §24), in `(tenant)/t/[slug]/…` + a shared `StatusPage` composition from `@academybee/ui`:
- **Unknown academy** (HTTP 404);
- **Suspended**;
- **Archived** (410 where Next allows it, else 200 + `noindex`);
- **Setting up**;
- **Access denied** (the route exists now; Phase 2 sends users to it);
- **Temporarily unavailable**.

Each page states what happened, the next step and a way back to AcademyBee. No IDs or raw errors. Strings live in a new `tenant` i18n namespace. Light and dark, phone-first, 48 px targets, status never shown by colour alone. Server components only, so no route-JS growth (shell headroom is ≈4 KB).

### S6 `p1/web-branding` — branded shell, manifest, hub, E2E

**1.14 Branding.**
- Tenant layout applies academy identity: name, monogram/logo, and a brand accent on identity surfaces only (C-49). `brandAccent()` falls back to Bee Gold when contrast fails in either theme; unit-tested.
- **Branded placeholder home** at `/` on tenant hosts. It shows the academy identity and a "Sign-in arrives with accounts" style message, so it sits behind release flag **`p1-tenant-home`** (owner PO, on in local/ci, off in staging/production; remove in Phase 2 when `/login` replaces it). When the flag is off, it shows the Setting-up-style identity page with no promises.
- Per-tenant `manifest.webmanifest` route (name, short_name, theme colour from branding, start_url `/`, id per tenant).
- Generated monogram icons and favicon per tenant via `ImageResponse`, cached. Logo upload (R2) arrives in Phase 3, when `logoKey` takes over.

**1.15 Hub, console and flag cleanup.**
- `app.` → designed AcademyBee Family Hub placeholder behind flag **`p1-hub-placeholder`** (on in local/ci; off → 307 to apex; remove in 7P).
- `console.` → designed not-found until the Phase 2/3 console pages exist.
- **Remove `p0-flag-probe`** (contracts registry, `/flag-probe`, specs); `e2e/specs/flag.spec.ts` now asserts `p1-tenant-home` instead.

**1.16 E2E + analytics.**
- `e2e/specs/tenant-hosts.spec.ts`:
  - `demo-a.localhost` shows Demo A name/brand and manifest name "Demo A";
  - `demo-b` differs;
  - `nope.localhost` → Unknown (404);
  - `paused.localhost` → Suspended;
  - `closed-demo` → Archived;
  - `setup-demo` → Setting up;
  - `old-demo-a.localhost/x` → 301 to `demo-a.localhost/x`;
  - `app.localhost` → hub placeholder;
  - `console.localhost` → console host;
  - `localhost` → marketing.
- axe on every status page in both themes; phone (Pixel 7 / iPhone) projects; screenshots to `e2e/artifacts/`.
- Analytics: `tenant_status_page_viewed { status }` (no PII, hashed tenant) via the UI tracker; event schema in contracts.

### S7 `p1/docs` — as-built docs

**1.17 Docs.**
- ARCHITECTURE §4.1/§4.2/§5.2/§8.2/§10.2 as built (C-51…C-54, `PLATFORM_ROOT_DOMAIN`, proxy headers, resolver cache).
- README + CLAUDE.md §8 (seeded hosts).
- `.env.example`s.
- `docs/runbooks/environments.md`: wildcard DNS/TLS steps for staging (deferred, C-50).
- Plan evidence table drafted for P1-3.

| Slice | Branch | Tasks | Release flags |
| --- | --- | --- | --- |
| S1 | `p1/tenant-package` | 1.1, 1.2 | — |
| S2 | `p1/tenant-schema` | 1.3, 1.4, 1.5 | — |
| S3 | `p1/tenant-client` | 1.6, 1.7, 1.8 | — |
| S4 | `p1/tenant-api` | 1.9, 1.10, 1.11 | — |
| S5 | `p1/web-routing` | 1.12, 1.13 | — (status pages are complete) |
| S6 | `p1/web-branding` | 1.14, 1.15, 1.16 | `p1-tenant-home` (→ Ph 2), `p1-hub-placeholder` (→ 7P); `p0-flag-probe` removed |
| S7 | `p1/docs` | 1.17 | — |

## Dependencies and gaps

- Uses Phase 0: CLS + effective host (C-46), Redis module, error envelope + `ErrorCode`, i18n catalogues, `@academybee/ui`, release flags, post-migrate SQL runner, Testcontainers roles, Playwright `*.localhost` projects.
- Missing from Phase 0 and added here:
  - tenant-aware flag cache;
  - lint restriction on `createAppClient`;
  - RLS on core tables;
  - M4.
- **Not built (later phases):**
  - login, sessions, `token.tid` check, MembershipGuard (Phase 2) — `Access denied` exists, but nothing routes to it until then;
  - branding/domain settings UI, slug change and custom-domain verification, logo upload (Phase 3);
  - worker tenant-bound processors (first needed in Phase 6; the shared helper is ready);
  - hub fan-out (7P).

## Risks

| Risk | Mitigation |
| --- | --- |
| Prisma 7 extension + `$transaction([set_config, op])` per query: overhead, nested-transaction semantics, `$queryRaw` coverage | Benchmark in S3. Interactive-transaction variant. The isolation suite covers raw SQL. If the budget is missed → ADR-005 fallback raised with you |
| `current_setting` returns `''` after a local set ends | `NULLIF(…,'')::uuid` in every policy; a test reuses a pooled connection after a tenant transaction |
| FORCE RLS breaks Phase 0 code (audit/outbox/idempotency writes, flag reads, outbox relay) | C-53 policies; core services switched to the bound client in S4; outbox relay already uses the platform client; the existing Phase 0 integration tests must stay green |
| Next.js `proxy.ts` per-request API call adds latency; a wrong cache serves a stale status | LRU 60 s / negative 30 s, matching the API; Phase 3 suspend → invalidate API cache (web cache expires ≤ 60 s, documented) |
| Rewrites can't always set a status code (404/410) | Unknown via `notFound()` → real 404; Archived 410 if `NextResponse.rewrite(…, {status})` holds, else 200 + `noindex` (recorded) |
| WebKit (iPhone project) resolving `*.localhost` | Verify in S6. If WebKit can't, tenant-host specs run on Chromium desktop + Android, and the iPhone project covers the pages via a host-resolver override or the `Host` header; recorded as a C- entry |
| Route-JS budget (≈4 KB headroom) | Status pages and branding are server components; brand accent via CSS variables; `perf:budget` on tenant routes |
| Spoofed internal headers (`x-ab-tenant`, `x-forwarded-host`) | Proxy strips `x-ab-*` before setting its own; API trusts only the secret/IP (C-46); security tests in S4/S6 |

## How I'll prove the exit gate (P1-3)

| Gate item | Evidence |
| --- | --- |
| Host classification matrix (all cases, incl. `app`, punycode, IP, nested, REDIRECT, custom mock) | `packages/tenant/src/*.spec.ts` (unit + fast-check); `apps/web/src/proxy.spec.ts` |
| Context A sees only A on every tenant table; raw SQL without context = 0; B write rejected | `packages/database/test/tenant-isolation.int.spec.ts` (DMMF-generated); `rls-coverage.int.spec.ts` |
| Platform client lint | `packages/config/test/eslint-rules.spec.js` (platform client + `createAppClient` fixtures) |
| Client-supplied tenantId / forged host never trusted | `apps/api/test/security/tenant-resolution.int.spec.ts`; cross-tenant suite registry test |
| E2E: demo-a branding + manifest; `nope` → 404 Unknown; `paused` → Suspended (+ archived, setup, redirect, hub, console) | `e2e/specs/tenant-hosts.spec.ts`, `status-pages.a11y.spec.ts` (both themes) |
| RLS overhead < 2 ms p95 | `pnpm --filter @academybee/database bench` output in exit notes |
| Staging `*.staging.academybees.com` + TLS | **DEFERRED (C-50)** with local evidence |
| Common Phase Gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm perf:budget && pnpm i18n:check && pnpm flags:check && pnpm db:drift` |

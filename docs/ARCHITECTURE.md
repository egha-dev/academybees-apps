# AcademyBee — Architecture

> Status: **Baseline v1.5** (Phase 0 entry; incorporates PRD v3.2 Addendum incl. G-30 payments, G-31 Family Hub, G-32 multilingual; repository management ADR-041; P-00 orientation corrections C-29…C-41) · Owner: Principal Architect · Last updated: 2026-09-30
> Governs: all engineering work. Subordinate to PRD v3.1 and UI/UX Spec v1.1 (see `CLAUDE.md` §2).
> Every decision summarised here is recorded with rationale in `docs/DECISIONS.md` (ADR-xxx).

---

## 0. Reference conventions

The source documents contain multiple versions stitched together. Cite them precisely:

| Citation | Meaning |
| --- | --- |
| `PRD v2 §n` | First part of the PRD file ("Version 2.0 — Consolidated PRD"), sections 1–41 |
| `PRD v2.1 §18.x` | "Scalability, Infrastructure & Cost Planning" section inside the v2 part |
| `PRD v3 §n` | "FINAL PRODUCT REQUIREMENTS DOCUMENT v3.0" part, sections 1–34 |
| `PRD v3.1 §A–J` | "V3.1 Addendum — Academy Provisioning & Tenant Domain Architecture" |
| `UX §n` | UI/UX Master Spec v1.0 body, sections 1–37 + appendices |
| `UX v1.1 §n` | "V1.1 Addendum — Academy Provisioning, Wildcard URL & Tenant Experience" |
| `PRD v3.2 G-xx` | `docs/PRD_ADDENDUM_v3.2.md` — Product Owner corrections (highest precedence) |

Source texts live in `docs/source/PRD_v3.1.md` and `docs/source/UX_SPEC_v1.1.md` (plain-text copies of the .docx files so Claude Code can read them).

When versions disagree the newest wins: **PRD v3.2 addendum > v3.1 > v3.0 > v2.x** (ADR-000).

---

## 1. Architectural principles

1. **Modular monolith.** One API deployable, one worker deployable, one web deployable. Module boundaries are enforced in code, not by network hops (PRD v3 §29).
2. **Academy = Tenant.** Every tenant-owned row carries `tenantId`; branch-scoped rows also carry `branchId` (PRD v2 §27).
3. **Server is authoritative.** Clients (online or offline) propose; the server decides (PRD v3 §31).
4. **Tenant isolation in depth.** Hostname resolution → authenticated membership → request context → ORM scoping → PostgreSQL RLS → tests. No single layer is trusted alone (ADR-005).
5. **Financial correctness over convenience.** State machines, idempotency, server numbering, append-only audit (PRD v3 §12).
6. **Selective offline.** Only the workflows listed in PRD v3 §10 work offline. Everything else is honest about needing a network.
7. **Build for 100K, pay for today.** Stateless processes, keyset pagination, summary tables, queues — but no sharding, replicas or service extraction until metrics demand it (PRD v2.1 §18.10).
8. **Contracts are shared and typed.** One Zod schema defines request/response/offline-payload shape for API, web, worker and Dexie (ADR-012).

---

## 2. System context

```text
                         ┌──────────────────────────────────────────────┐
  Browsers / PWAs        │                 Edge / CDN                    │
  ─────────────────      │  academybees.com  console.academybees.com       │
  Owner/Admin (desktop)  │  *.academybees.com (tenants)  custom domains*  │
  Teacher PWA (mobile) ─▶│  wildcard TLS                                 │
  Parent/Student PWA     └───────────────┬──────────────────────────────┘
  Super Admin console                    │ same host, path-routed
                                         ▼
               ┌─────────────────────────────────────────────┐
               │ apps/web  (Next.js App Router, PWA, SW)     │
               │  middleware: host → experience rewrite      │
               │  /api/*  ──rewrite (same-origin proxy)──┐   │
               └─────────────────────────────────────────┼───┘
                                                         ▼
               ┌─────────────────────────────────────────────┐
               │ apps/api  (NestJS, stateless, N instances)  │
               │  TenantResolver → Auth → Membership →       │
               │  Permission/Scope → Module → Prisma(+RLS)   │
               └──────┬───────────────┬──────────────┬───────┘
                      │               │              │
             ┌────────▼───┐   ┌───────▼──────┐  ┌────▼─────────────┐
             │ PostgreSQL │   │ Redis        │  │ Object storage   │
             │ (RLS, UTC) │   │ cache, rate  │  │ (S3-compatible,  │
             │            │   │ limit, BullMQ│  │  R2) presigned   │
             └────────▲───┘   └───────▲──────┘  └────▲─────────────┘
                      │               │              │
               ┌──────┴───────────────┴──────────────┴───────┐
               │ apps/worker (NestJS standalone, BullMQ)      │
               │ outbox relay · notifications · sessions gen  │
               │ invoices · summaries · exports · reminders   │
               └──────┬───────────────────────────────────────┘
                      ▼
     Email · SMS (DLT) · WhatsApp Cloud API · Web Push · Payment gateway · Sentry
```
`*` custom domains are future (PRD v3.1 §G); the model supports them from Phase 1.

---

## 3. Repository layout

pnpm workspaces + Turborepo (ADR-001).

```text
academybee/
├── CLAUDE.md
├── docs/
│   ├── ARCHITECTURE.md          ← this file
│   ├── IMPLEMENTATION_PLAN.md
│   ├── DECISIONS.md
│   ├── METRICS.md               (Phase 12 — single metric definitions)
│   └── runbooks/                (Phase 15)
├── apps/
│   ├── web/                     Next.js — academy staff, Family Hub, console, marketing
│   │   ├── src/app/
│   │   │   ├── (marketing)/         apex host
│   │   │   ├── (console)/console/   console.academybees.com  (rewritten)
│   │   │   ├── (tenant)/t/[slug]/   *.academybees.com  — staff (rewritten)
│   │   │   │   ├── (auth)/          login, reset, invite
│   │   │   │   ├── (status)/        unknown / suspended / setup
│   │   │   │   ├── (public)/        academy public page, enquiry, privacy notice
│   │   │   │   ├── onboarding/
│   │   │   │   ├── (manage)/        owner/admin/accountant/receptionist
│   │   │   │   └── teach/           teacher PWA
│   │   │   ├── (hub)/hub/           app.academybees.com — Family Hub (rewritten)
│   │   │   │   ├── (parent)/        all-academies Home, /a/[slug]/…, join, academies
│   │   │   │   └── me/              student
│   │   │   ├── manifest.ts          dynamic per-tenant manifest
│   │   │   └── sw.ts                Serwist service worker
│   │   ├── src/proxy.ts             host classification + rewrite ("middleware"; file name per pinned Next.js major, C-34)
│   │   ├── src/features/<module>/   feature UI (components, hooks, queries)
│   │   └── src/offline/             Dexie wiring, sync runner, sync UI
│   ├── api/                     NestJS modular monolith
│   │   └── src/
│   │       ├── core/            tenant, auth, rbac, audit, idempotency, errors, outbox
│   │       ├── modules/<name>/  one folder per domain module
│   │       └── platform/        Super Admin (console) modules
│   └── worker/                  NestJS standalone app, BullMQ processors
├── packages/
│   ├── config/        tsconfig bases, eslint flat config, prettier, vitest presets
│   ├── contracts/     Zod schemas: DTOs, enums, error codes, sync ops, permissions
│   ├── database/      Prisma schema, migrations, client factory, RLS SQL, seeds
│   ├── auth/          token/cookie helpers, password hashing, permission catalogue
│   ├── tenant/        hostname parsing, slug rules, reserved names (shared web+api)
│   ├── sync/          Dexie DB definition, queue engine, connectivity, conflict types
│   ├── ui/            AcademyBee design system (tokens, MUI theme, components)
│   ├── i18n/          ICU message catalogues (en-IN), locale context, Intl formatters (ADR-031/040)
│   └── testing/       test factories, tenant fixtures, Testcontainers helpers
├── infra/
│   ├── docker-compose.yml   postgres, redis, mailpit, minio
│   └── k6/                  load tests (Phase 15)
├── e2e/                     Playwright specs
└── .github/                 workflows (CI/CD), CODEOWNERS, PR template, issue templates, renovate config (ADR-041)
```

### 3.1 Repository management (ADR-041)

One private monorepo, trunk-based. Work lands in **slices** (short branches `p<phase>/<slice>`, squash-merged via PR with auto-merge when CI is green), so `main` is always deployable; unfinished user-visible work sits behind a **release flag** (`FeatureFlag`, separate from plan entitlements). `main` is protected by a GitHub ruleset (PR + required checks + linear history). Conventional Commits; release-please maintains `CHANGELOG.md`; `v*` tags deploy to production after PO approval; `phase-*` tags are milestones only. pnpm catalogs keep one version per dependency; Renovate updates weekly; Turborepo remote cache and `--affected` keep CI fast. Scale path and triggers for revisiting (Nx, extracted deployables) are in ADR-041.

**Module dependency rule.** `apps/*` may depend on `packages/*`. `packages/*` never depend on `apps/*`. Inside `apps/api`, a module may call another module only through its exported service interface (no reaching into another module's Prisma models or internals). Enforced by `eslint-plugin-boundaries`.

---

## 4. Hosts, environments and runtime topology

### 4.1 Hostnames

| Host | Purpose | Notes |
| --- | --- | --- |
| `academybees.com`, `www.` | Marketing/platform entry | Phase 0 placeholder; public enquiry lives on tenant hosts |
| `app.academybees.com` | **Family Hub**: parents & students, one login across all linked academies (ADR-039) | User-bound `HUB` sessions; academy URLs redirect parents/students here |
| `console.academybees.com` | Super Admin platform console | Separate origin ⇒ separate cookies & storage (ADR-003) |
| `{slug}.academybees.com` | Academy tenant workspace | All academy roles, one origin per academy |
| `{custom-domain}` | Verified custom domain (future) | Maps to same immutable tenant ID |
| `*.staging.academybees.com` | Staging tenants | Needs its own wildcard cert |
| `{slug}.localhost:3000` | Local development | `*.localhost` resolves to loopback in Chromium; no hosts-file edits |

**Reserved slugs** (never provisionable), kept in `packages/tenant/src/reserved.ts`:
`www, app, my, hub, family, parents, api, admin, console, platform, auth, login, logout, signup, register, account, accounts, mail, email, smtp, static, assets, cdn, media, files, img, images, docs, help, support, status, blog, news, billing, pay, payments, invoice, invoices, dev, staging, stage, test, qa, demo, sandbox, preview, internal, ops, root, system, security, academybee, bee, public, private, www2, m, mobile, ftp, ns1, ns2, localhost` plus anything < 3 chars. Reserved slugs are refused by normal provisioning; only a **platform-owned tenant** (seed/CLI, audited) may use one — e.g. the sales demo academy `demo` (G-13, C-36).

**Slug rules:** `^[a-z0-9](?:[a-z0-9-]{1,40}[a-z0-9])$`, no `--` (blocks punycode `xn--`), lower-cased, trimmed, profanity/impersonation list checked at provisioning.

*As built (Phase 1):* `packages/tenant` (dependency-free, used by `proxy.ts` and the API) holds `normalizeHost`, `classifyHost(host, PLATFORM_ROOT_DOMAIN)` → `marketing | console | hub | tenant(label) | custom(host) | invalid`, `validateSlug` and the reserved list. IP literals, punycode labels and nested labels under the root are `invalid`. Reserved labels still classify as `tenant`, because a platform-owned tenant may hold one (C-36); provisioning refuses them with `validateSlug`. `TenantDomain.hostname` stores the **label** for subdomains and the full host for custom domains (C-52). The root domain comes from `PLATFORM_ROOT_DOMAIN` (web + API; `localhost` by default only in local/ci).

### 4.2 Same-origin API

Every host serves `/api/*`, rewritten by the web tier (or the load balancer) to the NestJS service. The browser therefore talks to its own origin only:

- Cookies are **host-only** (no `Domain=` attribute) — a session on `abc.academybees.com` is never sent to `xyz.academybees.com` (ADR-004).
- No wildcard CORS with credentials.
- The API resolves the tenant from `X-Forwarded-Host`, which it trusts **only** from the configured proxy (trusted-proxy list; direct access to the API origin is firewalled or requires an internal shared secret header).
- *As built (Phase 0, C-46; review M1 in Phase 1):* `apps/web/src/proxy.ts` rewrites `/api/*` to `API_ORIGIN`. It drops every client-sent `X-Forwarded-For`, `Forwarded`, `X-Real-IP` and `x-ab-*` header. It sets `X-Forwarded-For` only from the platform header named in `TRUSTED_CLIENT_IP_HEADER` (Vercel: `x-real-ip`), **overwrites** `X-Forwarded-Host` with the browser's host, and adds `X-AB-Proxy-Secret`; the API accepts the forwarded host only with that secret (timing-safe compare) or from `TRUSTED_PROXY_IPS`, otherwise it uses `Host`. The effective host is stored in the request context for tenant resolution (Phase 1).

### 4.3 Deployables

| Deployable | Scaling | State |
| --- | --- | --- |
| `apps/web` | CDN + serverless/edge (Vercel default) | Stateless |
| `apps/api` | Horizontal containers behind LB | Stateless (sessions in DB/Redis) |
| `apps/worker` | Horizontal, per-queue concurrency | Stateless |
| PostgreSQL | Managed, pooled (PgBouncer transaction mode) | Authoritative |
| Redis | Managed | Cache, rate limit, queues (rebuildable except in-flight jobs) |
| Object storage | S3-compatible (R2) | Files, receipts, exports |

Environments: `local`, `ci`, `staging`, `production`. Config is validated at boot by a Zod schema; the process refuses to start on invalid config.

---

## 5. Tenant & domain architecture

### 5.1 Data model

```text
Tenant               id (uuid v7, immutable) · slug (unique) · name · academyType
                     status: SETUP | ACTIVE | SUSPENDED | ARCHIVED   (PENDING_APPROVAL reserved)
                     timezone (default Asia/Kolkata) · locale (en-IN) · currency (INR)
                     createdAt · updatedAt · createdBy
TenantDomain         id · tenantId · hostname (unique, lower-case) · kind: SUBDOMAIN | CUSTOM
                     role: PRIMARY | REDIRECT | ALIAS · verification: PENDING | VERIFIED | FAILED
                     verificationToken · verifiedAt · createdAt
TenantBranding       tenantId (PK) · logoKey · faviconKey · primaryColor · secondaryColor
                     displayName · themeMode
TenantSettings       tenantId (PK) · contact (phone, email, whatsapp, address) · terminology (JSON)
                     attendance (editWindowHours, offlineAcceptDays) · finance (invoicePrefix,
                     receiptPrefix, fiscalYearStartMonth, taxConfig) · notifications (defaults)
                     publicProfile (enabled, fields)
TenantOnboarding     tenantId (PK) · currentStep · steps (JSON: {step: {status, completedAt, refIds}})
Branch               id · tenantId · name · isDefault · address · status
```

- Slug change = new `TenantDomain(PRIMARY)` + old one demoted to `REDIRECT` (301 to new host for 180 days, then `REDIRECT` rows remain reserved so the slug can't be taken by another academy). `Tenant.id` never changes (PRD v3.1 §F).
- Every tenant gets a **default branch** at provisioning. Branch-scoped tables carry `branchId` from day one; multi-branch *UI* is deferred (C-07).

### 5.2 Resolution flow

```text
Request Host ──▶ normalise (lower-case, strip port, reject IP / punycode / >1 label under root)
            ──▶ classify:  apex | console | tenant-subdomain | custom-domain | unknown
            ──▶ lookup TenantDomain by hostname  (Redis cache, TTL 60s, negative cache 30s)
            ──▶ ResolvedHost { kind, tenant?: {id, slug, status}, domainRole }
                     │
   web middleware ───┤ REDIRECT role ─▶ 301 to primary host (same path)
                     │ unknown       ─▶ rewrite to /t/_/status/unknown   (404)
                     │ SUSPENDED     ─▶ status page (+ login allowed for Owner to see billing)
                     │ ARCHIVED      ─▶ status page (410)
                     │ SETUP         ─▶ normal; authenticated owner is routed to onboarding
                     │ ACTIVE        ─▶ rewrite  /<path>  →  /t/<slug>/<path>
                     ▼
   api (per request) TenantResolverMiddleware → TenantContext (CLS) = {tenantId, slug, status}
                     AuthGuard → token.tid MUST equal resolved tenantId, else 401 TENANT_MISMATCH (audited)
                     MembershipGuard → active membership in tenant, loads roles/capabilities
                     PermissionGuard → capability + scope policy
                     Prisma client (tenant-bound) → SET LOCAL app.tenant_id → RLS
```

Hostname is **candidate identification only** — authorization comes from the authenticated membership (PRD v3.1 §C).

*As built (Phase 1):* resolution is the first global guard (`apps/api/src/core/tenant/tenant.guard.ts`). It classifies the effective host with `@academybee/tenant`, looks it up via `TenantResolver` (Redis cache, `TENANT_CACHE_MS` / `TENANT_NEGATIVE_CACHE_MS`, `invalidateHost` / `invalidateTenant`; falls back to the database when Redis is down), and stores `resolvedHost` + `tenantId` in CLS. The tenant-bound client (`TENANT_DB`) reads `tenantId` from there. Each route declares a host policy: the default is an academy host in SETUP/ACTIVE; `@TenantHost(...statuses)`, `@AnyHost()` (flags, `/tenant/context`) and `@NoHostResolution()` (health, docs) are opt-ins. Non-academy and unknown hosts get `404 NOT_FOUND`; other statuses get `403 TENANT_UNAVAILABLE`. `TenantContext.run(tenantId, fn)` runs work under an explicit academy, awaiting inside the scope because Prisma queries run when awaited. `GET /api/v1/tenant/context` returns `{status: SETUP|ACTIVE, slug, displayName, timezone, locale, branding}`, `{status: SUSPENDED, displayName}`, `{status: ARCHIVED}` or `{status: REDIRECT, host}`; it never includes IDs.

### 5.3 Tenant status behaviour

| Status | Public context API | Login | Operational APIs | UI |
| --- | --- | --- | --- | --- |
| SETUP | ✔ | ✔ | ✔ (owner/admin), onboarding APIs | Owner → onboarding; others → "Academy is being set up" |
| ACTIVE | ✔ | ✔ | ✔ | Normal |
| SUSPENDED | ✔ (status only) | Owner only | ✘ except billing + data export | Suspended page with next action |
| ARCHIVED | ✔ (status only) | ✘ | ✘ | Archived page |
| unknown | 404 | ✘ | ✘ | "Academy not found" |

Raw errors (tenantId, DB, routing) are never shown (UX v1.1 §7).

### 5.4 Custom domains (future-ready)

Add `TenantDomain(kind=CUSTOM, verification=PENDING)` with a TXT token → worker verifies DNS → platform edge API (e.g. Vercel Domains API) attaches domain + certificate → `VERIFIED`. Nothing else in the tenant model changes.

### 5.6 Family Hub (`app.academybees.com`, ADR-039, PRD v3.2 G-31)

```text
Parent opens app.academybees.com ──▶ HUB session (user-bound, no tid)
  ├─ GET /api/v1/hub/home
  │    → memberships = ACTIVE Parent/Student memberships of user
  │    → for each tenant (parallel, timeout 3s):
  │         TenantContext.run(tenantId) → portal services (RLS app.tenant_id = tenantId, LINKED/SELF scope)
  │    → merge: today's classes (tagged by academy), children cards, dues per academy, notifications
  ├─ GET /api/v1/hub/academies/:slug/…      (explicit single-academy calls; membership verified; unknown = 404)
  └─ Add academy (QR poster / typed URL or code / invite link)
       POST /hub/links/start {slug}  → public academy card (name, logo)
       POST /hub/links/verify        → if academy holds a matching verified identifier → OTP → ACTIVE membership + ConsentRecord
       POST /hub/join-requests       → no match → academy "Join requests" queue → staff approve & link students
       (uniform responses, rate limits per user/IP/tenant — no enumeration)
```

- The Parent/Student experiences are served **only** by the hub; the same UI components are used in "All academies" and "single academy" modes (the selected academy's logo/accent is applied).
- Academy sites show a "Parents: open your AcademyBee app" entry that deep-links to `app.academybees.com/a/<slug>`.
- `HubChildGroup` stores parent-private groupings of the same child across academies; never visible to tenants.

### 5.5 Per-tenant PWA identity

`app/manifest.ts` is dynamic: name, short_name, icons and theme colour come from `TenantBranding`. *As built (Phase 1):*
- an ACTIVE academy host serves `/manifest.webmanifest` from `(tenant)/t/[slug]/manifest.webmanifest/route.ts` (name, short name ≤ 12 characters, `theme_color` = brand colour when it passes `brandIdentityColors`);
- icons come from `/academy-icon/{icon-192,icon-512,maskable-512,apple-180}.png`, generated from the slug initials until uploaded logos arrive (Phase 3);
- every other host serves the AcademyBee manifest. Because each tenant is its own origin, each academy installs as its own branded app for **staff** with an isolated service worker, cache and IndexedDB. Parents and students install the single **AcademyBee Family Hub** app from `app.academybees.com` (§5.6).

---

## 6. Identity, authentication and sessions

### 6.1 Model (ADR-006)

```text
User                 id · email (unique, citext, nullable) · phone (E.164, unique, nullable)
                     name · status · emailVerifiedAt · phoneVerifiedAt · lastLoginAt
UserCredential       userId · passwordHash (argon2id) · passwordUpdatedAt · failedCount · lockedUntil
Membership           id · tenantId · userId · status: INVITED | ACTIVE | DISABLED · branchIds[]? (null = all)
Role                 id · tenantId (null = system template) · key · name · isSystem
RolePermission       roleId · capability
MembershipRole       membershipId · roleId
PlatformStaff        userId · platformRole: SUPER_ADMIN | SUPPORT | FINANCE_OPS · status
AuthSession          id · userId · tenantId? (null for CONSOLE and HUB) · audience: TENANT | CONSOLE | HUB
                     refreshTokenHash · familyId · deviceLabel · ip · userAgent
                     createdAt · lastUsedAt · expiresAt · revokedAt · revokeReason
Invitation           id · tenantId · email/phone · roleKeys[] · tokenHash · expiresAt · acceptedAt
PasswordResetToken   userId · tokenHash · expiresAt · usedAt
```

- One global identity, many memberships (a parent may belong to two academies). Academies never see another academy's membership.
- **Staff sessions are bound to one tenant (or the console).** Staff using another academy sign in on that academy's host.
- **Parent/Student sessions are bound to the user on the Family Hub** (`aud=HUB`, no `tid`), and every per-academy read/write re-establishes that academy's tenant context and verifies membership (ADR-039). Hub tokens are rejected on tenant/console hosts and vice versa.
- Teacher, Parent, Student are **roles on a Membership** plus a domain profile (`Teacher`, `Parent`, `Student` rows) linked by `userId` — the auth model is not duplicated per role.

### 6.2 Tokens and cookies (ADR-007)

| Token | Form | Lifetime | Storage |
| --- | --- | --- | --- |
| Access | JWT (EdDSA/ES256), claims `sub, tid, sid, aud, ver` (`tid` only for `aud=TENANT`; absent for CONSOLE and HUB, C-32) | 15 min | `__Host-ab_at` cookie, httpOnly, Secure, SameSite=Lax, Path=/ |
| Refresh | 256-bit opaque, SHA-256 hashed in DB | 30 days sliding (7 days for console) | `__Secure-ab_rt` cookie, host-only (no `Domain`), httpOnly, Secure, SameSite=Lax, Path=/api/v1/auth (`__Host-` requires Path=/, so `__Secure-` is used here) |
| CSRF | random, double-submit | session | readable cookie + `X-CSRF-Token` header on all mutations |

- Refresh rotation with **reuse detection**: presenting a rotated token revokes the whole `familyId`.
- Capabilities are **not** embedded in the JWT; they are loaded per request (cached in Redis keyed by membership + `permissionsVersion`) so role changes take effect immediately.
- Passwords: argon2id (memory ≥ 19 MiB, t=2, p=1 minimum), breached-password check optional, min length 8 with strength meter.
- Rate limits (Redis): login 5/min/IP+identifier with exponential backoff; reset/invite 3/hour/identifier.
- Offline: the PWA shell and cached data open without a network; **mutations queue locally and are sent when a valid session exists**. If the refresh token has expired when connectivity returns, the queue is kept and the user re-authenticates; the queue then flushes. Passwords are never stored client-side (PRD v2 §12).

### 6.3 Console authentication

Super Admin signs in only on `console.academybees.com`. Console sessions have `aud=CONSOLE`, shorter lifetime, mandatory TOTP 2FA (Phase 14 — before that, restricted to allow-listed accounts created by CLI). Console tokens are rejected on tenant hosts and vice versa.

### 6.4 Impersonation ("Login as Academy") — Phase 14

Explicit capability `platform.impersonate`, reason required, time-boxed (30 min), creates a tenant session with `act` claim (actor = platform user), persistent red banner in UI, every request audited with both identities, finance-mutating and credential-changing actions blocked while impersonating.

---

## 7. Authorization (ADR-008)

### 7.1 Capabilities

Permissions are capability strings `resource.action`. The catalogue lives in `packages/contracts/src/permissions.ts` and is the single source for API guards, UI visibility and seed data.

| Area | Capabilities |
| --- | --- |
| Academy | `academy.settings.read` `academy.settings.manage` `academy.branding.manage` `academy.domain.manage` `academy.onboarding.manage` |
| Team | `team.read` `team.invite` `team.manage` `role.manage` |
| People | `student.read` `student.create` `student.update` `student.archive` `parent.read` `parent.manage` `teacher.read` `teacher.manage` |
| Scheduling | `course.read` `course.manage` `batch.read` `batch.manage` `batch.enrol` `timetable.read` `timetable.manage` `session.manage` |
| Attendance | `attendance.read` `attendance.mark` `attendance.edit_past` |
| Finance | `fee.read` `fee.manage` `invoice.read` `invoice.create` `invoice.issue` `invoice.cancel` `payment.read` `payment.record_cash` `payment.record_offline` `payment.verify` `payment.report` (parent) `payment.refund` `receipt.read` `finance.reconcile` `expense.manage`* |
| CRM | `lead.read` `lead.manage` `trial.manage` `admission.convert` |
| Learning | `homework.read` `homework.manage` `homework.submit` `assessment.read` `assessment.manage` `assessment.grade` `progress.read` |
| Communication | `announcement.read` `announcement.publish` `message.send` `template.manage` |
| Insights | `report.read` `report.finance` `report.export` |
| Subscription | `subscription.read` `subscription.manage` |
| Audit | `audit.read` |
| Platform | `platform.tenant.read` `platform.tenant.create` `platform.tenant.suspend` `platform.tenant.domain` `platform.user.read` `platform.user.manage` `platform.plan.manage` `platform.billing.read` `platform.billing.manage` `platform.analytics.read` `platform.support.manage` `platform.announcement.publish` `platform.settings.manage` `platform.audit.read` `platform.impersonate` |

`*` deferred module.

### 7.2 Scopes

Capabilities are evaluated with a **scope**, resolved by a policy function per resource:

| Scope | Meaning | Typical role |
| --- | --- | --- |
| `TENANT` | Any record in tenant | Owner |
| `BRANCH` | Records in membership's branches | Admin, Accountant, Receptionist |
| `ASSIGNED` | Batches where user is a `BatchTeacher`; students enrolled in those batches (active window) | Teacher |
| `LINKED` | Children linked via `ParentStudent` | Parent |
| `SELF` | Own `Student` record | Student |

Policies are written once per resource in `apps/api/src/modules/<m>/<m>.policy.ts` and return a Prisma `where` fragment + a `can(record)` check, so list queries and single-record access use the same rule (prevents IDOR drift).

### 7.3 Default role matrix (system templates, copied per tenant)

| Capability group | Owner | Admin | Teacher | Accountant | Receptionist | Parent | Student |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Academy settings/branding/domain | ✔ | read | – | – | – | – | – |
| Team & roles | ✔ | invite/read | – | – | – | – | – |
| Students/parents | ✔ | ✔ | read (ASSIGNED) | read | create/update | read (LINKED) | read (SELF) |
| Teachers | ✔ | ✔ | read self | – | read | – | – |
| Courses/batches/timetable | ✔ | ✔ | read (ASSIGNED) | read | read | read (LINKED) | read (SELF) |
| Attendance mark | ✔ | ✔ | ✔ (ASSIGNED, window) | – | – | – | – |
| Attendance read | ✔ | ✔ | ASSIGNED | – | read | LINKED | SELF |
| Fees/invoices | ✔ | ✔ | – | ✔ | read | LINKED | – |
| Record cash | ✔ | ✔ | off (grantable) | ✔ | off (grantable) | – | – |
| Refund | ✔ | – | – | ✔ | – | – | – |
| Verify reported payments / clear cheques | ✔ | ✔ | – | ✔ | – | – | – |
| Report a UPI payment ("I've paid") | – | – | – | – | – | ✔ (LINKED) | – |
| CRM | ✔ | ✔ | – | – | ✔ | – | – |
| Learning | ✔ | ✔ | ✔ (ASSIGNED) | – | – | read/submit (LINKED) | read/submit (SELF) |
| Announcements/messages | ✔ | ✔ | batch-level (ASSIGNED) | fee reminders | ✔ | read | read |
| Reports | ✔ | ✔ (non-finance) | own batches | finance | CRM | – | – |
| Subscription | ✔ | – | – | read | – | – | – |
| Audit | ✔ | – | – | – | – | – | – |

Custom tenant roles are a later capability (`role.manage`); the model supports them now.

---

## 8. Data architecture

### 8.1 Conventions

- PostgreSQL ≥ 16, Prisma schema in `packages/database/prisma/schema/*.prisma` (multi-file, one per module).
- IDs: **UUIDv7** generated in application code (clients generate IDs for offline creates) (ADR-009).
- Columns: `tenantId` on every tenant-owned table; `branchId` on branch-scoped tables; `createdAt`, `updatedAt` (`timestamptz`, UTC); `createdById`/`updatedById` where useful; `version int` on offline-editable and finance rows (optimistic concurrency).
- Money: `amountMinor Int` + `currency Char(3)` (ADR-010). Aggregates computed as `bigint`.
- Dates: instants are `timestamptz`; calendar facts (session date, due date, DOB) are `date` interpreted in tenant timezone (ADR-011).
- Deletion: finance never deletes; operational history uses `status`/`archivedAt`; pure configuration may hard-delete if unreferenced (ADR-025).
- Unique constraints always include `tenantId` unless global by nature (`TenantDomain.hostname`, `User.email`).
- Partial unique indexes for "only one active" rules (e.g. one active enrolment per student per batch).
- Every migration is generated by Prisma, reviewed, and committed; RLS policies live in SQL migrations alongside.

### 8.2 Row-Level Security (ADR-005)

```sql
-- applied to every tenant-owned table
ALTER TABLE student ENABLE ROW LEVEL SECURITY;
ALTER TABLE student FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- App connects as role `ab_app` (no `BYPASSRLS`). Migrations run as `ab_migrator`. Platform console queries that legitimately span tenants use role `ab_platform` via a separate Prisma client available **only** inside `apps/api/src/platform/**` and the worker's platform jobs (lint-enforced), and every such call is audited.
- The tenant-bound Prisma client sets the context **in the pg driver adapter** (C-55): each statement outside a transaction runs as `BEGIN; SELECT set_config('app.tenant_id', $1, true); <statement>; COMMIT` on one pooled connection, and every Prisma transaction sets it right after `BEGIN` — `SET LOCAL` semantics keep it safe with PgBouncer transaction pooling. Resolution before a tenant is known uses the narrow `app.lookup_host` policy (C-51).
- If `app.tenant_id` is unset, policies match nothing ⇒ fail closed.
- A Prisma client extension also injects `tenantId` into `where`/`data` so application code never hand-writes it (a mismatch throws), refuses tenant tables without a context, and routes `findUnique` through `findFirst` (Prisma batches same-tick `findUnique` calls, which would mix tenant contexts).

### 8.3 Entity map by module and phase

| Module | Entities | Phase |
| --- | --- | --- |
| core/audit | `AuditLog` (append-only; actor, actorType, impersonatorId, tenantId, action, entityType, entityId, before, after, ip, requestId, at) | 0 |
| core/idempotency | `IdempotencyRecord` (tenantId, key, scope, requestHash, status, responseSnapshot, expiresAt) | 0 |
| core/outbox | `OutboxEvent` (id, tenantId, type, payload, occurredAt, dispatchedAt, attempts) | 0 |
| core/flags | `FeatureFlag` (key, default, per-environment values, owner, expiresAt), `FeatureFlagOverride` (flagKey, tenantId?, value) — release flags, not entitlements (ADR-041); FK to `Tenant` + RLS on overrides added in Phase 1 (C-35) | 0 / 1 |
| tenant | `Tenant`, `TenantDomain`, `TenantBranding`, `TenantSettings`, `Branch` | 1 |
| auth/rbac | `User`, `UserCredential`, `Membership`, `Role`, `RolePermission`, `MembershipRole`, `PlatformStaff`, `AuthSession`, `Invitation`, `PasswordResetToken` | 2 |
| provisioning | `TenantOnboarding`, `Plan`, `PlanEntitlement`, `Subscription` (TRIAL only until Ph 13), `ProvisioningRequest` | 3 |
| legal & consent | `LegalDocument` (variants per locale), `LegalAcceptance` (records the locale shown), `ConsentRecord` (ADR-034) | 3 / 4 |
| i18n | `User.preferredLocale`, `Parent.preferredLocale`, `TenantSettings.i18n`; locale-keyed variants on `MessageTemplate`, `Announcement`, `HelpArticle`, public page; `TemplateRegistration` (channel, template, locale, provider id, status) (ADR-040) | 0 / 2 / 3 / 10 / L |
| import | `ImportJob` (ADR-036) | 4 |
| people | `Student` (G-05 fields, `customFields` JSONB validated against `CustomFieldDefinition`), `Parent`, `ParentStudent`, `Teacher`, `CustomFieldDefinition`, `ActivityEvent` | 3 (min) / 4 |
| scheduling | `Course`, `CourseLevel`, `Batch`, `BatchTeacher`, `BatchEnrolment`, `ScheduleRule`, `ClassSession`, `Holiday` (ADR-037) | 3 (min) / 5 |
| attendance | `Attendance`, `SyncOperation`, `AttendanceDailySummary`, `StudentMonthlyAttendance` | 6 |
| notification (foundation) | `Notification` (in-app), `NotificationIntent` | 6 |
| finance | `FeePlan`, `FeeComponent`, `StudentFeeAssignment`, `Discount`, `FeePolicy` (proration, sibling, late fee), `Invoice` (kind: REGULAR / ONE_TIME / INSTALMENT / OPENING_BALANCE), `InvoiceItem`, `Payment`, `PaymentAllocation`, `StudentCredit`, `Refund`, `Receipt`, `DocumentShareLink`, `NumberSequence`, `GatewayEvent`, `TenantPaymentAccount` (ADR-033) | 7 |
| crm | `Lead`, `LeadSource`, `LeadActivity`, `FollowUp`, `Trial`, `Admission` | 8 |
| learning | `Homework`, `HomeworkTarget`, `HomeworkSubmission`, `Attachment`, `AssessmentTemplate`, `AssessmentCriterion`, `Assessment`, `AssessmentResult`, `TeacherNote` | 9 |
| communication | `MessageTemplate`, `Announcement`, `Message`, `MessageDelivery`, `ChannelConfig`, `ContactPreference`, `PushSubscription` | 10 |
| reports | `ReportExport`, summary tables (`FinanceDailySummary`, `CrmDailySummary`, …) | 12 |
| saas billing | `Subscription` (full), `SubscriptionInvoice`, `SubscriptionPayment`, `UsageMeter` | 13 |
| support (basic) | `FeedbackItem`, help articles as static content | 7P |
| platform | `SupportTicket`, `SupportMessage`, `PlatformAnnouncement`, `PlatformSetting`, `ImpersonationSession`, `PlatformLead` (marketing-site demo/pilot requests) | 14 |
| analytics | `ProductEvent` (only if OD-14 chooses internal store) | 0 |
| ai | `AiRequestLog`, `AiSuggestion` | 16 |

### 8.4 Key invariants and indexes

| Table | Constraint / index |
| --- | --- |
| `TenantDomain` | `UNIQUE(hostname)`; partial `UNIQUE(tenantId) WHERE role='PRIMARY' AND kind='SUBDOMAIN'` |
| `Membership` | `UNIQUE(tenantId, userId)` |
| `Student` | `UNIQUE(tenantId, admissionNo)`; index `(tenantId, branchId, status, lastName)`; trigram index on name for search |
| `ParentStudent` | `UNIQUE(tenantId, parentId, studentId)` |
| `BatchEnrolment` | partial `UNIQUE(tenantId, batchId, studentId) WHERE endedOn IS NULL`; index `(tenantId, studentId)` |
| `ClassSession` | `UNIQUE(tenantId, scheduleRuleId, sessionDate)` (generated); index `(tenantId, branchId, sessionDate)`; `(tenantId, batchId, sessionDate)` |
| `Attendance` | `UNIQUE(tenantId, sessionId, studentId)`; index `(tenantId, studentId, sessionDate DESC)`; `(tenantId, batchId, sessionDate)` — `sessionDate`/`batchId` denormalised for reporting |
| `SyncOperation` | PK `(tenantId, opId)` |
| `Invoice` | `UNIQUE(tenantId, number)`; index `(tenantId, studentId, status)`; `(tenantId, dueDate) WHERE status IN ('ISSUED','PARTIALLY_PAID')` |
| `Payment` | `UNIQUE(tenantId, clientRef)` (idempotency/offline opId); `UNIQUE(provider, providerPaymentId)` |
| `Receipt` | `UNIQUE(tenantId, number)`; `UNIQUE(paymentId)` |
| `GatewayEvent` | `UNIQUE(provider, providerEventId)` |
| `NumberSequence` | PK `(tenantId, kind, period)` — row-locked increment |
| `Lead` | index `(tenantId, stage, nextFollowUpAt)`; `(tenantId, phone)` for dedupe |
| `AuditLog` | index `(tenantId, at DESC)`, `(tenantId, entityType, entityId)`; `REVOKE UPDATE, DELETE` from `ab_app` |

Attendance growth (~2M rows/month at 100K students, PRD v2.1 §18.6) is handled by the composite indexes above and summary tables; **monthly range partitioning by `sessionDate` is pre-designed but only enabled when monitoring shows need** (evaluated in Phase 15).

---

## 9. API architecture

### 9.1 Conventions

| Area | Standard |
| --- | --- |
| Style | REST, JSON, resource-oriented, `/api/v1/...` prefix; breaking change ⇒ `/v2` for that resource |
| Validation | Zod schemas from `@academybee/contracts` via a global `ZodValidationPipe`; unknown keys stripped |
| Serialization | Response DTO schemas (Zod) — never return Prisma models directly; tenant IDs omitted from tenant-facing payloads unless needed |
| Errors | Envelope below; stable `code` from `ErrorCode` enum; no stack/DB text to clients |
| Pagination | Cursor (keyset) `?limit=&cursor=` → `{ items, nextCursor }`; opaque base64 cursor of sort keys. Offset only for small admin lists |
| Filtering/sorting | Whitelisted per endpoint in the schema |
| Idempotency | `Idempotency-Key` header required on financial writes, provisioning, bulk operations; stored in `IdempotencyRecord` for 24h+; same key + different body ⇒ `409 IDEMPOTENCY_KEY_REUSED` |
| Concurrency | `If-Match: <version>` / body `version` for editable aggregates ⇒ `409 VERSION_CONFLICT` |
| Time | ISO-8601 UTC instants; `YYYY-MM-DD` dates are tenant-local |
| Docs | OpenAPI 3.1 generated from Zod (non-prod `/api/docs`) |
| Transactions | Service-level `withTransaction()`; outbox rows written in the same transaction |
| Request IDs | `X-Request-Id` accepted/generated, propagated to logs, jobs, error envelope |

**Error envelope**

```json
{
  "error": {
    "code": "ATTENDANCE_SESSION_CANCELLED",
    "message": "This class was cancelled, so attendance can't be recorded.",
    "details": [{ "path": "sessionId", "issue": "cancelled" }],
    "requestId": "01J…"
  }
}
```

Core codes: `VALIDATION_FAILED, UNAUTHENTICATED, SESSION_EXPIRED, TENANT_MISMATCH, TENANT_UNAVAILABLE, FORBIDDEN, NOT_FOUND (also used for out-of-scope records — no existence leak), CONFLICT, VERSION_CONFLICT, IDEMPOTENCY_KEY_REUSED, RATE_LIMITED, ENTITLEMENT_LIMIT_REACHED, FEATURE_NOT_IN_PLAN, INVALID_STATE_TRANSITION, INTERNAL`.

### 9.2 Request pipeline (NestJS)

```text
RequestIdMiddleware → TrustedProxy → TenantResolverMiddleware (CLS)
→ ThrottlerGuard → AuthGuard (JWT, aud, tid==tenant) → MembershipGuard
→ TenantStatusGuard → PermissionGuard(@Can('student.read')) → EntitlementGuard(@Feature/@Limit)
→ ZodValidationPipe → Controller → Service (policy scope → tenant Prisma client)
→ AuditInterceptor (declared actions) → ResponseSerializer → ErrorFilter
```

Decorators: `@Public()`, `@PlatformOnly()`, `@Can(cap)`, `@Idempotent()`, `@Audited('student.archive')`, `@Feature('crm')`.

### 9.3 API module map (primary endpoints)

| Module | Endpoints (under `/api/v1`) | Phase |
| --- | --- | --- |
| health | `GET /health/live`, `GET /health/ready` | 0 |
| tenant | `GET /tenant/context` (public: name, slug, branding, status, terminology) | 1 |
| auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `GET /auth/me`, `GET/POST /invitations/:token` | 2 |
| team | `GET /team/members`, `POST /team/invitations`, `PATCH /team/members/:id`, `GET /roles` | 2/4 |
| platform/tenants | `GET /platform/slug-availability?slug=`, `POST /platform/tenants`, `GET /platform/tenants`, `GET/PATCH /platform/tenants/:id`, `POST /platform/tenants/:id/(suspend|reactivate|archive)`, `POST /platform/tenants/:id/domains` | 3 (+14) |
| onboarding | `GET /onboarding`, `PUT /onboarding/steps/:step`, `POST /onboarding/complete` | 3 |
| academy | `GET/PATCH /academy/settings`, `PATCH /academy/branding`, `POST /academy/branding/logo-upload-url` | 3 |
| students | `GET/POST /students`, `GET/PATCH /students/:id`, `POST /students/:id/(archive|restore)`, `GET /students/:id/activity`, `GET/PUT /settings/custom-fields` | 4 |
| import | `POST /imports` (upload URL), `POST /imports/:id/validate`, `GET /imports/:id` (preview, errors), `POST /imports/:id/commit`, `GET /imports/templates/:kind` | 4 / 7 |
| legal & consent | `GET /legal/current`, `POST /legal/accept`, `POST /parents/:id/consents`, `GET /students/:id/consents`, public `GET /privacy` (academy notice) | 3 / 4 |
| parents | `GET/POST /parents`, `PATCH /parents/:id`, `POST /students/:id/parents`, `POST /parents/:id/invite` | 4 |
| teachers | `GET/POST /teachers`, `GET/PATCH /teachers/:id` | 4 |
| search | `GET /search?q=` (command palette; scope-aware) | 4 |
| courses | `GET/POST /courses`, `PATCH /courses/:id`, `POST /courses/:id/levels` | 5 |
| batches | `GET/POST /batches`, `GET/PATCH /batches/:id`, `POST /batches/:id/enrolments`, `POST /batches/:id/enrolments/:eid/end`, `PUT /batches/:id/teachers`, `PUT /batches/:id/schedule-rules` | 5 |
| sessions | `GET /sessions?from=&to=&batchId=&teacherId=`, `POST /sessions` (ad-hoc / make-up), `POST /sessions/:id/(cancel|reschedule|start|complete)`, `POST /batches/:id/transfers` | 5 |
| calendar | `GET/POST /holidays`, `POST /holidays/preview` (impact), `DELETE /holidays/:id` | 5 |
| attendance | `GET /sessions/:id/attendance`, `PUT /sessions/:id/attendance` (bulk, idempotent), `PATCH /attendance/:id`, `GET /students/:id/attendance`, `GET /attendance/overview` | 6 |
| sync | `POST /sync/push`, `GET /sync/pull?scope=&since=`, `GET /sync/bootstrap?scope=` | 6 |
| notifications | `GET /notifications`, `POST /notifications/read` | 6 |
| finance | `…/fee-plans`, `…/fee-assignments`, `…/invoices` (+`/issue`, `/cancel`), `…/payments` (+`/cash`, `/offline`, `/online/initiate`), `…/payments/:id/refunds`, `…/receipts/:id/pdf`, `GET /finance/overview`, `GET /finance/reconciliation` | 7 |
| payment accounts | `GET/POST /settings/payment-accounts`, `POST /settings/payment-accounts/:id/verify`, `DELETE …/:id`; `PUT /settings/upi` | 7 |
| webhooks | `POST /webhooks/payments/:provider/:accountRef` (public, verified with that tenant account's secret, ADR-033; exercised by the simulator now, Razorpay in Phase G) | 7 |
| reported payments | `POST /hub/academies/:slug/invoices/:id/reported-payments` (parent, Family Hub), `GET /finance/verification-queue`, `POST /payments/:id/(verify|reject)`, `POST /payments/:id/(cheque-cleared|cheque-bounced)`, `GET /invoices/:id/upi` (UPI string + QR) | 7 / 7P |
| documents | `POST /(invoices|receipts)/:id/share-links`, `DELETE /share-links/:id`, public `GET /d/:token` | 7 |
| support | `POST /feedback`, `GET /help/articles` | 7P |
| crm | `…/leads` (+`/stage`, `/activities`, `/follow-ups`), `…/trials` (+`/attendance`, `/feedback`), `POST /leads/:id/convert`; public `POST /public/enquiries` | 8 |
| learning | `…/homework` (+`/submissions`), `…/assessment-templates`, `…/assessments` (+`/results`), `GET /students/:id/progress`, `…/attachments/upload-url` | 9 |
| communication | `…/templates`, `…/announcements`, `…/messages` (compose/schedule), `GET /messages/:id/deliveries`, `POST /push/subscriptions`; provider webhooks | 10 |
| hub (Family Hub) | `GET /hub/home`, `GET /hub/academies`, `GET /hub/academies/:slug/(children|schedule|invoices|notifications|…)`, `POST /hub/academies/:slug/invoices/:id/reported-payments`, `POST /hub/links/(start|verify)`, `POST /hub/join-requests`, `GET /hub/join-requests`, `POST /hub/academies/:slug/leave`, `GET/PUT /hub/child-groups` | 7P / 11 |
| join requests (academy side) | `GET /join-requests`, `POST /join-requests/:id/(approve|reject)`, `GET /settings/parent-app/qr` | 4 |
| reports | `GET /reports/:report?from&to&scope`, `POST /reports/exports`, `GET /reports/exports/:id` | 12 |
| billing | `GET /subscription`, `POST /subscription/change-plan`, `POST /subscription/pay`; platform billing endpoints | 13 |
| platform | overview, users, plans, payments, analytics, support, announcements, settings, audit, impersonation | 14 |
| ai | `POST /ai/(insights|draft-message|ask)` | 16 |

---

## 10. Frontend architecture

### 10.1 Stack

Next.js App Router + React Server Components for shells and first paint; client components for interactive workspaces. **TanStack Query** for server state (with Dexie-backed persistence for offline-capable queries), **React Hook Form + Zod** (shared schemas) for forms, MUI themed exclusively through `@academybee/ui` (ADR-014), `date-fns` + `date-fns-tz` for tenant-timezone formatting, ICU message catalogue + `Intl` formatting helpers with Indian digit grouping (ADR-031), Serwist for the service worker (ADR-015). Support matrix and performance budgets per ADR-035 (Android 10+ Chrome, iOS 16.4+ Safari, LCP < 2.5 s on 4G reference device).

### 10.2 Host → experience routing

The Next.js host-routing file (`proxy.ts` on Next.js 16+, formerly `middleware.ts`; C-34) classifies the host (shared `@academybee/tenant` parser), calls the tenant-context endpoint (cached at the edge for 60s), and rewrites:

- apex → `/(marketing)`
- `console.` → `/console/...`
- `app.` (Family Hub) → `/hub/...` (parents and students, all linked academies)
- tenant → `/t/{slug}/...` (the visible URL stays clean, e.g. `gurushethra.academybees.com/students`)

*As built (Phase 1):* `apps/web/src/proxy.ts` strips every client-sent `x-ab-*` header, classifies the host, and for academy/custom hosts reads `GET /api/v1/tenant/context` (in-memory cache 60 s, unknown hosts 30 s). The decision itself is a pure function, `lib/routing.ts` (unit-tested):
- ACTIVE → `/t/<slug><path>`;
- REDIRECT → **301** to the primary host (same path, query and port);
- SUSPENDED / ARCHIVED / SETUP → `/status/<state>` (HTTP 503 / 410 / 200);
- unknown or invalid host → `/status/unknown` (404);
- API unreachable → `/status/unavailable` (503, fail closed — never "unknown");
- `console.` → `/console`, `app.` → `/hub`, apex/`www` → marketing;
- typed internal paths (`/t/…`, `/status/…`, `/console`, `/hub`) → 404;
- `/offline` and `/dev/*` are served on every host.

The resolved context reaches server components in the `x-ab-context` request header (URI-encoded JSON, validated with the contract on read) and the marketing origin in `x-ab-apex`. Status pages are the shared `StatusPage` composition (academy identity or AcademyBee brand, icon + heading, next action, "Powered by AcademyBee"; `noindex`).

After login on an academy URL, `/` sends staff to the home of their primary experience: Owner/Admin/Accountant/Receptionist → `/today`; Teacher → `/teach`. Parents and students are redirected to the Family Hub (`app.academybees.com/a/<slug>`), where Parent Home is `/` and Student Home is `/me`. Users with several roles (owner who also teaches) get an experience switcher.

### 10.3 Route map (visible paths on a tenant host)

| Experience | Routes |
| --- | --- |
| Auth & status | `/login` `/forgot-password` `/reset-password` `/invite/[token]` · status: unknown / suspended / archived / setup / access-denied |
| Onboarding | `/welcome` `/onboarding/profile` `/onboarding/type` `/onboarding/course` `/onboarding/teacher` `/onboarding/batch` `/onboarding/students` `/onboarding/timetable` `/onboarding/fees`† `/onboarding/ready` |
| Manage — HOME/RUN | `/today` `/dashboard` `/timetable` `/attendance` `/batches` `/batches/[id]` `/students` `/students/[id]/[tab]` `/teachers` `/teachers/[id]` `/courses` |
| Manage — MONEY | `/finance` `/invoices` `/invoices/[id]` `/payments` `/fee-plans` `/expenses`‡ |
| Manage — GROW | `/leads` `/leads/[id]` `/trials` `/trials/[id]` `/admissions` |
| Manage — LEARN | `/learning/homework` `/learning/assessments` `/learning/progress` |
| Manage — CONNECT | `/messages` `/messages/compose` `/announcements` |
| Manage — INSIGHTS | `/reports` `/reports/[section]` |
| Manage — ACADEMY | `/settings/academy` `/settings/branding` `/settings/team` `/settings/notifications` `/settings/payments` `/settings/communication` `/settings/security` `/settings/subscription` `/branches`‡ |
| Teacher (`/teach`) | `/teach` (Today) `/teach/classes` `/teach/classes/[sessionId]` `/teach/classes/[sessionId]/attendance` `/teach/batches/[id]` `/teach/students` `/teach/students/[id]` `/teach/learning` `/teach/sync` `/teach/more` |
| Parent & Student — **Family Hub host `app.academybees.com`** | `/` (Home: all academies) `/a/[slug]` (single academy) `/a/[slug]/children/[id]` `/schedule` `/payments` `/a/[slug]/invoices/[id]` `/notifications` `/leave` (Ph 11) `/join/[slug]` (QR/URL add) `/academies` (My academies, consent, leave) `/me/...` (student) — core delivered in Phase 7P |
| Student | on the Family Hub: `/me` `/me/classes` `/me/homework` `/me/progress` `/me/profile` (Phase 11) |
| Academy (staff side) | `/settings/parent-app` (Join QR poster, printable) · `/join-requests` queue (Phase 4) |
| Public | `/` academy public page when enabled + `/enquire` (Phase 8) · `/privacy` academy privacy notice (Phase 4) · `/d/[token]` shared receipt/invoice (Phase 7) |
| Shared | `/help` help centre + contact + feedback (Phase 7P) · `/students/import`, `/finance/opening-balances` · `/settings/security` incl. 2FA + Devices & sessions (Phase 2) · `/settings/custom-fields` · `/settings/calendar` (holidays) |

† added in Phase 7 · ‡ deferred modules (hidden until built — no placeholder "coming soon" pages in production navigation).

**Console (`console.academybees.com`)**: `/overview` `/academies` `/academies/new` `/academies/[id]/[tab]` `/users` `/subscriptions` `/plans` `/payments` `/growth/(acquisition|usage|retention)` `/support` `/announcements` `/audit` `/settings` `/security`.

### 10.4 Shells and navigation (UX §7, §8, §25)

| Shell | Desktop | Mobile |
| --- | --- | --- |
| Manage | Collapsible sidebar grouped HOME / RUN / MONEY / GROW / LEARN / CONNECT / INSIGHTS / ACADEMY, top bar with academy identity, Cmd/Ctrl+K palette, Global Add, notifications, sync indicator | Bottom nav: Today · Students · Finance · More |
| Teacher | Same components, mobile layout on all widths ≥ phone; sidebar only on ≥ lg | Home · Classes · Students · Learning · More |
| Parent (Family Hub) | Mobile-first centered column on desktop; academy switcher (All academies / one academy) in the header | Home · Children · Schedule · Payments · More |
| Student (Family Hub) | Mobile-first | Home · Classes · Homework · Progress · Profile |
| Console | Distinct visual variant (Deep Ink chrome), dense-but-calm tables | Desktop-first; responsive read-only on mobile |

Navigation items are rendered from a config filtered by capabilities **and** entitlements; items for unbuilt modules are absent.

### 10.5 Design system (`packages/ui`)

- **Themes (C-49, UX V1.2 addendum):** semantic colour roles (`palettes.light` / `palettes.dark` in `tokens.ts`) emitted as MUI CSS variables and selected by `data-ab-theme` on `<html>`; default follows `prefers-color-scheme`, a Light / Dark / System toggle overrides it (localStorage now, user profile from Phase 2); the inline `ThemeScript` sets the attribute before first paint. Components use roles (`bgcolor: 'ab.surface'`), never raw hex; a unit test enforces AA contrast for every pair in both palettes.
- Tokens (UX §5–6): `ivory #FAFAF7`, `ink #171817`, `gold #E6B94A`, `goldSoft #F5E7B8`, `success #238B63`, `warning #D99124`, `danger #D95555`, `info #4778C7`, plus derived neutral scale; type scale Display 32–40, Title 24–28, Section 18–20, Body 14–16, Meta 12–13; font stack Inter (variable) with a Noto Sans fallback for non-Latin names (per-script loading per active locale arrives in Phase L, ADR-040), script-aware line-height tokens, CSS logical properties only (RTL-ready); radii 6/10/14; spacing 4-pt grid; motion 120–200 ms ease-out, disabled under `prefers-reduced-motion`.
- Tenant branding: `primaryColor` only tints academy-identity surfaces (logo area, parent-facing accents); **status colours and the AcademyBee system palette are never overridden** (UX v1.1 §10). Contrast is validated when a colour is saved (WCAG AA against ivory/ink or rejected).
- Components (UX §26): AppShell, Sidebar, Topbar, BottomNav, CommandPalette, GlobalAdd, Search, Button, IconButton, TextField, Select, DatePicker/TimePicker, Tabs, Card (sparingly), KPI (inline stat, not tile walls), DataTable (virtualised, cursor-paged), List, StatusBadge (icon + text, never colour-only), Avatar, Timeline, ActivityFeed, Drawer, Modal/BottomSheet, Toast, ConfirmDialog (consequence language), EmptyState (always with next action), Skeleton, FileUpload, OfflineBanner, SyncIndicator, SyncCenter, PermissionState, Chart wrappers, AttendanceToggle (≥ 48 px targets).
- Every screen ships loading / empty / error / permission / offline (where applicable) / success states (UX §24, §33).
- Lint rule: application code may not import `@mui/*` directly — only `@academybee/ui`.

### 10.6 Internationalisation (ADR-031, ADR-040, PRD v3.2 G-32)

**Launch is English (`en-IN`) only.** The items below marked *(Phase L)* are not built before Phase L; everything else is built from Phase 0 so adding a language later needs no refactoring.

- `packages/i18n`: ICU catalogues `messages/<locale>/<namespace>.json` shared by web, API (error messages per `ErrorCode`), worker (emails, notifications, PDFs); `en-IN` is the source; per-key fallback to `en-IN`.
- Money formatting (C-40): `formatMoney` shows 2 decimals by default (`₹1,00,000.00` — invoices, receipts, payments, finance screens); `{ compact: true }` drops a zero fraction (`₹1,00,000`) for dashboards and summaries. Indian grouping in both.
- Locale resolution: `User.preferredLocale` → `TenantSettings.i18n.defaultLocale` → `Accept-Language` → `en-IN`; carried in request context and job payloads. On the Family Hub, the user's locale applies across all academies; academy content variants use the user's locale when the academy provides it, otherwise the academy default.
- *(Phase L)* Language switcher in profile/settings, showing `enabledLocales` only; academy language settings UI.
- Authenticated apps: no locale in URL. *(Phase L)* Public pages (marketing, academy public page): `/<lang>/…` prefixes + `hreflang`.
- CI: no hard-coded JSX strings, ICU validity, completeness for `complete` locales; Playwright pseudo-locale (`en-XA`) and +40% long-text visual checks on Tier-1 screens.
- Text input: any script accepted; Unicode-aware validation; NFC normalisation; ICU collation for sorting. *(Phase L)* Transliteration column for cross-script search; per-script font loading (until then a single Noto fallback covers non-Latin names).

### 10.7 Data fetching & caching

- Server components fetch with the user's cookies via the same-origin API for first paint of read-heavy pages.
- Client data via TanStack Query; query keys include the tenant slug and user id.
- Offline-capable queries read from Dexie first (stale-while-revalidate) and show "Last synced …".
- Mutations for offline-capable operations **always** go through the sync queue (even online) so there is one code path; everything else calls the API directly and is disabled with an explanation when offline.

---

## 11. Offline & sync architecture

### 11.1 Scope (PRD v3 §10)

| Workflow | Local capability | Phase |
| --- | --- | --- |
| App shell, session, today's timetable, my batches, assigned students | Cached, read | 6 |
| Attendance | Create/update offline, durable sync | 6 |
| Attendance history (assigned) | Cached, read | 6 |
| Homework drafts, teacher notes | Create/update offline, sync | 9 |
| Announcements, notifications | Cached, read | 6/10 |
| Fees/invoices (parent own, staff recent) | Cached, read | 7/11 |
| Cash payment recording | Queue as pending-sync (permitted roles only) | 7 |
| Online payment, refunds, subscription, admin config | **Online only** | — |

### 11.2 Local database (Dexie, `packages/sync`)

One Dexie database per **origin + user**: `ab_{userId}` (the origin is already per-tenant). Schema is versioned with explicit Dexie migrations; `schemaVersion` is also sent with every sync op.

```ts
db.version(1).stores({
  meta:            'key',                                   // tenant, user, lastPullAt per scope, deviceId
  batches:         'id, updatedAt',
  students:        'id, updatedAt',
  enrolments:      'id, batchId, studentId',
  sessions:        'id, sessionDate, batchId, [sessionDate+batchId], status',
  attendance:      'id, &[sessionId+studentId], sessionId, syncState',
  notifications:   'id, createdAt, readAt',
  syncQueue:       'opId, status, createdAt, [status+createdAt], entityKey',
  syncLog:         '++seq, opId, at',                        // local diagnostics, capped
});
// v2 (Phase 7): invoices, payments(pending cash) · v3 (Phase 9): homeworkDrafts, teacherNotes
```

On sign-in the app requests `navigator.storage.persist()`; the Sync Center reports if persistence was denied.

### 11.3 Sync operation contract (`packages/contracts/src/sync.ts`)

```ts
type SyncOp = {
  opId: string;            // UUIDv7, client-generated = idempotency key
  type: 'attendance.markSession' | 'attendance.update'
      | 'homework.saveDraft' | 'note.upsert' | 'payment.recordCash';
  entityKey: string;       // e.g. `session:<id>` — ordering key
  payload: unknown;        // validated by the op's Zod schema
  baseVersion?: number;    // server version the user edited from
  clientCreatedAt: string; // device time (informational; server uses its own clock)
  deviceId: string;
  schemaVersion: number;
  // local-only
  status: 'pending' | 'processing' | 'synced' | 'failed' | 'conflict';
  attempts: number; nextAttemptAt?: string; lastError?: { code: string; message: string };
};
```

**Push** `POST /api/v1/sync/push` — `{ ops: SyncOp[] }` (≤ 100 ops, ordered). Server processes each op in its own transaction:

1. `SyncOperation(tenantId, opId)` exists → return stored result (`DUPLICATE`, same payload as original).
2. Validate schema, membership, capability, scope (e.g. teacher assigned to batch *at session date*), business rules (session not cancelled, inside offline acceptance window).
3. Apply with optimistic concurrency → write domain rows + `SyncOperation` + outbox event in one transaction.
4. Return `{ opId, status: 'APPLIED' | 'DUPLICATE' | 'REJECTED' | 'CONFLICT', serverVersion?, error?, conflict?: { server: … } }`.

Ops sharing an `entityKey` are processed in order; if one is `CONFLICT`/`REJECTED`, later ops for the same key are held (`BLOCKED`) until the user resolves — other keys continue.

**Pull** `GET /api/v1/sync/pull?scope=teacher&since=<watermark>` returns changed rows in the user's working set since the watermark (`updatedAt > since - 5s skew` + id tiebreak) plus tombstones (archived/ended enrolments, cancelled sessions). `bootstrap` returns the full working set: teacher = assigned batches, active enrolled students (basic profile only), sessions from today −7 to +14 days, attendance for the last 30 days of those sessions.

### 11.4 Sync runner

- Triggers: app start, `online` event, `visibilitychange` to visible, after enqueue (debounced 1 s), every 60 s while pending ops exist. **Does not rely on the Background Sync API** (not supported in Safari/iOS).
- Retry: exponential backoff with jitter (2 s → 5 min cap) for network/5xx/`RATE_LIMITED`; `401` pauses the queue and prompts re-login without dropping ops; `REJECTED`/`CONFLICT` stop retrying and surface to the user.
- A Web Lock (`navigator.locks`) ensures only one tab runs the runner.
- On `APPLIED`, the local entity takes the server version; the queue item is marked `synced` and purged after 7 days (kept briefly for the Sync Center history).

### 11.5 Conflict policy (ADR-017, PRD v3 §11)

| Domain | Rule |
| --- | --- |
| Attendance | Per (session, student). If `baseVersion` = current → apply. If stale and the last change was by the **same user** → apply (their later intent wins). If stale and last change was by a **different user** with a different value → `CONFLICT`; teacher sees both values and chooses. Identical values → `APPLIED` (no-op). |
| Homework drafts / notes | Owner-only drafts ⇒ last-write-wins by server receipt order; drafts are private until published (publishing is online). |
| Cash payment | Never merged. Each op creates a distinct payment identified by `opId`; duplicates impossible by `UNIQUE(tenantId, clientRef)`. Invoice already fully paid ⇒ payment accepted as **unallocated credit** and flagged for accountant review (money was physically received — never silently dropped). |
| Everything financial | No last-write-wins, ever. |

### 11.6 Offline UX contract (UX §12.1, §24)

- Global `OfflineBanner`: "You're offline. Attendance will sync automatically when you're back online."
- `SyncIndicator` in every shell: states **Online & synced** ("All changes synced — synced just now"), **Offline**, **Pending** ("Saved on this device — 24 records waiting to sync"), **Syncing**, **Needs attention** (failed/conflict count).
- `SyncCenter` (`/teach/sync`, and a drawer elsewhere): lists pending/failed/conflict ops in human language, Retry, Resolve conflict, and **Discard** only with explicit confirmation — never silent.
- Logout with pending ops: blocking dialog ("24 attendance records haven't synced. Stay signed in until they sync, or sign out and lose them"), default action = stay.
- Online-only actions show a disabled state with the reason while offline.

### 11.7 Offline security

- Cache only the role's working set (PRD v2.1 §18.8); no finance data for teachers unless `payment.record_cash` is granted; parents cache only linked children.
- No passwords, refresh tokens or access tokens in IndexedDB/localStorage (cookies only).
- On logout (after the pending-op guard) and on membership revocation detected at pull (`403 MEMBERSHIP_REVOKED`), the Dexie DB and SW data caches are deleted.
- The service worker never caches `/api/*` responses containing personal data in Cache Storage; data lives in Dexie under app control. The SW caches the app shell, static assets, fonts and tenant branding.

---

## 12. Finance architecture (Phase 7)

### 12.1 State machines

```text
Invoice:  DRAFT ──issue──▶ ISSUED ──payment──▶ PARTIALLY_PAID ──payment──▶ PAID
            │                 │                     │
            └──delete(draft)  └──cancel──▶ CANCELLED ◀──cancel (only if no confirmed payments)
          overdue = derived: status ∈ {ISSUED, PARTIALLY_PAID} ∧ dueDate < today(tenant tz)
          (materialised nightly as overdueSince for fast queries; UI badge "Overdue")

Payment:  INITIATED ──gateway order created──▶ PENDING ──webhook/verify──▶ CONFIRMED      (online, Phase G / simulator)
          PARENT_REPORTED UPI or CHEQUE ──────▶ PENDING ──staff verify/clear─▶ CONFIRMED
                                                   └──reject / bounce──▶ FAILED
          (cash, staff UPI/bank with reference, offline-recorded cash: created as CONFIRMED by the server on acceptance)
          CONFIRMED ──refund(s)──▶ PARTIALLY_REFUNDED ──▶ REFUNDED
```

- Transitions are implemented once in a pure domain module (`finance/domain/*.state.ts`) with exhaustive unit tests; the DB stores status and every transition writes `AuditLog`.
- **No endpoint lets a client set `CONFIRMED`.** Confirmation comes only from (a) a staff member with `payment.verify` verifying a reported payment or clearing a cheque, (b) the server accepting a staff-recorded cash/UPI/bank payment, or (c) later, a signature-verified gateway webhook / server-side status fetch.
- Allocations: `PaymentAllocation(paymentId, invoiceId, amountMinor)`; sum of allocations ≤ payment amount; invoice `paidMinor` recomputed in the same transaction under `SELECT … FOR UPDATE` on the invoice.
- Invoice and receipt numbers: `NumberSequence` row lock per `(tenantId, kind, fiscalYear)`; format `{prefix}/{FY}/{seq:05}` (configurable prefix). Numbers are assigned at **issue** (invoice) and **confirmation** (receipt), never on the client.
- Receipts: HTML template rendered to PDF by headless Chromium in the worker (correct Indic script shaping, embedded Noto fonts, tenant document language or bilingual, ADR-040), stored in object storage, served by short-lived signed URL.
- Refunds: online (needs connectivity), `payment.refund`, reason required, recorded manually with method + reference in this release; gateway refund API in Phase G; append-only.

### 12.2 Current release: payments without a gateway (PRD v3.2 G-30, ADR-038)

```text
Parent taps "Pay" on an invoice
  └─ sees academy UPI ID + QR + one-tap upi://pay link (amount, academy, invoice no. prefilled)
Parent pays in their UPI app ──▶ returns, taps "I've paid", enters UTR (+ optional screenshot)
  └─ POST /hub/academies/:slug/invoices/:id/reported-payments (Idempotency-Key)
       → Payment(PENDING, method=UPI, source=PARENT_REPORTED, reference=UTR); duplicate-UTR check
       → parent sees "Awaiting academy confirmation"; outbox → staff notification
Staff "Verify payments" queue ──▶ Confirm → CONFIRMED → allocate → receipt number → notify parent
                               └─ Reject (reason) → FAILED → notify parent with reason
Cheque: recorded PENDING → Mark cleared → CONFIRMED  |  Mark bounced → FAILED (+ optional bounce charge invoice)
```

Settings → Payments: UPI ID + payee name + QR preview (works now); bank details for invoices; "Online gateway — not connected yet" card (Phase G).

### 12.3 Online payment flow (built now, live gateway in Phase G)

```text
Parent taps Pay online (shown only when a gateway is connected) ──▶ POST /hub/academies/:slug/invoices/:id/pay (Idempotency-Key)
  └─ server creates Payment(INITIATED) → provider order → Payment(PENDING) → returns checkout params
Checkout completes in browser ──▶ UI shows "Payment processing…" (never "successful")
Provider webhook (to the academy's own account route) ──▶ verify signature with that tenant's secret → GatewayEvent (unique providerEventId) → Payment CONFIRMED
  └─ allocate → invoice status → receipt number → outbox: receipt.generate, notify.parent
UI polls /payments/:id (or SSE) → shows "Payment confirmed · Receipt R/2026-27/00042"
Reconciliation job (hourly/daily) ──▶ provider settlements vs Payments → exceptions list
```

`PaymentProvider` interface (create order, verify webhook, fetch status, refund, fetch settlements). Adapters: `ManualProvider` (production default now), `SimulatorProvider` (local/CI/staging/demo only — config validation refuses it in production; drives E2E of this whole flow), `RazorpayProvider` (Phase G, OD-02). **Merchant-of-record rule (PRD v3.2 G-01):** each academy's online payments go to the academy's own connected gateway account; AcademyBee never receives or settles academy fee money. Academies without a gateway show UPI ID/QR and staff record payments manually (never labelled "online"). AcademyBee's SaaS billing (Phase 13) uses a separate platform gateway configuration.

---

## 13. Background jobs, outbox and notifications

### 13.1 Outbox (ADR-019)

Domain services write `OutboxEvent` rows in the same DB transaction as the state change. The worker's relay polls (`FOR UPDATE SKIP LOCKED`, batch 100) and enqueues BullMQ jobs, marking `dispatchedAt`. This removes dual-write loss between Postgres and Redis.

### 13.2 Queues

| Queue | Jobs | Phase |
| --- | --- | --- |
| `system` | heartbeat, outbox relay, cleanup (expired idempotency, synced ops, sessions) | 0 |
| `email` | transactional email (invite, reset) | 2 |
| `provisioning` | post-provision tasks (welcome email, default data) | 3 |
| `scheduling` | rolling class-session generation (daily, 28 days ahead) | 5 |
| `attendance` | summaries, absence notification intents | 6 |
| `notifications` | fan-out intent → per-recipient per-channel deliveries | 6 (in-app) / 10 |
| `finance` | recurring invoice generation, overdue marking, receipt PDF, reminders, reconciliation | 7 |
| `reports` | summary refresh, async exports | 12 |
| `billing` | subscription renewals, dunning, grace/suspension transitions | 13 |
| `ai` | batch insights | 16 |

Every job payload contains `tenantId` (or `platform: true`), `requestId`, `actor`. Processors establish tenant context the same way requests do and **re-check** permissions/state before sensitive work (PRD v3 §13). Retries use exponential backoff; exhausted jobs go to a failed set surfaced in an ops view (Phase 14) with replay.

### 13.3 Notification pipeline (PRD v2.1 §18.7)

```text
domain event → NotificationIntent (type, tenant, subjects, data, dedupeKey)
→ resolve recipients (parents of student, prefs, quiet hours)
→ per channel: render template (tenant override → system default) → provider adapter
→ MessageDelivery (queued → sent → delivered/read | failed) with provider ids
```

`dedupeKey` (e.g. `attendance.absent:{sessionId}:{studentId}`) guarantees no duplicate sends on retry. Channels: in-app (Ph 6), email (Ph 2 transactional, Ph 10 general), web push, SMS (DLT-registered templates, India), WhatsApp Cloud API (approved templates, opt-in) (Ph 10). Provider adapters are swappable (PRD v3 risk table: WhatsApp dependency).

---

## 14. File storage

- S3-compatible client; bucket per environment; keys `t/{tenantId}/{module}/{uuid}/{sanitisedName}`.
- Uploads via presigned PUT (size/type limits, 10 MB default), then a `confirm` call that verifies object metadata and records `Attachment`.
- Downloads via presigned GET (≤ 5 min) issued only after a permission + scope check. Public branding assets (logo, favicon) are served via a public CDN path that contains only branding.
- Content-type allow-list; images re-encoded server-side (sharp) to strip EXIF; malware scanning hook reserved (Phase 15).

---

## 15. Observability & operations

| Concern | Implementation |
| --- | --- |
| Logs | pino JSON, fields: `requestId, tenantId, userId, route, status, durationMs`; redaction list (passwords, tokens, phone/email masked) |
| Errors | Sentry (web, api, worker) with release + environment tags; PII scrubbing. *As built (C-48):* off unless a DSN is set; API/worker use `@sentry/node` for error capture only (no tracing yet), the web loads `@sentry/nextjs` lazily (zero bytes without a DSN); Sentry 11 `dataCollection` collects no user info, cookies, headers, bodies or query params |
| Metrics | OpenTelemetry metrics → provider of choice; RED metrics per route, DB pool, queue depth/age, job failures, sync push results by status, webhook failures, reconciliation exceptions |
| Tracing | OpenTelemetry traces (API → Prisma → Redis → jobs), sampling 10% prod |
| Health | `/api/v1/health/live` (process; reports the deployed `release`), `/api/v1/health/ready` (DB, Redis, 2 s timeouts, 503 when down); also served at `/api/health/*` for deploy checks; the worker's liveness is the `worker:heartbeat` key in Redis |
| Audit | `AuditLog` for sensitive admin, all finance, auth events, platform actions, medical-note reads |
| Product analytics | `AnalyticsPort` (ADR-032), server-side events after commit, hashed IDs, no PII; activation funnel dashboard from Phase 7P |
| Alerts (Ph 15) | API 5xx rate, p95 latency, DB CPU/conn saturation, queue age, failed sync ratio, webhook failures, backup failure |

---

## 16. Security architecture (summary)

- OWASP ASVS L2 as the checklist target (Phase 15 formal review; controls built in as each phase lands).
- Headers: strict CSP (nonce-based), HSTS (preload after launch), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, frame-ancestors none (except payment provider frames as required).
- CSRF: SameSite=Lax cookies + double-submit token on non-GET.
- Input: Zod everywhere; output encoding by React; rich text (announcements) sanitised server-side with an allow-list.
- Rate limits: auth, public enquiry (plus Turnstile), search, exports, sync push.
- Secrets: environment/secret manager only; `.env` never committed; gateway/webhook secrets per environment.
- Tenant isolation tests: a reusable cross-tenant suite (`packages/testing`) runs against **every** tenant-scoped endpoint, generated from the route registry, asserting 404/403 and no data leakage.
- Data protection (PRD v3.2 G-06): academy = data fiduciary, AcademyBee = processor (DPA); Terms/Privacy/DPA acceptance by owners; verifiable parent consent records for minors' data (ADR-034); purpose limitation; export/correction/erasure-by-anonymisation workflows; data residency preference in India (OD-03). Exact DPDP obligations confirmed with counsel.
- Secrets per tenant (payment gateway credentials) use envelope encryption with a KMS/secret-manager master key (ADR-033).

---

## 17. Scalability path (PRD v2.1 §18.3)

| Stage | Trigger (measured) | Action |
| --- | --- | --- |
| 1 (0–5K students) | — | 1 API, 1 worker, managed PG (small), Redis, R2 |
| 2 (5–25K) | API CPU > 60% p95 or deploy HA need | 2+ API instances, dedicated worker, PgBouncer |
| 3 (25–50K) | DB CPU > 60%, slow dashboards | Bigger DB, summary tables everywhere, Redis caching of tenant context/permissions |
| 4 (50–100K) | Read load dominates | Read replica for reports/exports; attendance partitioning if index bloat/latency |
| 5 (100K+) | Specific bottleneck | Extract notifications/reporting services only on evidence |

---

## 18. Delivery pipeline

- **CI (GitHub Actions)** on every PR (affected packages only, Turborepo remote cache; full nightly run): install (pnpm, cached) → commitlint (PR title) → `lint` → `typecheck` → unit tests → integration tests (Testcontainers Postgres + Redis) → `prisma migrate diff` drift check → build all → Playwright E2E against built apps with `*.localhost` → upload traces on failure.
- *As built (Phase 0):* required jobs `verify` (format, lint/typecheck/unit with `--affected` on PRs, i18n check, expired release flags, governance dry run), `integration` (Testcontainers incl. drift), `build` (+ route JS budget, G-24), `e2e` (Postgres/Redis, migrations, en-IN/en-XA/en-LONG web builds, Playwright on desktop Chromium, Android-emulated Chromium and iPhone-emulated WebKit, Lighthouse CI; artifacts always uploaded), `pr-title`; `nightly.yml` runs everything without `--affected`.
- **CD**: `main` → staging automatically (migrations run as a separate pre-deploy job with `ab_migrator`); production via a `v*` release tag (release-please) through the `production` GitHub Environment with PO approval — `phase-*` tags never deploy; web via Vercel promotion; API/worker blue-green or rolling; migrations must be backward compatible for one release (expand → migrate → contract).
- *As built (C-44, C-48):* `deploy-staging.yml` runs after green CI on `main` when `STAGING_ENABLED` is set: images to GHCR → migrate → Render deploy hooks → Vercel prebuilt deploy → smoke check that waits for the new `release`. On the free GitHub plan production is a **PO-only `workflow_dispatch`** of a `vX.Y.Z` tag (`deploy-production.yml`). Images run as non-root with `tini` as PID 1 for graceful SIGTERM. Runbook: `docs/runbooks/environments.md`.
- **Rollback**: previous web deployment promotion; previous API image; migrations are forward-only, so contract steps ship one release later.

---

## 19. Testing architecture

| Layer | Tooling | Location |
| --- | --- | --- |
| Unit | Vitest (SWC for Nest decorators) | `*.spec.ts` next to code |
| Integration | Vitest + Testcontainers (Postgres, Redis), real Prisma + RLS | `apps/api/test/integration` |
| Contract | Zod ↔ OpenAPI snapshot; error envelope tests | `apps/api/test/contract` |
| Offline (unit) | Vitest + `fake-indexeddb` for Dexie queue/runner | `packages/sync` |
| E2E | Playwright (Chromium; WebKit for PWA/offline smoke), `context.setOffline()`, reload/restart | `e2e/` |
| Security | Cross-tenant matrix, IDOR, privilege escalation, token/aud/tid mismatch, webhook forgery, rate limits | `apps/api/test/security`, `e2e/security` |
| Performance | k6 (attendance bulk writes, dashboards, lists, exports) | `infra/k6` (Phase 15, smoke earlier) |
| Accessibility | axe-core in Playwright for Tier-1 screens | `e2e/a11y` |

Test data: factories in `packages/testing` build tenants, members and domain records; **no seed/mock data in production code paths** (seeds live only in `packages/database/seed/dev`).

---

## 20. Top architectural risks

| Risk | Mitigation |
| --- | --- |
| RLS + Prisma friction (transactions per query, pooling) | Client-extension pattern proven in Phase 1 spike with benchmark; fallback = keep extension + scoped repositories + cross-tenant suite, RLS on critical tables only (decision recorded if taken) |
| Wildcard DNS/TLS vendor lock-in | Host parsing and tenant resolution are ours; edge only terminates TLS and forwards Host |
| iOS PWA storage eviction / no Background Sync | Persistent storage request, foreground sync triggers, visible pending count, logout guard |
| Clock skew on offline devices | Server clock is authoritative; client time is informational; acceptance window by session date |
| Notification cost explosion | Intent → dedupe → per-tenant usage meter → plan limits (Ph 10/13) |
| Ordering of phases vs dependencies | Pulled-forward slices documented in DECISIONS C-02…C-06 |

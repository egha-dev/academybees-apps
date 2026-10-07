# P2-1 · Phase 2 — Authentication + RBAC: plan

> **Approved by the PO on 2026-10-02** (`phase-2-start` = `be3e1a2`) with C-59…C-64 accepted and three additions (reviewed below: C-65 phone-ready identity, C-66 mandatory console TOTP, staging proposal before S8). `phase-2-start` is tagged at the start of P2-2.

## Context

- **Predecessor:** Phase 1 is ✅ (2026-10-02, tag `phase-1`). Phase 2 may start.
- **Goal (IMPLEMENTATION_PLAN Phase 2):** staff sign in on their academy's URL and parents/students on the Family Hub. Everyone gets exactly their capabilities and cannot use a session anywhere else.
- **Refs read:** CLAUDE.md; IMPLEMENTATION_PLAN §1, §2, Phase 2 (and follow-ups assigned to Phase 2 in the Phase 0/1 exit notes); PRD v3 §4–5, §29 (security), v3.2 G-11, G-31, G-32; UX §8, §25, §29 (Login is Tier 1), v1.1 §8; ARCHITECTURE §6, §7, §9.2–9.3; DECISIONS ADR-006/007/008/039/040, C-02, C-04, C-25, C-27, C-32, C-37, C-39.

### What exists

| Area | State | Phase 2 change |
| --- | --- | --- |
| Tenancy | Host → academy in CLS, tenant-bound client (RLS via `app.tenant_id`), host policies, cross-tenant suite with route registry | Auth guards plug in after `TenantGuard`; sessions join the suite |
| Contracts | Capability catalogue skeleton (`permissions.ts`); `ErrorCode` already has `UNAUTHENTICATED`, `SESSION_EXPIRED`, `TENANT_MISMATCH`, `FORBIDDEN`, `RATE_LIMITED` | Descriptions, role templates with scopes, auth DTOs |
| Packages | No `packages/auth`; no argon2 / JWT / TOTP / SMTP libraries | New `packages/auth`; new catalog entries |
| Worker | Outbox relay + domain-event dispatch by type | Email handler (`EmailPort` + SMTP) |
| UI | `AppShell`, `PermissionState`, offline banner/sync indicator, logout-guard copy in `offline.json` | Login, auth screens, signed-in shell, Team, Security |
| Web | Host routing; academy home behind `p1-tenant-home`; hub placeholder; console host empty | `/login` replaces the placeholder home; hub and console sign-in |
| CI | E2E job starts Postgres + Redis only | Add Mailpit (invite/reset journeys read mail) |
| Assigned follow-ups | Phase 0: idempotency M1–M3, logging L1/L2/L4. Phase 1: L6, L7, tenantId mismatch → 404 | Slice S10 (and L6/L7 in S4) |

## Decisions I'll record before coding (safe defaults, CLAUDE.md §2)

None blocks the plan. They touch tenant isolation, security or UX, so I'm listing them; each gets a C- entry in S1.

| New ID | Question | Default | Why it's safe |
| --- | --- | --- | --- |
| **C-59** | Identity tables (`user`, `user_credential`, `auth_session`, `password_reset_token`, `platform_staff`, MFA tables) are **not** tenant-owned, so the Phase 1 tenant policy doesn't protect them; `ab_app` could read any user. | **User-bound RLS:** a second transaction-local GUC `app.user_id` (set by the tenant-bound client when a session exists — pulls C-39 forward). Rows are visible to (a) their own user, and (b) for `user`, members of the current academy. Login, refresh, reset and invite use narrow single-row lookup GUCs (`app.lookup_identifier`, `app.lookup_token`), as C-51 does for hosts. `membership` stays tenant-owned and is additionally visible to its own user (hub fan-out). | Same fail-closed model as Phase 1. No tenant code can list users of other academies, and a lookup exposes only the one row whose secret or identifier the caller already has. |
| **C-60** | ARCHITECTURE §6.1 says `Role.tenantId` null = system template, but NULL-tenant rows are invisible in a tenant context (C-53). | **System role templates live in code** (`@academybee/contracts`). Each academy gets real `Role` rows (tenant_id NOT NULL) copied from them: by seed now, by provisioning in Phase 3 (`RoleTemplateService.ensureSystemRoles`). A template change ships as an expand-only data migration. | Roles stay tenant-isolated; ADR-008 ("copied into each tenant") is unchanged. |
| **C-61** | A parent who signs in on an academy URL must end up signed in on `app.` (ADR-039), but cookies are host-only. | **One-time handoff code:** the academy login recognises a parent/student-only user, returns a 60-second single-use code (hashed in Redis, bound to user + target), and the browser goes to `app.…/auth/handoff?code=…&a=<slug>`, where the hub exchanges it for a `HUB` session. No cookie ever crosses hosts. | Single-use, short-lived, bound to the user; equivalent to re-entering the password without the friction. |
| **C-62** | Invite/reset emails carry a secret link, and side effects go through the outbox (ADR-019); a plaintext token in `outbox_event` would sit in the database and logs. | The outbox payload stores the link token **encrypted** (AES-256-GCM, `SECRETS_MASTER_KEY`, the same envelope helper ADR-033 needs). The worker decrypts, renders the template from the i18n catalogue (tenant-branded) and sends through `EmailPort` (SMTP: Mailpit locally; the provider is chosen at staging go-live, A6). | Secrets never stored or logged in plaintext; delivery keeps outbox retries. |
| **C-63** | Libraries, and how rate limiting is built. | **`jose`** (EdDSA JWTs, `kid` rotation); **`@node-rs/argon2`** (prebuilt binaries incl. Alpine/musl, so no native build in Docker); **`otpauth`** (RFC 6238 TOTP); **`nodemailer`** (SMTP). Rate limits and lockout: a small Redis limiter in `core/rate-limit` instead of `@nestjs/throttler`, to support per-identifier + per-IP keys and progressive lockout. | Mainstream, maintained libraries behind our own interfaces. No new infrastructure (ADR-001). |
| **C-64** | Signing keys and local cookies. | `AUTH_SIGNING_KEYS` (JWK set; current `kid` signs, all verify), generated by `pnpm env:init` locally and in CI, secret-stored on staging. Cookie names and flags exactly per §6.2 (`__Host-ab_at`, `__Secure-ab_rt` Path `/api/v1/auth`, `__Host-ab_csrf`). If the S6 spike shows **WebKit drops `Secure` cookies on `http://*.localhost`**, local/ci use unprefixed, non-Secure names via config. That is never allowed outside local/ci (config validation). | Production cookies are unchanged; the fallback is confined to http dev hosts. |

Already decided (no change): login identifier is email + password; phone OTP in Phase 10 (OD-04). Console has no TOTP until Phase 14; until then accounts are CLI-created and IP allow-listed (C-25). Locale is always `en-IN` (G-32).

## PO additions (2026-10-02), reviewed

**1. Mobile number + OTP login (C-65).**
- **In scope:** G-31 ("phone OTP from Phase 10") and OD-04. OTP *sending* lands in **Phase 10**, because it depends on the SMS provider, TRAI DLT registration of the entity, sender header and OTP template (A8, G-07), and the WhatsApp Cloud API number (A7).
- **What ships now (S1), so Phase 10 needs no identity migration:**
  - `User.phone` (E.164, unique, nullable) + `phoneVerifiedAt`;
  - an email or phone may be the only identifier;
  - `IdentityLookup` accepts both (normalised with the same Unicode/E.164 rules);
  - invitations may target a phone;
  - an `OtpChallenge` table (identifier hash, channel `SMS|WHATSAPP`, purpose `LOGIN|VERIFY_PHONE`, code hash, attempts, expiry, consumed) with RLS, unused until Phase 10;
  - rate-limit keys already per identifier.
- **Policy until Phase 10:** a phone becomes a login identifier only once verified; password is the factor.
- **Who uses OTP from Phase 10:** parents and students (and optionally teachers) on the hub/teacher PWA. Owner, Accountant and platform staff keep password + TOTP (money roles, G-11).
- **Cost** (indicative India prices 2025–26 — re-quote at Phase 10):
  - DLT SMS OTP ≈ ₹0.12–0.25 per message, plus one-time DLT entity registration (operator-dependent, a few thousand ₹);
  - WhatsApp authentication template ≈ ₹0.10–0.13 per message (Meta per-message pricing), and needs a verified business + approved template;
  - example: 2,000 parents × ~1.5 OTP sign-ins/month (30-day sessions; OTP only on new device / expiry) ≈ 3,000 OTPs ≈ **₹300–750/month by SMS or ₹300–400 by WhatsApp**;
  - recommend WhatsApp first with SMS fallback, per-identifier/IP/academy rate limits and a monthly usage meter (ADR-020), so abuse cannot run up costs.

**2. Mandatory TOTP for platform staff (C-66).** Accepted as an improvement. It supersedes the C-25 "console TOTP in Phase 14" for login.
- In S8, `platform:create-admin` issues a one-time set-password link; the first console sign-in forces TOTP enrolment (recovery codes shown once).
- Every console login requires password + TOTP; console sessions stay CONSOLE-audience with 7-day refresh.
- The IP allow-list stays as an optional extra layer (staging/prod).
- Phase 14 keeps impersonation and the full console.

**3. Staging before S8:** see [`staging-proposal.md`](staging-proposal.md). Recommendation: **Railway (Singapore), everything in one region, Cloudflare DNS**. New slice **S7b `p2/staging`** (web Docker image, Railway deploy workflow, runbook) runs after you create the accounts; S8 is then smoke-tested on your phone over https. Until you approve, OD-03/C-31/C-48 stay as recorded.

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + the relevant tests → Conventional Commit (explicit paths, no `git add -A`).
Each slice: branch `p2/<slice>` from the latest `main` → PR → all required checks green → squash merge (C-43).

### S1 `p2/identity-schema` — plan, schema, roles

**2.1 Docs.** Plan 🟨 + slice table; C-59…C-64.

**2.2 Identity schema + RLS** (phone-ready, C-65) (`packages/database/prisma/schema/identity.prisma`, migration, `020-identity-rls.sql`):
- `User` (citext email and E.164 phone, each unique and nullable, at least one required; `emailVerifiedAt`, `phoneVerifiedAt`; `preferredLocale` nullable; status);
- `UserCredential`;
- `Membership` (status `INVITED|ACTIVE|DISABLED`, `branchIds`, `permissionsVersion`);
- `Role`, `RolePermission`, `MembershipRole`;
- `PlatformStaff`;
- `AuthSession` (audience `TENANT|CONSOLE|HUB`, `familyId`, refresh hash, device id/label, ip, UA, revoke reason);
- `Invitation` (role keys, token hash, inviter);
- `PasswordResetToken`;
- `MfaFactor` (TOTP secret encrypted);
- `MfaRecoveryCode` (hashed);
- `KnownDevice` (for new-device alerts);
- `OtpChallenge` (C-65: designed now, used from Phase 10).

Policies per C-59. Coverage test extended: identity tables have exactly their user-bound/lookup policies. Isolation tests: user A can't read user B; a member of academy A can't read a user only in academy B; the lookup GUC exposes one row.

**2.3 Capability catalogue complete + role templates.**
- `permissions.ts` gets descriptions and the system templates (Owner, Admin, Teacher, Accountant, Receptionist, Parent, Student) with **default scopes** per ARCHITECTURE §7.3, plus platform roles (`SUPER_ADMIN`, `SUPPORT`, `FINANCE_OPS`) and an "experience" per role (manage / teach / hub).
- `payment.verify` and `payment.report` included.
- Unit tests: every template capability exists; owner ⊇ admin where §7.3 says so; parent/student only LINKED/SELF capabilities.

**2.4 Seeds + factories.**
- demo-a: one user per role (owner, admin, teacher, accountant, receptionist, parent, student), with the teacher also a member of demo-b.
- Roles copied from the templates into each seeded academy.
- One Super Admin.
- Shared local-only password, documented in README (`APP_ENV` guard as today).
- Factories `createUserFixture`, `createMembershipFixture`.

### S2 `p2/auth-core` — `packages/auth` + config

**2.5 `packages/auth`** (pure, no Nest):
- `hashPassword`/`verifyPassword` (argon2id, m ≥ 19 MiB, t=2, p=1) + password policy (min 8, strength score, Unicode-safe);
- opaque token generate/hash (256-bit, SHA-256);
- JWT sign/verify (EdDSA, claims `sub, tid?, sid, aud, ver`, `kid` rotation, clock skew);
- cookie name/option builder per audience/host;
- CSRF token;
- TOTP (`otpauth`) + recovery codes;
- `encryptSecret`/`decryptSecret` (AES-256-GCM envelope).

Unit tests for each, including tampered/expired/wrong-audience tokens and a timing-safe compare.

**2.6 Config.**
- API/worker/web config gains `AUTH_SIGNING_KEYS`, `SECRETS_MASTER_KEY`, SMTP settings and `COOKIE_SECURE_DEV` (C-64), validated at boot; production refuses dev values.
- `pnpm env:init` generates local keys.
- CI generates throwaway keys.
- Runbook rows for staging secrets.

### S3 `p2/sessions` — sign-in, refresh, sign-out

**2.7 Session service + endpoints** (`apps/api/src/core/auth`):
- `POST /auth/login`: an `IdentityLookup` resolves the user, then credentials are verified, then the membership is checked for the host's academy (tenant host), PlatformStaff (console) or parent/student memberships (hub).
- `POST /auth/refresh`: rotation; a reused token revokes the whole family.
- `POST /auth/logout`: this device, or all.
- `GET /auth/me`: user, academy membership, roles, capabilities, experiences.
- Cookies + CSRF double-submit guard on all mutations.
- `lastLoginAt` set; auth audit events (login success/failure, logout, refresh reuse, lockout).

**2.8 Guards** (pipeline order per ARCHITECTURE §9.2):
- `AuthGuard`: verify JWT, audience must match host kind (TENANT on academy hosts, HUB on `app.`, CONSOLE on `console.`); for TENANT, `tid` must equal the resolved academy, else **401 `TENANT_MISMATCH` + audit**; session not revoked; `ver` matches.
- `MembershipGuard`: ACTIVE membership in this academy, else 401 on the next request.
- `@Public()`.
- `@PlatformOnly()`.
- Actor in CLS. The tenant-bound client also sets `app.user_id` (C-59).

**2.9 Rate limits + lockout.**
- Redis limiter: login 5/min per IP+identifier with exponential backoff; reset/invite 3/hour per identifier.
- `429 RATE_LIMITED` + `Retry-After`.
- Progressive lockout on `UserCredential.failedCount`/`lockedUntil`.
- Uniform responses: no account enumeration.

Security tests:
- demo-a token on demo-b host → 401 `TENANT_MISMATCH` + audit row;
- console↔tenant↔hub audience rejection;
- refresh reuse revokes the family;
- missing CSRF → 403;
- 429 with `Retry-After`;
- disabled membership → 401.

### S4 `p2/rbac` — capabilities and scopes

**2.10 Capability resolution.** Roles → capabilities, cached in Redis by `membershipId:permissionsVersion` (role change bumps the version, so it takes effect immediately). `PermissionGuard` with `@Can('cap')`, which every authenticated tenant route must declare (lint/test enforces it).

**2.11 Scope-policy framework** (`core/rbac/policy.ts`):
- `Scope` = `TENANT | BRANCH | ASSIGNED | LINKED | SELF`;
- `definePolicy({ where, can })` returning a Prisma `where` + record check;
- out of scope → 404.

Domain policies arrive with their modules (Phase 4+); Phase 2 ships the framework, a reference policy for `Membership` (Team) and tests.

**2.12 Cross-tenant suite grows.** Registry entries gain `capability`, and the suite adds per-route:
- A's session on B's host;
- no session;
- a role without the capability → 403;
- an out-of-scope record → 404.

Privilege-escalation tests (teacher → owner endpoints). Phase 1 follow-ups **L6** (lint-restrict `createMigratorClient` / `PrismaClient` construction in app code) and **L7** (`set_config` only inside `packages/database`, plus reset on the no-context path); a mismatching tenantId from input → 404.

### S5 `p2/email-invites` — email, invitations, reset, team API

**2.13 Email** (C-04, C-62):
- `EmailPort` + `SmtpEmailAdapter` in the worker; handler for `email.requested` outbox events.
- Templates for invite, password reset, new-device sign-in and password changed, as HTML + text rendered from i18n keys with academy branding (name, colour; emails stay light per C-49).
- Mailpit in CI E2E; template snapshot tests.

**2.14 Invitations + password reset + team API:**
- `POST /team/invitations` (`team.invite`);
- `GET /invitations/:token`: public, uniform for invalid/expired;
- `POST /invitations/:token/accept`: sets password for a new user, or just links an existing user, activates the membership, assigns roles;
- `POST /auth/password/forgot`: uniform response;
- `POST /auth/password/reset`: revokes all sessions, sends the "password changed" alert;
- `GET /team/members`;
- `PATCH /team/members/:id`: roles, disable/enable, bumps `permissionsVersion`;
- `GET /team/roles` (with `grantable` per role);
- `GET /team/invitations`, `POST /team/invitations/:id/{resend,revoke}`.

Idempotency on invite creation. Every endpoint in the cross-tenant registry. Rules: C-67.

### S6 `p2/web-auth` — sign-in screens

**2.15 Web auth plumbing:**
- server-side session read (`/auth/me` with forwarded cookies, per-request cache);
- client fetch wrapper (CSRF header, silent refresh on 401 `SESSION_EXPIRED`, a re-login modal that keeps the page and form state);
- logout with the pending-sync confirmation from `packages/sync`;
- **cookie spike first**: WebKit + `Secure`/`__Host-` on `http://*.localhost` (C-64 fallback if needed).

**2.16 Screens** (UX Tier 1 Login; UX v1.1 §8):
- tenant-branded **Login** (academy identity, email + password, show/hide, caps-lock hint, errors per code, lockout/rate-limit copy, offline state);
- **Forgot / Reset** password;
- **Invite accept** (set password, or "You already have an account — sign in to accept");
- role-home redirect after sign-in.

Unauthenticated `/` on an academy host goes to `/login`, and **`p1-tenant-home` is removed**. Strings in a new `auth` namespace. Loading/empty/error/success states. JS budget: Login is added to `perf:budget` and must fit (see Risks).

### S7 `p2/web-shell` — signed-in shell, navigation, Team

**2.17 Signed-in Manage shell:**
- `AppShell` with academy identity, user menu (Security, Sign out) and capability-filtered navigation config (UX §8, §25) showing **only built modules** (Phase 2: Team and Security under ACADEMY).
- Experience switcher for multi-role users (manage / teach).
- `PermissionState` page for 403.
- Role homes: `/today` and `/teach` are **placeholders behind release flag `p2-role-homes`** (owner PO, remove in Phase 5/6 when Owner Today and Teacher Today ship). With the flag off, staff land on `/settings/security`, which is real (from S9; until then the landing answers not found, C-68).

**2.18 Team page** (`/settings/team`): members and pending invites, an "Invite member" sheet (email + roles), change roles, disable/enable, resend/revoke invite. All UI states; phone-first.

### S8 `p2/hub-console` — Family Hub and console sessions

**2.19 HUB audience** (G-31, ADR-039, C-61):
- Hub login on `app.`.
- Academy login for a parent/student-only user → handoff code → `app.…/auth/handoff` → `HUB` session.
- Hub `/auth/me` lists ACTIVE parent/student memberships via per-tenant fan-out (`TenantContext.run`, never the platform client). The hub placeholder becomes the signed-in placeholder (still `p1-hub-placeholder`).
- Hub, tenant and console tokens mutually rejected (tests).

**2.20 Console** (C-02, C-66):
- `pnpm platform:create-admin --email`: platform code, platform client, audited; prints a one-time set-password link (and emails it).
- Console login on `console.` (CONSOLE audience, 7-day refresh, `@PlatformOnly`) with **mandatory TOTP**: first sign-in forces enrolment (C-66).
- Console home placeholder behind **`p2-console-home`** (owner PO, remove in Phase 3 when the academies list ships).
- `CONSOLE_IP_ALLOWLIST` enforced outside local/ci.

### S9 `p2/account-security` — 2FA, devices, alerts (G-11)

**2.21 TOTP 2FA:**
- enrol (QR + manual key);
- verify;
- 10 recovery codes (shown once, hashed);
- login step (`MFA_REQUIRED` → `POST /auth/mfa/verify` with a short-lived MFA token);
- disable (re-authentication);
- tenant setting `security.requireMfaForRoles` (Owner/Accountant), **strong prompt by default** after sign-in for Owner/Accountant without 2FA.

**2.22 Devices & sessions** (`/settings/security`): sessions list (device label, location-free, last used), sign out one / all others. "New device" email on the first sign-in from an unknown device (`KnownDevice` keyed by a long-lived device-id cookie). "Password changed" email.

*As built (C-80):* 2FA is asked for on every host for users who have it, invite accept included. The MFA token is bound to its host and academy. The academy rule lives in `GET/PATCH /settings/security`, and sessions without 2FA end at refresh once the rule covers them. The strong prompt is a page section (Owner/Accountant land on `/settings/security?prompt=mfa`), not a modal. Signed-in password change was added for the "password changed" alert. There is also a "two-step sign-in turned off" email. With `p2-role-homes` off, `/today` and `/teach` land on `/settings/security`.

### S10 `p2/hardening-e2e` — assigned follow-ups, journeys, docs

**2.23 Idempotency + logging follow-ups** (Phase 0 review), before any finance/provisioning endpoint uses `@Idempotent()`:
- **M1** stale IN_PROGRESS lease (expiry + takeover);
- **M2** store the schema-filtered response;
- **M3** no extra audit row on replay;
- **L1** mask `Error` messages/stacks, drop Prisma `meta` from logs;
- **L2** log URLs without query strings, deep redaction;
- **L4** unmapped 4xx logged and mapped.

**2.24 E2E journeys + docs.**
- invite → accept → sign in → role home;
- forgot → Mailpit link → reset → sign in;
- teacher in demo-a and demo-b signs in separately on each host;
- parent signs in on demo-a and lands on `app.localhost` with a HUB session;
- console admin signs in;
- 2FA enrol + sign in;
- sign out everywhere;
- axe in both themes on all new screens; pseudo-locale on Login.

Docs: ARCHITECTURE §6/§7/§9.2 as built, README (demo logins), CLAUDE.md §8, runbook (secrets, email provider, console allow-list).

| Slice | Branch | Tasks | Release flags |
| --- | --- | --- | --- |
| S1 | `p2/identity-schema` | 2.1–2.4 | — |
| S2 | `p2/auth-core` | 2.5, 2.6 | — |
| S3 | `p2/sessions` | 2.7–2.9 | — |
| S4 | `p2/rbac` | 2.10–2.12 | — |
| S5 | `p2/email-invites` | 2.13, 2.14 | — |
| S6 | `p2/web-auth` | 2.15, 2.16 | removes `p1-tenant-home`; adds `p2-role-homes` (pulled from S7, C-68) |
| S7 | `p2/web-shell` | 2.17, 2.18 | `p2-role-homes` (→ Phase 5/6) |
| S7b | `p2/staging` | staging on the approved host (only after you approve the proposal and create the accounts) | — |
| S8 | `p2/hub-console` | 2.19, 2.20 | `p2-console-home` (→ Phase 3); `p1-hub-placeholder` stays (→ 7P) |
| S9 | `p2/account-security` | 2.21, 2.22 | — |
| S10 | `p2/hardening-e2e` | 2.23, 2.24 | — |

## Dependencies and gaps

- **Uses Phase 0/1:** CLS context, `TenantGuard` + host policies, tenant-bound client, cross-tenant suite, outbox + worker, `AuditService`, `@Idempotent`, i18n, `AppShell`/`PermissionState`, `packages/sync` (logout guard), release flags, seeds.
- **Missing from earlier phases and added here:**
  - the user-bound DB context (C-39 pulled forward as C-59);
  - secret encryption helper (ADR-033 pulled forward for MFA secrets and outbox tokens);
  - Mailpit in CI.
- **Not built here (later phases):**
  - provisioning, owner invite from the console, terms acceptance (Phase 3);
  - domain profiles and the parent/student data behind the hub (4/7P);
  - consent records (C-37: from Phase 4, seeded parents get one);
  - phone OTP (10);
  - console TOTP, impersonation (14);
  - language switcher (L).
- **M0 Foundation Release** (declared at this gate) also says "CI/CD to staging". Staging is deferred (C-50), so M0 is declared **with staging deferred**.

## Risks

| Risk | Mitigation |
| --- | --- |
| **Route JS budget**: the shell is at 198.6 / 200 KB gz; a Login form with MUI inputs, RHF and zod could push the Login page (and the hub, a G-24 route) over. | S6 starts with a measurement. Login uses a lean form (native inputs styled through `@academybee/ui`, no RHF on this page, validation from the shared schema on submit). If still over, a small "shell diet" task (lazy-load PWA prompts, theme toggle and toast view). If that isn't enough, I'll come back to you before raising any budget. |
| WebKit and `Secure`/`__Host-` cookies on `http://*.localhost` (iPhone E2E project) | Spike first in S6; config fallback confined to local/ci (C-64) |
| User-bound RLS adds policy complexity (C-59) | Exact-policy coverage test (as L5), isolation tests per identity table, lookups limited to one row |
| Native argon2 in Docker images and Testcontainers | `@node-rs/argon2` prebuilt (glibc + musl); verified in the API Docker build in S2 |
| Email deliverability / provider not chosen | Mailpit locally and in CI. The provider and SPF/DKIM/DMARC come with staging go-live (A6, C-50). The adapter is SMTP, so it's vendor-neutral. |
| Enumeration through login/reset/invite/handoff | Uniform responses and timings (dummy hash on unknown users), rate limits, tests assert identical bodies |
| Session fixation / CSRF on the same-origin API | New session on every login, SameSite=Lax + double-submit header on all mutations, CSRF test per mutating route |

## How I'll prove the exit gate (P2-3)

| Gate item | Evidence |
| --- | --- |
| Password policy, token rotation, capability resolution, scope policies | `packages/auth/src/*.spec.ts`, `packages/contracts/src/permissions.spec.ts`, `apps/api/src/core/rbac/*.spec.ts` |
| demo-a token on demo-b → 401 `TENANT_MISMATCH` + audit; console↔tenant↔hub rejected | `apps/api/test/security/sessions.int.spec.ts` |
| Refresh reuse revokes family; disabled membership → 401; teacher → owner endpoint → 403; 429 + `Retry-After`; CSRF missing → 403 | `apps/api/test/security/*.int.spec.ts`; cross-tenant suite with session cases for every registered route |
| Identity tables isolated | `packages/database/test/identity-isolation.int.spec.ts`, extended `rls-coverage.int.spec.ts` |
| E2E journeys (invite, reset via Mailpit, two academies, parent → hub, console, 2FA, sign out everywhere) | `e2e/specs/auth-*.spec.ts`, axe + pseudo-locale on the new screens |
| Common Phase Gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm perf:budget && pnpm perf:lighthouse && pnpm i18n:check && pnpm flags:check && pnpm db:drift` |
| Staging + M0 "CI/CD to staging" | **DEFERRED (C-50)** |

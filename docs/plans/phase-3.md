# P3-1 · Phase 3 — Academy Provisioning + Onboarding: plan

> **Approved by the PO on 2026-10-07** (`phase-3-start` = `afd72c2`), with logo storage on **ImageKit** (C-93) — changed to **Cloudflare R2** by the PO on 2026-10-09 (C-97). Decisions C-85…C-96 recorded in DECISIONS.md.

## Context

- **Predecessor:** Phase 2 ✅ 2026-10-07 (tag `phase-2`, M0). Phase 3 can start.
- **Goal:** a Super Admin creates an academy in the console and hands over its URL. The owner accepts the invite, accepts the Terms, and is guided to a ready-to-run academy that is then ACTIVE.
- **Refs read:**
  - CLAUDE.md
  - IMPLEMENTATION_PLAN §1, §2, Phase 3, and the Phase 1/2 follow-ups assigned to Phase 3
  - PRD v3.1 §A–J; v3 §6, §19, §20; v3.2 G-05, G-06, G-25, G-30, G-31, G-32
  - UX §21, §22; v1.1 §2–10; V1.2 §5
  - ARCHITECTURE §4.1, §5, §8.3–8.4, §9, §10, §13, §14
  - DECISIONS C-02/03/08/09/11/13/36/37/52/54/60/67/70/78/83, ADR-008/019/021/024/025/028/029/034/040/041
- **PO decision (2026-10-07, changed 2026-10-09):** logos go to **Cloudflare R2 (free tier)** on staging, not ImageKit (C-97). The PO creates the account and provides the keys. Locally they go to SeaweedFS behind the same interface.

### What exists

| Area | State today | Phase 3 change |
| --- | --- | --- |
| Tenancy schema | `Tenant` (statuses incl. SETUP, plus PENDING_APPROVAL reserved), `TenantDomain` (PRIMARY/REDIRECT, one-primary partial unique), `TenantBranding` (`logoKey`/`faviconKey` unused), `TenantSettings` (incl. `i18n` default `en-IN`), `Branch` | Add provisioning, legal, people and scheduling tables; `Tenant.statusReason` and `previousStatus` |
| Provisioning | No API. `platform/cli/bootstrap-staging.ts` creates tenant, domain, branding, settings, branch and roles in one transaction. `ensureSystemRoles` exists. | Extract into a `ProvisioningService`; the CLI reuses it |
| Platform API | Only two CLIs. No Nest provider for the platform client. | `PlatformDbModule` (audited) and `/platform/*` endpoints |
| Slugs | `validateSlug` and `RESERVED_SLUGS` in `packages/tenant`. No impersonation list. | Add the impersonation list and `suggestSlugs()` |
| Host cache | API Redis cache with `invalidateHost`/`invalidateTenant` (unused). The web proxy caches for 60 s. | Invalidate on every console change; shorter web TTL for non-ACTIVE academies (P1-4 L1) |
| Status routing | Web: SETUP, SUSPENDED and ARCHIVED all go to status pages. API: login is `@AnyHost`, so a session can be created on a SUSPENDED academy (P2-4 follow-up). | SETUP owner goes to onboarding; SUSPENDED/ARCHIVED refuse sign-in and sessions |
| Contracts | Capabilities exist (`academy.*`, `student.*`, `course.*`, `batch.*`, `timetable.*`, `platform.tenant.*`). `ENTITLEMENT_LIMIT_REACHED` and `FEATURE_NOT_IN_PLAN` exist. | Plan, legal, onboarding, people, scheduling and provisioning DTOs; academy-type templates |
| Email | Outbox `email.requested`. `academySender` only works on an academy host. Invite accept is reusable. | `owner_invite` template, built with an explicit academy host from the console |
| Web | Console has only a home placeholder (`p2-console-home`). Academy shell is ≈198 KB gz of 200. No TanStack Query or React Hook Form in use. No stepper, upload or colour components. | Console shell, onboarding layout outside the shell, settings pages, new lean UI components |
| Storage | SeaweedFS in docker-compose only. No code. | `MediaStoragePort` with one S3 adapter: SeaweedFS locally, Cloudflare R2 on staging/production (C-97) |

## Decisions (C-85…C-96, recorded in DECISIONS.md)

None of these blocks the plan. Each is recorded in S1 unless noted. Say if you want any changed.

| ID | Question | Default |
| --- | --- | --- |
| **C-85** | ARCH §5.3 says SETUP is "normal, owner → onboarding", but the web sends every SETUP request to a status page. | On a SETUP host the web serves the sign-in pages (`/login`, `/invite`, forgot/reset), `/legal`, `/welcome` and `/onboarding/*`. A signed-in member with `academy.onboarding.manage` (the owner) goes legal → welcome → current step. Everyone else sees "{academy} is getting ready". Manage pages stay closed until ACTIVE. |
| **C-86** | P2-4 says show the status page and create no session on SUSPENDED/ARCHIVED; ARCH §5.3 says "owner may sign in" on SUSPENDED (for billing and export, which don't exist yet). | **Refuse sign-in and refresh** on SUSPENDED/ARCHIVED (`TENANT_UNAVAILABLE`), and revoke that academy's sessions on suspend or archive. Owner sign-in on SUSPENDED returns with billing/export (Phase 13/15, G-15), recorded as a follow-up. |
| **C-87** | When does SETUP become ACTIVE, and what does reactivate restore? | `POST /onboarding/complete` requires Profile and Type to be done (other steps may be skipped, C-08), then sets ACTIVE. The console can also **Activate** a SETUP academy (C-11). Suspend stores `previousStatus`, and reactivate restores it (SETUP or ACTIVE). Archive is allowed from any status, with a reason; ARCHIVED → ACTIVE is not offered (Phase 14). |
| **C-88** | ARCH §4.1 calls for an "impersonation list" that doesn't exist. | Add `IMPERSONATION_SLUGS` to `packages/tenant`: government and payment/bank brands, big-tech names, AcademyBee look-alikes such as `academybees`, `academy-bee` and `academybee-*`. Matching is exact or by prefix. Availability answers `available | taken | reserved | invalid`, with up to 3 suggestions. Platform-owned exceptions are unchanged (C-36). |
| **C-89** | How plans and trials are modelled. | Seed `Plan`s Trial, Starter, Growth and Pro (G-25), with `PlanEntitlement` rows: limits `students`, `staff`, `branches`, `storageMb`, `messagesPerMonth`; features `crm`, `learning`, `whatsapp`, `reports_advanced`, `custom_domain`, `ai`. **Payments are never a gated feature (G-30).** `Subscription` (one row per tenant, `status TRIAL`, `planId`, `trialEndsAt` = +30 days, `entitlementsSnapshot`). Trials don't expire while `billing.enforce=false` (C-03). `SubscriptionOverride` is designed now with no UI (Phase 14). Plan and subscription tables are **read-only for `ab_app`**. Create Academy offers a choice of plan, with Trial selected by default. |
| **C-90** | Medical notes must be restricted and every read audited (G-05). | They go in a separate `StudentHealthNote` table instead of a `Student` column, so a generic student read can never return them. Phase 3 only writes it (nothing reads it); the audited read path arrives in Phase 4. |
| **C-91** | Admission numbers. | A `TenantSequence(tenantId, kind)` row is locked with `SELECT … FOR UPDATE` and the prefix comes from settings (default `ADM-`). The same table serves invoices and receipts in Phase 7. |
| **C-92** | Where the minimal create commands live (C-09). | In real domain modules, `modules/people` and `modules/scheduling`, each with a service and a policy. Onboarding is a thin orchestrator that calls their exported services, and Phases 4–5 add the full endpoints on top. Onboarding creates 14 days of sessions synchronously, as dates in the academy's timezone; `UNIQUE(scheduleRuleId, sessionDate)` makes it safe to re-run. |
| **C-93** | Storage, following the PO answer and C-70. | `MediaStoragePort` with two adapters, `S3MediaAdapter` (SeaweedFS in local/ci) and `ImageKitMediaAdapter` (staging and production); no vendor types outside the adapter. `MediaFile` stores metadata only under RLS (path, owner entity, mime, size, dimensions, visibility, status `PENDING → READY`). Uploads go straight from the browser with a short-lived server token after tenant, entity, type and size checks. The upload is then confirmed on the server: it checks size and mime by reading the file's header. Logos and favicons are **public** (URL built at read time); everything else is private (Phase 4+). Allowed types are PNG, JPEG, WebP and SVG; SVG is **refused** for safety. Logos are capped at 2 MB, favicons at 512 KB. If the ImageKit keys are missing, uploads are turned off with a clear message, never faked. |
| **C-94** | Forms and data fetching. CLAUDE §6 lists React Hook Form and TanStack Query, but Phase 2 deliberately used lean forms for the bundle budget. | Keep the Phase 2 pattern: server components load data, client forms use the shared Zod schemas and `api()`. No React Hook Form or TanStack Query yet; they are reconsidered in Phase 4 with the shell diet. |
| **C-95** | The plan line "custom-domain section 'coming soon' hidden behind flag" contradicts CLAUDE §10 ("no coming-soon pages"). | **Don't render it.** The Domain tab and Branding & Domain page show the AcademyBee subdomain and any old addresses that redirect to it. The data model already supports custom domains, so adding them later needs no shell redesign (UX v1.1 §10). |
| **C-96** | Status and domain changes must be visible within about 2 minutes (P1-4 L1). | Every console change invalidates the API host cache inside its own transaction hook. The web proxy caches ACTIVE for 60 s and anything else for 10 s, so changes show within about 60 s. A REDIRECT to a CUSTOM primary resolves only when that domain is verified. |

Also recorded in S1: an ADR-034 note that `LegalDocument` content is stored as locale variants (`en-IN` only), with `contentUrl` pointing at the marketing site's draft legal pages (C-74). Placeholder text is fine on staging; real text is needed before the pilot.

## Slices and tasks

Each task follows the same steps: implement → `pnpm lint && pnpm typecheck` + relevant tests → Conventional Commit (explicit paths).
Each slice follows the same steps: branch `p3/<slice>` from the latest `main` → PR with the DoD checklist → auto-merge (squash) once green.

### S1 `p3/plans-legal` — plan, plans and entitlements, legal

**3.1 Docs.**
- `docs/plans/phase-3.md` (this plan).
- IMPLEMENTATION_PLAN: Phase 3 marked 🟨, plus the slice table.
- DECISIONS: C-85…C-96.

**3.2 Plans, entitlements and trial** (C-03, C-89, ADR-028):
- Schema `packages/database/prisma/schema/subscription.prisma`: `Plan`, `PlanEntitlement`, `Subscription`, `SubscriptionOverride`.
- Migration `…_plans_and_subscriptions`; grants in `000-grants.sql` (`ab_app` SELECT only).
- Plan rows are seeded in local/ci, and also by an idempotent data migration so staging and production have them.
- `apps/api/src/core/entitlements/`:
  - `EntitlementService`: `featureEnabled`, `checkLimit(kind, adding)`, `usage` (reads the subscription snapshot with overrides applied).
  - `@Feature(key)` and `@Limit(kind, countFn)` guards placed after `@Can` (ARCH §9.2).
  - `GET /academy/plan`: plan, trial end date and usage, for the UI.
- Seeds give demo academies a Trial on Growth.
- **Tests:**
  - unit: entitlement resolution, overrides, and that payments are never gated;
  - integration: limit reached → `403 ENTITLEMENT_LIMIT_REACHED` with `details.limit`/`used`; reads and exports are never blocked.

**3.3 Legal documents and acceptance** (G-06, ADR-034, G-32):
- Schema `legal.prisma`: `LegalDocument` (platform table: kind, version, `publishedAt`, `variants` JSON keyed by locale with title/url) and `LegalAcceptance` (append-only: user, tenant?, document, locale shown, ip, `acceptedAt`). It has user-bound RLS like C-59.
- `GET /legal/current` returns current documents with an `accepted` flag for the signed-in user.
- `POST /legal/accept` takes `{documentIds}`, is idempotent and audited.
- `LegalGuard` checks that current Terms, Privacy and DPA are accepted. It is applied to onboarding and, for owners, to manage routes. When a version changes, acceptance is asked for again.
- Draft documents are seeded.
- **Tests:** acceptance is recorded; a version bump asks again; user A can't read user B's acceptances.

*As built (S1):*
- Plans and legal documents are synced from the catalogues in `@academybee/contracts` after every migrate/deploy (`syncReferenceData`, in `applySqlFolder`), not seeded: every environment has the same rows.
- Entitlement errors use the standard `{ path, issue }` details: `{ path: 'students', issue: 'limit_reached' }`, `{ path: 'crm', issue: 'not_in_plan' }`.
- Limits counted so far: `staff` and `branches` (students arrive with the people module in S5). Staff invitations aren't limited yet; that comes with teacher management in Phase 4.
- `GET /academy/plan` is deferred until a screen needs it; the console detail (S3/S4) shows the plan.
- `LegalAcceptance` is user-owned (like `auth_session`): its own RLS policy also requires the recorded academy to be the current one. A draft DPA page was added to the marketing site (`/dpa/`), next to Terms and Privacy.

### S2 `p3/people-scheduling-schema` — full schema (C-09)

**3.4 People schema** (`people.prisma`, G-05):
- `Student`:
  - names (Unicode, NFC), preferred name, `photoMediaId?`, DOB, gender incl. `PREFER_NOT_TO_SAY`, school, grade, `admissionNo` (`UNIQUE(tenantId, admissionNo)`), admission date, address JSON, emergency contact JSON, tags[], `customFields` JSONB;
  - status `ACTIVE | ON_HOLD | COMPLETED | LEFT` (C-12), `branchId`, `version`, `archivedAt`;
  - trigram index on name.
- `StudentHealthNote` (C-90).
- `Parent`: name, relationship, phone E.164, `whatsappCapable`, email, `preferredLocale` (always `en-IN`), occupation, `pickupAuthorised`, `userId?`.
- `ParentStudent` (`UNIQUE(tenantId, parentId, studentId)`).
- `Teacher`: `membershipId?`, `invitationId?`, name, contact, status, `branchId`.
- `ConsentRecord` (append-only, ADR-034).
- `CustomFieldDefinition` (≤10 per academy, typed).
- `TenantSequence` (C-91).

**3.5 Scheduling schema** (`scheduling.prisma`):
- `Course`, `CourseLevel`.
- `Batch`: course, level?, `branchId`, capacity, status, `version`.
- `BatchTeacher`.
- `BatchEnrolment` (`startedOn`/`endedOn`, partial unique where `endedOn IS NULL`).
- `ScheduleRule`: weekday, start/end local time, teacher, `effectiveFrom/To`.
- `ClassSession` (date, start/end instants, origin `GENERATED | MANUAL`, status, `UNIQUE(scheduleRuleId, sessionDate)`).
- `TenantOnboarding`: `tenantId` PK, `currentStep`, `steps` JSON, `completedAt`, `version`.
- Holidays stay in Phase 5 (G-03).

**3.6 RLS, seeds and factories:**
- The migration is expand-only. Tenant RLS is applied automatically by `010`, and `rls-coverage` is extended.
- C-37: the seeded `parent@demo-a.test` gets a `Parent` profile linked to a seeded `Student` plus a `ConsentRecord`; demo-a also gets one course, one batch and one rule.
- Factories: `createStudentFixture`, `createCourseFixture`, `createBatchFixture`.
- **Tests:** the isolation suite covers the new tables; constraint tests (one open enrolment, unique admission number).

*As built (S2):*
- `Student.userId` was added for the student's own Family Hub sign-in (G-31, used from Phase 11).
- Relationship, primary contact and pickup permission sit on `ParentStudent`, because they can differ per child (G-05 lists them under Parent).
- `ConsentRecord` holds append-only GRANT/WITHDRAW events; the latest row is the current state (ADR-034).
- Schedule rules store local start/end as minutes after midnight.
- The trigram name index moves to Phase 4 together with search, since it needs the `pg_trgm` extension.
- Shape checks and no-delete grants are in `prisma/sql/030-people-scheduling-rules.sql`.
- The tenant fixture fills every new table, so the isolation suite covers them automatically.

### S3 `p3/provisioning-api` — provisioning and console API

**3.7 ProvisioningService** (`apps/api/src/platform/provisioning/`):
- `PlatformDbModule` provides the platform client only under `src/platform/**` (enforced by lint), and every use is audited.
- `POST /platform/tenants` is `@ConsoleHost`, `@Can('platform.tenant.create')` and `@Idempotent`. It runs one transaction:
  1. Validate the slug (format, reserved, impersonation, availability including REDIRECT rows).
  2. Create `Tenant` (SETUP).
  3. Create the PRIMARY `TenantDomain`.
  4. Create branding and settings defaults by academy type (terminology templates in `packages/contracts/src/academy-types.ts`, ADR-029; `i18n` defaults).
  5. Create the default `Branch` (named after the optional initial branch, or "Main branch").
  6. Run `ensureSystemRoles`.
  7. Create the owner `Invitation` (role `owner`; the email may already belong to a user).
  8. Create the TRIAL `Subscription`.
  9. Create `TenantOnboarding`.
  10. Audit `platform.tenant_provisioned`.
  11. Outbox: `tenant.provisioned` (analytics) and `email.requested` (`owner_invite`, sealed token, explicit academy host).
- A slug collision (unique violation) becomes `409 CONFLICT` with `details.suggestions`.
- `GET /platform/slug-availability?slug=` is rate-limited.
- `bootstrap-staging.ts` is refactored to call the service core.
- Worker: new `owner_invite` email template (i18n `email.ownerInvite.*`).

**3.8 Console academy management:**
- `GET /platform/tenants`: keyset pagination, search by name or slug, status filter.
- `GET /platform/tenants/:id`: overview, domains, owner invite status, plan and trial, onboarding progress.
- `POST /platform/tenants/:id/{suspend,reactivate,archive,activate}`: reason required, audited, idempotent, sessions revoked (C-86), cache invalidated (C-96).
- `POST /platform/tenants/:id/domains`: change subdomain. The new PRIMARY is created and the old one demoted to REDIRECT in one transaction, then audited and invalidated.
- `POST /platform/tenants/:id/owner-invite/resend`.
- Capabilities follow `PLATFORM_ROLE_GRANTS` (SUPPORT can read but not change).

**3.9 Status enforcement and tests:**
- Login, refresh and handoff refuse SUSPENDED/ARCHIVED academies (C-86). The hub keeps greying them out (C-73).
- Web proxy TTL split (C-96).
- **Tests** (`apps/api/test/platform/provisioning.int.spec.ts`, `console-tenants.int.spec.ts`, `security/console.int.spec.ts`):
  - the same `Idempotency-Key` twice creates one tenant;
  - a concurrent same-slug request → one wins, the other gets 409 with suggestions;
  - reserved, impersonating and invalid slugs are refused;
  - a forced failure part-way leaves no rows;
  - audit and outbox rows are present;
  - tenant and hub tokens are refused on `/platform/*`; SUPPORT gets 403 on create;
  - suspend → sign-in refused and existing sessions revoked; reactivate restores the previous status;
  - change subdomain → the old host returns REDIRECT and the old slug stays reserved;
  - the status change is visible after cache invalidation.

*As built (S3):*
- **Platform database.** The API gets the `ab_platform` client (`PLATFORM_DATABASE_URL`), used only under `src/platform/**`. The variable is optional outside production: without it, console academy routes answer 503. Railway's `api` service needs the variable (runbook `staging-variables.md` C1).
- **Platform capabilities.** `platform.*` capabilities come only from a CONSOLE session's platform role (`PLATFORM_ROLE_GRANTS`); academy capabilities come only from memberships.
- **Owner invitation.** It has no academy sender (`invitedById` null), so the C-84 sender re-check, which covers member invites, doesn't apply. `Invitation.inviteeName` keeps the owner's name for the console and the accept form.
- **Errors.** A taken subdomain answers `409 CONFLICT` with `{ path: 'slug', issue: 'taken' }`, followed by `{ path: 'suggestions', issue: <slug> }` entries. Reserved or impersonating subdomains answer 400 `reserved`.
- **Audit.** Status changes, subdomain changes, resends and console *views* are recorded on the academy's own audit trail, with the platform-staff actor.
- **Backfill.** The migration `tenant_lifecycle` gives academies created before Phase 3 (staging's demo academies) a Trial subscription and an onboarding state. The staging bootstrap creates both for new academies.

### S4 `p3/console-ui` — Provisioning Console (C-02, UX §21, v1.1 §2–3, §9)

**3.10 Console shell and Academies list:**
- Console variant of `AppShell` (Deep Ink chrome, desktop-first, read-only on phones) with nav **Academies** only.
- `/academies`: search, status filter, calm table with status badges, empty state that leads to "Create academy", loading and error states.
- `/` redirects to `/academies`. **Removes `p2-console-home`.**

**3.11 Create Academy and Provisioning Success:**
- `/academies/new` is a guided form:
  - fields: name; type; slug pre-filled from the name with debounced live availability, reasons and suggestions; owner name and email; plan (Trial default); optional initial branch;
  - "Create academy" uses an idempotency key per form.
- `/academies/[id]/created` is the premium activation moment:
  - large URL, Copy URL, Open Academy;
  - owner invite status, plan and trial end, onboarding progress.

**3.12 Academy detail:**
- `/academies/[id]/overview`: status, owner, plan, onboarding, suspend / reactivate / activate / archive dialogs with consequence copy and a required reason, resend owner invite.
- `/academies/[id]/domain`: primary URL, redirecting addresses, change subdomain with live availability and a "the old address will redirect" warning.
- Strings in a new `console` i18n namespace; axe in both themes; added to the pseudo-locale pages.

*As built (S4):*
- **Routes** (console host): `/academies`, `/academies/new`, `/academies/[id]/created`, `/academies/[id]/overview`, `/academies/[id]/domain`. Console `/` goes to `/academies` for staff and to `/login` otherwise. **`p2-console-home` is removed**, together with its placeholder strings.
- **Strings.** The console's signed-in pages pass only the `console` namespace to the client through `NextIntlClientProvider`, so console forms use `useTranslations`. The console has no route budget (desktop staff, UX §21); academy and teacher pages keep server-passed labels (C-94).
- **Deep Ink sidebar.** `AppShell chrome="ink"` puts the dark-scheme attribute on the sidebar. To make text follow it, `Text` now uses the `ab.*` roles (CSS variables) instead of MUI's resolved colours; the same values apply on every other page.
- **Phones.** Console pages work on phones (read-mostly); Sign out moves to the top bar there, because phones have no sidebar.
- **Live address field.** It checks availability 400 ms after the last keystroke, announces the result to screen readers, and offers the free alternatives. The server checks again on create.
- **E2E.** `console.spec.ts` (desktop): create with reserved, taken and available addresses → activation screen → list search → suspend (the academy shows its unavailable page) → reactivate → change address (old address 301s); axe in light and dark. The E2E web server turns the proxy's context cache off, so console changes show at once.

### S5 `p3/onboarding-api` — onboarding and minimal create commands (flag `p3-onboarding`)

**3.13 Onboarding state** (`modules/onboarding`, `academy.onboarding.manage`, `@TenantHost('SETUP','ACTIVE')`, behind `LegalGuard`):
- `GET /onboarding` returns steps, status, current step, and the records created so far.
- `PUT /onboarding/steps/:step`: `{action: 'save' | 'skip', data}`, `version` (optimistic concurrency), idempotent.
- `POST /onboarding/complete`, which follows C-87, invalidates the cache, and emits analytics.
- Profile updates `Tenant` and `TenantSettings.contact` (timezone and currency stay `Asia/Kolkata`/`INR`, editable).
- Type applies the terminology template.

**3.14 Minimal create commands** (C-92):
- `PeopleService.createTeacher`: "me" links the owner's membership; "invite" uses `InvitationsService.create` with the teacher role.
- `PeopleService.createStudents`: bulk of up to 20, optional parent name and phone, admission numbers from `TenantSequence`, **`@Limit('students')`**. Parents aren't invited or activated, so no consent is needed yet.
- `SchedulingService.createCourse`.
- `SchedulingService.createBatch`: course, teacher, capacity, enrols the students from the step.
- `SchedulingService.createWeeklySlots`: `ScheduleRule`s plus 14 days of `ClassSession`s in the academy's timezone, DST-safe through Intl/Temporal-style helpers.
- Each step reuses its records when it is saved again (`refIds`), so going back and forth never duplicates.
- Analytics: `onboarding.step_completed{step}`, `onboarding.completed`, `student.created{source:'onboarding'}`, `batch.created`, `session.generated{count}`.

**3.15 SETUP routing (web, C-85) and tests:**
- `decideRoute` lets the allowed paths through on SETUP hosts when `p3-onboarding` is on; with the flag off, behaviour is exactly as today.
- After sign-in, the owner home on SETUP is legal → welcome → current step.
- **Tests:**
  - resume after sign-out at every step; continue on a second device (a new session sees the same step);
  - a stale `version` → 409; a teacher → 403;
  - **the cross-tenant registry covers every new route**; tenant B can't read A's onboarding;
  - session generation is idempotent and timezone-correct;
  - the student cap is enforced.

*As built (S5):*
- **Modules.** `modules/people` and `modules/scheduling` hold the commands; `modules/onboarding` orchestrates them. Each module has an `index.ts` with its public interface (lint boundary). `InvitationsService` is reused for the invited teacher, and accepting that invitation links the Teacher profile.
- **Teacher invite.** The invitation is created just before the step's transaction (it has its own); re-saving with the same email keeps it, and switching away revokes it.
- **Students.** The `students` limit counter moved into core/entitlements (active and on-hold students). Quick-added parents are `GUARDIAN` links until edited in Phase 4. Students removed in onboarding are kept as `LEFT`.
- **Timetable.** Rules store local minutes. Sessions are computed with `zonedInstant` in the academy's timezone, which is DST-safe and tested with Kolkata, New York and London. Slots that have already started today aren't created.
- **Completing.** It calls the SQL function `ab_activate_current_tenant()` (`040-onboarding.sql`, SECURITY DEFINER, SETUP → ACTIVE for the current academy only), because tenant code still can't write `tenant.status`. If the console already activated the academy, it stays ACTIVE.
- **Web.** `p3-onboarding` (off everywhere until S7/S8) makes SETUP hosts serve `/login`, `/invite`, `/forgot-password`, `/reset-password`, `/legal`, `/welcome` and `/onboarding/*`. Everything else goes to `/setup-gate`: the owner → `/welcome`, signed out → "I run this academy — sign in", other staff → "getting ready". The proxy asks for the flag only for SETUP academies.
- **Not done.** The re-acceptance prompt for owners of ACTIVE academies when a legal version changes moves to S7 (web).

### S6 `p3/media-branding` — storage, Settings → Academy, Branding & Domain

**3.16 Media storage** (C-93, ADR-021 subset):
- `packages/database` gets a `MediaFile` table.
- `apps/api/src/core/media/` holds the `MediaStoragePort` and the `S3MediaAdapter` (SeaweedFS locally, R2 on staging/production, C-97).
- Config: `MEDIA_PROVIDER`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`. Production refuses the S3 dev adapter.
- `POST /academy/branding/{logo,favicon}-upload` returns an upload token.
- `POST /academy/branding/{logo,favicon}/confirm` checks header bytes and size, then sets `logoMediaId`.
- Keys look like `/t/<tenantId>/branding/<uuid>.<ext>`. The public URL is built at read time and added to `GET /tenant/context` as `branding.logoUrl`.
- Runbook rows for the R2 variables on Railway (C-97).
- **Tests:** a wrong type, an oversized file or a spoofed mime is refused; another academy's media id → 404; with the adapter missing, the error says uploads are unavailable.

**3.17 Settings pages** (UX v1.1 §6, V1.2 §5):
- `/settings/academy`: name, contact, timezone, currency; `GET/PATCH /academy/settings` with `version`.
- `/settings/branding`: logo, favicon, primary colour with a live preview of login tile, shell and parent card, a contrast check in **both themes** before saving, the subdomain shown read-only with "Copy URL", and the public-profile toggle (stored only); `PATCH /academy/branding`.
- Native file and colour inputs styled in `@academybee/ui` (new `FileDrop` and `ColorField`, both light).
- New nav icon keys; capability `academy.settings.read` / `academy.branding.manage`.
- The pages are added to `perf:budget` and must fit within 200 KB. Their actions load on first use, as `/settings/security` does.

**3.18 Logo everywhere:**
- `AcademyIdentity` shows the uploaded logo in the shell, sign-in screens and status pages.
- PWA and favicon routes use the uploaded favicon or logo, falling back to the monogram.
- E2E: upload a logo locally, and it appears on the login screen.

### S7 `p3/onboarding-ui` — onboarding screens (flag `p3-onboarding`)

**3.19 Legal and Welcome:**
- Onboarding layout **outside the Manage shell**: lean, phone-first, academy identity, a progress bar with step names that is not colour-only.
- `/legal`: Terms, Privacy and DPA summaries with links and a single "I accept" (re-accept on a version change).
- `/welcome`: logo or name, warm copy, progress, estimated time, Continue Setup / Resume later.

**3.20 Steps Profile, Type, Course and Teacher:**
- `Stepper`/`StepFrame` components in `@academybee/ui`: Back, Save & continue, and Skip where allowed; touch targets ≥ 48 px.
- Profile includes the logo upload from S6.
- Type uses large cards with terminology previews.

**3.21 Steps Batch, Students, Timetable and Ready:**
- Students: quick multi-add rows, optional parent contact, limit message.
- Timetable: weekday chips and time pickers, with a preview of the next sessions.
- Ready: checklist, and "Take first attendance" (an honest disabled state until Phase 6, which wires it).

All pages have loading, error and offline states (online-only actions are disabled with a reason). Strings go in an `onboarding` namespace, the pages are added to the perf budget and pseudo-locale lists, and axe runs in both themes.

### S8 `p3/journey-e2e` — journey, flag removal, docs

**3.22 Journey E2E** (`e2e/specs/provisioning.spec.ts`, `onboarding.spec.ts`):
1. A console admin (TOTP) creates "Gurushethra" (Bharatanatyam).
2. `admin` and `www` are refused live.
3. The success screen shows `gurushethra.localhost:3000` with Copy and Open.
4. The Mailpit owner invite is accepted, then the Terms.
5. Welcome → every step, with a reload and a second browser context mid-way to prove resume.
6. Ready → the tenant is ACTIVE.
7. Suspend → Suspended page and sign-in refused; reactivate.
8. Change the subdomain → the old URL returns 301.

The journey runs on desktop and on the Android and iPhone projects for the owner steps. Also: an axe pass and pseudo-locale on all new pages.

**3.23 Flags and docs:**
- Turn `p3-onboarding` on in every environment, and remove it once staging is verified (within this phase).
- Update ARCHITECTURE §5.3 (as built, C-86), §8.3, §9.3, §10.3 and §14.
- Update CLAUDE.md §3 and §8 (console URLs, demo logins), the README, and `docs/runbooks/staging-variables.md` (R2).
- Plan status.

| Slice | Branch | Tasks | Release flags |
| --- | --- | --- | --- |
| S1 | `p3/plans-legal` | 3.1–3.3 | — |
| S2 | `p3/people-scheduling-schema` | 3.4–3.6 | — |
| S3 | `p3/provisioning-api` | 3.7–3.9 | — |
| S4 | `p3/console-ui` | 3.10–3.12 | removes `p2-console-home` |
| S5 | `p3/onboarding-api` | 3.13–3.15 | adds `p3-onboarding` (off in staging/prod) |
| S6 | `p3/media-branding` | 3.16–3.18 | — (pages complete when merged) |
| S7 | `p3/onboarding-ui` | 3.19–3.21 | `p3-onboarding` |
| S8 | `p3/journey-e2e` | 3.22–3.23 | removes `p3-onboarding` |

## Dependencies and gaps

- **Uses Phases 0–2:**
  - tenant guard and host policies, tenant-bound client and RLS, `TenantContext`;
  - `@Idempotent` (lease and fencing), `AuditService`, `OutboxService`, `EmailService`, `AnalyticsService`;
  - `@Can` and scope policies, invitations accept, console sessions with TOTP;
  - cross-tenant registry, i18n, flags, `AppShell`/`PermissionState`/`Sheet`, E2E helpers (`createConsoleAdmin`, `waitForEmail`, `totpCode`).
- **Missing from earlier phases, added here:**
  - a Nest provider for the platform client;
  - an email path that doesn't need an academy host;
  - the slug impersonation list;
  - host-cache invalidation callers;
  - web SETUP routing;
  - refusing sessions on SUSPENDED academies;
  - stepper, file and colour components;
  - any storage code.
- **Later phases (noted, not built):**
  - full Student/Parent/Teacher workspaces, import and the consent flow (4);
  - timetable editor and session job (5);
  - "Take first attendance" (6);
  - Fee Setup step (7);
  - public profile page (8);
  - self-serve signup (13);
  - console users, plans UI, overrides UI, impersonation, un-archive (14);
  - owner sign-in on SUSPENDED for billing and export (13/15);
  - custom domains (later, C-95).

## Risks

| Risk | Mitigation |
| --- | --- |
| **Route JS budget** (the shell is ≈198 of 200 KB) for the Settings pages | Native inputs, actions loaded on use, no new libraries (C-94). Onboarding sits outside the shell. If a page is still over, a small shell-diet task comes first; I come back to you before raising any budget. |
| Large expand-only schema (≈20 tables) designed before its full UI | Follows ARCH §8.3/8.4 and G-05 exactly. Columns are nullable or defaulted, so Phases 4–5 only add to them. Constraint and RLS tests land with the schema. |
| R2 bucket and token not ready when S6 merges | Uploads on staging turn off with a clear message. Local, CI and E2E use SeaweedFS. I'll tell you the exact 3 variables to add in Railway. |
| Provisioning touches platform and tenant tables in one transaction | Platform client only under `src/platform`, every call audited, a rollback test, and the same transaction shape as the proven `bootstrap-staging`. |
| Timezone and DST bugs in session generation | Dates in the academy's timezone, instants in UTC. Unit tests cover IST, a DST timezone and month boundaries. |
| Real legal text isn't ready | Draft versions are seeded now. Publishing a new version prompts re-acceptance, so the real text drops in without code changes (needed before the pilot). |
| Console on a phone | Desktop-first, phone read-only (UX §21). Your phone checklist covers the academy side. |

## How I'll prove the exit gate (P3-3)

| Gate item | Evidence |
| --- | --- |
| Provisioning idempotency, concurrent slug, reserved/invalid, rollback, audit | `provisioning.int.spec.ts` |
| Entitlement guards | `entitlements.spec.ts` (unit) and `entitlements.int.spec.ts` |
| Onboarding resume, second device, tenant isolation | `onboarding.int.spec.ts`; cross-tenant registry has every new route |
| Suspend/archive refuse sessions; subdomain change redirects; status visible quickly | `console-tenants.int.spec.ts`, `sessions.int.spec.ts` additions, `routing.spec.ts` |
| RLS on all new tables; drift clean | `rls-coverage.int.spec.ts`, `tenant-isolation.int.spec.ts`, `pnpm db:drift` |
| Critical journey E2E (Gurushethra → … → Suspended page) on desktop and phones | `provisioning.spec.ts`, `onboarding.spec.ts`, screenshots in `e2e/artifacts/` |
| UI states, a11y, i18n, budgets | axe light and dark on every new page, `i18n-pseudo.spec.ts`, `pnpm perf:budget` (new routes added), Lighthouse in CI |
| Common gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm i18n:check && pnpm flags:check && pnpm db:drift` |
| Staging | Gurushethra created on `console.staging…`, owner onboarding on your phone, logo stored in R2, suspend and subdomain change verified |

**Your inputs before S6:** a Cloudflare R2 bucket, an API token and a public domain for media (I'll give the exact steps, C-97). **Before the pilot:** real Terms, Privacy and DPA text (drafts are fine for now).

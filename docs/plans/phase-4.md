# P4-1 · Phase 4 — Students + Parents + Teachers: plan

> **Approved by the PO on 2026-10-10** (`phase-4-start` = `7b89578`). Decisions C-99…C-108 recorded in DECISIONS.md.

## Context

- **Predecessor:** Phase 3 ✅ 2026-10-09 (tag `phase-3`), so Phase 4 can start.
- **Goal:** students, parents and teachers are managed through workspaces (list → Student 360), not CRUD tables:
  - real spreadsheets import cleanly;
  - medical notes are restricted;
  - parents can be invited, with consent enforced;
  - the academy side of the Family Hub (Join QR, Join requests, link API) is ready for 7P.
- **Refs read:**
  - CLAUDE.md; IMPLEMENTATION_PLAN §1, §2 and Phase 4
  - PRD v3.2 G-02, G-05, G-06, G-26, G-27, G-31; PRD v3.1 §5, §9, §17
  - UX §8–11.4, §24–25
  - ARCHITECTURE §7, §8
  - ADR-026, ADR-027, ADR-034, ADR-036, ADR-039; C-12, C-22, C-37, C-67, C-72, C-73, C-90, C-92, C-94, C-97, C-98
  - EXECUTION_GUIDE Part F Phase 4
- **Phase 3 exit notes say: shell diet first.** Shell pages are at 196–199 KB of the 200 KB route budget.

### What exists (from Phases 2–3)

| Area | Today | Phase 4 change |
| --- | --- | --- |
| People schema | `Student` (G-05 fields, `archivedAt`, `version`), `StudentHealthNote` (C-90, nothing reads it yet), `Parent`, `ParentStudent`, `Teacher`, `ConsentRecord` (append-only), `CustomFieldDefinition`, `TenantSequence`. **No trigram index, no `pg_trgm`.** | Add `ActivityEvent`, `ImportJob`, `JoinRequest`, `AcademyLinkAttempt`, `Teacher.subjects`, `Invitation.parentId`; `pg_trgm` + GIN indexes |
| People API | `PeopleService` has only onboarding commands (teacher for member, invited teacher, quick students) | Full Students / Parents / Teachers / health / consent / custom-field endpoints over the same service, plus `people.policy.ts` |
| Team & Roles | **Already built in Phase 2** (C-67): members, invite staff, change role, disable with session revocation, last-owner protection | Only linking a team member to a Teacher profile, and Teacher invite from Teachers |
| Capabilities | `student.*`, `parent.*`, `teacher.*` granted per role. No health, import or consent capabilities. `ensureSystemRoles` only runs at provisioning. | New capabilities; system role grants synced for **existing** academies at deploy |
| Family Hub | HUB sessions, handoff, `$listOwnMemberships`, hub placeholder (flag `p1-hub-placeholder`, off on staging). QR SVG helper in `@academybee/auth` (C-73). | Academy side + link/verify/join-request API; hub screens stay in 7P |
| Media | Public bucket (logos) on R2; adapter designed for `putPrivate`/`signedGet` on `MEDIA_PRIVATE_BUCKET` (C-97) | Private uploads (student photos, import files) with presigned GETs ≤ 5 min |
| Worker | Outbox relay, email, analytics; **no tenant data access** | No change (see C-100) |
| Web | Manage nav: Today, Team, Settings, Security. Plain-anchor shell (C-72), `Sheet`/`FormDialog`/`ConfirmDialog`/toast in `@academybee/ui`. Baseline ≈ 128 KB framework + ≈ 50 KB MUI/theme + 7.5 KB Serwist registration. | Students, Student 360, Teachers, Join requests, new Settings tabs, command palette, Global Add |

## Decisions (C-99…C-108, safe defaults recorded in S1)

| ID | Question | Default |
| --- | --- | --- |
| **C-99** | No room in the route budget for Phase 4 screens | **Shell diet first** (S1). Target ≥ 10 KB free on shell pages (≤ 186 KB) and ≥ 6 KB on setup pages. Means: load Serwist registration after page load; replace MUI `Button`/`CssBaseline` in the shell and frames with `ButtonBase` and static CSS; load the palette, Global Add and drawers on first use. **No budget raise.** If the target can't be reached, I come back to you first. |
| **C-100** | Where the import job runs. ADR-036 says "worker", but the worker has no tenant data access, and the student-creation rules (admission numbers, parent dedupe, plan limit) live in the API's `people` module. | Import runs as a **BullMQ job consumed inside the API process** (`modules/people/import`, concurrency 1 per instance). Tenant context, the job's state and the creator's capability are re-checked in the processor, and the job reuses `PeopleService`, so there is no duplicated domain code and no new infrastructure. Phase 15 can move it to a dedicated process by running the API image in a jobs-only mode. |
| **C-101** | Import file formats and safety | CSV via `papaparse`; XLSX via `exceljs`, read as a stream. The npm `xlsx` (SheetJS 0.18) has open CVEs, and newer versions are only on SheetJS's own CDN. Limits: 5 MB, 2,000 rows, first sheet only, uncompressed size checked against zip bombs. Formulas are read as values. The error report escapes leading `= + - @` against CSV injection. Files go to the **private** bucket and are deleted after 7 days. |
| **C-102** | "Parent invite with consent capture" when the parent's own screens arrive in 7P (your checklist says so) | In Phase 4 the invite is real: an `Invitation` for the `parent` role linked to the `Parent` record, and an email with a hub link (`app.…/invite#token=…`, fragment per C-83). Links are valid 30 days and can be re-sent from Student 360. **Accepting and consenting happen on the hub in 7P.** No account is created for someone who hasn't accepted (data minimisation; refines the plan's "account created now"). Activation is enforced in code now: **a parent membership can't become ACTIVE without a current consent from that parent** (G-06). |
| **C-103** | Consent recorded by staff (paper admission forms, G-06 "optionally on admission forms") | Staff with `parent.manage` can record or withdraw consent on Student 360 (channel `PAPER`/`ACADEMY_STAFF`, purposes, notice version). It shows in the consent history. **It does not activate a parent account:** activation needs the parent's own consent on the hub (`FAMILY_HUB`), which is the safer reading of verifiable parental consent. |
| **C-104** | Capabilities that are missing | Add `student.health.read` (owner TENANT, admin BRANCH, teacher ASSIGNED), `student.health.manage` (owner, admin) and `student.import` (owner, admin). Consent and Join requests use `parent.manage` (ADR-039). Custom fields use `academy.settings.manage`. A deploy step syncs system role grants into every existing academy (add-only, never removes custom edits). |
| **C-105** | Search (ADR-026) | Enable `pg_trgm` (a trusted extension, created by the migrator). GIN trigram indexes on student, parent and teacher names; prefix match on admission number and phone digits. `GET /search?q=` needs ≥ 2 characters, returns up to 5 per type and is scope-aware through the same policies as the lists. Batches join the palette in Phase 5. |
| **C-106** | Parents in the UI | UX §8 has no Parents entry. Parents live in Student 360 (a parent sheet showing all their children), the command palette and Global Add. **Dedupe:** creating a parent whose phone or email matches one in this academy offers "Use existing" (no automatic merge). Import dedupes the same way. A merge tool for two existing parents goes to the backlog (Phase 12 data tools). |
| **C-107** | Family Hub linking before the hub exists | APIs only (hub UI in 7P), following ADR-039. **Codes go to email only until Phase 10** (phone OTP). A code is 6 digits, valid 10 minutes, with 5 attempts. `link/start` always answers 202 with the same body. Rate limits per user, IP and academy. `AcademyLinkAttempt` is **user-owned** (RLS `user_id = app.user_id`, never readable by academies); `JoinRequest` is tenant-owned. Verify or approve creates the parent membership as `INVITED`, and it becomes ACTIVE only with hub consent (C-102). A local/staging CLI `pnpm hub:join-request` creates a join request through the real API (for your checklist). |
| **C-108** | Archive / restore / Undo (G-26) and status changes (G-27) | Archive sets `archivedAt`; archived students leave lists and search (an "Archived" filter shows them) and can be restored for **90 days**. After that they stay archived and read-only (erasure is Phase 15). **Undo** (an 8-second toast, a compensating command that checks `version`) covers archive, status change and parent unlink. Status changes need a reason and show the schedule consequence (active enrolments). The fee consequence is added in Phase 7. |

Also recorded:
- **C-94 stays:** no React Hook Form or TanStack Query in Phase 4 (budget).
- **New dependencies:** `@tanstack/react-virtual` for the Students list only, `papaparse`, `exceljs` (API only).
- **Student photo:** private bucket, presigned URL ≤ 5 min, every view audited (C-97).

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + relevant tests → Conventional Commit.
Each slice: branch `p4/<slice>` from the latest `main` → PR with the DoD checklist → merge only after every check passes on the PR's head (C-43, never `--auto`).

### S1 `p4/shell-diet` — plan, decisions, budget room

- **4.1 Docs:**
  - `docs/plans/phase-4.md`;
  - IMPLEMENTATION_PLAN: Phase 4 🟨 plus the slice table;
  - DECISIONS C-99…C-108.
- **4.2 Shell diet (C-99):**
  - Serwist registration and PWA prompts become lazy after `load`;
  - shell, platform frame and setup frame use `ButtonBase` and static CSS instead of MUI `Button`/`CssBaseline`;
  - measure each change with `perf:budget`, and record before/after in the plan.
  - **Tests:** existing E2E (shell, PWA install prompt, offline page), axe light/dark, budget.
- **4.3 Capabilities:**
  - C-104 capabilities added to `packages/contracts/src/roles.ts`/`permissions.ts`;
  - `syncSystemRoleGrants()` in `packages/database/src/reference.ts`, called from `applySqlFolder` at deploy;
  - unit tests on the role matrix; an integration test that an existing academy gains the new grants and keeps custom ones.

*As built (S1):*
- **Shell diet (C-99), measured with `perf:budget`:**

  | Route | Before | After |
  | --- | --- | --- |
  | `/today`, `/teach`, `/more` | 196.4 | **180.8** |
  | `/settings/academy`, `/settings/branding` | 196.8 | 181.3 |
  | `/settings/security` | 197.0 | 191.9 |
  | `/login` | 197.7 | 192.7 |
  | `/legal` | 198.9 | 193.9 |
  | `/onboarding/[step]` | 199.0 | 194.1 |

  - The service worker registers from the lazy PWA prompts after page load (`components/service-worker.ts`; `SerwistProvider` removed): −2.1 KB on every route.
  - The root `error.tsx` / `global-error.tsx` load their UI (and the catalogue JSON) only when an error happens: −3 KB.
  - Empty / error / permission state actions, sign-out, shell nav and the theme toggle use native controls (`PlainButton`, `plainControl` in `@academybee/ui`), so MUI's button code (≈ 10.7 KB) loads only on pages with forms.
  - **Tried and dropped:** moving `ToastProvider` into its own module added ≈ 6–17 KB, because the page needs `feedback` anyway and Turbopack duplicated the shared code into an extra chunk.
- **Capabilities (C-104):** `student.health.read`, `student.health.manage`, `student.import` in the catalogue and templates. `syncSystemRoleGrants()` runs with the reference data on every deploy: it adds missing template grants to every academy's system roles (add-only) and bumps `permissions_version` for affected members. Tested in `packages/database/test/role-grants.int.spec.ts`.

### S2 `p4/people-api` — Students, parents, health, consent, custom fields (API)

- **4.4 Migration** `…_people_workspaces` (expand-only):
  - `CREATE EXTENSION pg_trgm`;
  - GIN trigram indexes;
  - `ActivityEvent` (tenantId, entityType, entityId, type, actorMembershipId, data JSON without sensitive fields, at; index `(tenantId, entityType, entityId, at DESC)`);
  - `Teacher.subjects`; `Invitation.parentId`;
  - RLS via `010` automatically; `rls-coverage` extended.
- **4.5 Policy and Students API:**
  - `modules/people/people.policy.ts` (TENANT/BRANCH/ASSIGNED/LINKED/SELF → `where` + `can()`; ASSIGNED = active enrolment in a batch where the member's Teacher is a `BatchTeacher`).
  - Endpoints:
    - `GET /students` (keyset; filters status/batch/course/archived; search);
    - `GET /students/:id`;
    - `POST /students` (`@Idempotent`, `@Limit('students')`, admission number from `TenantSequence`);
    - `PATCH /students/:id` (`version`, custom fields validated against definitions);
    - `POST /students/:id/status` (reason; returns the consequences);
    - `POST /students/:id/archive` and `/restore` (90 days).
  - An `ActivityService` writes events in the same transaction.
- **4.6 Parents API:**
  - `POST /students/:id/parents` (new or existing parent; relationship, primary contact, pickup);
  - `DELETE /students/:id/parents/:linkId` (unlink, history kept as an activity event);
  - `GET /parents/:id` (with their children in scope);
  - `PATCH /parents/:id`;
  - `GET /parents/duplicates?phone|email` (suggestion, C-106).
- **4.7 Health, consent, custom fields:**
  - `GET /students/:id/health-note` (`student.health.read`, **every read audited**, never in other responses);
  - `PUT /students/:id/health-note` (`version`);
  - `GET /students/:id/consents`;
  - `POST /students/:id/consents` (staff record/withdraw, C-103);
  - `GET/POST/PATCH /settings/custom-fields` (≤ 10, typed, archive instead of delete);
  - `GET /students/:id/activity` (keyset).
- **Tests:**
  - scope policies: receptionist create/update, accountant read-only, teacher only assigned students, parent/student denied on staff routes, out of scope → 404;
  - IDOR on `/students/:id` across academies and scopes; the many-to-many links;
  - the health note is hidden from receptionist and accountant, and reads are audited; it never appears in student responses;
  - plan limit; archive keeps history; restore window; version conflicts;
  - **every route in the cross-tenant registry.**

*As built (S2):*
- **Migration** `20261010090000_people_workspaces`: `pg_trgm`; GIN trigram indexes on student, parent and teacher names; `(tenant_id, full_name, id)` for the name-ordered keyset; `activity_event` (append-only for `ab_app`, like the audit log); `teacher.subjects`; `invitation.parent_id`.
- **API** (`modules/people`):
  - `people.policy.ts`: lists and single records both use `where`.
  - Students: `GET/POST /students`, `GET/PATCH /students/:id`, `/status`, `/archive`, `/restore`, `/activity`.
  - Parents: `POST /students/:id/parents`, `PATCH/DELETE …/parents/:linkId`, `GET/PATCH /parents/:id`, `/parents/:id/activity`, `GET /parents/duplicates`.
  - Restricted records: `GET/PUT /students/:id/health-note` (every read audited, even when there is no note), `GET/POST /students/:id/consents`.
  - Custom fields: `GET/POST/PATCH /custom-fields`.
- **Details:**
  - Only holders of `student.health.read` learn that a note exists (`hasHealthNote`).
  - The first parent becomes the primary contact; unlinking moves the flag.
  - Moving back into a seat (restore, or status → ACTIVE/ON_HOLD) checks the student limit.
  - Consent records carry the version of the new `ACADEMY_PRIVACY_TEMPLATE` legal document (draft).
  - `OWNER_LEGAL_DOCUMENTS` is what owners accept.
  - Analytics: `student.created{source}`, `student.status_changed`, `student.archived`, `student.restored`, `parent.linked`, `consent.recorded`.
- **Tests:** `students.int.spec.ts` (14), `people.policy.spec.ts`; 22 routes in the cross-tenant registry. API integration 619 → 816.

### S3 `p4/students-ui` — Students, Student 360, Add Student (flag `p4-people`)

- **4.8 Students list** (`/students`):
  - server-rendered first page, client search (debounced, trigram) and filters, keyset "load more" with `@tanstack/react-virtual`;
  - rows: name, admission number, status (text + icon), primary parent;
  - states: empty → Add student / Import, skeleton, error, permission;
  - added to `perf:budget`.
- **4.9 Add Student drawer and Global Add:**
  - the drawer has the minimum fields, an optional parent with the duplicate suggestion, and the custom fields;
  - a "+ Add" shell button opens a lazy menu (Student, Parent, Teacher as their slices land).
- **4.10 Student 360** (`/students/[id]`):
  - header (name, status, primary actions per UX §10: Message/Collect appear in later phases, so only built actions show);
  - **Overview**: profile, parents, custom fields, health note (only for holders, "Show" button → audited read), consent history plus "Record consent", enrolments read-only;
  - **Activity** tab;
  - edit sheet; status change with consequences; archive/restore with Undo toast;
  - photo upload (private, C-97).
- **4.11 Parent sheet and links:**
  - add/link a parent to a student, edit relationship/primary/pickup, unlink with Undo;
  - the parent sheet lists all their children.
- **4.12 Settings → Custom fields** (new Settings tab): create, reorder, archive (≤ 10).
- **Nav:** RUN group gets Students (bottom bar: Today • Students • More, UX §25) behind `p4-people`.
- **Tests:**
  - E2E: add a student with two parents → Student 360 shows both; add a second child to the same parent; receptionist sees no medical note; archive → restore; Undo;
  - axe light/dark; pseudo-locale and 40 % text.

*As built (S3):*
- **Screens** (flag `p4-people`):
  - `/students`: search as you type, status and archived filters, show more, a virtualised list over 120 rows.
  - `/students/[id]` (Student 360):
    - **Overview** is server-rendered: profile, custom fields, classes, parents, medical notes (shown on request, every view audited), consent history plus "Record consent".
    - **Activity** tab.
  - `/settings/custom-fields`, a new Settings tab.
  - Global Add (`+ Add`) in the shell top bar: a native `<details>` menu with no JS.
- **Interactive parts** load as their own chunks (`students-lazy.tsx`): the browser, Add Student, the 360 actions, parent actions, the health note, consent and the field editor.
- **Budget:** `/students` 181.8, `/students/[id]` 185.1, `/settings/custom-fields` 181.8 KB gz.
- **UI kit:** native `SelectInput` / `DateInput` / `TextAreaInput`; toasts take an action (Undo stays 8 s); `EmptyState` action is optional.
- **Navigation:** RUN → Students; the phone bottom bar is Today • Students • More (UX §25).
- **Seeds:** demo-a has 30 students (siblings share a parent), a medical note on Aarav and a Board custom field.
- **Fixes found while testing:**
  - API keep-alive raised to 65 s: the web proxy's "socket hang up" was a reused socket the API had just closed.
  - `pg_trgm` is created by the deploy's admin step: staging's migrator may not, so the deploy of #68 failed and is repaired here (C-105).
- **E2E:** `students.spec.ts`, on desktop, Android and iPhone: search, add with two parents, sibling reuses a parent, medical notes for receptionist vs owner, archive with Undo, axe in dark mode. Pseudo-locale covers Student 360 and Custom fields.

### S4 `p4/teachers-search` — Teachers, command palette

- **4.13 Teachers:**
  - API: `GET /teachers`, `GET /teachers/:id`, `POST /teachers` (name only / invite as member with the teacher role via `InvitationsService`, reusing the Phase 3 link on accept / link an existing team member), `PATCH /teachers/:id` (subjects, contact, status, `version`), `GET /teachers/:id/activity`;
  - UI: `/teachers` list and a profile workspace (Overview: contact, subjects, member/invite status, batches read-only; Activity), Add Teacher in Global Add.
- **4.14 Search and palette:**
  - `GET /search` (C-105);
  - Cmd/Ctrl+K and a shell search button load the palette lazily: results per type, quick actions (Add student, Add teacher, Import), keyboard and screen-reader complete.
  - **Tests:** scope-aware results (a teacher finds only assigned students); no cross-tenant results; local benchmark with **50K seeded students, p95 < 300 ms** (`pnpm db:seed:perf` + `scripts/perf/search-bench.mjs`); E2E finds a student by a partial name.

*As built (S4):*
- **Teachers API:**
  - `GET/POST /teachers`, `GET/PATCH /teachers/:id`, `/teachers/:id/activity`, `GET /teachers/linkable-members`.
  - Add by name, by email invitation (teacher role; the invite is revoked if the profile can't be saved; the profile links on accept) or from the team.
  - Scope policy: TENANT / BRANCH / SELF. Archive and restore via `status`, audited.
- **Search API:** `GET /search?q=` (signed-in; each type through its own scope policy, ≤ 5 each, archived students left out).
  - **Deviation from the plan:** no `search.used` analytics event. Search runs as people type, and each event is an outbox write.
- **Screens** (flag `p4-people`):
  - `/teachers`: server-rendered with a GET search and Current / Archived.
  - `/teachers/[id]`: Overview and Activity, edit, archive/restore.
  - Add Teacher sheet.
  - **Command palette:** Search button in the top bar plus Ctrl/⌘ + K. The trigger is tiny; the dialog is a native `<dialog>` with combobox and arrow keys, loaded on first use, with quick actions.
  - Global Add now has Student, Parent (opens Students with "open the child, then Add parent", C-106) and Teacher.
  - RUN nav gets Teachers.
- **Budget:** `/teachers` 185.5, `/students/[id]` 185.8, `/today` 181.8 KB gz.
- **Benchmark:** `pnpm db:seed:perf` (50,000 students with parents in demo-b, local/CI only) and `pnpm perf:search`. **p95 150 ms** for `/search` and **148 ms** for `/students?q=` (p50 ≈ 75 ms), against the 300 ms budget.
- **Tests:**
  - `teachers.int.spec.ts` (4): modes, versions and audit, scopes, search scope and cross-academy. 7 routes in the cross-tenant registry. API integration 885.
  - E2E `teachers.spec.ts`: add/edit/archive/restore, Ctrl+K → Student 360, palette on phones, axe.
  - Pseudo-locale covers the teacher profile; the pseudo spec uses its own client IP.

### S5 `p4/import` — Import students & parents (G-02, ADR-036)

> **Needs from you before this slice:** the anonymised pilot spreadsheet (A10) in `e2e/fixtures/`, and the private R2 bucket (below).

- **4.15 Private media:**
  - `S3MediaAdapter.putPrivate`/`signedGet` (≤ 5 min) on `MEDIA_PRIVATE_BUCKET`;
  - config refuses to start if the private bucket equals the public one;
  - SeaweedFS gets a second local bucket;
  - runbook rows.
- **4.16 Import pipeline:**
  - `ImportJob` table (`UPLOADED → VALIDATING → PREVIEW_READY → COMMITTING → COMPLETED | FAILED`, counts, mapping, error report key);
  - endpoints:
    - `GET /students/import/template` (CSV with the academy's custom fields);
    - `POST /students/import` (raw upload through the API, magic-byte check);
    - `PUT /students/import/:id/mapping`;
    - `GET /students/import/:id` (progress and preview);
    - `POST /students/import/:id/commit` (`@Idempotent`);
    - `GET /students/import/:id/errors.csv`;
  - an in-API BullMQ consumer (C-100) validates rows with the same Zod schemas;
  - dedupe: students by name + DOB, parents by phone/email; optional batch by name;
  - plan limit checked **before** commit with a clear message;
  - commit in chunks of 200 with row keys `importId:rowNo` (re-runs never duplicate).
- **4.17 Import UI:**
  - `/students/import` wizard: template → upload → map columns → preview (plain-language errors per row) → commit → result and error report, with progress polling;
  - onboarding Students step offers "Import from spreadsheet" (a separate setup route `/onboarding/import`, so `/onboarding/[step]` stays in budget).
- **Tests:**
  - 500 rows with 20 bad → 480 created, 20 reported with reasons; re-upload of the corrected file → no duplicates;
  - plan limit; malformed, oversized, zip-bomb and formula cells; cross-tenant job access → 404;
  - your real file imports cleanly (E2E fixture).

*As built (S5):*
- **Private media** (C-97):
  - `MediaStorage.putPrivate` / `getPrivate` / `deletePrivate` / `signedGet` (presigned ≤ 300 s) on `MEDIA_PRIVATE_BUCKET`. Config refuses a bucket equal to the public one. Local SeaweedFS gets `academybee-private-local`, with no anonymous access.
- **Import** (G-02, ADR-036, C-100, C-101):
  - `import_job` migration.
  - API: `GET /students/import/template`, `POST /students/import` (raw body, `x-file-name`), `GET /students/import/:id`, `PUT …/mapping`, `POST …/commit`, `GET …/errors.csv`. These routes are also open while SETUP, for onboarding.
  - Parsing: `papaparse` and `exceljs`, with the ZIP central directory checked before inflating (≤ 50 MB, ≤ 2,000 entries). Formulas are read as values. Windows-1252 CSV fallback.
  - Mapping: suggested from template headers, synonyms and custom field labels.
  - Validation: the same rules as Add Student. Duplicates are caught inside the file and against the academy (name + date of birth, else name + parent phone) → `exists`.
  - Commit: an in-API BullMQ consumer (`student-imports`, concurrency 1) re-checks the starter's `student.import` and commits in 200-row chunks. Each chunk marks its rows `created` in the same transaction.
  - Parents are reused by phone/email; batch matched by name; plan limit checked before commit and per chunk. The file is deleted after commit.
  - Error report CSV: plain-language problems, formula-safe, BOM for Excel.
- **Photos:**
  - `PUT/DELETE /students/:id/photo`, `GET /students/:id/photo` (5-minute link, audited view).
  - **Consent-gated:** a parent's latest consent must include `photos`; withdrawing it removes the photo and file (G-06).
  - Student 360 shows initials, or the photo with Add/Change/Remove.
- **UI:**
  - `/students/import` wizard: template, upload, preview with counts / mapping / problems in words, import, result and problem CSV. The job id stays in the URL.
  - Onboarding Students step: "Import from spreadsheet" → `/onboarding/import`, a separate setup route.
  - Students header gets an Import button.
- **Budget:** `/students/import` 182.1, `/onboarding/import` 179.5 KB gz.
- **Tests:**
  - `parse.spec.ts` (9); `import.int.spec.ts` (6): 500/20 → 480 + 20, corrected re-upload adds 20, XLSX + re-mapping, bad/oversize/empty files, plan limit, roles and academies.
  - `student-photo.int.spec.ts` (2). Cross-tenant registry +9 routes.
  - E2E `import.spec.ts`; the photo test in `students.spec.ts`.
  - People E2E share sign-ins between the owner and the admin (5 sign-ins a minute per account).
- **Not built here:** the pilot's own spreadsheet (A10) as an E2E fixture. It arrives with the PO; the same steps then run on it.

### S6 `p4/family-link` — Parent invites, privacy notice, Join QR, Join requests (G-06, G-31; flag `p4-family-link`)

- **4.18 Parent invites (C-102):**
  - `POST /parents/:id/invite`, plus resend and revoke;
  - worker email template `parentInvite`;
  - activation guard in `MembershipService` (parent ACTIVE only with a current hub consent) with tests;
  - Student 360 shows invite status.
- **4.19 Academy privacy notice:**
  - generated from the `ACADEMY_PRIVACY_TEMPLATE` legal document (locale variants) plus academy name, contact and purposes;
  - public `/privacy` on the academy host, linked from academy sign-in;
  - Settings → Privacy notice (preview, version);
  - `noticeVersion` is stored on consents.
- **4.20 Settings → Parent app:**
  - printable "Join us on AcademyBee" poster with a server-rendered QR of `https://app.<root>/join/<slug>` (C-73 helper, print CSS, A4);
  - the address shown for typing.
- **4.21 Link and Join requests:**
  - `JoinRequest`, `AcademyLinkAttempt` migration;
  - hub API (`/hub/academies/:slug/link/start`, `/link/verify` with consent payload, `/join-requests`; uniform responses, rate limits, per-tenant context per ADR-039);
  - academy API: `GET /join-requests`, `POST /join-requests/:id/approve` (link to student(s), creating or attaching the `Parent`), `POST /join-requests/:id/reject`;
  - **Join requests** queue page (`parent.manage`);
  - CLI `pnpm hub:join-request` (local/staging).
- **Tests:**
  - code sent only to an email the academy holds; identical responses for match / no match / unknown academy; rate limits;
  - approval links only the chosen students; every hub call runs under that academy's tenant context;
  - activation impossible without consent; cross-tenant registry.

*As built (S6):*
- **Schema:** migration `family_link`.
  - `join_request` is tenant-owned, with DELETE/TRUNCATE revoked.
  - `academy_link_attempt` carries `tenant_id` but is **user-owned**: RLS is `user_id = app.user_id`, it is left out of the tenant policy (`050-family-link.sql`), and academies can never read it.
- **Invites (C-102):**
  - `POST /parents/:id/invite` sends or re-sends (a new invite revokes the earlier open one); `POST /parents/:id/invite/revoke`.
  - Email template `parent_invite` with a hub link valid 30 days.
  - Student 360 parent cards show Family Hub access (on the hub / invited until … / not yet) with Invite, Send again and Cancel. The parent needs an email address.
  - The activation guard lives in `ParentAccessService.activate` (not `MembershipService`): ACTIVE only when the latest consent for every linked child is a `FAMILY_HUB` GRANT that includes `service`. Paper consent never activates (C-103).
- **Linking (C-107)**, hub host only:
  - `POST /hub/academies/:slug/link/start` always returns 202 `sent_if_known`, and the 6-digit code goes only to an email the academy already holds (template `link_code`, the code sealed in the outbox).
  - `POST …/link/verify` takes the code plus consent purposes (`service` required). It records the hub consent for each linked child and activates the parent.
  - `POST …/join-requests` always returns 202.
  - Limits: link 5/h per user, verify 10/h, plus per-IP and per-academy limits; join requests 5/day per user.
  - Every academy read runs inside `TenantContext.run(tenantId)` with the tenant-bound client.
- **Join requests:**
  - API: `GET /join-requests`; `POST /join-requests/:id/approve` (chosen students; an existing parent with the same phone/email, or a new one; parent membership INVITED); `POST /join-requests/:id/reject`.
  - Page `/join-requests` and a Manage nav item (`parent.manage`).
  - `pnpm hub:join-request` creates a request through the real hub API (local/staging).
- **Privacy notice (G-06):**
  - Public `GET /academy/privacy-notice` and page `/privacy` (open while SETUP too), linked from academy sign-in.
  - Settings → Privacy notice shows the version and missing-contact hints. The wording is a draft until legal review.
- **Parent app:** Settings → Parent app has a printable A4 poster with a server-rendered QR of `app.<root>/join/<slug>` (`qrcode` SVG) and the address to type.
- **Budget:** `/join-requests` 185.3, `/settings/parent-app` 181.9, `/privacy` 177.5 KB gz.
- **Tests:**
  - `family.int.spec.ts` (6): invite, resend and revoke; no enumeration; code to the held email only; verify with consent → active; approve links only the chosen students; activation refused without hub consent; public notice.
  - Cross-tenant registry: new routes added.
  - E2E `family.spec.ts`: invite email in Mailpit, poster and notice with axe, sign-in → privacy, approve a join request.

### S7 `p4/journey-e2e` — journey, flags, docs

- **4.22 E2E:**
  - exit journey: add student with two parents → Student 360 shows both → parent invite email arrives in Mailpit;
  - import journey with your file; palette;
  - Join request → approve → linked;
  - phone projects (Android, iPhone) for list and 360; axe; pseudo-locale.
- **4.23 Flags and docs:**
  - remove `p4-people` and `p4-family-link` once staging is verified;
  - ARCHITECTURE as-built notes (§7.3 matrix, §8.3, ADR-036/039 notes); CLAUDE.md §3/§8; README demo data; plan status.

*As built (S7):*
- **Exit journey** `e2e/specs/people-journey.spec.ts`, on desktop, Android and iPhone: Students from the navigation (the bottom bar on phones) → Add student with a parent (mobile + email) → Student 360 → add a second parent → both are shown, with the primary contact → invite the parent with an email (the other one says why they can't be invited) → the invitation email arrives in Mailpit with the hub link → the student is archived again. Join request → approve → linked is in `family.spec.ts` (S6); the palette is in `teachers.spec.ts` (S4); import in `import.spec.ts` (S5). The pilot spreadsheet (A10) is still to come from the PO.
- **Flags removed:** `p4-people` and `p4-family-link` (both were on in local/ci/staging), with `peopleEnabled()` / `familyLinkEnabled()` and every check that used them. Phase 4 screens are now permanent; the Join requests nav item and the Student 360 invite controls follow `parent.manage`.
- **Photo metadata (C-109):** the API strips EXIF/XMP/IPTC/comments (JPEG), text/eXIf/tIME chunks (PNG) and EXIF/XMP (WebP) before storing a student photo (`core/media/image-metadata.ts`, 4 unit tests). The browser redraws the photo upright at ≤ 800 px as a JPEG first. ARCHITECTURE had assigned this to Phase 4, and S5 had missed it.
- **Docs:** ARCHITECTURE §5.6, §7.3, §8.3 and media as-built notes; CLAUDE.md §3 and §8; README (tables fixed, Phase 4 tour); C-109.

| Slice | Branch | Tasks | Release flags |
| --- | --- | --- | --- |
| S1 | `p4/shell-diet` | 4.1–4.3 | — |
| S2 | `p4/people-api` | 4.4–4.7 | — (API only) |
| S3 | `p4/students-ui` | 4.8–4.12 | adds `p4-people` (on local/ci/staging, off production) |
| S4 | `p4/teachers-search` | 4.13–4.14 | `p4-people` |
| S5 | `p4/import` | 4.15–4.17 | `p4-people` |
| S6 | `p4/family-link` | 4.18–4.21 | adds `p4-family-link` |
| S7 | `p4/journey-e2e` | 4.22–4.23 | removes both (done) |

**Analytics (no personal data):** `student.created{source: manual|import|onboarding}`, `student.status_changed{to}`, `student.archived`, `student.restored`, `parent.linked`, `parent.invited`, `consent.recorded{channel, action}`, `import.previewed{rows, errors}`, `import.committed{created, skipped}`, `teacher.created{mode}`, `search.used{types}`, `join_request.received|approved|rejected`.

**Seeds (local/ci, C-37):** demo-a gets about 30 students with parents, consents for active parents, one health note and custom fields. `db:seed:perf` creates 50K students for the benchmark.

## Dependencies and gaps

- **Uses:**
  - tenant-bound client and RLS, `@Idempotent`, `AuditService`, outbox and email, `AnalyticsService`;
  - `@Can` + `EntitlementService` `@Limit('students')`;
  - `InvitationsService` (C-67) and the Phase 3 teacher link on accept;
  - HUB sessions + `TenantContext.run` fan-out (ADR-039), QR helper (C-73), media adapter (C-97), `TenantSequence` (C-91), cross-tenant registry.
- **Missing from earlier phases, added here:**
  - `pg_trgm`;
  - syncing role grants to existing academies;
  - private-bucket methods;
  - scope policies for people (Team has its own);
  - ActivityEvent;
  - any background job that writes tenant data.
- **Later (noted, not built):**
  - parent/hub screens, accept, consent and join UI (7P);
  - phone OTP codes (10);
  - batches in the palette, transfer, teacher's student list (5–6);
  - fee consequences of status changes and opening balances (7);
  - exports incl. custom fields (12);
  - parent merge tool (12);
  - erasure workflow (15).

## Risks

| Risk | Mitigation |
| --- | --- |
| Route budget | S1 diet before any new screen. Palette, Global Add and drawers load on first use; budget routes are added per slice. I come back to you before raising any budget. |
| `pg_trgm` not allowed for the migrator on Railway | It is a trusted extension (any user with CREATE on the database). I'll check staging at the start of S2; if it's refused, I'll give you the one-line SQL to run as the database owner. |
| Spreadsheet parsing (zip bombs, formulas, odd encodings) | Size and row limits, uncompressed-size check, values only, BOM/UTF-8 detection, CSV-injection escaping, fuzz tests. |
| Scope policy mistakes (ASSIGNED, LINKED) | One policy per resource used for lists and single records; matrix tests per role plus the cross-tenant suite. |
| Enumeration through the link API | Identical bodies and timings (dummy work), per-user/IP/academy limits, integration tests comparing responses. |
| Consent wording is legal territory | Template text is a draft; real wording with the Terms/Privacy/DPA before 7P (G-06: "confirm with legal counsel"). |
| A10 spreadsheet and private bucket not ready by S5 | S1–S4 don't need them. I'll ask when S4 merges. |

**Your inputs:**
1. **Before S5:**
   - the anonymised pilot spreadsheet (A10) in `e2e/fixtures/`;
   - a second R2 bucket, `academybees-private-staging` (APAC, **no custom domain, r2.dev off, no CORS**), added to your existing token's bucket list or given its own token. Then add `MEDIA_PRIVATE_BUCKET` on the Railway `api` service (I'll confirm exact names).
2. **Before 7P:** real consent and privacy-notice wording.

## How I'll prove the exit gate (P4-3)

| Gate item | Evidence |
| --- | --- |
| Scope policies, IDOR, many-to-many, archive history | `students.int.spec.ts`, `parents.int.spec.ts`, `people.policy.spec.ts`, cross-tenant registry (every new route) |
| Medical notes hidden + reads audited | `health-notes.int.spec.ts`; E2E receptionist |
| Consent: no activation without hub consent; history | `consent.int.spec.ts`, `membership activation` tests |
| Import 500/20 → 480/20, re-upload no duplicates, plan limit | `import.int.spec.ts`; E2E with your file |
| Join/link: no enumeration, rate limits, only chosen students linked, tenant context per call | `family-link.int.spec.ts`, `hub-tenant-context.int.spec.ts` |
| Search p95 < 300 ms on 50K | `scripts/perf/search-bench.mjs` output in the gate report |
| RLS on new tables; drift | `rls-coverage.int.spec.ts`, `tenant-isolation.int.spec.ts`, `db:drift` |
| Exit E2E: student with two parents → Student 360 → invite email | `people.spec.ts` (desktop + phones), Mailpit |
| UI states, a11y, i18n, budgets | axe light/dark on every new page, `i18n-pseudo.spec.ts`, `perf:budget` (new routes added) |
| Common gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm i18n:check && pnpm flags:check && pnpm db:drift && pnpm perf:budget` + CI green |
| Staging | your checklist (Part F Phase 4) on staging, with a real phone for list and 360 |

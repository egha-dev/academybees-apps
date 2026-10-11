# P5-1 · Phase 5 — Courses + Batches + Timetable: plan

> **Approved by the PO on 2026-10-11** (`phase-5-start` = `8e50d25`), after a PO review of real scheduling patterns. Decisions C-112…C-121 recorded in DECISIONS.md.

## Context

- **Predecessor:** Phase 4 ✅ 2026-10-11 (tag `phase-4`), so Phase 5 can start.
- **Goal:** every teacher has a reliable daily schedule made of concrete class sessions. Owners run batches from a Batch Workspace and a Timetable, holidays cancel exactly the right classes, and students move between batches without losing history.
- **Refs read:**
  - CLAUDE.md; IMPLEMENTATION_PLAN §1, §2 and Phase 5
  - PRD v3 §9, v2 §17, v3.2 G-03 and G-27
  - UX §8, §10, §11.1, §11.5, §11.6, §25
  - ADR-024, ADR-029, ADR-037; C-09, C-92, C-100, C-108
- **Exit gate:** create a batch with a weekly schedule → its sessions appear in the timetable's week view → cancel one → a teacher who signs in sees only their own batches.

### What exists (Phases 3–4)

| Area | Today | Phase 5 change |
| --- | --- | --- |
| Schema (`scheduling.prisma`) | Course, CourseLevel, Batch (capacity, branch, dates, status, version), BatchTeacher (isPrimary), BatchEnrolment (time-aware, one open per student and batch), ScheduleRule (weekday, minutes, effective dates), ClassSession (sessionDate local + UTC instants, origin, status; unique per rule and date) | ClassSession gains cancel reason/when/by, `modifiedAt` (the "untouched" test), make-up link, holiday link, note. New `Holiday` and `NotificationIntent` tables |
| `SchedulingService` | Onboarding commands only: course/batch create, primary teacher, enrol/unenrol, `replaceWeeklySlots` (14 days, synchronous), `regenerateForTimezone` | One shared generator (28 days), full endpoints, policies |
| Time helpers | `localDate`, `zonedInstant`, `weeklyOccurrences` in `packages/contracts/src/schedule-time.ts` | Reused everywhere; no new date library |
| Capabilities | `course.*`, `batch.read/manage/enrol`, `timetable.read/manage`, `session.manage`; teachers get ASSIGNED reads | None added. Holidays use `timetable.manage` |
| Terminology | `TenantSettings.terminology` (batch/course/teacher choices), templates by academy type, ICU `select` messages in onboarding | `useTerm` helpers across every screen; Settings → Academy can change the words |
| Background jobs | Imports run as an API-hosted BullMQ job (C-100). The worker has no tenant data access. Domain events without a handler finish as no-ops | Session generation follows the import pattern |
| Web | `/today` and `/teach` are placeholders behind flag `p2-role-homes` | Owner Today v1, Teacher home v1, Batches, Batch Workspace, Timetable, Holidays; the flag is removed |

## How academies actually schedule (PO review, 2026-10-11)

Real academies don't all meet on the same rhythm. The model must cover these patterns without special cases per academy type (ADR-029):

| Pattern | Example | How Phase 5 models it |
| --- | --- | --- |
| **2 days a week** | Weekend batch Sat/Sun 10:00; music Tue/Thu 17:00 | A batch with 2 weekly slots |
| **3 days a week** | Karate Mon/Wed/Fri 18:00–19:00 | 3 slots |
| **5–6 days a week** | Tuition Mon–Fri 17:00; Mon–Sat 06:30 | 5 or 6 slots |
| **Daily** | Fitness 06:00 every day | 7 slots |
| **Different times on different days** | Tue 17:00–18:00 and Sat 10:00–11:30 | Each slot has its own day, start and end |
| **Student attends only some of the batch's days** | Dance class runs Mon–Sat; one student's plan is "2 classes a week" on Tue/Thu, another's is all six days | **Student day plan** on the enrolment (C-120) |
| **Timing change mid-year** | Summer timings from 1 April | Effective-dated slots (C-113): edit "from date" |
| **One-to-one lessons** | Private piano lesson, Wed 16:00 | A batch with capacity 1 (works now; a private-lesson booking flow comes later) |
| **Term with start/end** | 12-week spoken-English course | Batch start and end dates (exist); generation stops at the end date |

Not in Phase 5 (recorded, not built):
- **Flexible class packs** ("any 8 classes a month", attend any day): belong with fees and attendance counting → **Phase 7**;
- **every second week / fortnightly**: rare; backlog;
- **room/resource clashes**: out of scope.

## Decisions I'll record in S1 (C-112…C-121, safe defaults; tell me to change any)

| ID | Question | Default |
| --- | --- | --- |
| **C-112** | ADR-024 says the *worker* generates sessions, but the worker can't read academy data (C-100) | As with imports, **generation runs as a BullMQ job inside the API**:<br>• A daily platform job (`src/platform/jobs`, audited, lists ACTIVE/SETUP academies only) queues one `scheduling.generateSessions` job per academy.<br>• Each job runs in `TenantContext.run` with the tenant-bound client and fills a rolling **28-day** window.<br>• Saving a schedule rule also generates that batch's sessions immediately, in the same request, so the owner sees them at once.<br>• Onboarding's 14-day synchronous generation (C-92) switches to the same generator (28 days). |
| **C-113** | What counts as an "untouched" session, and how rule edits apply | **Untouched** = `origin GENERATED`, `status SCHEDULED`, `modifiedAt` null, and (from Phase 6) no attendance.<br>Editing a weekly slot **from a date**:<br>• ends the old rule the day before (`effectiveTo`);<br>• creates a new rule;<br>• deletes only the old rule's untouched sessions from that date;<br>• generates the new ones.<br>Rescheduling, cancelling or changing the teacher of a single session sets `modifiedAt`, so later edits never overwrite it. Ad-hoc and make-up sessions are `MANUAL`. |
| **C-114** | Holidays must create "one parent notification intent per child" (G-03), but notifications start in Phase 6, and events without a handler are dropped | Pull a minimal **`NotificationIntent` table** forward from Phase 6, storage only:<br>• fields: tenantId, kind `SESSION_CANCELLED_HOLIDAY`, studentId, holidayId, payload (dates, batch names), status `PENDING`;<br>• unique per (holiday, student), written in the holiday's transaction.<br>Phase 6 delivers them in-app and Phase 10 by SMS/WhatsApp. **Nothing is sent to parents in Phase 5.** |
| **C-115** | Holiday rules | `Holiday` (name, startDate, endDate, kind HOLIDAY/CLOSURE, branchId optional = whole academy), managed with `timetable.manage`.<br>• **Create:** returns an **impact preview** (sessions, batches and students per day) → confirm cancels exactly those sessions (`cancelReason HOLIDAY`, `holidayId`) and writes the intents. Generation skips holiday dates.<br>• **Delete a future holiday:** reinstates the sessions it cancelled, unless they were changed since. Its intents are marked `VOID`.<br>• **Make-up session:** a manual session with `makeupForSessionId`, offered from a cancelled session. |
| **C-116** | Timetable interactions within the route budget | **No drag-and-drop in Phase 5** (the stretch goal): reschedule from a session sheet instead. The desktop grid is a CSS grid with no library. Mobile gets a chronological timeline. Every view is a separate route whose interactive parts load on first use. |
| **C-117** | The teacher's home before the Teacher PWA (Phase 6) | **Teacher home v1** at `/teach`, read-only:<br>• today's and this week's classes (holidays shown);<br>• "My batches" → read-only Batch Workspace (students, schedule), all ASSIGNED scope;<br>• Take Attendance appears disabled with "Attendance arrives soon", not hidden, because UX §10 makes it the primary action.<br>With Owner Today v1, this removes flag **`p2-role-homes`**. |
| **C-118** | `useTerm` (ADR-029) | One helper pair:<br>• `termsFor(terminology)` on the server;<br>• `useTerm()` in client components, from a provider in the academy layout.<br>Both return forms such as `batch`, `batches`, `Batch`, `Batches`, resolved through ICU `select`/plural messages in `packages/i18n` (no string concatenation). Applied to every Phase 3–5 screen and the navigation. **Settings → Academy** gets "Words your academy uses" (choices from `TERM_OPTIONS`). |
| **C-119** | Timezone-correct "today" | Server-side only: `localDate(now, academy.timezone)` decides "today", and timetable ranges are academy-local dates. API inputs and outputs use local dates plus UTC instants, and the browser never computes "today" for data. Tests cover UTC 18:30–23:59 against IST's next day, and a DST timezone (Europe/London) for the generator. |

| **C-120** | Students who attend only some of a batch's days ("2 classes a week" in a 5-day batch) | **Student day plan** on `BatchEnrolment.weekdays` (ISO weekdays; empty = every day the batch meets). It defaults to all days; staff pick days when enrolling ("Which days does this student come?").<br>• **Who is expected at a class:** enrolments open on that date whose plan includes that weekday. Phase 6 attendance, Phase 7 fees and reports use the same rule.<br>• **Changing a student's days from a date:** ends the current enrolment the day before and starts a new one (history kept, like a transfer within the batch).<br>• **A day removed from the batch's schedule:** affected plans are flagged for staff and never silently rewritten.<br>• **Shown as** "3 classes a week" or "2 of 5 days (Tue, Thu)" on the Batch Workspace and Student 360. Phase 7 can then price by frequency (2-day vs 3-day fee). |
| **C-121** | Weekly schedule editor and capacity with day plans | **Editor:**<br>• one-tap presets: Mon–Fri, Mon/Wed/Fri, Tue/Thu/Sat, Tue/Thu, Weekend, Mon–Sat, Every day, Custom;<br>• one time for all days, or a different time per day;<br>• a teacher per slot is optional (defaults to the batch's primary teacher);<br>• validation: end after start, no overlapping slots in one batch on the same day, at most 14 slots a week.<br>**Capacity** is checked **per weekday** (students expected that day). Lists show the fullest day ("Wed 20/20"), and enrolment warns about the specific days that would go over.<br>**Holiday intents** go only to students expected on the cancelled days. |

Also recorded:
- **No new dependencies.**
- **No new capabilities.** Batch policy: TENANT / BRANCH / ASSIGNED, where ASSIGNED means a BatchTeacher row for the member's teacher. Session policy: ASSIGNED = the session's teacher or a batch teacher.
- **Release flag `p5-scheduling`** (on in local/ci/staging, off in production) covers the new screens until S7.
- **Pilot data (A10, optional):** if the pilot's real weekly timetable and holiday list don't arrive, a realistic synthetic timetable and Indian holiday list go into seeds and E2E (as with C-111).

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + relevant tests → Conventional Commit.
Each slice: branch `p5/<slice>` from the latest `main` → PR with the DoD checklist → merge only after every check passes on the PR's head (C-43, never `--auto`).

### S1 `p5/scheduling-core` — plan, schema, generator, daily job

- **5.1 Docs:**
  - `docs/plans/phase-5.md`;
  - IMPLEMENTATION_PLAN: Phase 5 🟨 plus the slice table;
  - DECISIONS C-112…C-121.
- **5.2 Migration `…_scheduling_workspace` (expand-only):**
  - `class_session` gains `cancel_reason` (enum TEACHER_UNAVAILABLE | HOLIDAY | OTHER), `cancelled_at`, `cancelled_by_id`, `modified_at`, `makeup_for_session_id`, `holiday_id`, `note`; index `(tenant_id, teacher_id, session_date)`;
  - `batch_enrolment.weekdays SMALLINT[]` (student day plan, C-120; empty = every day);
  - `holiday` table;
  - `notification_intent` table;
  - RLS through `010` automatically; DELETE revoked on `notification_intent`; `rls-coverage` and the isolation suite extended; testing fixture rows.
- **5.3 Generator** (`modules/scheduling/domain/generate.ts`):
  - pure function: rules + holidays + window + timezone → sessions to create;
  - `SessionGenerator.forBatch(tx, batchId)` / `forTenant()`: inserts with `skipDuplicates` and never touches existing rows;
  - `replaceWeeklySlots` and `regenerateForTimezone` use it.
- **5.4 Daily job (C-112):**
  - platform fan-out `scheduling.generateSessions` (`upsertJobScheduler`, 02:00 IST, audited);
  - per-academy processor in `modules/scheduling` (tenant context re-established, concurrency 1);
  - `pnpm scheduling:generate` CLI for local/staging.
- **Tests:**
  - unit: generator (holidays skipped, effective dates, DST, past slots today not created, idempotent);
  - integration: job twice → same rows; cancelled and modified sessions survive re-runs; timezone "today".

*As built (S1):*
- **Migration `scheduling_workspace`:**
  - `class_session` gains cancel reason/when/by, `modified_at`, a make-up link (composite FK), `holiday_id` and `note`;
  - `batch_enrolment.weekdays` (day plan);
  - new `holiday` (with `removed_at`: holidays are never deleted) and `notification_intent` tables.
- **`060-scheduling-workspace.sql`:** DELETE/TRUNCATE revoked on holidays and intents, plus CHECKs:
  - holiday shape;
  - weekdays within 1–7;
  - a cancelled session ⇔ it has a reason; a HOLIDAY reason requires a holiday;
  - a make-up is manual and never its own make-up.
- **Generator:** `plannedSessions` (pure) and `generateSessions` (rules + holidays → inserts with skip-duplicates). Onboarding and timezone changes use it; untouched now also means `modified_at` is null; the window is 28 days.
- **Daily job (C-112):**
  - the `platform-jobs` queue has a scheduler at 02:00 Asia/Kolkata. Its fan-out lists ACTIVE/SETUP academies with the platform client and writes a platform audit row, `platform.sessions_generation_queued`;
  - one `session-generation` job per academy and day, processed in the API in tenant context, concurrency 1;
  - analytics `session.generated {source: daily|manual|onboarding}`;
  - `pnpm scheduling:generate` queues the run now (not in production);
  - `bullConnection` moved to `core/redis`.
- **Tests:** `generate.spec.ts` (5: 2/3/5/7-day patterns, times per day, effective dates, batch dates, holidays by branch, started classes, DST); `sessions.int.spec.ts` (3: idempotent, other academy untouched, cancelled/changed never touched, holiday skipped, fan-out and audit). Database integration: 355.

### S2 `p5/batches-api` — courses, batches, teachers, enrolments, transfer

- **5.5 Policies** `scheduling.policy.ts`: batch and session scopes (TENANT/BRANCH/ASSIGNED); student ASSIGNED reuses the Phase 4 `assignedEnrolment`.
- **5.6 Courses & levels API:**
  - `GET/POST /courses`, `PATCH /courses/:id` (version, archive);
  - `POST/PATCH /courses/:id/levels` (reorder).
- **5.7 Batches API:**
  - `GET /batches` (keyset; filters branch/course/teacher/status; capacity used), `GET /batches/:id`, `POST /batches`, `PATCH /batches/:id` (version), archive;
  - teachers: `PUT /batches/:id/teachers` (primary/assistant);
  - activity events.
- **5.8 Enrolments, day plans and transfer (G-27, C-120):**
  - `POST /batches/:id/enrolments` (start date, optional `weekdays`; per-weekday capacity warning `over_capacity {days}` unless confirmed);
  - `POST /enrolments/:id/days` (change days from a date: end + start, history kept);
  - `POST /enrolments/:id/end` (date, reason);
  - `POST /students/:id/transfer` (from batch, to batch, date: ends one, starts the other, one transaction, idempotent);
  - Phase 4 status-change consequences gain "leaves N batches; M future classes".
- **Tests:**
  - scope matrix (owner TENANT, admin BRANCH, teacher only assigned batches, receptionist read, accountant read);
  - IDOR across academies;
  - enrolment history: past sessions keep the student, future ones don't;
  - transfer keeps past rows;
  - day plans: who is expected per weekday; changing days from a date keeps history; per-weekday capacity;
  - version conflicts;
  - cross-tenant registry for every route.

### S3 `p5/schedule-api` — rules, sessions, holidays

- **5.9 Schedule rules API:**
  - `GET /batches/:id/schedule` (rules plus the next sessions);
  - `PUT /batches/:id/schedule` (slots with a day, start, end and optional teacher, plus an effective date; C-113 split; C-121 validation; generates immediately; returns double-booking warnings and any student day plans that include a removed day).
- **5.10 Sessions API:**
  - `GET /sessions?from&to&view=day|week|teacher&branch&course&teacher` (local-date range ≤ 31 days, scope-aware, includes holidays);
  - `POST /sessions` (ad-hoc / make-up, `@Idempotent`);
  - `PATCH /sessions/:id` (reschedule, teacher; sets `modifiedAt`; double-booking warning);
  - `POST /sessions/:id/cancel` (reason) and `/restore`.
- **5.11 Holidays API (C-114, C-115):**
  - `GET /holidays`;
  - `POST /holidays/preview` (impact by day: sessions, batches, students);
  - `POST /holidays` (confirm: cancel + intents, one transaction, `@Idempotent`, audited);
  - `DELETE /holidays/:id` (future only: reinstate + void intents).
- **Tests:**
  - holiday cancels exactly the sessions in range (branch filter respected), generation never recreates them, one intent per expected child per holiday (day plans respected), deletion reinstates only unchanged sessions;
  - schedule patterns: 2-, 3-, 5- and 7-day batches and different times per day produce the right sessions; overlapping slots refused;
  - rule edit leaves modified/cancelled/manual sessions alone;
  - double-booking detection;
  - teacher sees only assigned sessions;
  - registry.

### S4 `p5/terminology-today` — `useTerm`, Owner Today v1, Teacher home v1 (flag `p5-scheduling` for new bits)

- **5.12 Terminology (C-118):**
  - `termsFor` / `useTerm` and messages;
  - Settings → Academy "Words your academy uses";
  - applied to onboarding, the shell nav, Students/Teachers (batch mentions) and all Phase 5 screens;
  - the pseudo-locale spec checks wording switches.
- **5.13 Owner Today v1** (UX §11.1, `/today`):
  - welcome; today's classes (academy-local, holiday banner);
  - attention items: batches without a teacher, batches at or over capacity, sessions this week without a teacher, upcoming holidays;
  - "happened recently" from activity events;
  - empty state → create the first batch.
- **5.14 Teacher home v1** (C-117, `/teach`): today and this week, my batches, disabled Take Attendance with a reason.
- **5.15** Remove `p2-role-homes` (both homes are real now).
- **Tests:** E2E Today (owner) and Teach (teacher sees only own classes); terminology switch E2E; axe light/dark; route budget for both homes.

### S5 `p5/batches-ui` — Courses, Batches, Batch Workspace

- **5.16 Batches list** (`/batches`, RUN nav, `useTerm` label):
  - filters, capacity bar (text, not colour only), teacher, next class;
  - Add Batch sheet (course/level inline create, branch, capacity, dates, teachers);
  - Global Add and palette gain Batch.
- **5.17 Batch Workspace** (`/batches/[id]`, UX §11.5):
  - header with primary actions Attendance (disabled until Phase 6), Students, Schedule;
  - **Students** tab: enrol (with "Which days does this student come?"), change days, end, transfer; per-day capacity warning; each student shows "3 classes a week" or "2 of 5 days (Tue, Thu)";
  - **Schedule** tab: weekly pattern editor with presets (Mon–Fri, Mon/Wed/Fri, Tue/Thu/Sat, Tue/Thu, Weekend, Mon–Sat, Every day, Custom), one time or a time per day, a "from date" choice, and the next sessions;
  - **Activity** tab.
- **5.18 Courses** (Settings → Courses, or under Batches; decided by UX fit): levels editor, archive.
- **Tests:** E2E create a course → batch → Mon/Wed/Fri schedule → sessions listed; Tue/Thu with different times; a student enrolled for 2 of 5 days; enrol over capacity on one day shows that day's warning; transfer; phones; axe.

### S6 `p5/timetable-ui` — Timetable and Holidays

- **5.19 Timetable** (`/timetable`, UX §11.6):
  - Day, Week and Teacher views: desktop CSS grid, mobile timeline;
  - filters branch/course/teacher; date navigation; holiday bands;
  - session sheet: cancel with reason / restore, reschedule, change teacher, add make-up, open batch; double-booking warnings shown.
- **5.20 Holidays** (Timetable → Holidays):
  - list;
  - add holiday → **impact preview** (classes, batches, students per day) → confirm;
  - delete a future holiday (reinstates);
  - seed: an Indian holiday sample for demo-a.
- **Tests:** E2E week view shows generated sessions; cancel one; Diwali preview lists affected classes → confirm → cancelled; make-up session; mobile timeline; axe.

### S7 `p5/journey-e2e` — exit journey, flags, docs

- **5.21 Exit E2E:** create batch with weekly schedule → week view → cancel one → teacher signs in and sees only their batches (desktop + phones).
- **5.22** Remove `p5-scheduling`; ARCHITECTURE as-built notes (§8.3, ADR-024/037 notes, jobs); CLAUDE.md §3/§8; README tour; plan status.

| Slice | Branch | Tasks | Release flags |
| --- | --- | --- | --- |
| S1 | `p5/scheduling-core` | 5.1–5.4 | — |
| S2 | `p5/batches-api` | 5.5–5.8 | — (API only) |
| S3 | `p5/schedule-api` | 5.9–5.11 | — (API only) |
| S4 | `p5/terminology-today` | 5.12–5.15 | adds `p5-scheduling`; removes `p2-role-homes` |
| S5 | `p5/batches-ui` | 5.16–5.18 | `p5-scheduling` |
| S6 | `p5/timetable-ui` | 5.19–5.20 | `p5-scheduling` |
| S7 | `p5/journey-e2e` | 5.21–5.22 | removes `p5-scheduling` |

**Analytics (no personal data):**
- `batch.created`, `batch.schedule_saved {slots, days}`;
- `enrolment.created {dayPlan: all|some}`;
- `session.cancelled {reason}`, `session.rescheduled`, `session.added {kind: adhoc|makeup}`;
- `holiday.created {days, sessions}`;
- `student.transferred`, `enrolment.ended`.

**Seeds (local/ci):** demo-a gets:
- 3 courses and 6 batches across 2 teachers (`teacher@demo-a.test` teaches 2) covering the real patterns: weekend 2-day, Mon/Wed/Fri, Tue/Thu with different times, Mon–Fri tuition, Mon–Sat early morning, a one-to-one lesson;
- students on day plans (for example 2 of 6 days);
- generated sessions;
- an upcoming holiday;
- one batch at capacity (for Today attention items).

## Dependencies and gaps

- **Uses:**
  - `SchedulingService`, schedule-time helpers, tenant-bound client and RLS, `@Idempotent`, audit, activity events;
  - Phase 4 people policies and Student 360 (enrolments tab becomes live), the palette and Global Add;
  - BullMQ import pattern (C-100), cross-tenant registry, route budget tooling.
- **Missing from earlier phases, added here:**
  - session cancel/modified fields;
  - `Holiday`;
  - `NotificationIntent` (pulled forward);
  - batch/session policies;
  - a daily per-academy job;
  - `useTerm` beyond onboarding;
  - Settings terminology;
  - student day plans (who is expected on which day).
- **Later (noted, not built):**
  - attendance and Take Attendance (6);
  - delivering notification intents (6 in-app, 10 channels);
  - fees on transfer and status change (7);
  - parent schedule view (7P/11);
  - drag-to-reschedule (backlog);
  - flexible class packs, any N classes a month (7, with fees and attendance);
  - fortnightly / every-N-weeks schedules (backlog);
  - rooms/resources (not in scope).

## Risks

| Risk | Mitigation |
| --- | --- |
| Route budget: the timetable grid on top of shells at about 182 KB | Separate routes per view, lazy interactive parts, CSS-only grid, no libraries; budget entries added per slice; I come back to you before any raise. |
| Timezones and DST in generation | Generation only through `zonedInstant` and local dates; unit tests for IST and Europe/London; "today" server-side only (C-119). |
| Regeneration overwriting staff edits | `modifiedAt` and the C-113 untouched rule; integration tests for modified, cancelled and manual sessions. |
| Many academies × 28 days nightly | Per-academy jobs, concurrency 1, inserts with `skipDuplicates`, a window of only the missing dates; a staging dry run. |
| Holiday impact on many students | Preview first; one transaction per holiday with a cap (e.g. 2,000 sessions), refused with a clear message above it. |

**Your inputs (optional):** the pilot's weekly timetable and holiday list (A10). If they don't come, synthetic ones stand in (as C-111), and I'll note it in the plan.

## How I'll prove the exit gate (P5-3)

| Gate item | Evidence |
| --- | --- |
| Generation idempotent; regeneration rules; cancelled excluded | `generate.spec.ts`, `sessions.int.spec.ts` (job twice, modified/cancelled/manual survive) |
| Holiday cancels exactly its sessions; never recreated; intents | `holidays.int.spec.ts` |
| Transfer keeps history; enrolment history in past vs future sessions; day plans decide who is expected | `batches.int.spec.ts` |
| 2/3/5/7-day patterns, different times per day, timing change from a date | `generate.spec.ts`, `schedule.int.spec.ts`, E2E Batch Workspace |
| Teacher sees only assigned batches/students/sessions | scope matrix tests, cross-tenant registry, E2E teacher |
| Timezone-correct "today" | integration with a frozen clock at UTC 19:00 (IST next day) |
| Exit E2E: batch + weekly schedule → week view → cancel → teacher sees only theirs | `scheduling-journey.spec.ts` on desktop and phones |
| UI states, a11y, terminology, budgets | axe light/dark, pseudo-locale, terminology switch E2E, `perf:budget` |
| Common gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm i18n:check && pnpm flags:check && pnpm db:drift && pnpm perf:budget` plus CI green; staging on the latest `main` |

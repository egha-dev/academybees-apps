# P6-1 · Phase 6 — Attendance + Offline Sync: plan

> **Approved by the PO on 2026-10-16** (`phase-6-start` = `8cbe035`). Decisions C-124…C-131 recorded in DECISIONS.md.

## Context

- **Predecessor:** Phase 5 ✅ 2026-10-16 (tag `phase-5`), so Phase 6 can start.
- **Goal:** a teacher takes attendance in seconds, online or offline, and it reaches the server **exactly once**. This is the differentiator and milestone **M1 Academy Alpha**.
- **Refs read:**
  - CLAUDE.md §10, §11; IMPLEMENTATION_PLAN Phase 6 and §2;
  - ARCHITECTURE §11 (scope, Dexie, sync contract, runner, conflict policy, offline UX, offline security), §13 (outbox, queues, notifications);
  - ADR-016, ADR-017; C-04, C-06, C-100, C-112; OD-11; G-16;
  - UX §12, §12.1, §14.
- **Exit gate:** common gate including the offline suite; a real-phone test on Android Chrome and iOS Safari (installed PWA) in airplane mode.

### What exists, and what this phase adds

| Area | Today | Phase 6 |
| --- | --- | --- |
| Schema | `ClassSession` (status SCHEDULED/CANCELLED/COMPLETED, `slotDate`), `BatchEnrolment.weekdays` (who is expected), `NotificationIntent` (holiday only), `OutboxEvent` | `Attendance`, `AttendanceChange` (history), `SyncOperation` (op ledger), `Notification` (in-app); new intent kinds `ATTENDANCE_ABSENT/LATE` |
| Contracts | `sync.ts`: `SyncOp`, result statuses, op types incl. `attendance.markSession/update` | payload schemas, push/pull/bootstrap schemas, attendance and notification schemas |
| `packages/sync` | Phase 0 engine: Dexie **v1** (meta, syncQueue, syncLog), `SyncQueue`, `SyncRunner` (Web Lock, backoff), connectivity, hooks (`useSyncStatus`, `useLogoutGuard`, `deriveSyncState`) | Dexie **v2** domain tables, bootstrap/pull client, op builders, resolve-conflict, wipe; wired into the web app |
| Service worker (`app/sw.ts`) | precaches shell + `/offline`; `/api/*` NetworkOnly; **navigations NetworkOnly → `/offline`** | `/teach/*` navigations NetworkFirst (3 s) → cached teacher shell (C-124) |
| Teacher web | `/teach` Teacher home v1 (server-rendered, read-only), read-only Batch Workspace | Teacher PWA: Today, Classes, Attendance, Students, Sync Center, More (local-first) |
| Capabilities | `attendance.read/mark/edit_past` already in roles (teacher: read + mark, ASSIGNED) | none added |
| Jobs | outbox relay (worker); API-hosted BullMQ jobs (imports C-100, generation C-112) | nudge job (G-16) in the API, same pattern as generation |

## Decisions I'll record in S1 (C-124…C-131, safe defaults; tell me to change any)

| ID | Question | Default |
| --- | --- | --- |
| **C-124** | Teacher screens must open offline after a reload or restart, but pages are server-rendered and the SW sends navigations to the network | **Teacher PWA screens are local-first shells:**<br>• `/teach`, `/teach/classes`, `/teach/attendance?session=…`, `/teach/students`, `/teach/sync`, `/teach/more` render from Dexie on the client; their HTML carries no student data;<br>• the SW serves `/teach/*` navigations NetworkFirst (3 s timeout), then the cached shell (matched ignoring the query), and warms those shells after bootstrap;<br>• links inside the teacher app are plain document navigations, so they work offline;<br>• the shell cache is wiped on logout or revocation (ARCHITECTURE §11.7). |
| **C-125** | ARCHITECTURE §11.2 says "Dexie v1 full", but v1 shipped in Phase 0 with only meta/queue/log | Domain tables arrive as **Dexie `version(2)`**: batches, students, enrolments, sessions, attendance, notifications. A released version is never edited. |
| **C-126** | Conflict unit for a whole-class save (ADR-017 is per session and student) | `attendance.markSession` carries a **per-student `baseVersion`** and is **atomic**:<br>• if any student conflicts (stale base, last set by another user, different value), the whole op is `CONFLICT`, with each conflicting student's server value;<br>• the teacher picks "keep mine" or "use theirs" per student, which enqueues a new op on the fresh versions;<br>• same user or identical values → applied (ADR-017 truth table). |
| **C-127** | `AttendanceDailySummary` and `StudentMonthlyAttendance` tables | **Computed on read** with indexes, `(tenant, studentId, sessionDate)` and `(tenant, batchId, sessionDate)`, for monthly %, Today completion and the overview. Summary tables come with Phase 12 reports if needed; this avoids keeping counters in step on every edit. A perf test covers 100K rows. |
| **C-128** | How parent intents and in-app notifications are produced (worker has no tenant data, C-100) | **Absence/late intents are written in the attendance transaction** (one per student per session, unique), so they exist only if the attendance committed (ADR-017). A correction to Present before delivery **voids** the pending intent. Delivery is 7P (hub, in-app) and Phase 10 (channels).<br>**Staff in-app `Notification` rows** (the G-16 nudge for now) are written by API-hosted jobs, as C-112 does. |
| **C-129** | Session status "Started" | **No STARTED state.** "In progress" is derived from the time. The first saved roll call sets **COMPLETED**; a cancelled class can't take attendance (`REJECTED`). |
| **C-130** | OD-11 windows | Defaults per OD-11:<br>• teachers edit until **48 h after the class ends**;<br>• offline ops are accepted until **7 days after the class date**;<br>• beyond that, `attendance.edit_past` is needed (owner/admin).<br>Stored in `TenantSettings.attendance`; **no settings screen this phase**. |
| **C-131** | Owner/admin marking on the web | They use **the same attendance component and the same sync queue** (CLAUDE §10: offline-capable mutations always go through the queue). `PUT /sessions/:id/attendance` exists for API clients and tests, with `Idempotency-Key`; both paths share one `AttendanceService`. |

Also recorded:
- **No new dependencies:** Dexie and Serwist are already pinned.
- **Release flag `p6-teacher-pwa`** (on in local/ci/staging, off in production) covers the new teacher and attendance screens until S8; the server-rendered Teacher home v1 stays the fallback while it's off.
- **Offline E2E runs on the Chromium projects** (desktop, Android). WebKit runs the online flows; iOS offline is proven on your real iPhone (Playwright's WebKit service-worker support is limited).

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + relevant tests → Conventional Commit.
Each slice: branch `p6/<slice>` from the latest `main` → PR with the DoD checklist → merge only after every check passes on the PR's head (C-43, never `--auto`).

### S1 `p6/attendance-core` — plan, schema, attendance domain and REST

- **6.1 Docs:**
  - `docs/plans/phase-6.md`;
  - IMPLEMENTATION_PLAN Phase 6 🟨 plus the slice table;
  - DECISIONS C-124…C-131.
- **6.2 Migration `…_attendance_sync`:**
  - `attendance`: tenant, branch, batch, session, student, `session_date`, status `PRESENT|ABSENT|LATE|LEAVE`, note, `marked_by_id`, `marked_at`, `version`; unique `(tenant, session, student)`; indexes per C-127;
  - `attendance_change`: append-only history (from, to, by, at, `op_id`); UPDATE/DELETE revoked;
  - `sync_operation`: `(tenant, op_id)` PK, membership, type, entity key, result status, result JSON, created; append-only;
  - `notification`: recipient membership, kind, params JSON, link, `read_at`, unique dedupe key;
  - `NotificationIntentKind` gains `ATTENDANCE_ABSENT`, `ATTENDANCE_LATE` plus a `session_id` column, unique per (kind, session, student);
  - `TenantSettings.attendance` JSON;
  - RLS automatically via `010`; rls-coverage; testing fixtures.
- **6.3 `modules/attendance`:**
  - `attendance.policy.ts` (TENANT/BRANCH/ASSIGNED: the teacher teaches the batch, or the session, **on the session date**);
  - `roster` = enrolments open on the date whose day plan includes the weekday (C-120);
  - `markSession` (ADR-017 truth table, C-126 atomic, C-130 windows, cancelled → refused, session → COMPLETED, history rows, intents per C-128, analytics);
  - `update` for one student.
- **6.4 REST:**
  - `GET /sessions/:id/attendance` (roster + marks + versions);
  - `PUT /sessions/:id/attendance` (`@Idempotent`);
  - `PATCH /attendance/:id`;
  - `GET /students/:id/attendance` (history + monthly %);
  - `GET /batches/:id/attendance` (by session, %);
  - `GET /attendance/overview?date=` (completion by batch);
  - cross-tenant registry.
- **Tests:**
  - unit: the ADR-017 truth table and windows;
  - integration: duplicate PUT → one row; 50 concurrent PUTs → one row per student; unassigned teacher → 404; cancelled session refused; edit after 48 h refused for a teacher, allowed with `edit_past`; intents once, voided on correction; cross-tenant → 404; perf smoke (60 students < 300 ms p95 locally).

*As built (S1):*
- **Schema** (migration `20261016120000_attendance_sync`, `070-attendance-sync.sql`):
  - `attendance`: versioned, unique per class and student; DELETE revoked;
  - `attendance_change` and `sync_operation`: append-only (UPDATE/DELETE revoked);
  - `notification`: in-app, unique dedupe key; DELETE revoked;
  - intents gain `ATTENDANCE_ABSENT` / `ATTENDANCE_LATE` and `session_id`, with a CHECK that an intent names its subject;
  - fixture rows in every new table.
- **`modules/attendance`:**
  - pure rules in `domain/rules.ts`: the ADR-017 truth table, windows (C-130), percentages; unit spec of 9 tests;
  - `AttendanceService`:
    - the roll call (expected students per C-120, plus anyone marked earlier);
    - `markSession` / `markSessionIn(tx)`: atomic (C-126); locks the class row so saves to one class run in turn; set-based writes; history only when the status changes; class completed (C-129); intents and voiding (C-128);
    - `update` (same rule from the seen version);
    - student months, batch range, day overview.
  - It reads classes and rosters through scheduling's `SessionsService.forAttendance/markCompleted` and people's `EnrolmentsService.expectedOn/between` (C-122).
- **REST** (cross-tenant registry updated):
  - `GET`/`PUT /sessions/:id/attendance` (a conflict is a 409 naming `marks.<studentId>`);
  - `PATCH /attendance/:id`;
  - `GET /students/:id/attendance?months=`;
  - `GET /batches/:id/attendance?from&to`;
  - `GET /attendance/overview?date=`.
- **Percentages:** Present and Late are attended; Leave is left out.
- **Tests:** `attendance.int.spec.ts` (8 tests):
  - the roll call end to end; exactly once (replay + 50 concurrent);
  - the conflict rule incl. PATCH; scope by role and roll;
  - locks (cancelled, not yet, 48 h); history and percentages;
  - perf smoke (**60 students p95 178 ms locally**, was 569 ms before set-based writes); cross-tenant.
- **Test fix:** `sessions.int.spec.ts` counts generated classes only (the fixture's past one-off class is manual).

### S2 `p6/sync-api` — push, pull, bootstrap

- **6.5 `modules/sync`:**
  - `POST /sync/push` (≤ 100 ops): per op, the ledger hit → `DUPLICATE` with the stored result;
  - op registry (`attendance.markSession`, `attendance.update`), each validated by its Zod schema and dispatched to `AttendanceService` in one transaction with the ledger row;
  - per-`entityKey` order: after a `CONFLICT`/`REJECTED`, later ops with that key in the batch come back `REJECTED` with detail `blocked` and stay queued on the client;
  - a schema-version check; `TENANT_MISMATCH` comes from the existing auth guard.
- **6.6 Bootstrap and pull:**
  - `GET /sync/bootstrap?scope=teacher|staff`: assigned batches, active enrolments, students' basic profile (no health, no contacts), sessions −7…+14 days, attendance for the last 30 days;
  - `GET /sync/pull?since=`: watermark from `updatedAt` with 5 s skew and an id tiebreak; tombstones for ended enrolments, cancelled or removed sessions and unassigned batches;
  - a revoked membership gets `403 MEMBERSHIP_REVOKED`.
- **6.7 Metrics:**
  - push results by status as pino metric logs and analytics counts (no personal data);
  - `POST /sync/beacon` (pending count, oldest age) from clients;
  - conflict rate.
- **Tests:**
  - duplicate `opId` → `DUPLICATE` with the original result;
  - 50 concurrent pushes of one op → one row;
  - unassigned batch → `REJECTED`; cancelled session → `REJECTED`;
  - blocked order; cross-tenant op → `TENANT_MISMATCH`;
  - pull watermark edges, tombstones, revocation; registry.

### S3 `p6/sync-client` — Dexie v2 and the client engine (`packages/sync`)

- **6.8 Dexie and repositories:**
  - `version(2)` stores (C-125);
  - repositories for today and upcoming sessions, roster, attendance per session, and assigned students.
- **6.9 Client sync:**
  - bootstrap on sign-in, incremental pull (watermark in `meta`);
  - op builders (`markSession` with per-student base versions; the local attendance row is written optimistically with `syncState`);
  - the runner wired to the API transport; triggers: start, `online`, visible, enqueue (debounced 1 s), every 60 s while pending;
  - `401` pauses; conflict resolution (keep mine / use theirs → a new op);
  - `navigator.storage.persist()`;
  - `wipe()` (Dexie DB + SW shell cache) on logout and revocation.
- **Tests (fake-indexeddb):** migration from v1 with the queue kept; ordering per entity key; backoff; restart recovery (processing → pending); conflict resolve; wipe.

### S4 `p6/teacher-pwa` — Teacher PWA shell and screens (flag `p6-teacher-pwa`)

- **6.10 Service worker (C-124):**
  - `/teach/*` navigations NetworkFirst (3 s) → cached shell;
  - warm the shells after bootstrap;
  - wipe them on logout.
- **6.11 Teacher shell:** bottom nav Home · Classes · Students · More (Learning hidden until Phase 9); `OfflineBanner` and `SyncIndicator` in the header (UX §12.1 wording).
- **6.12 Screens (local-first, phone-first, ≥ 48 px):**
  - **Teacher Today:** next class, today's classes, Take Attendance, holiday notes;
  - **Classes:** today, upcoming, past 7 days, with "attendance not taken" shown;
  - **Attendance:**
    - large Present/Absent/Late/Leave toggles; **Mark all present**, then exceptions;
    - counts; save → "Saved on this device — N records waiting to sync" or "All changes synced";
    - edit-window state;
  - **Students:** assigned students, recent attendance;
  - **Sync Center:** pending, failed and conflict items in words; Retry; Resolve; Discard only with confirmation;
  - **More:** account, switch to Manage, and sign out with the guard ("N attendance records haven't synced…", default Stay).
- **6.13** Loading, empty, error and offline states; budgets: Dexie and the engine load as a lazy chunk after first paint.
- **Tests:** E2E online flow on all three projects; axe; budgets.

### S5 `p6/offline-e2e` — the offline suite

- **6.14** `e2e/specs/offline-attendance.spec.ts` (Chromium projects):
  - sign in → bootstrap → `setOffline(true)` → mark 25 students → pending = 25;
  - **reload while offline** (data persists) → **close and reopen the context** (restart) → `setOffline(false)` → auto-sync → "All changes synced";
  - the server has 25 rows; absence intents created once;
  - duplicate retries (requests replayed) → still one row each.
- **6.15** `two-device-conflict.spec.ts`: two contexts edit the same student differently with one offline → conflict surfaced in the Sync Center → resolved → the server holds the chosen value.
- **6.16** Logout guard with pending ops; revocation wipes local data.

### S6 `p6/manage-attendance` — owner and admin views

- **6.17 Owner Today:** attendance completion today; "Attendance not taken" list (G-16), replacing the Phase 5 placeholder.
- **6.18 Views:**
  - `/attendance` overview: today and a date picker; completion by batch; links to take or edit;
  - Batch Workspace **Attendance** tab (sessions with %, take or edit via the same component and queue, C-131); its disabled "Take attendance" button becomes live;
  - Student 360 **Attendance** tab: history and monthly %.
- **6.19 Seeds (local/ci):** two weeks of demo attendance in demo-a for percentages.
- **Tests:** E2E owner takes attendance from the Batch Workspace; the percentages show; axe.

### S7 `p6/notifications` — in-app notifications and teacher nudges

- **6.20 Notification centre:** bell with unread count in the Manage and Teacher shells, `/notifications` list, mark as read; online read plus a Dexie cache for teachers.
- **6.21 G-16 nudge:** a platform fan-out every 10 min (audited) → a per-academy job in the API → for sessions ended ≥ 30 min ago without attendance, one notification per teacher per session (dedupe key). Owner Today lists the same classes.
- **6.22 Phase 5 review lows deferred here (C-123):**
  - L1: batch teacher set gets a version check;
  - L2: generation takes an academy advisory lock and re-checks status;
  - L3: holiday confirm uses the previewed session ids;
  - L4: class changes recorded in batch activity;
  - L5: same-day day-plan change gets the schedule check.
- **Tests:**
  - integration: nudge once, not before 30 min, none if taken, none for cancelled classes;
  - one test each for the lows;
  - E2E: bell shows the nudge.

### S8 `p6/journey-e2e` — exit journey, flags, docs

- **6.23 Exit E2E:** the teacher journey online and offline on desktop and Android; the online path on iPhone.
- **6.24 Wrap-up:**
  - remove `p6-teacher-pwa`;
  - ARCHITECTURE as-built (§11, §13); CLAUDE.md §3 and §8; README tour;
  - a real-phone checklist for you (Android Chrome, iOS Safari installed PWA, airplane mode).

| Slice | Branch | Tasks | Release flag |
| --- | --- | --- | --- |
| S1 | `p6/attendance-core` | 6.1–6.4 | — (API only) |
| S2 | `p6/sync-api` | 6.5–6.7 | — (API only) |
| S3 | `p6/sync-client` | 6.8–6.9 | — (package only) |
| S4 | `p6/teacher-pwa` | 6.10–6.13 | adds `p6-teacher-pwa` |
| S5 | `p6/offline-e2e` | 6.14–6.16 | `p6-teacher-pwa` |
| S6 | `p6/manage-attendance` | 6.17–6.19 | `p6-teacher-pwa` |
| S7 | `p6/notifications` | 6.20–6.22 | `p6-teacher-pwa` |
| S8 | `p6/journey-e2e` | 6.23–6.24 | removes `p6-teacher-pwa` |

**Analytics (no personal data):**
- `attendance.marked {students, exceptions, source: online|queued, offline}`;
- `sync.pushed {applied, duplicate, rejected, conflict}`;
- `sync.conflict_resolved {choice}`;
- `notification.opened {kind}`.

## Dependencies and gaps

- **Uses:**
  - Phase 5 sessions, `slotDate`, day plans (who is expected), scheduling policies, `NotificationIntent`, Owner Today and Teacher home;
  - Phase 0 `packages/sync` engine, Serwist SW and PWA prompts;
  - Phase 2 cookies (no tokens in IndexedDB) and device sessions;
  - API job pattern (C-100/C-112); cross-tenant registry; route budget tooling.
- **Missing from earlier phases, added here:**
  - Attendance, history, sync ledger and in-app Notification tables;
  - attendance policy;
  - sync endpoints;
  - Dexie domain tables;
  - offline teacher shells in the SW;
  - a notification bell.

## Risks

| Risk | Mitigation |
| --- | --- |
| Offline reload or restart on iOS (Safari service worker and storage eviction) | Local-first shells (C-124), `storage.persist()`, reporting in the Sync Center when persistence is denied, and the real-iPhone test in the exit gate |
| Route budget: teacher shell ~185 KB plus Dexie (~25 KB gz) | Dexie and the engine load as a lazy chunk after first paint; the teacher shell stays lean. I come back to you before any budget raise |
| Duplicates under retries or many tabs | Ledger `(tenant, opId)` plus unique `(tenant, session, student)`; Web Lock runner; the 50-concurrent test |
| A session that expires while offline for days | Ops stay queued; `401` pauses and prompts sign-in without dropping anything; the 7-day acceptance window (C-130) |
| Monthly % on read at 100K students | Indexes plus a perf test; summary tables only if needed (C-127) |

**Your inputs:** one Android phone and one iPhone for the exit test. OD-11 defaults are applied (C-130); the pilot's real timetable (A10) is still welcome but not needed here.

## How I'll prove the exit gate (P6-3)

| Gate item | Evidence |
| --- | --- |
| Exactly-once: duplicate op, 50 concurrent retries | `sync.int.spec.ts`, `attendance.int.spec.ts` |
| Rejected cases: unassigned, cancelled, cross-tenant, outside the window | same specs plus the cross-tenant registry |
| ADR-017 conflicts and resolution | unit truth table; `two-device-conflict.spec.ts` |
| Offline: mark → reload → restart → reconnect → synced once; intents once | `offline-attendance.spec.ts` (desktop + Android) |
| Logout guard, revocation wipe | `offline-attendance.spec.ts`, `sync-client` unit tests |
| Teacher PWA screens, states, a11y, budgets | `teacher-pwa.spec.ts` on three projects, axe, `perf:budget` |
| G-16 nudge and Owner Today list | `notifications.int.spec.ts`, E2E |
| Perf: 60-student save < 300 ms p95 | perf smoke in `attendance.int.spec.ts` |
| Real phones | your checklist on Android Chrome and iOS Safari (installed PWA, airplane mode) |
| Common gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm i18n:check && pnpm flags:check && pnpm db:drift && pnpm perf:budget` plus CI green; staging on the latest `main` |

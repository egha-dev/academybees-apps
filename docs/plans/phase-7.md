# P7-1 · Phase 7 — Finance: plan

> **Approved by the PO on 2026-11-02** (`phase-7-start` = `9267fd3`). Decisions C-137…C-146 recorded in DECISIONS.md; C-147…C-149 added in S3b.

## Context

- **Predecessor:** Phase 6 ✅ 2026-11-02 (tag `phase-6`), so Phase 7 can start.
- **Goal:** invoice → payment → receipt is authoritative, auditable and impossible to double-count, with **every payment method enabled and no gateway** (G-30, ADR-038). Milestone **M2 Operations MVP**.
- **Refs read:**
  - CLAUDE.md §5, §9, §11, §12; IMPLEMENTATION_PLAN Phase 7 and §2;
  - ARCHITECTURE §12 (state machines, numbering, receipts, gateway-less flow, online flow), §11 (offline), §13;
  - ADR-010, ADR-018, ADR-033, ADR-038, ADR-036, ADR-039;
  - C-08, C-18, C-19, C-24, C-26, C-38, C-100, C-110 (M2), C-112;
  - OD-02, OD-10 (default applied), OD-13;
  - PRD v3.2 G-01, G-02, G-04, G-18, G-27, G-30, G-32; PRD v3.1 §19, §30, §12; UX §8–9, §11, §13.
- **Exit gate:** common gate plus the E2E journey:
  - assign a fee plan → invoice generated → partial cash → receipt → parent-reported UPI (API) → staff verify → PAID → receipt PDF;
  - cheque bounce; manual refund;
  - the simulator online path (success, failure, duplicate webhook);
  - offline cash.

### What exists, and what this phase adds

| Area | Today | Phase 7 |
| --- | --- | --- |
| Capabilities | `fee.*`, `invoice.create/issue/cancel/read`, `payment.read/record_cash/record_offline/verify/report/refund`, `finance.reconcile` already in roles | none added (`payment.verify` already exists, ADR-038) |
| Settings | `TenantSettings.finance` JSON (empty) | UPI ID + payee, bank details, methods on/off, tax (OD-10), numbering prefixes, fee policy (G-04) |
| Encryption | `packages/auth/src/secrets.ts` master-key ring (AES-256-GCM) used by bootstrap and MFA | reused for `TenantPaymentAccount` credentials (ADR-033) |
| Storage | `core/media/media-storage.ts`, private bucket, 5-minute signed GETs | finance documents (receipt/invoice PDFs) in the private bucket |
| Jobs | API-hosted BullMQ jobs (imports C-100, generation C-112, nudges) | invoice generation, overdue, reminders, reconciliation, PDF rendering — the same pattern |
| Imports | `ImportJob` (`kind` varchar) + people import pipeline (ADR-036) | `opening_balances` kind |
| Sync | Dexie v2, `attendance.*` ops, ledger | Dexie **v3** (`invoices`, `payments`), `payment.recordCash` op |
| Hub | `hub/academies/:slug/...` controller (link, join requests), `HUB` session | `…/invoices/:id/reported-payments` (flag), with per-child consent (C-110 M2) |
| Onboarding | steps profile → … → timetable → ready | optional **Fee Setup** step before Ready (C-08) |

## Decisions I'll record in S1 (C-137…C-146, safe defaults; tell me to change any)

| ID | Question | Default |
| --- | --- | --- |
| **C-137** | Where receipts and invoices become PDFs. ARCHITECTURE §12.1 says the worker, but the worker has no tenant data (C-100) | **An API-hosted job, like C-100/C-112:**<br>• the API renders the document's HTML from an immutable snapshot taken at issue or confirmation;<br>• headless Chromium (`playwright-core` with the image's system Chromium plus Noto fonts) prints it to the private bucket;<br>• concurrency 1, one shared browser closed when idle;<br>• the download shows "Preparing…" until the file exists.<br>Adds ~250 MB to the **API image**; no new service. (Phase 15 may move jobs to a jobs-only API instance.) |
| **C-138** | Invoices: per student or per family | **Per student.** Sibling discount is a line on the 2nd+ child's invoice (siblings via `ParentStudent` with the same primary parent). Family statements come in 7P/11. |
| **C-139** | Billing cycle and due date | Cycles start on the **1st** (monthly, quarterly from Apr/Jul/Oct/Jan, half-yearly from Apr/Oct, annual from Apr; custom = a start date plus N months). Invoices are generated **5 days before** the cycle and are **due on day 10** of the cycle. Each is a setting with these defaults. |
| **C-140** | G-04 defaults | Each is a `FeePolicy` setting with these defaults:<br>• **mid-cycle joiner:** full charge;<br>• **sibling discount:** off;<br>• **credit:** auto-applied at issue;<br>• **late fee:** off; when on, suggested after N = 7 days overdue and applied only with approval, as a **separate `LATE_FEE` invoice** (issued invoices are immutable);<br>• **ON_HOLD:** pauses generation from the next cycle;<br>• **instalments:** 2–12, equal, the remainder on the last. |
| **C-141** | Write-off | A new terminal invoice status **`WRITTEN_OFF`** (a refinement, like C-18's `PARTIALLY_REFUNDED`), from ISSUED or PARTIALLY_PAID. Needs `invoice.cancel` and a reason; audited; reported separately. Payments already made stay. |
| **C-142** | Numbering | `NumberSequence` row lock per (tenant, kind, fiscal year). India FY **Apr–Mar** in the academy's timezone. Format `{prefix}/{FY}/{seq:05}` with defaults `INV` and `RCT` (e.g. `INV/2026-27/00042`); prefixes configurable before the first number in a year. |
| **C-143** | Tax (OD-10, default applied) | Optional: **GSTIN on documents, one tax rate, inclusive or exclusive**, computed per line, half-up (ADR-010). Off by default. No filing or returns. |
| **C-144** | The parent-reported UPI hub route in Phase 7 (C-38) and consent (C-110 M2) | The route requires the parent's latest FAMILY_HUB grant **with `service` for that child**, so the C-110 M2 rule starts with this first hub money route. It sits behind flag `p7-hub-payments` until the 7P UI. |
| **C-145** | Simulator on staging | `PAYMENTS_SIMULATOR=on` is accepted only when `APP_ENV ≠ production`; production boot fails if set (test). Staging turns it on via a Railway variable that **you add**; local and CI turn it on in `.env` examples. |
| **C-146** | Offline cash (ADR-018) | Dexie **v3** (Phase 6 used v2) adds `invoices` (permitted roles' recent working set) and `pendingPayments`. Op `payment.recordCash` uses `clientRef = opId` with `UNIQUE(tenantId, clientRef)`. Over-payment becomes **unallocated credit flagged for review**. Never shown as confirmed before the server accepts it. |

Also recorded:
- **No Razorpay** (Phase G).
- Receipts are issued only at confirmation; nothing reported becomes CONFIRMED without `payment.verify`.
- The SaaS billing tables (Phase 13) stay separate.
- **Release flags:**
  - `p7-finance` (manage screens, Student 360/Batch Fees tabs, onboarding Fee Setup, Today pulse; on in local/ci/staging, off in production; removed in S10);
  - `p7-hub-payments` (hub route; removed in 7P with the parent UI).

## Slices and tasks

Each task: implement → `pnpm lint && pnpm typecheck` + relevant tests → Conventional Commit.
Each slice: branch `p7/<slice>` from the latest `main` → PR with the DoD checklist → merge only after every check passes on the PR head (C-43, never `--auto`).

### S1 `p7/finance-core` — plan, schema, money and state machines
- **7.1 Docs:** `docs/plans/phase-7.md`, IMPLEMENTATION_PLAN 🟨 with the slice table, DECISIONS C-137…C-146.
- **7.2 Migration `…_finance`:**
  - `fee_plan`, `fee_component`, `fee_assignment` (student, plan, discount %/fixed, validity, instalments);
  - `invoice` (status, kind REGULAR | ONE_TIME | OPENING_BALANCE | LATE_FEE | INSTALMENT, number, issue/due dates, totals, `paid_minor`, `credit_applied_minor`, `overdue_since`, snapshot JSON, `version`);
  - `invoice_line`;
  - `payment` (method, source, status, reference, `client_ref`, evidence key, verified/rejected fields, `version`);
  - `payment_allocation`, `refund`, `credit_ledger` (append-only), `number_sequence`;
  - `tenant_payment_account` (encrypted creds), `gateway_event` (unique provider event id);
  - `finance_document` (kind, entity, storage key, status), `share_link` (token hash, expiry, revoked).
  - Constraints: unique (tenant, kind, fy, number); unique (tenant, method, reference) where reference is set; unique (tenant, client_ref); CHECK amounts ≥ 0.
  - RLS via `010`. `080-finance.sql` revokes UPDATE/DELETE on ledgers, allocations, refunds and gateway events. Fixtures; rls-coverage.
- **7.3 `modules/finance/domain`:**
  - `money.ts` (half-up lines, sums, tax inclusive/exclusive, proration by days and sessions, instalment split, sibling discount);
  - `invoice.state.ts`, `payment.state.ts`: exhaustive transition tables;
  - `numbering` (FY from tenant tz).
- **Tests:** property tests for money (sums balance, never negative); exhaustive state tables; numbering FY edges (31 Mar / 1 Apr IST).

### S2 `p7/fees-api` — fee plans, policy, settings
- **7.4 `finance.policy.ts` scopes:**
  - TENANT/BRANCH for staff;
  - LINKED only via the hub (consent, C-144);
  - fee plans, components and assignments CRUD (`fee.manage`, versioned, audited);
  - one-time fees.
- **7.5 Settings → Payments API (`settings.finance`):**
  - UPI (VPA validation, payee), bank details, methods on/off, cheque handling, tax (C-143), prefixes (C-142), FeePolicy (C-140);
  - the UPI deep link and QR string built server-side (ADR-038).
- **7.6 Cross-tenant registry** entries for every endpoint.
- **Tests:** CRUD plus scope; settings validation; a bad VPA; prefix locked once used.

*As built (S1, #100):*
- **Schema:** migration `20261102090000_finance`, 14 tables.
- **`080-finance.sql`:**
  - allocations, refunds, credit entries and gateway events are append-only (gateway events may only get `processed_at` / `payment_id`);
  - only DRAFT invoices and their lines can be deleted (restrictive RLS policies);
  - CHECKs: invoice totals (`total = subtotal − discount + tax`; settled ≤ total; numbered ⇔ not draft); payment shape (confirmed ⇔ `confirmed_at`; cheque and UPI/bank/card need a reference; parent-reported needs the hub user);
  - the duplicate-reference guard (unique per method unless the earlier payment failed);
  - `invoice_one_per_cycle` (generation idempotency).
- **Fixtures:** a closed 2019-20 history in every new table.
- **Domain:** `money.ts` (half-up, largest-remainder splits, instalments, proration, GST exclusive/inclusive on discounted lines, oldest-first allocation), `invoice.state.ts`, `payment.state.ts`, `numbering.ts`.
- **Tests:** 16 unit, including fast-check properties; database integration 499.
- **Also:** the tenant client's query hook casts its arguments once (TS2590 with the larger schema).

*As built (S2):*
- **Contracts `finance.ts`:** fee plans, assignments (with a discount or instalments), `FinanceSettingsSchema` with C-139…C-143 defaults, `upiLink()` shared by API and web; VPA, GSTIN and IFSC validation.
- **`modules/finance`:**
  - `FeePlansService` (academy-wide; components replaced whole; versioned; audited);
  - `FeeAssignmentsService` (listed students or a batch's roster on the start date; branch scope via the copied `branchId`; LEFT/COMPLETED refused; never on one plan twice over the same dates);
  - `FinanceSettingsService` (sections replace stored ones; prefixes lock once a number is taken in the fiscal year; gateway status; the UPI preview).
  - `StudentsService.forFees` in people.
- **Endpoints:**
  - `GET/POST /fee-plans`, `GET/PATCH /fee-plans/:id`;
  - `GET/POST /fee-assignments`, `GET/PATCH /fee-assignments/:id`;
  - `GET /settings/finance` (`fee.read`), `PATCH /settings/finance` (`academy.settings.manage`, owner: academy-wide settings aren't for a branch-scoped accountant).
- **Tests:** `fees.int.spec.ts` (4); cross-tenant registry entries for every new endpoint; contracts unit (4).

### S3 `p7/invoices-api` — invoices, generation, rules
- **7.7 Invoices:**
  - draft / manual / issue (number, snapshot, credit auto-apply) / cancel (no confirmed payments) / write-off (C-141);
  - keyset list with filters (status, overdue, batch, student, period); detail; `@Idempotent` on issue, cancel and write-off.
- **7.8 Generation job (API-hosted, C-112 pattern):**
  - a daily platform fan-out → per-academy job → invoices for cycles starting within 5 days;
  - idempotent per (assignment, cycle);
  - ON_HOLD pause, proration (C-140), sibling discount, instalments.
- **7.9 Nightly overdue materialisation** (`overdue_since`, C-19); late-fee suggestions plus approve → LATE_FEE invoice.
- **7.10 G-27:** fee preview on transfer or status change (switch from the next cycle or prorate per policy) for the Phase 5 transfer and status dialogs.
- **7.11 Opening balances (G-02):** entry plus import kind `opening_balances` on the ADR-036 pipeline → `OPENING_BALANCE` invoices at the cut-over date.
- **Tests:**
  - generation idempotency (run twice → one invoice); FY rollover; proration and sibling maths end to end;
  - cancel refused with a confirmed payment; write-off;
  - import of 500 rows with 20 bad → 480 plus a report, re-upload → no duplicates;
  - cross-tenant.

*As built (S3; split from S3b `p7/invoice-generation`, which has 7.8, 7.10 and 7.11, to keep each PR reviewable):*
- **`InvoicesService`:**
  - drafts: create, change, delete (the database allows deletes on drafts only);
  - **issue:** totals recomputed from the lines under today's tax settings; number from `nextNumber` (row lock, rollback returns the number); frozen `snapshot`; credit applied; `invoice.issued` analytics; audit;
  - **cancel** when no money was received (also from PARTIALLY_PAID or PAID settled by credit alone, ARCHITECTURE §12.1), credit returned to the student;
  - **write-off** (C-141);
  - keyset list (`OPEN`, `OVERDUE`, kind, student); detail with lines.
- **Credit:** a transaction-scoped advisory lock per student, so two invoices issued together never spend the same credit.
- **Nightly run:** the platform job `daily-finance` (03:00 IST, one job per ACTIVE academy) → `FinanceDailyProcessor` in the API (re-checks ACTIVE) → `markOverdue` sets and clears `overdue_since`. Overdue itself stays derived (C-19).
- **Late fees (C-140):** `GET /invoices/late-fee-suggestions` charges nothing; `POST /invoices/:id/late-fee` creates and issues a separate `LATE_FEE` invoice linked by `for_invoice_id` (migration `20261102120000_invoice_late_fee_link`, at most one live per invoice).
- **i18n:** a `finance` namespace; line labels the server writes come from it.
- **Fixed before merge:** issuing deleted the draft's lines after flipping the status, which the delete policy would silently refuse, duplicating lines. Lines now go first; the test checks one set of lines.
- **Tests:** `invoices.int.spec.ts` (11): draft → issue; replay keeps one number; 12 concurrent issues → 12 numbers; concurrent credit; GST frozen at issue; write-off; cancel refused after payment; overdue run; late fees once; roles; keyset; another academy. Registry entries for all 10 endpoints.

*As built (S3b; C-147…C-149):*
- **`domain/cycles.ts`:** cycles lined up with April, custom cycles from the assignment's start; which cycles are due; due dates; mid-cycle share; one cycle's invoices with discounts and instalments that always add back up (property tests).
- **`InvoiceGenerationService`** in the daily finance job: pages through active assignments, one transaction per assignment so a bad row can't stop the rest; run twice → billed once; a cancelled invoice isn't remade; `invoice.generated` analytics.
- **`student.status_changed_on`** (migration `20261102150000`): someone back from a pause mid-cycle is billed as a joiner.
- **`SessionsService.plannedDates`:** class counts from the weekly pattern and holidays, for `PRORATE_SESSIONS`.
- **`FeeEffectsService`:** `GET /fee-assignments/effects` (preview), `POST /fee-assignments/:id/switch` (`NEXT_CYCLE` or `PRORATE`). The UI joins the transfer and status dialogs in S8.
- **`OpeningBalancesService`:** `POST /opening-balances`, and `/opening-balances/import` (template, upload, preview, commit, problems CSV) on its own queue; index `invoice_one_opening_balance`.
- **Tests:** `invoice-generation.int.spec.ts` (18), `opening-balances.int.spec.ts` (6, including the G-02 500-row acceptance), `domain/cycles.spec.ts`, `domain/opening-balance.spec.ts`.

### S4 `p7/payments-api` — record, verify, allocate, refund
- **7.12 Record payment (staff):**
  - Cash, UPI (UTR), Bank transfer, Card-on-POS → CONFIRMED by the server; Cheque → PENDING;
  - allocation across invoices under `SELECT … FOR UPDATE` (oldest due first, or chosen);
  - over-payment → credit;
  - receipt number at confirmation; `@Idempotent`; audit.
- **7.13 Verify queue:**
  - `GET /payments?status=PENDING`; confirm or reject with a reason (`payment.verify`);
  - cheque clear or bounce (+ optional bounce-charge invoice);
  - the duplicate-UTR flag (unique plus a soft warning across methods).
- **7.14 Hub reported payment (flag `p7-hub-payments`):** `POST /hub/academies/:slug/invoices/:id/reported-payments` (UTR, optional screenshot), consent check (C-144), "Awaiting academy confirmation", outbox → staff notification; confirm or reject → parent notification intent.
- **7.15 Refunds:** `payment.refund`, reason, method plus reference, partial or full → PARTIALLY_REFUNDED or REFUNDED; online only; append-only.
- **Tests:**
  - a reported payment never issues a receipt while pending; verify → exactly one receipt; reject → intent with the reason;
  - the same UTR twice is flagged; cheque transitions;
  - 20 concurrent payments on one invoice never over-allocate;
  - receipt numbers unique and sequential under concurrency;
  - a client can't set CONFIRMED; refund without the capability → 403;
  - cross-tenant 404; IDOR on hub (other child, no consent → 404).

### S5 `p7/provider-layer` — gateway-ready, simulator
- **7.16** `PaymentProvider` (create order, verify webhook, fetch status, refund, settlements); `ManualProvider` (default); `SimulatorProvider` (C-145); config validation fails production boot.
- **7.17** `TenantPaymentAccount` with envelope-encrypted creds (`packages/auth/src/secrets.ts`); the "not connected yet" status API.
- **7.18 Online flow on the simulator:**
  - `POST …/invoices/:id/pay` → INITIATED → PENDING;
  - `POST /webhooks/payments/:provider/:accountRef` → signature verified with that tenant's secret → `GatewayEvent` idempotent → CONFIRMED → allocate → receipt;
  - status polling; an hourly reconciliation job → exceptions list (`finance.reconcile`).
- **Tests:**
  - webhook replay ×10 → one confirmation; a forged signature → 401 plus a metric;
  - tenant A's account webhook never touches tenant B; an unknown account is rejected and logged;
  - credentials absent from logs and responses (log-scan test);
  - production boot with the simulator fails.

### S6 `p7/documents` — receipts and invoices as documents
- **7.19 HTML templates** (A4 and mobile):
  - academy branding, number, GSTIN, lines, discount and tax lines, paid and balance;
  - strings from `packages/i18n`, money and dates via `Intl` helpers.
- **7.20 PDF job (C-137):** Chromium plus Noto fonts in the API image; stored immutable; reprint = the same file.
- **7.21 Share links (G-18):**
  - signed, 7 days, revocable, token stored hashed;
  - a public download route on the academy host (rate-limited, no personal data in the URL);
  - a prefilled WhatsApp or email message.
- **Tests:**
  - a PDF is created for a Devanagari/Tamil name (text extract contains it);
  - link expiry, revocation and tampering;
  - documents never change after issue;
  - cross-tenant.

### S7 `p7/finance-settings-ui` — setup screens (flag `p7-finance`)
- **7.22 Settings → Payments:** UPI ID + payee + live QR preview, bank details, methods, tax, prefixes, fee rules; the "Online gateway — not connected yet" card.
- **7.23 Fee plans:** list and editor (components, cycles); assign plans to students and batches with a discount; one-time fees and instalments.
- **7.24 Onboarding Fee Setup step** (optional, skippable, C-08): one plan plus the UPI ID.
- **Tests:** E2E settings → plan → assignment; axe; budgets.

### S8 `p7/finance-ui` — daily money screens (flag `p7-finance`)
- **7.25 Finance Dashboard** (UX §13): Collected · Pending · Overdue · trend · Needs attention (verify queue, cheques, overdue, late-fee suggestions, reconciliation exceptions).
- **7.26 Invoices list and Invoice workspace:**
  - student, components, total, paid, balance;
  - Collect / Send (share link) / Download;
  - cancel, write-off, credit.
- **7.27 Collect Payment drawer:**
  - every method; allocation preview; offline-aware;
  - "Pending sync — receipt number assigned when synced".
- **7.28 Payments, Verify payments and refunds:** the Payments list; the Verify payments queue (confirm/reject); cheque clear/bounce; the refund dialog.
- **7.29 Elsewhere in the app:**
  - Student 360 **Fees** tab; Batch **Fees** tab;
  - Owner Today financial pulse;
  - Global Add (Invoice, Payment); Ctrl/⌘+K invoices.
- **Tests:** E2E on three projects; axe; budgets ≤ 200 KB (lazy drawers).

### S9 `p7/offline-cash` — offline cash and reminders
- **7.30 Dexie v3 and sync** (C-146):
  - invoices read cache and pending payments;
  - `payment.recordCash` op handler on the server, with `clientRef` unique, allocation and over-payment credit;
  - Sync Center wording for payments.
- **7.31 Fee reminder intents (in-app now, C-04):**
  - due soon and overdue, dedupe per invoice and stage;
  - staff notifications for reported payments and cheques awaiting.
- **Tests:**
  - offline E2E: record cash offline → reload → restart → online → one payment, one receipt;
  - a replayed op → DUPLICATE;
  - an over-payment flagged.

### S10 `p7/journey-e2e` — exit journey, flags, docs
- **7.32 Exit E2E:** the full journey, including cheque bounce, refund, the simulator path (success, failure, duplicate webhook) and offline cash.
- **7.33 Wrap-up:**
  - remove `p7-finance`;
  - ARCHITECTURE §12 as built; CLAUDE.md §3/§8; README tour;
  - an acceptance checklist for you (the Part F Phase 7 items).

| Slice | Branch | Tasks | Release flag |
| --- | --- | --- | --- |
| S1 | `p7/finance-core` | 7.1–7.3 | — (schema/domain) |
| S2 | `p7/fees-api` | 7.4–7.6 | — (API) |
| S3 | `p7/invoices-api` | 7.7–7.11 | — (API) |
| S4 | `p7/payments-api` | 7.12–7.15 | adds `p7-hub-payments` |
| S5 | `p7/provider-layer` | 7.16–7.18 | — |
| S6 | `p7/documents` | 7.19–7.21 | — |
| S7 | `p7/finance-settings-ui` | 7.22–7.24 | adds `p7-finance` |
| S8 | `p7/finance-ui` | 7.25–7.29 | `p7-finance` |
| S9 | `p7/offline-cash` | 7.30–7.31 | `p7-finance` |
| S10 | `p7/journey-e2e` | 7.32–7.33 | removes `p7-finance` (`p7-hub-payments` stays until 7P) |

**Analytics (counts only):**
- `invoice.issued {kind, lines}`, `invoice.generated {count}`;
- `payment.recorded {method, source}`, `payment.verified {outcome}`;
- `refund.recorded {partial}`;
- `document.shared {kind}`.

## Dependencies and gaps

- **Uses:**
  - Phase 4 students, parents and `ParentStudent` (siblings), status ON_HOLD, the import pipeline and the hub link/consent services;
  - Phase 5 batches, enrolments, transfers (G-27) and sessions (proration by sessions);
  - Phase 6 sync ledger, queue, Sync Center, notifications and intents;
  - Phase 2 idempotency, audit, rate limits and `HUB` sessions; Phase 3 onboarding steps and entitlements.
- **Missing from earlier phases, added here:**
  - the finance schema and modules;
  - `NumberSequence`;
  - document rendering;
  - per-child consent enforcement on hub reads/writes (C-110 M2, started here);
  - Dexie v3;
  - the onboarding Fee Setup step.

## Risks

| Risk | Mitigation |
| --- | --- |
| Money maths errors | Pure `money.ts` with property tests; totals are sums of half-up lines (ADR-010); every rule has unit tests (G-04) |
| Double counting (retries, concurrent collects, webhook replays, offline re-sends) | Idempotency-Key, invoice row locks, unique `client_ref` / `reference` / `provider_event_id`, concurrency tests |
| Chromium in the API image (size, memory) | Lazy, one shared browser, concurrency 1, idle close; measure the image and RSS in S6; fall back to a jobs-only API instance (Phase 15) |
| Route budget with finance screens (~190 KB pages today) | Lazy drawers/editors, `@academybee/ui/components/*` imports; tell you before any budget change |
| Legal model (OD-13) | No money flows through AcademyBee in this release (ManualProvider); counsel's confirmation is a go-live item, not a build blocker |
| Scope (10 slices) | Strict slice order; the API slices land before UI; flags keep `main` deployable |

## Your inputs

- **A10:** the pilots' real fee structures (plans, one-time fees, sibling rules), to tune the defaults in C-139/C-140.
- **Staging:** add `PAYMENTS_SIMULATOR=on` in Railway (C-145) and renew `RAILWAY_TOKEN` (the deploy workflow still fails).
- **OD-13:** legal confirmation of the merchant-of-record model before go-live (not needed to build).

## How I'll prove the exit gate (P7-3)

| Gate item | Evidence |
| --- | --- |
| State machines, money rules | unit: `invoice.state`, `payment.state`, `money` property tests |
| Exactly-once money (retries, concurrency, replays, offline) | `payments.int.spec.ts`, `webhooks.int.spec.ts`, `finance-sync.int.spec.ts` |
| No client-set CONFIRMED; verify-only confirmation; receipts only on confirmation | integration plus E2E |
| Tenant isolation, hub consent, IDOR | cross-tenant registry; `hub-payments.int.spec.ts` |
| Credentials never leak; simulator blocked in production | log-scan test; config boot test |
| Documents (Indic names, immutability, share links) | `documents.int.spec.ts` |
| Journey | `finance-journey.spec.ts` (desktop, Android, iPhone; offline cash on Chromium) |
| Common gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm e2e && pnpm i18n:check && pnpm flags:check && pnpm perf:budget`; CI green; staging on the latest `main` |

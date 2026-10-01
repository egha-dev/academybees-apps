# AcademyBee PRD v3.2 Addendum — Product Owner Corrections

> **Status:** Approved baseline extension to PRD v3.1 and UX Spec v1.1 · 2026-09-29
> **Authority:** Same as the PRD. Where this addendum and earlier PRD/UX text differ, this addendum wins.
> **Why:** A product-owner review of PRD v3.1, UX v1.1 and the engineering documents found gaps that would block a real academy from going live, create legal or financial risk, or leave success unmeasurable. Each gap below has a requirement, the phase it lands in, and acceptance criteria.

---

## 1. Build order — ratified with one insertion

The 17-phase order (Phase 0–16) is ratified as the official build order, replacing PRD v2 §14 and PRD v3 §32.

**Insertion: Phase 7P — Pilot Readiness Pack**, between Phase 7 (Finance) and Phase 8 (CRM).

Why: PRD v3 §8 (MVP contract) and §25 (pilot strategy) say a real academy must run daily work *including parents*. Under the original order parents get access only at Phase 11, which would delay the first pilot by about four phases and remove the real-world feedback PRD v3 §31 calls "the final validation layer". Phase 7P brings in only what a pilot needs:

| Item | Moved from | Gap ref |
| --- | --- | --- |
| Parent Core: sign-in, child selector, attendance, fees and receipts, Pay (UPI with academy confirmation, G-30), notifications | Phase 11 | G-12 |
| Basic help and support (help centre link, contact support, feedback) | Phase 14 | G-10 |
| Legal acceptance and consent screens in use | Phase 15 | G-06 |
| Activation analytics dashboard (internal) | Phase 12/14 | G-09 |
| Sales demo academy | new | G-13 |
| Pilot runbook and success criteria | new | G-29 |

The pilot runs **alongside** Phases 8–16; pilot feedback is triaged at every phase gate. Phase 11 then completes the parent experience (leave requests, homework, progress, offline cache polish) and the student experience.

---

## 2. Gap register

Priority: **P0** = blocks pilot or launch, or creates legal/financial risk · **P1** = needed for a commercially credible product · **P2** = important, schedulable later.

| ID | Gap | Priority | Phase |
| --- | --- | --- | --- |
| G-01 | Who receives parents' fee money (merchant-of-record model) | P0 | 7 (decide now) |
| G-02 | Importing existing students and opening fee balances | P0 | 4, 7 |
| G-03 | Holidays and academy calendar | P0 | 5 |
| G-04 | Fee rules that real academies need (proration, sibling discount, credit, late fee, pause) | P0 | 7 |
| G-05 | Complete student profile fields incl. emergency and medical notes | P0 | 3/4 |
| G-06 | Privacy, consent and legal terms (DPDP Act, minors' data) | P0 | 3, 4, 7P, 15 |
| G-07 | Messaging compliance in India (SMS DLT, WhatsApp, email authentication) | P0 | 10 (start paperwork now) |
| G-08 | Localisation foundation (Indian number format; extended by G-32) | P1 | 0 |
| G-09 | Product analytics instrumentation for activation metrics | P1 | 0, every phase, 7P |
| G-10 | Customer support from day one of pilot | P0 | 7P, 14 |
| G-11 | Owner/accountant account security (2FA, devices, login alerts) | P1 | 2 |
| G-12 | Parent access before pilot | P0 | 7P |
| G-13 | Sales demo academy | P1 | 7P |
| G-14 | Marketing site and academy acquisition funnel | P1 | parallel track, before pilot outreach |
| G-15 | Full academy data export (portability) | P0 | 12 (before 13) |
| G-16 | Teacher nudges and session accountability | P1 | 6, 10, 12 |
| G-17 | Parent leave requests (planned absence) | P1 | 11 |
| G-18 | Shareable and printable receipts and invoices | P0 | 7 |
| G-19 | Academy public profile and enquiry page | P1 | 8 |
| G-20 | AcademyBee → owner lifecycle communications | P1 | 13 |
| G-21 | GST-compliant AcademyBee subscription invoices | P0 | 13 |
| G-22 | Support hours, uptime commitment, incident communication | P1 | 15 |
| G-23 | App-store presence (Play Store via Trusted Web Activity) | P2 | backlog after 11 |
| G-24 | Browser and device support matrix, performance budget | P0 | 0 |
| G-25 | Pricing and packaging hypothesis | P0 | 3 (seed), 13 (bill) |
| G-26 | Tenant-level recovery from mistakes (undo, restore) | P1 | 4–7, 15 |
| G-27 | Batch transfer and student status effects on fees | P0 | 5, 7 |
| G-28 | Business prerequisites with long lead times | P0 | start now |
| G-29 | Pilot success criteria with numeric targets | P0 | 7P |
| G-30 | Payments fully enabled **without** a gateway integration (current release) | P0 | 7, 7P, 11, 13; gateway in Phase G |
| G-31 | Family Hub: one parent login across many academies (QR / URL / invite to add academies) | P0 | 1, 2, 4, 7P, 10, 11 |
| G-32 | Multilingual support: English-only launch, invisible foundations from Phase 0, languages delivered in Phase L | P1 | 0, 2, 7, L |

---

## 3. Requirements

### G-01 — Merchant-of-record for academy fees (P0)
**Problem.** The PRD never says whose bank account receives parents' online payments. If AcademyBee collects money for academies and later pays it out, it may be acting as a payment aggregator, which in India needs RBI authorisation. It would also hold other people's money.
**Requirement.**
- AcademyBee **never holds or settles academy fee money**. Parents pay the academy directly.
- Each academy can **connect its own payment gateway account** (default: Razorpay). Credentials or OAuth tokens are stored encrypted per tenant (envelope encryption, never returned to the client, rotatable). Webhooks route to the tenant by gateway account ID.
- Academies without a gateway can show their **UPI ID/QR** on invoices; parents pay outside AcademyBee and staff record the payment (reference number captured). This path is never labelled "online payment".
- "Pay online" appears for a parent **only** when the academy has a verified, connected gateway.
- AcademyBee's own subscription revenue (Phase 13) uses AcademyBee's own gateway account, completely separate.

**Current release (PO decision 2026-09-29, G-30):** no gateway is integrated yet. Everything above is designed and the `PaymentProvider` interface is built, but connecting a real gateway happens in **Phase G — Gateway Activation**, run when OD-02/OD-13 are settled.

**Acceptance.** Tenant A's parents' payments can never land in tenant B's or AcademyBee's account. A gateway webhook for an unknown account is rejected and logged. Credentials never appear in logs, API responses or the browser. Legal counsel confirms the model before Phase 7 go-live (OD-13).

### G-02 — Data import and opening balances (P0)
**Problem.** Every pilot academy already has 50–500 students in registers or spreadsheets. Adding them one by one kills onboarding (PRD v3 §19 time-to-value).
**Requirement.**
- **Import students and parents** from CSV/XLSX using a downloadable template: column mapping, validation preview (errors per row in plain language), duplicate detection (phone/name+DOB), optional batch assignment, dry-run then commit, idempotent re-upload, downloadable error report. Runs as a background job with progress. Available in onboarding ("Import from spreadsheet" alongside "Add a few students") and in Students.
- **Opening balances**: import or enter existing dues per student as opening invoices (clearly typed `OPENING_BALANCE`, dated the cut-over date), so pending fees are right from day one.
- Plan limits apply to imports, with a clear message before commit.

**Acceptance.** A 500-row file with 20 bad rows imports 480, reports 20 with reasons, and re-uploading the corrected file creates no duplicates. Opening balances show in the finance dashboard and on parent views.

### G-03 — Holidays and academy calendar (P0)
**Requirement.** Holidays and closures per academy or branch (single day or range, with a reason). Session generation skips them. Declaring a holiday over existing sessions offers to bulk-cancel them and notify parents. Make-up sessions (ad-hoc, linked to the cancelled one). Holidays are visible on the timetable, teacher Today and parent schedule.
**Acceptance.** Declaring Diwali (3 days) cancels the affected sessions, generation never recreates them, and parents get one notification per child.

### G-04 — Fee rules for real academies (P0)
**Requirement** (all configurable per academy, sensible defaults):
- **Mid-cycle joiners**: charge full / prorated by days / prorated by sessions / start next cycle.
- **Sibling discount**: automatic % or fixed amount for the 2nd+ child of the same parent.
- **Advance payments and credit balance**: over-payments become student credit, applied automatically to the next invoice (visible and auditable).
- **Late fee**: optional; suggested automatically after N days overdue, applied only with staff approval.
- **Fee pause**: student ON_HOLD stops recurring invoice generation from the next cycle.
- **Write-off**: needs the `invoice.cancel` capability plus a reason; it's audited and shown separately in reports.
- **One-time fees**: admission fee, uniform or kit, exam or competition fee, event fee.
- **Instalments**: split a large fee (for example an annual course) into scheduled invoices.

**Acceptance.** Every rule has unit tests on the money maths. Invoices show each component and discount line clearly, and the parent sees the same breakdown.

### G-05 — Student profile completeness (P0)
**Requirement.** Student: full name, preferred name, photo (optional), date of birth, gender (optional, includes "prefer not to say"), school and grade (tuition), admission number (automatic, configurable prefix), admission date, address (optional), **emergency contact**, **medical or allergy notes** (visible to owner/admin and assigned teachers only, never exported to parents of other children, audited), consent record (G-06), tags, custom fields (up to 10 per academy, typed: text, number, date, select). Parent: name, relationship, phone (WhatsApp-capable flag), email, preferred language, occupation (optional), pickup-authorised flag (kids academies).
**Acceptance.** Medical notes are hidden from receptionist and accountant roles, and every read of them is audited. Custom fields appear in the Student 360 Overview and in imports and exports.

### G-06 — Privacy, consent and legal (P0)
**Problem.** AcademyBee processes children's personal data. India's Digital Personal Data Protection Act 2023 and its Rules (notified in 2025, with phased compliance dates) require, among other things, verifiable parental consent for children's data, purpose limitation, and rights to access, correct and erase. The PRD mentions none of these specifically. *Exact obligations and timelines must be confirmed with legal counsel.*
**Requirement.**
- Roles: the **academy is the data fiduciary**; **AcademyBee is the data processor**. This is documented in a Data Processing Agreement.
- **Owner accepts** Terms of Service, Privacy Policy and DPA at first login during onboarding (version and timestamp stored; re-acceptance prompted when versions change).
- **Parent consent capture**: at parent account activation (and optionally on admission forms) the parent consents to processing of their child's data for stated purposes. Stored as `ConsentRecord` (who, for which child, purposes, notice version, timestamp, channel) and withdrawable, with the effects of withdrawal explained.
- **Academy privacy notice**: a per-tenant notice page generated from a template (academy name, contact, purposes), linked from parent sign-in.
- **Data rights requests**: owner can export or correct a student's data; erasure is an audited anonymisation workflow that keeps financial records as the law allows (Phase 15 completes the workflow).
- **Marketing opt-in** kept separate from service messages.
- Breach response runbook (Phase 15).

**Acceptance.** No parent account becomes active without a recorded consent. Consent history is visible on the Student 360 and exportable.

### G-07 — Messaging compliance, India (P0 — paperwork starts now)
**Requirement.**
- **SMS**: TRAI DLT registration of the principal entity, sender headers and every template. Templates are stored with their DLT template ID, and sends with an unregistered template are blocked.
- **WhatsApp**: Meta Business verification, a WhatsApp Business Account on the Cloud API, approved templates per category (utility vs marketing), recorded opt-in per parent, and respected opt-out. **Sender strategy**: default one AcademyBee-managed number with the academy name in the template body; option (Growth plan and above) for an academy to connect its **own** WhatsApp Business number.
- **Email**: sending domain authenticated with SPF, DKIM and DMARC. Transactional mail comes from `no-reply@mail.academybees.com` with the academy's name as the display name and the academy's reply-to address.
- Per-tenant **usage metering** and caps per plan (WhatsApp and SMS are paid per message).

**Acceptance.** Every outbound SMS or WhatsApp is traceable to a registered or approved template. Opted-out parents receive only legally required service messages through the allowed channels.

### G-08 — Localisation foundation (P1)
**Requirement.** From Phase 0 all UI text is externalised (message catalogue with ICU plurals). Formatting uses `Intl` with the tenant locale: **Indian digit grouping** (₹1,00,000), dd MMM yyyy dates, and 12-hour times by default. English (India) is the only language at launch. Parent-facing screens are designed to take longer strings. Full multilingual planning is in **G-32** (languages delivered in Phase L).
**Acceptance.** A pseudo-locale build shows no hard-coded strings on Tier-1 screens.

### G-09 — Product analytics (P1)
**Requirement.** An event taxonomy covering the PRD v3 §27 metrics, sent server-side where possible and **never with personal data** (IDs are hashed, no names or phones). Core events: `tenant_provisioned`, `owner_invite_accepted`, `onboarding_step_completed{step}`, `onboarding_completed`, `student_created{source}`, `import_completed`, `batch_created`, `session_generated`, `attendance_marked{mode:online|offline}`, `sync_conflict`, `invoice_issued`, `payment_confirmed{method}`, `parent_activated`, `parent_first_login`, `lead_created{source}`, `trial_completed`, `admission_converted`, `message_sent{channel}`. Tool: PostHog (cloud or self-hosted) behind an `Analytics` port, or an internal `ProductEvent` table if privacy review prefers. Each phase adds its events as part of Definition of Done.
**Acceptance.** The Phase 7P activation dashboard shows, per pilot academy, the funnel from provisioned → onboarding complete → first attendance → first payment → first parent login.

### G-10 — Support from day one (P0)
**Requirement (Phase 7P).** A "Help" entry in every shell containing: a help centre (static articles for the 15 most common tasks, with screenshots), **Contact support** (WhatsApp and email, prefilled with academy and page context, no personal data), a **feedback** form (category, message, optional screenshot), and a "What's new" note. Support hours are published. Phase 14 adds full support tickets in the console.
**Acceptance.** A pilot owner can reach a human in two taps from any screen.

### G-11 — Account security for money roles (P1)
**Requirement (Phase 2).** Optional TOTP 2FA for any tenant user, **strongly prompted for Owner and Accountant** (tenant setting can make it mandatory); recovery codes; a "Devices & sessions" page with sign-out per device and sign-out everywhere; email alerts for new-device sign-ins and password changes. Console 2FA remains mandatory (Phase 14, IP allow-list until then).

### G-12 — Parent Core before pilot (P0)
Covered by §1 (Phase 7P).
**Acceptance.** A parent invited by the academy can, on a phone, sign in, see each child's next class, attendance this month, dues and receipts, and pay by UPI with "I've paid" + UTR (G-30), seeing "Awaiting academy confirmation" until staff confirm and the receipt appears. Online gateway payment is added in Phase G.

### G-13 — Sales demo academy (P1)
**Requirement.** A platform-owned tenant (`demo` slug, reserved) with realistic Indian seeded data: 3 batches, 60 students, 8 weeks of attendance, invoices in each state, leads in each stage. Demo credentials for each role are shown on a demo login panel. Data **resets nightly**. The tenant is fully isolated, and outbound messaging goes only to a sink.
**Acceptance.** A salesperson can demo every Tier-1 screen without touching a real tenant.

### G-14 — Marketing site and acquisition (P1, parallel track)
**Requirement.** `academybees.com`: value proposition per academy type, feature pages matching the five outcomes, a pricing page (from G-25), "Book a demo" and "Join the pilot" forms that create platform leads (emailed to the founder until the Phase 14 console lists them), Terms, Privacy, DPA, a security page, and a contact page. It can be built in the `(marketing)` route group or a no-code site. **Needed before pilot outreach.**

### G-15 — Full academy data export (P0 before billing)
**Requirement.** The owner can request a full export (a ZIP of CSVs: students, parents, batches, enrolments, sessions, attendance, invoices, payments, receipts, leads, assessments, plus attachments manifest). It is generated asynchronously, arrives as a download link, and is available in every subscription state including Suspended (PRD v3 §20 "never block critical data access").
**Acceptance.** Exporting the fixture academy and re-importing its students into a fresh tenant round-trips without loss of core fields.

### G-16 — Teacher nudges and accountability (P1)
**Requirement.** Phase 6: in-app nudge to the teacher 30 minutes after a session ends without attendance, and the owner's Today shows "attendance not taken". Phase 10: the same nudge by push or WhatsApp (tenant setting), plus a session reminder to teachers. Phase 12: a "Classes held vs scheduled" and "attendance taken on time" report per teacher.

### G-17 — Parent leave requests (P1)
**Requirement (Phase 11).** A parent marks a child as absent for a future date or range with a reason. The child appears pre-marked "Leave (parent informed)" on the teacher's roll call (the teacher can override). The owner can see leave patterns.

### G-18 — Shareable receipts and invoices (P0)
**Requirement (Phase 7).** A4 PDF and a compact mobile-friendly version, carrying the academy branding, number, GSTIN (if configured), line items, and paid/balance. "Share" creates a signed, expiring link (7 days, revocable) for WhatsApp or email and copies a prefilled message. Staff can reprint any receipt. Receipts are never editable after issue (corrections go through refund or credit).

### G-19 — Academy public page (P1)
**Requirement (Phase 8).** An optional public page at `{slug}.academybees.com/` for signed-out visitors, when enabled: logo, about, courses offered (names, levels, age groups, optional fees), locations and timings, contact, WhatsApp button, and the enquiry form (creates a Lead). Includes SEO metadata. It's off by default, and the owner controls every field.

### G-20 — Lifecycle communications to owners (P1)
**Requirement (Phase 13).** Emails and in-app messages: welcome, onboarding nudges (day 1/3/7 when incomplete), trial ending (7/3/1 days), payment failed, grace period, suspension warning, monthly academy summary. All are templated and can be switched off except billing and security notices.

### G-21 — GST-compliant subscription invoices (P0)
**Requirement (Phase 13).** AcademyBee's own subscription invoices comply with GST: AcademyBee legal name, GSTIN, invoice number series, place of supply, SAC code (confirmed by the CA), CGST/SGST or IGST split, and the customer academy's GSTIN (optional, for input credit). E-invoicing obligations depend on turnover and must be confirmed by the CA. These are separate from academy fee invoices (G-01, OD-10).

### G-22 — Service commitments (P1)
**Requirement (Phase 15).** Published support hours and response targets per plan, an uptime target (99.5% at launch, 99.9% once commercially required per PRD v3 §16), a status page, an incident communication template, and a maintenance window policy.

### G-23 — App-store presence (P2, backlog)
**Requirement.** After Phase 11, evaluate a Play Store listing that wraps the PWA as a Trusted Web Activity (same codebase, same tenant URL model) so parents can find it the way they expect. An iOS App Store listing is out of scope unless PWA limits are proven to hurt adoption. Decide using pilot evidence.

### G-24 — Browser, device and performance baseline (P0)
**Requirement (Phase 0 definition, verified continuously, audited in Phase 15).**
- Supported: Android 10+ with current Chrome; iOS/iPadOS 16.4+ Safari (installed PWA required for web push); desktop Chrome, Edge, Firefox and Safari (latest two versions).
- Reference low-end device: a 3 GB RAM Android phone on 4G.
- Budgets on Tier-1 screens: LCP < 2.5 s (4G, reference device), INP < 200 ms, route JS < 200 KB gzipped for teacher and parent experiences, offline cold start of Teacher Today < 1.5 s.

### G-25 — Pricing hypothesis (P0 to seed; validate in pilot)
A **hypothesis** to be validated with the pilot and market research, not final pricing:

| Plan | Hypothesis (₹/month, billed annually) | Limits | Features |
| --- | --- | --- | --- |
| Trial | Free, 30 days | 100 students | Everything in Growth |
| Starter | ~₹999 | 100 students, 5 staff | Attendance + offline, fees, parent app, in-app/email |
| Growth | ~₹2,499 | 300 students, 15 staff | + CRM, learning, WhatsApp/SMS (pass-through usage), reports |
| Pro | ~₹4,999 | 1,000 students, 40 staff | + custom domain, own WhatsApp number, advanced reports, priority support |

WhatsApp and SMS are charged as pass-through usage plus a margin, or through message packs. Plans seed as `PlanEntitlement` rows in Phase 3; prices are set in Phase 13.

### G-26 — Recovering from mistakes (P1)
**Requirement.** Operational edits get a short "Undo" toast (enrolment end, session cancel, attendance bulk change) where safe. Archived students, batches and leads can be restored for 90 days. Finance corrections go only through reversing entries. Phase 15 adds a runbook for tenant-scoped data recovery from backups (restore to a sandbox, selectively copy with audit).

### G-27 — Batch transfer and status effects (P0)
**Requirement.** A **Transfer student** action (Phase 5) ends the old enrolment and starts a new one on a chosen date, keeping attendance history. The fee effect is decided in Phase 7 (switch fee plan from the next cycle, or pro-rata adjustment per the G-04 policy). Status changes to ON_HOLD, COMPLETED or LEFT show the fee and schedule consequences before confirming.

### G-28 — Business prerequisites with long lead times (P0, start now)
These are not engineering tasks, but engineering will stall without them:

| Item | Needed by | Typical lead time |
| --- | --- | --- |
| Company or legal entity, PAN, bank account | Razorpay KYC, GST | weeks |
| GST registration | Phase 13 (and earlier for Razorpay) | 1–4 weeks |
| Domain `academybees.com` + DNS provider supporting wildcard | Phase 1 staging | days (if available) |
| Razorpay account (AcademyBee) + test keys; understand the academy-account model | Phase 7 | 1–3 weeks KYC |
| Meta Business verification + WhatsApp Cloud API number + templates | Phase 10 | 1–4 weeks |
| TRAI DLT registration (entity, headers, templates) | Phase 10 | 1–3 weeks |
| Email provider + domain authentication | Phase 2 | days |
| Lawyer: Terms, Privacy Policy, DPA, DPDP review, payment model review | Phase 3 (terms), Phase 7 (G-01), 15 | 2–6 weeks |
| Chartered accountant: GST on SaaS, invoice format | Phase 13 | 1–2 weeks |
| Two pilot academies (one tuition, one activity) with signed pilot agreements | Phase 7P | start conversations now |

### G-29 — Pilot success criteria (P0)
PRD v3 §25 says what to measure but not the targets. Pilot exit targets (4 consecutive weeks, per academy):

| Metric | Target |
| --- | --- |
| Onboarding to first attendance | ≤ 2 days, completed without engineer help |
| Sessions with attendance recorded within 24 h | ≥ 90% |
| Attendance marked by teachers themselves (not admin) | ≥ 80% |
| Offline attendance syncs without manual intervention | ≥ 99% of ops |
| Fee payments recorded in AcademyBee (vs outside) | ≥ 80% |
| Parents activated | ≥ 50% of families |
| Owner weekly active | 4/4 weeks |
| P0 bugs open | 0 |
| Owner says they would pay (at a stated price) | Yes |

If the targets are missed, fix root causes before commercial launch; don't just add features (PRD v3 §25).

### G-30 — Payments enabled now, gateway integration later (P0)
**PO decision (2026-09-29).** No payment gateway is integrated in this release, but **every payment feature is built and enabled** so academies and parents can use the full money workflow today. Plugging in a gateway later must be an adapter change, not a redesign.
**Requirement.**
1. **Staff-recorded payments**, all enabled: Cash, UPI (UTR/reference required), Bank transfer (NEFT/IMPS/RTGS reference), Cheque (number, bank, date → `PENDING` until marked *cleared* → `CONFIRMED`, or *bounced* → `FAILED` with an optional bounce charge). Also card-on-POS (reference).
2. **Parent-reported UPI payment** ("Pay" for parents): the parent sees the academy's UPI ID and QR code, plus a one-tap `upi://pay` link pre-filled with amount, academy name and invoice number → pays in any UPI app → returns and taps **"I've paid"**, entering the UTR (and optionally a screenshot) → a payment is created as `PENDING` (source `PARENT_REPORTED`) and the parent sees **"Awaiting academy confirmation"** → staff get a **Verify payments** queue → **Confirm** (→ `CONFIRMED`, receipt issued, parent notified) or **Reject** with a reason (→ `FAILED`, parent notified). The same UTR used twice is flagged automatically.
3. **Online gateway, built but not connected:** the `PaymentProvider` interface, `TenantPaymentAccount`, webhook endpoint, `GatewayEvent` idempotency, polling UI and reconciliation job are all built now. Adapters:
   - `ManualProvider` — production default. Settings → Payments shows "Online card/UPI gateway: not connected yet" with the UPI setup that works today.
   - `SimulatorProvider` — **local, CI, staging and the demo academy only** (the app refuses to start in production if it is configured). It simulates checkout success, failure and delayed or duplicate webhooks, signed with a test secret, so the full online pipeline is exercised by automated tests today.
   - `RazorpayProvider` — built in Phase G.
4. **Refunds**, enabled: recorded manually (cash, UPI or bank back, reference required), `payment.refund` capability, reason and approval, append-only. Gateway refunds arrive in Phase G.
5. **SaaS billing (Phase 13)** uses the same pattern: AcademyBee's invoice shows AcademyBee's UPI and bank details → the academy owner reports the payment with a UTR → Super Admin verifies → subscription becomes Active. Automatic renewals by gateway arrive in Phase G.
6. **All payment features are on for every plan**, including Trial. Plan limits for students and staff are unchanged.

**Integrity rules still apply.** Nothing reported by a parent or owner is `CONFIRMED` until a staff member (or later the gateway webhook) confirms it. Receipts are issued only on confirmation. The UI never shows "Payment successful" for a pending payment.

**Acceptance.** A parent can settle an invoice end to end with UPI and see the receipt after staff confirmation. Staff can record every method. Cheque clear and bounce work. Refunds are recorded. The simulator-driven E2E proves the online path. Production start-up fails if `SimulatorProvider` is enabled.

### G-31 — Family Hub: one parent login across many academies (P0)
**Problem.** Families often use more than one academy (tuition at one, karate at another). Every academy lives on its own URL with its own login and app, so such a parent would need two apps, two logins and two sets of notifications. That makes AcademyBee feel fragmented exactly where it should feel simplest.
**PO decision (2026-09-29).** Parents (and students) use **one AcademyBee Family Hub** at **`app.academybees.com`** (OD-17, closed): one login, one installed app, every linked academy and child in one place. Staff (owner, admin, teacher, accountant, receptionist) keep using each academy's own URL.

**Requirement.**
1. **One account, many academies.** A parent signs in once (email + password now, phone OTP from Phase 10) and sees every academy they are linked to. With one academy, the hub opens straight into it (no extra step). With two or more, Home shows all children across academies.
2. **Adding an academy**, three ways:
   - **Scan the academy's QR code**: each academy gets a printable "Join us on AcademyBee" poster and QR in Settings, encoding `https://app.academybees.com/join/<slug>`.
   - **Enter the academy's address or code manually**: `gurushethra.academybees.com`, or just `gurushethra`.
   - **Accept an invite from the academy** (email / WhatsApp / SMS link with a one-time token). If the invited person already has an AcademyBee account, the invite simply adds this academy to their hub.
3. **Scanning or typing never grants access by itself** (security). After choosing an academy, the parent must prove they are the parent the academy has on record:
   - **Match & verify**: if the academy has a parent record with the parent's verified email/phone, a one-time code is sent to that email/phone. Entering it links the account. The response is always the same ("If this academy has your details, you'll receive a code"), so nobody can discover who studies where.
   - **Or send a join request**: if there's no match, the parent submits a request (their name, phone, child's name). It appears in the academy's **Join requests** queue, and staff approve it by linking to the right student(s) or reject it. The parent sees the status.
   - **Invite token**: pre-verified; one tap plus consent.
   - On every new academy link, the parent gives **consent for that academy** (each academy is a separate data fiduciary, G-06).
4. **Unified views** (hub Home):
   - **Today across academies**: all children's classes today, in time order, each tagged with its academy logo/name.
   - **Children**: each child card shows the academy/course, next class, this month's attendance, and dues.
   - **Money**: dues grouped **per academy** ("₹2,500 due to Gurushethra · ₹1,800 due to ABC Karate"). Payment is always made to each academy separately (never one combined payment: different merchants, G-01/G-30).
   - **Notifications**: one merged inbox with an academy badge on each item. Tapping an item opens that academy's context.
   - **Academy switcher**: an "All academies" view, or one academy at a time (that academy's logo and accent colour are applied while viewing it).
5. **Same child at two academies.** Each academy keeps its own student record. In the hub, the parent may **group** them as one child ("Aarav: Karate at ABC, Maths at Gurushethra"). AcademyBee suggests groupings when the name and date of birth match. This grouping is private to the parent and never visible to either academy.
6. **Privacy between academies.** An academy can never see that a parent or child also uses another academy: no shared data, no counts, no cross-academy search. Each academy's data is fetched under that academy's own tenant context (ADR-039). Removing a parent link at the academy, or suspending or archiving the academy, removes or greys out that academy in the hub immediately ("This academy is currently unavailable").
7. **Managing academies.** Hub → Settings → My academies lists linked academies, consent per academy (view or withdraw), notification preferences per academy, and "Leave this academy" (which unlinks the parent's access; the academy keeps its own records).
8. **Links and notifications.** All parent-facing links (emails, WhatsApp, push, receipts) point to the hub (`app.academybees.com/a/<slug>/…`). A parent who opens an academy's own URL and signs in is sent to the hub, with that academy selected.
9. **Offline.** The hub caches each linked academy's working set (children, schedule, attendance, invoices, recent notifications), tagged by academy, with "Last updated" shown per academy.
10. **Later (backlog):** teachers who work at several academies get a "My academies" launcher in the hub with single sign-on into each academy URL.

**Acceptance.**
- A parent linked to two academies signs in once and sees both children's classes for today in one list, dues per academy, and one merged notification inbox.
- Scanning academy B's QR adds academy B only after code verification or staff approval.
- Guessing an academy code or a phone number reveals nothing.
- Academy A's staff can find no trace of academy B.
- Unlinking at academy B removes B from the hub on the next refresh.
- Automated tests prove that every hub request for academy B runs under academy B's tenant context and membership.

### G-32 — Multilingual AcademyBee (P1 — English-only launch; invisible foundations now, languages in Phase L)
**PO decision (2026-09-29).** AcademyBee will support multiple languages. Everything that would be expensive to retrofit is built from Phase 0. The languages themselves ship in **Phase L — Multilingual Rollout** (any time after Phase 11), and after that **adding a language needs no code change**.

**What must be translatable (seven layers):**

| Layer | Examples | How |
| --- | --- | --- |
| 1. App interface | Buttons, menus, empty states, errors | Message catalogue per locale (ICU plurals/gender); error codes map to translated messages |
| 2. Numbers, dates, money | ₹1,00,000 · 29 Sept 2026 · 5:30 pm | `Intl` with the user's locale; Latin digits by default |
| 3. System messages | Emails, push, in-app, WhatsApp, SMS | Template variants per language; recipient's language chosen automatically; WhatsApp/DLT templates registered per language |
| 4. Documents | Receipts, invoices, exports | HTML → PDF in headless Chromium with Noto fonts, so Indic scripts render correctly; academy chooses the document language or bilingual (English + regional) |
| 5. Legal & consent | Privacy notice, consent screen, Terms | Versioned per language. Under the DPDP Act a data principal may be entitled to the notice in English or a language of the Eighth Schedule (confirm with counsel) |
| 6. Academy-authored content | Announcements, templates, public page, course names | Announcements, message templates and the public page support per-language variants. Master data (course, batch names) is stored as typed, with optional translations later |
| 7. Help centre | Help articles, What's new | Articles per language, falling back to English |

**Language rules**
- **Who sees what:** the user's own choice → the academy's default language → the browser language → English (India). Each user picks their language in their profile. Parents' messages use the language on their parent record (G-05).
- **Academy settings:** default language plus enabled languages. The language switcher shows only enabled languages and is hidden while only English exists.
- **Fallback, never broken screens:** a missing translation shows English for that string, is logged, and fails CI for Tier-1 screens in any "complete" language.
- **Names and typed text:** every text field accepts any script (Tamil, Devanagari, Kannada…). Validation must be Unicode-aware (no ASCII-only name rules). Sorting uses locale-aware collation, and search matches native-script names.
- **Layout:** text can grow 30–50% (Tamil, Malayalam), so layouts avoid fixed-width buttons and truncated labels. Line heights are tuned for Indic scripts. CSS uses logical properties (`margin-inline-start`, not `margin-left`), keeping right-to-left scripts (Urdu, or Arabic for Gulf academies) possible later without a redesign.
- **Fonts:** Inter for Latin, plus the Noto Sans family per script, loaded only when that language is active, so the performance budget (G-24) holds.
- **Translation quality:** machine translation may produce drafts, but a **native speaker reviews** every string before release. Money, consent and legal text always need human review. There is a glossary per language for academy terms (batch, fees, attendance, receipt).
- **Which experiences come first:** the Family Hub (parents, students) first, then the Teacher PWA, then academy management screens. The Super Admin console stays in English.

**Release 1 is English only (PO decision, 2026-09-29).** AcademyBee launches in English (India). Until Phase L, build only the groundwork that is cheap now and expensive to retrofit. Everything a user would see as "language features" waits for Phase L.

| Built now (Phases 0–16, invisible to users) | Deferred to Phase L |
| --- | --- |
| Every text in a message catalogue (`en-IN` only); CI blocks hard-coded strings | Other-language catalogues and translation workflow |
| `Intl` formatting helpers (₹1,00,000, dates, times) | Language switcher in profile |
| `preferredLocale` columns and locale in request context, always `en-IN` for now | Academy language settings UI (enabled languages, default, document language) |
| Unicode-aware name validation: parents and students can already type names in Tamil, Hindi or any script | Per-language editors for announcements, templates, public page, legal, help |
| CSS logical properties; layouts tolerate longer text (pseudo-locale check in CI) | WhatsApp/DLT template registration per language, Unicode SMS pricing |
| Receipts rendered HTML → PDF in headless Chromium with a Noto fallback font, so non-Latin names print correctly | Per-script font loading, bilingual receipts |
| Translatable content (templates, announcements, legal, help) stored locale-keyed, with only `en-IN` filled | Cross-script (transliteration) search, RTL activation, AI translation drafts |

**First languages (OD-18):** Hindi, plus the main language of the pilot academies' region (for example Tamil), chosen from pilot evidence. Later waves come by customer demand; typical candidates are Telugu, Kannada, Malayalam, Marathi, Bengali and Gujarati.

**Acceptance.**
- **Before Phase L:** pseudo-locale and "long-text" builds show no hard-coded strings or broken layouts on Tier-1 screens. A Tamil or Hindi name can be entered, saved, searched, sorted and printed on a receipt.
- **After Phase L:** a parent switches to Hindi and sees the whole Family Hub, notifications and receipts in Hindi. A new language is added with catalogue files, fonts and template registrations only, with no code change.

---

## 4. Deferred items — confirmed

Multi-branch management UI, Expenses, Certificates & Events, custom domains activation, custom tenant roles UI, native apps and regional languages stay in the backlog (IMPLEMENTATION_PLAN §4). They are revisited after the pilot using pilot evidence (PRD v3 §31 "no features without a clear user problem").

---

## 5. Traceability

Every gap is mapped into `docs/IMPLEMENTATION_PLAN.md` (phase scope and exit gates) and `docs/DECISIONS.md` (C-21…, OD-13…, ADR-031…). Claude Code must treat G-items as requirements with the same weight as PRD sections.

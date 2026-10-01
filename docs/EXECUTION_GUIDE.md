# AcademyBee — Execution Guide (from today to a live product)

> For: the Product Owner (you). You don't need to write code. Your job is to give inputs, run Claude Code phase by phase, check the result like a customer would, and approve.
> Claude Code is your engineering team. It follows `CLAUDE.md` and the docs in `/docs`.
> Work top to bottom. Don't start a phase until the previous one is ✅.

---

## How the whole thing works

```text
PART A  Start long-lead business tasks (today, in parallel)
PART B  Create accounts (only when a phase needs them)
PART C  Set up your computer (once)
PART D  Create the repository with the docs (once)
PART E  The phase loop (repeat for every phase)
PART F  Phase-by-phase instructions: 0 → 1 → … → 7 → 7P → 8 → … → 16
PART G  Running the pilot (from Phase 7P)
PART H  Launch checklist (after Phase 15)
PART I  Rules of thumb for working with Claude Code
```

Rough size of each phase (relative effort, not a promise): **S** small · **M** medium · **L** large · **XL** very large.

| Phase | Size | Phase | Size |
| --- | --- | --- | --- |
| 0 Foundation | L | 8 CRM | M |
| 1 Multi-tenant + domains | M | 9 Learning | L |
| 2 Auth + RBAC | L | 10 Communication | L |
| 3 Provisioning + onboarding | L | 11 Parent + Student | M |
| 4 Students/parents/teachers | L | 12 Reports | M |
| 5 Courses/batches/timetable | L | 13 SaaS billing | L |
| 6 Attendance + offline | XL | 14 Super Admin | M |
| 7 Finance | XL | 15 Hardening | L |
| 7P Pilot readiness | M | 16 AI | M |

---

## PART A — Start these business tasks today (they take weeks)

Engineering will stall at Phases 7 and 10 without these. Start them all this week.

| # | Task | Who helps | Needed by | Done |
| --- | --- | --- | --- | --- |
| A1 | Register or confirm the legal entity, PAN and a current bank account | CA | Razorpay KYC | ☐ |
| A2 | Buy or confirm `academybees.com`. Move its DNS to **Vercel DNS** (point the domain's nameservers to Vercel): Vercel can only issue the wildcard `*.academybees.com` certificate when it runs the DNS (C-31) | — | Phase 1 | ☐ |
| A3 | Apply for GST registration | CA | Razorpay, Phase 13 | ☐ |
| A4 | Create an AcademyBee Razorpay account and start KYC. **Not needed for Phases 7–16** (payments work via UPI and manual recording, G-30); needed only when you run Phase G | — | Phase G | ☐ |
| A5 | Brief a lawyer: Terms of Service, Privacy Policy, Data Processing Agreement, DPDP Act review (children's data, consent), and the fee-collection model (academies use their own gateway accounts, OD-13) | Lawyer | Terms: Phase 3 · Payments: Phase 7 | ☐ |
| A6 | Pick an email provider (Resend, Postmark or Amazon SES). Add SPF, DKIM and DMARC records for `mail.academybees.com` | — | Phase 2 | ☐ |
| A7 | Meta Business verification → WhatsApp Business Account → Cloud API phone number | — | Phase 10 | ☐ |
| A8 | TRAI DLT registration (entity, sender header "ACDBEE" or similar, message templates) | SMS provider | Phase 10 | ☐ |
| A9 | Recruit **two pilot academies** (one tuition, one dance/karate/sports). Agree pilot terms (OD-16): free during the pilot + 3 months, a weekly 30-minute feedback call | You | Phase 7P | ☐ |
| A10 | Collect from the pilots (anonymised is fine): their student spreadsheet, fee structure, weekly timetable, holiday list, how they assess students | You | Phases 4, 5, 7, 9 | ☐ |
| A11 | Ask a CA about GST on SaaS subscriptions (SAC code, invoice format, e-invoicing threshold) | CA | Phase 13 | ☐ |
| A12 | Find native-speaker reviewers for your first languages (OD-18), e.g. a teacher or parent at a pilot academy | You | Phase L | ☐ |

---

## PART B — Accounts to create (just in time)

| Account | Purpose | Create before |
| --- | --- | --- |
| GitHub: the repository `egha-dev/academybees-apps` with a **paid plan** — GitHub **Pro** on the personal account (or **Team** if you later move it to an `academybee` organisation). Protected branches and required checks on a private repository need a paid plan; check GitHub's current pricing (OD-19) | Code, CI, pull requests, protected `main` | Phase 0 |
| Anthropic / Claude plan with Claude Code access | The engineering team | Phase 0 |
| Vercel | Hosts the web app with wildcard domains | Phase 0 (staging) |
| API host (Render, Railway, Fly.io or AWS; pick one per OD-03) | Runs the API and worker | Phase 0 (staging) |
| Managed PostgreSQL (India region preferred) | Database | Phase 0 |
| Managed Redis (for example Upstash) | Cache and background jobs | Phase 0 |
| Cloudflare R2 | Files (logos, receipts, homework) | Phase 3 |
| Sentry | Error tracking | Phase 0 |
| PostHog (or keep analytics internal, OD-14) | Product analytics | Phase 0 |
| Email provider (A6) | Invites, password resets | Phase 2 |
| Razorpay (A4) | Online gateway | Phase G only |
| Uptime monitor (Better Stack, UptimeRobot) | Alerts | Phase 7P |
| WhatsApp Cloud API, SMS provider (A7, A8) | Messaging | Phase 10 |

**Secrets rule:** never paste API keys into the Claude chat. Put them in `.env` files (never committed) or in the hosting dashboard. Tell Claude Code *the variable name*, not the value.

---

## PART C — Set up your computer (once)

Mac or Linux. **On Windows, use WSL2 Ubuntu (OD-20):**
1. In an administrator PowerShell: `wsl --install -d Ubuntu`, restart, and create your Linux user.
2. Install Docker Desktop for Windows and enable *Settings → Resources → WSL integration → Ubuntu*.
3. Open the **Ubuntu** terminal and do everything below there. Clone the repository **inside Linux** (`cd ~ && gh repo clone egha-dev/academybees-apps`), not under `C:\` — it is much faster and the test tools expect it.
4. Run Claude Code from that Ubuntu terminal, in `~/academybees-apps`.

Run each line in a terminal:

```bash
# 1. Git and GitHub CLI
git --version                      # install from git-scm.com if missing
gh --version                       # install from cli.github.com; then: gh auth login

# 2. Node.js 24 LTS via fnm (a Node version manager)
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 24 && fnm default 24
node -v                            # should print v24.x

# 3. pnpm (package manager)
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v

# 4. Docker Desktop (runs Postgres, Redis, email catcher and file storage locally)
#    Install from docker.com, start it, then:
docker compose version

# 5. Claude Code (check docs.claude.com for the current install command)
curl -fsSL https://claude.ai/install.sh | bash        # or: npm install -g @anthropic-ai/claude-code
claude --version
```

---

## PART D — Create the repository and add the docs (once)

> **Already done (2026-09-30):** the repository exists as `egha-dev/academybees-apps` and the pack sits at its root (C-29). Just clone it inside WSL (Part C step 3). The commands below are kept for reference only.

```bash
mkdir academybee && cd academybee
git init -b main

# Unzip the bundle and copy the CONTENTS of the AcademyBee folder here, so the layout is:
#   README.md  CLAUDE.md  PROMPTS.md
#   docs/ARCHITECTURE.md  docs/DECISIONS.md  docs/IMPLEMENTATION_PLAN.md
#   docs/PRD_ADDENDUM_v3.2.md  docs/EXECUTION_GUIDE.md
#   docs/source/PRD_v3.1.md  docs/source/UX_SPEC_v1.1.md
# Also copy the two original .docx files into docs/source/ for the record.

git add . && git commit -m "docs: AcademyBee product and engineering baseline"
# Protected branches on a private repo need a paid GitHub plan (Part B, OD-19)
gh repo create <owner>/<repo> --private --source=. --push
```

You don't configure branch protection yourself: in Phase 0 Claude sets up the repository rules with `gh` (protected `main`, required checks, auto-merge, templates, release process — ADR-041). You'll only confirm the result in the Phase 0 checklist.

---

## PART E — The phase loop (repeat for every phase)

Each phase follows the same seven steps. The exact prompts, already filled in for every phase, are in `PROMPTS.md`; execute them one by one.

```text
1 Kickoff     start Claude Code on an up-to-date main, PLAN MODE, paste the Kickoff prompt → review the plan
2 Build       approve → Claude works in small "slices": each slice = a short branch + pull request
              that merges itself into main when all automatic checks pass, then deploys to staging
3 Gate        paste the Gate prompt → Claude runs every check and reports evidence
4 Review      paste the Independent Review prompt → a fresh reviewer checks security/tenancy/money
5 Accept      YOU run the acceptance checklist for the phase (Part F) — on staging
6 Close       paste the Close prompt → tracker ✅, phase tag; from 7P on, Claude prepares a
              production release that you approve in GitHub
```

Why slices instead of one big branch per phase: `main` never drifts far from what's tested, staging always shows the latest work, and a problem is found in a small change rather than a week-long one. Unfinished screens stay hidden behind switches ("release flags") until they're ready.

### Starting Claude Code
```bash
cd ~/academybees-apps
claude
```
- Press **Shift+Tab** until the mode shows **plan mode** before pasting a Kickoff prompt. Claude will propose a plan without changing files.
- Type `/clear` when starting a new phase or a new big task, so old conversation doesn't crowd the context.
- If a session gets long, use the Handover prompt, then `/clear`, then the Resume prompt.

### The prompts
**Every prompt, fully written out and numbered in execution order, is in [`PROMPTS.md`](../PROMPTS.md)** at the repository root. Execute them one by one, top to bottom. Each phase has the same five prompts (Kickoff → Build → Gate → Independent review → Close), plus reusable helpers (Continue, Handover, Resume, Fix a problem) at the end of that file.

---

## PART F — Phase-by-phase instructions

For each phase: **Before you start** (your inputs) → **Kickoff** (the phase's prompts in `PROMPTS.md`) → **Your acceptance checklist** (what you personally click through) → **Done when**.

### Phase 0 — Foundation
- **Before you start:** toolchain installed in WSL2 (Part C, OD-20) and the repo cloned there. Paid GitHub plan active (OD-19) so Claude can protect `main`. Staging accounts from Part B (Vercel, API host, Postgres, Redis; Sentry optional). OD-03 default confirmed (Claude proposes the exact vendors in the P0-1 plan); OD-14 closed (PostHog, off until you add a key).
- **Kickoff:** `PROMPTS.md` → P0-1.
- **Your acceptance checklist:**
  - ☐ Claude shows you `pnpm dev` running; `http://localhost:3000` opens an AcademyBee page in the new colours (ivory background, gold accent).
  - ☐ Open `http://localhost:3000/dev/design-system`. Does it feel "premium, warm, calm" (UX §1)? Buttons, inputs, badges, empty states and skeletons look consistent.
  - ☐ Turn Wi-Fi off and reload. You see the AcademyBee offline page, not the browser's dinosaur.
  - ☐ On your phone, open the **staging** address (it must be https — phones only allow app install and offline mode on secure addresses) and "Add to Home Screen" works.
  - ☐ Ask Claude to show the design-system page in the **pseudo-language** (`en-XA`) and **long-text** modes: every word looks accented or stretched (proving nothing is hard-coded) and nothing overflows.
  - ☐ GitHub → Actions shows a green CI run.
  - ☐ GitHub → Settings → Rules shows `main` protected; ask Claude to show you a small test pull request that merged itself after the checks passed, and one that was blocked by a failing check.
  - ☐ The staging URL opens.
- **Done when:** the gate is green and you like the design system page. Design feedback is cheapest now.

### Phase 1 — Multi-Tenant + Wildcard Domain
- **Before you start:** DNS for `academybees.com` is with your provider (A2). Staging domain decided (OD-07).
- **Your acceptance checklist:**
  - ☐ `http://demo-a.localhost:3000` shows "Demo A" branding; `demo-b.localhost` shows Demo B.
  - ☐ `http://nothing.localhost:3000` shows a friendly "Academy not found" page (no technical error).
  - ☐ `http://paused.localhost:3000` shows a polished "Suspended" page.
  - ☐ On staging, two tenant URLs work over https.
  - ☐ Ask Claude: "Show me the test that proves Demo A can never read Demo B's data, and run it." It runs and passes.
- **Done when:** gate green; the isolation tests exist and pass.

### Phase 2 — Authentication + RBAC
- **Before you start:** email provider key set in staging (A6).
- **Your acceptance checklist:**
  - ☐ Log in on `demo-a` as each staff role (owner, admin, teacher, accountant, receptionist); each lands on its own home. Log in as the seeded parent and student: you're sent to the Family Hub (`app.localhost:3000`), which is still a placeholder until Phase 7P.
  - ☐ The teacher cannot open owner pages (you get a friendly "no access" page).
  - ☐ Forgot password → email arrives (locally at `http://localhost:8025`) → reset works.
  - ☐ Log in on `demo-a`, then open `demo-b` in the same browser: you are **not** logged in there.
  - ☐ Enable 2FA for the owner; log out and in again with the code. Devices page lists your sessions; "sign out other devices" works.
  - ☐ Five wrong passwords → a clear "try again in …" message.
  - ☐ Create yourself as Super Admin with the CLI command Claude gives you; log in at `console.localhost:3000`.
- **Done when:** gate green → **M0 Foundation Release**.

### Phase 3 — Academy Provisioning + Onboarding
- **Before you start:** draft Terms, Privacy and DPA (placeholders are fine for staging; real ones before the pilot). Plan names from G-25.
- **Your acceptance checklist:**
  - ☐ In the console: Create Academy "Gurushethra", type Bharatanatyam. Typing a slug shows live availability; `admin` or `www` is refused.
  - ☐ The success screen shows `gurushethra.localhost:3000` with Copy and Open buttons.
  - ☐ The owner invite email arrives. Accept it → accept Terms → Welcome screen with academy name and logo.
  - ☐ Complete onboarding on your **phone**: profile, type, course, teacher, batch, students, timetable, ready. Close the browser halfway through and come back: it resumes where you left off.
  - ☐ Suspend the academy in the console → the academy URL shows the Suspended page. Reactivate → back to normal.
  - ☐ Change the subdomain → the old URL redirects to the new one.
- **Done when:** the full journey works end to end on desktop and phone.

### Phase 4 — Students + Parents + Teachers
- **Before you start:** a pilot academy's student spreadsheet (A10), anonymised.
- **Your acceptance checklist:**
  - ☐ Import that spreadsheet: preview shows errors in plain language; commit; re-import creates no duplicates.
  - ☐ Add a student with two parents; add a second child to the same parent.
  - ☐ Student 360 shows Overview and Activity; the medical note is hidden when logged in as the receptionist.
  - ☐ Invite a parent: the email arrives (the parent's own screens, including consent, arrive with the Family Hub in Phase 7P). Settings → Privacy notice shows your academy's generated notice.
  - ☐ Cmd/Ctrl+K finds a student by partial name in under a second.
  - ☐ Archive a student and restore them.
  - ☐ Settings → Parent app shows a printable Join QR poster. A join request (Claude shows you how to create one until the hub exists in 7P) appears in **Join requests**; approve it by linking a student.
- **Done when:** a real spreadsheet imports cleanly.

### Phase 5 — Courses + Batches + Timetable
- **Before you start:** the pilot's weekly timetable and holiday list (A10).
- **Your acceptance checklist:**
  - ☐ Recreate the pilot's real weekly timetable. The week view looks like their paper timetable.
  - ☐ Add Diwali as a holiday: the preview lists the affected classes; confirm → those classes are cancelled.
  - ☐ Transfer a student to another batch from next Monday; their past attendance stays on the old batch.
  - ☐ Log in as a teacher: you see only your batches.
  - ☐ Owner "Today" shows today's classes and anything needing attention.
  - ☐ Set terminology "Batch" → "Class": the whole UI changes wording.
- **Done when:** the pilot owner (on a call, screen-shared) agrees the timetable is right.

### Phase 6 — Attendance + Offline Sync ⭐ (the differentiator)
- **Before you start:** one Android phone and one iPhone. Decide OD-11 (edit windows); defaults are fine.
- **Your acceptance checklist** (on real phones, using the **staging** https address, installed as an app from the home screen):
  - ☐ Teacher Today → Take Attendance → Mark all present → change 3 exceptions → Save: under 30 seconds for 25 students.
  - ☐ **Airplane mode** on → take attendance for another class → you see "Saved on this device — N records waiting to sync".
  - ☐ Close the app completely, reopen it (still offline): the data is still there.
  - ☐ Airplane mode off → within about a minute: "All changes synced". The owner sees it on their dashboard.
  - ☐ Mark the same class on two phones differently while one is offline → you get a clear conflict choice, not silent overwriting.
  - ☐ Try to log out with unsynced records → a warning stops you.
  - ☐ An absent student creates a notification (visible to the owner now; parents see it from 7P).
  - ☐ Don't take attendance for a finished class → the teacher gets a nudge after 30 minutes.
- **Done when:** everything above works on both phones → **M1 Academy Alpha**.

### Phase 7 — Finance
- **Before you start:** pilot fee structures (A10), the pilot academy's UPI ID for testing. Decide OD-10 (GST on academy invoices). No gateway keys needed (G-30).
- **Your acceptance checklist:**
  - ☐ Set up the pilot's real fee plans (monthly, quarterly, admission fee, sibling discount).
  - ☐ Enter opening balances for three students; the Finance dashboard shows correct Pending and Overdue totals.
  - ☐ A student joins mid-month → the invoice follows the proration rule you chose.
  - ☐ Record a partial cash payment → a receipt with a proper number → share it by WhatsApp link → the link expires or can be revoked.
  - ☐ Settings → Payments: add the academy UPI ID; the QR preview scans correctly in a UPI app (don't pay).
  - ☐ Record each method: cash, UPI with UTR, bank transfer, cheque → mark the cheque bounced once and cleared once.
  - ☐ Enter a reported UPI payment (Claude shows you how until the parent screen exists in 7P) → it appears in **Verify payments** → Confirm → receipt. Reject another → reason recorded.
  - ☐ Enter the same UTR twice → you get a duplicate warning.
  - ☐ Settings → Payments shows "Online gateway — not connected yet" (no broken buttons).
  - ☐ Ask Claude to run the simulator online-payment tests and show them passing.
  - ☐ Record cash **offline** (as the accountant on a phone) → it syncs once and gets its receipt number after sync.
  - ☐ Refund works only for owner/accountant and requires a reason.
  - ☐ Numbers check: calculate one student's balance by hand. It matches.
- **Done when:** the numbers are right to the rupee → **M2 Operations MVP**.

### Phase 7P — Pilot Readiness Pack
- **Before you start:** pilot academies signed (A9). Real Terms/Privacy/DPA from your lawyer. The 15 help articles written (Claude can draft them; you edit). A support WhatsApp number. Production accounts ready (Part B).
- **Your acceptance checklist:**
  - ☐ As a parent on a phone: accept the invite → consent → see your child's next class, attendance and dues → tap **Pay** → the UPI app opens with the amount filled in (cancel it, or pay ₹1 to a test UPI) → back in AcademyBee tap "I've paid", enter a UTR → "Awaiting academy confirmation" → confirm as the accountant → the parent sees the receipt.
  - ☐ A parent with two children switches between them easily.
  - ☐ **Two academies, one parent:** create a parent whose child is in demo-a and another child in demo-b. Sign in once at `app.localhost:3000` → Home shows both academies' classes today, dues per academy, one notification inbox.
  - ☐ Scan demo-b's Join QR with a parent not linked there → nothing is shown until the code is verified or staff approve the join request.
  - ☐ Open the academy URL as a parent → you're sent to the Family Hub with that academy selected.
  - ☐ At demo-b, unlink the parent → demo-b disappears from their hub.
  - ☐ "Help" is on every screen; "Contact support" opens WhatsApp with context filled in.
  - ☐ `demo.academybees.com` works with the role login panel; tomorrow the data has reset.
  - ☐ The activation dashboard shows your test academy's funnel.
  - ☐ Production is live: provision the two pilot academies, import their students, invite teachers.
- **Done when:** both pilots are live → **M2P Pilot Start**. Now follow Part G every week while continuing with Phase 8.

### Phase 8 — CRM
- **Before you start:** the pilots' lead sources (walk-in, Instagram, referral…) and trial process.
- **Your acceptance checklist:** ☐ Submit the public enquiry form → a lead appears · ☐ drag it through the pipeline · ☐ schedule a trial → the teacher sees "Trial" on their roll call · ☐ mark it attended, add feedback · ☐ Convert to Student: no retyping, parent created, batch assigned · ☐ turn on the academy public page and check it on your phone · ☐ the conversion funnel numbers match what you did.

### Phase 9 — Learning
- **Before you start:** how each pilot assesses students (A10), e.g. karate belt criteria or tuition test marks.
- **Your acceptance checklist:** ☐ Teacher drafts homework offline → publishes when online · ☐ attach a PDF; another teacher's student cannot open it · ☐ create an assessment with the pilot's own criteria · ☐ Student 360 → Progress shows a timeline that makes sense to the pilot owner.

### Phase 10 — Communication
- **Before you start:** WhatsApp Cloud API number approved (A7), DLT templates approved (A8), sender strategy (OD-15).
- **Your acceptance checklist:** ☐ Absent student → parent receives **one** WhatsApp and one push · ☐ fee reminder goes out on schedule · ☐ compose an announcement to one batch, preview it, schedule it · ☐ delivery status visible per parent · ☐ a parent who opted out doesn't get marketing messages · ☐ parent logs in with a phone OTP · ☐ the usage meter shows the message count.

### Phase 11 — Parent + Student (complete)
- **Before you start:** decide whether students get logins by default (OD-08).
- **Your acceptance checklist:** ☐ Group the same child from two academies into one card ("Aarav — Karate at ABC, Maths at Gurushethra"); neither academy can see this · ☐ one calendar shows classes from both academies · ☐ Parent submits a leave request → the teacher sees "Leave (parent informed)" · ☐ parent sees homework and progress · ☐ offline, the parent app shows "Last updated …" · ☐ a student (if enabled) submits homework · ☐ pilot parents' feedback from the last weeks is addressed.

### Phase 12 — Reports
- **Before you start:** list the 10 questions the pilot owners ask most ("who hasn't paid?", "which batch is dropping?").
- **Your acceptance checklist:** ☐ Each of those 10 questions is answered by a report in two clicks · ☐ dashboard and report numbers match · ☐ export a large report → you get notified when it's ready · ☐ full academy export ZIP downloads and opens in Excel · ☐ the teacher accountability report looks fair.

### Phase 13 — SaaS Billing
- **Before you start:** final prices (validated with the pilots), the CA-approved GST invoice format (A11), AcademyBee's UPI ID and bank details for subscription payments (the gateway comes later in Phase G).
- **Your acceptance checklist:** ☐ Trial → owner reports UPI payment → you verify in console → Active · ☐ AcademyBee's GST invoice looks correct to your CA · ☐ failed renewal → past due → grace → recovered · ☐ a suspended academy can still export data · ☐ trial-ending emails arrive · ☐ self-serve signup creates a working academy in minutes.

### Phase 14 — Super Admin
- **Your acceptance checklist:** ☐ Console requires 2FA · ☐ overview numbers (academies, students, MRR) match reality · ☐ an academy opens a support ticket → you reply from the console · ☐ "Login as Academy" asks for a reason, shows a red banner, blocks money actions, and appears in the audit log · ☐ plans are editable, and a change is audited → **M4 Commercial**.

### Phase 15 — Security + Performance + Production Hardening
- **Before you start:** book an external penetration tester. Lawyer finalises the retention policy (OD-09).
- **Your acceptance checklist:** ☐ Pen-test report has no open critical or high findings · ☐ **restore drill**: Claude restores last night's backup to a test environment and you see real data there · ☐ load test report meets the targets · ☐ status page live · ☐ you receive a test alert on your phone · ☐ privacy request (export or erase a student) works end to end → **M5 Production GA**.

### Phase 16 — AI
- **Before you start:** choose an AI provider and approve a data policy (what data may be sent, no raw personal data by default).
- **Your acceptance checklist:** ☐ Each AI feature shows where its numbers come from · ☐ AI-drafted parent messages always need a human "Send" · ☐ turning a feature off works instantly · ☐ pilot owners say at least one AI feature saves them real time → **M6 Intelligence**.

---

### Phase L — Multilingual Rollout (only when you are ready, after Phase 11)
- **Before you start:** choose the first languages (OD-18; default Hindi + your pilots' regional language). Line up **one native-speaker reviewer per language** (a teacher or parent from a pilot academy is ideal) and agree a glossary (batch, fees, attendance, receipt…). Budget for WhatsApp/SMS template registrations in each language.
- **Your acceptance checklist:** ☐ Switch your parent profile to the new language → the whole Family Hub, notifications and receipt are in that language · ☐ WhatsApp absence alert arrives in that language · ☐ consent and privacy notice appear in that language · ☐ teacher switches the Teacher app language and takes attendance · ☐ Tamil/Hindi student names print correctly on a receipt PDF · ☐ the native-speaker reviewer signs off · ☐ ask Claude to show that adding the next language needs no code change (completeness report).

### Phase G — Gateway Activation (only when you are ready)
- **When:** any time after Phase 7P, once Razorpay KYC is done (A4), your lawyer has signed off the payment model (OD-13), and a pilot academy has its own gateway account.
- **Your acceptance checklist:** ☐ In a pilot academy, Settings → Payments → Connect gateway (test mode) works and shows "verified" · ☐ as a parent, **Pay online** now appears next to UPI; a test card payment shows "processing" then the receipt · ☐ refresh or double-tap during payment → still one payment · ☐ a gateway refund works · ☐ switch to live and make a real ₹1 payment into the academy's own account; the receipt is issued and reconciliation matches · ☐ AcademyBee subscription auto-renew works in test mode.

---

## PART G — Running the pilot (from Phase 7P, every week)

| Day | Activity |
| --- | --- |
| Monday | Check the activation dashboard against the G-29 targets for each pilot |
| Wednesday | 30-minute call with each pilot owner: what was annoying, what was missing, what they did outside AcademyBee |
| Thursday | Triage: **P0** (data wrong, can't take attendance, can't collect money) → fix within 48 h with **H5 Pilot triage** / **H4 Fix a problem** · everything else → add to the relevant future phase in IMPLEMENTATION_PLAN with a note "pilot feedback" |
| Friday | Tell the pilots what was fixed this week |

Rule (PRD v3 §25): when a pilot asks for a feature, write down the *problem* first. Only build it when the problem is real for both pilots.

---

## PART H — Launch checklist (after Phase 15)

- ☐ Pilot success criteria (G-29) met for 4 consecutive weeks
- ☐ Terms, Privacy, DPA live on the website; DPDP review signed off
- ☐ Payments: UPI/manual flows verified with pilots (G-30); Phase G (online gateway) done **or** consciously postponed
- ☐ WhatsApp and SMS templates approved for all automated messages
- ☐ Pricing page live; self-serve signup tested
- ☐ Support hours published; help centre complete; support WhatsApp staffed
- ☐ Status page, alerts to your phone, backup restore drill done this month
- ☐ Demo academy polished for sales
- ☐ Tag `v1.0.0` 🚀

---

## PART I — Rules of thumb for working with Claude Code

1. **One phase at a time, one big task per session.** Claude merges small slices into `main` as it goes; use `/clear` between big tasks. Long, sprawling sessions make mistakes.
2. **Always start a phase in plan mode.** Reading the plan costs 5 minutes and saves days.
3. **"Done" needs evidence.** If Claude says something works, ask: "Show me the test that proves it and run it."
4. **Never accept skipped tests** or "I'll add tests later".
5. **Test on real phones** for anything a teacher or parent touches, especially offline behaviour.
6. **Keep secrets out of the chat.** Use `.env` and the hosting dashboards.
7. **Decisions go into DECISIONS.md.** If you change your mind about scope, tell Claude to record it as a PO decision first.
8. **Don't let phases blur.** If Claude starts building something from a later phase, say: "Stop, that's Phase X; note it in the plan and continue with the current phase."
9. **Keep the docs current.** The plan's tracker and exit notes are how you (and future Claude sessions) know where things stand.
10. **When stuck for more than two attempts** on the same bug, ask Claude to "stop, explain the root cause hypotheses, and propose two approaches"; then choose.
11. **Production releases are your call.** From Phase 7P, Claude prepares a release (version number + plain-language notes); it goes live only when you click *Approve* on the deployment in GitHub → Actions.
12. **Never push to `main` yourself** and never paste secrets into issues or pull requests.

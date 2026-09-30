# 🐝 AcademyBee — Product & Engineering Pack

Everything needed to build AcademyBee with Claude Code, in one folder. Copy the contents of this folder into the root of your new repository.

## Start here

1. **`docs/EXECUTION_GUIDE.md`**: what *you* do, step by step: business paperwork, accounts, computer setup, and your acceptance checklist for every phase.
2. **`PROMPTS.md`**: every Claude Code prompt, fully written, in execution order. Execute them one by one.

## What's in the folder

| File | For | Purpose |
| --- | --- | --- |
| `README.md` | You | This index |
| `PROMPTS.md` | You → Claude Code | All prompts in order: P-00 Orientation, then Kickoff → Build → Gate → Review → Close for Phases 0–16, 7P and G, plus helpers |
| `CLAUDE.md` | Claude Code | Engineering rules, read automatically at the start of every session |
| `docs/EXECUTION_GUIDE.md` | You | Step-by-step guide from today to launch |
| `docs/PRD_ADDENDUM_v3.2.md` | Both | Product Owner corrections (G-01 … G-30), highest product authority |
| `docs/IMPLEMENTATION_PLAN.md` | Both | Phase tracker, scope, tests and exit gate for every phase |
| `docs/ARCHITECTURE.md` | Claude Code | System design: tenancy, auth, data, API, frontend, offline, finance, jobs, security |
| `docs/DECISIONS.md` | Both | Conflict register, open decisions with defaults, architecture decision records |
| `docs/source/PRD_v3.1.md` | Claude Code | Text copy of the original PRD (.docx) |
| `docs/source/UX_SPEC_v1.1.md` | Claude Code | Text copy of the original UI/UX specification (.docx) |

Put the original `.docx` files in `docs/source/` too, for the record.

## Build order

`0 Foundation → 1 Multi-tenant + domains → 2 Auth + RBAC → 3 Provisioning + onboarding → 4 Students/parents/teachers → 5 Courses/batches/timetable → 6 Attendance + offline → 7 Finance → 7P Pilot readiness (pilot starts) → 8 CRM → 9 Learning → 10 Communication → 11 Parent + student → 12 Reports → 13 SaaS billing → 14 Super Admin → 15 Hardening → 16 AI`
Plus two phases you run whenever you're ready: **L Multilingual rollout** (after Phase 11) and **G Gateway activation** (after 7P, once your payment gateway account and legal sign-off are ready).

## Payments in this release

Every payment feature is built and switched on **without** a payment-gateway integration (PRD v3.2 G-30):
- Staff can record cash, UPI, bank transfer, cheque and card-on-POS payments.
- Parents pay by UPI, then tap "I've paid"; staff verify the payment before a receipt is issued.
- Refunds are recorded manually.
- AcademyBee's own subscription billing works the same way, with Super Admin verification.

The online gateway layer is built and tested with a simulator. Razorpay is connected later in **Phase G**.

## Families with children at several academies

Parents and students use one **AcademyBee Family Hub** at `app.academybee.com` (PRD v3.2 G-31):
- **One login** covers every academy they're linked to.
- **Adding an academy:** scan the academy's QR code, type its address, or accept an invite. Access is granted only after a verification code or academy approval.
- **Home screen:** today's classes across academies, dues shown per academy, and one merged notification inbox.
- **Staff** keep using each academy's own address.

## Languages

AcademyBee **launches in English**. The code is multilingual-ready from Phase 0 (PRD v3.2 G-32), at almost no extra cost:
- No text is hard-coded.
- Names can be typed in any script.
- Receipts print non-Latin names correctly.
- Layouts allow for longer words.

When you are ready, **Phase L** adds the language switcher and your first languages (e.g. Hindi plus your regional language). After that, each new language is mostly translation work.

## Repository

The pack assumes **one private GitHub monorepo** (web, API, worker and shared packages together), managed trunk-based (ADR-041):
- **Protected main branch:** nothing reaches it without passing all automatic checks.
- **Small pull requests ("slices")** that merge themselves when green.
- **Release flags** keep unfinished screens hidden.
- **Staging** updates automatically on every merge. **Production** releases need your approval.

This scales from a solo founder to a team of about 10–15 engineers without restructuring. The signals for when to revisit are listed in ADR-041.

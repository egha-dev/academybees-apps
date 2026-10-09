# 🐝 AcademyBee — Product & Engineering Pack

**"The operating system for coaching academies." / "Manage Your Academy. Grow Together."** — SaaS for tuition, dance, music, karate, sports, fitness, language and other academies.

Everything needed to build AcademyBee with Claude Code. This pack lives at the root of the repository (`egha-dev/academybees-apps`).

## Start here

1. **`docs/EXECUTION_GUIDE.md`**: what *you* do, step by step: business paperwork, accounts, computer setup, and your acceptance checklist for every phase.
2. **`PROMPTS.md`**: every Claude Code prompt, fully written, in execution order. Execute them one by one.

## What's in the folder

| File | For | Purpose |
| --- | --- | --- |
| `README.md` | You | This index |
| `PROMPTS.md` | You → Claude Code | All prompts in order: P-00 Orientation, then Kickoff → Build → Gate → Review → Close for Phases 0–16, 7P, L and G, plus helpers |
| `CLAUDE.md` | Claude Code | Engineering rules, read automatically at the start of every session |
| `docs/EXECUTION_GUIDE.md` | You | Step-by-step guide from today to launch |
| `docs/PRD_ADDENDUM_v3.2.md` | Both | Product Owner corrections (G-01 … G-32), highest product authority |
| `docs/IMPLEMENTATION_PLAN.md` | Both | Phase tracker, scope, tests and exit gate for every phase |
| `docs/ARCHITECTURE.md` | Claude Code | System design: tenancy, auth, data, API, frontend, offline, finance, jobs, security |
| `docs/DECISIONS.md` | Both | Conflict register, open decisions with defaults, architecture decision records |
| `docs/source/PRD_v3.1.md` | Claude Code | Text copy of the original PRD (.docx) |
| `docs/source/UX_SPEC_v1.1.md` | Claude Code | Text copy of the original UI/UX specification (.docx) |
| `apps/`, `packages/` | Code | Web (Next.js), API and worker (NestJS); shared packages (contracts, database, i18n, ui, sync, testing, config) |
| `e2e/`, `infra/`, `scripts/` | Code | Playwright specs; local Docker stack and DB role scripts; governance, performance and dev scripts |
| `docs/runbooks/` | Both | How-tos: GitHub governance, environments and deploys |

Optionally put the original `.docx` files in `docs/source/` too, for the record; the `.md` copies are the working sources (C-41).

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

Parents and students use one **AcademyBee Family Hub** at `app.academybees.com` (PRD v3.2 G-31):
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

**One private GitHub monorepo** (web, API, worker and shared packages together), managed trunk-based (ADR-041):
- **Small pull requests ("slices")** that merge only when every automatic check is green: `verify`, `integration`, `build`, `e2e`, `pr-title`.
- **Release flags** keep unfinished screens hidden.
- **Staging** updates automatically on every merge once its accounts exist (`docs/runbooks/environments.md`). **Production** releases are started by you from a version tag.

On the **free GitHub plan** (C-44), `main` has no server-side protection: Claude merges only after all checks pass and never pushes to `main`, and local git hooks refuse commits and pushes on `main`. Upgrading later (GitHub Pro) and running `scripts/github/apply-governance.sh` adds the enforced ruleset (`docs/runbooks/github-governance.md`).

This scales from a solo founder to a team of about 10–15 engineers without restructuring. The signals for when to revisit are listed in ADR-041.

## Local setup (WSL2)

Supported setup (OD-20): Windows with **WSL2 Ubuntu**, the repository cloned **inside Linux** (`~/academybees-apps`), and Docker Desktop with WSL integration. Prerequisites in `docs/EXECUTION_GUIDE.md` Part C: git, `gh`, Node 24 (fnm), pnpm via corepack.

```bash
git clone https://github.com/egha-dev/academybees-apps.git ~/academybees-apps && cd ~/academybees-apps
corepack enable                 # pnpm version comes from package.json
pnpm install                    # also installs the git hooks
pnpm env:init                   # creates .env files from the committed examples (local values only)
pnpm infra:up                   # Postgres 17, Redis 7, Mailpit, SeaweedFS S3 — all healthy
pnpm db:migrate                 # migrations + grants, as ab_migrator
pnpm db:seed                    # local/ci only: demo academies (needed by pnpm e2e)
pnpm dev                        # web :3000, API :4000, worker (≈1 minute on first start)
```

Then open:

| URL | What |
| --- | --- |
| http://localhost:3000 | Web shell |
| http://localhost:3000/dev/design-system | Every component and state (not in production) |
| http://demo-a.localhost:3000, http://demo-b.localhost:3000 | Seeded academies (branded home, own manifest and icon) |
| http://paused.localhost:3000, http://closed-demo.localhost:3000, http://setup-demo.localhost:3000, http://nope.localhost:3000 | Academy status pages: suspended, archived, setting up, unknown |
| http://old-demo-a.localhost:3000 | Old slug → 301 to demo-a |
| http://app.localhost:3000 | Family Hub placeholder (G-31) |

**Demo sign-ins (local/CI seeds only):** every demo user's password is `AcademyBees#2026`.

| Email | Where | Role |
| --- | --- | --- |
| `owner@demo-a.test`, `admin@demo-a.test`, `accountant@demo-a.test`, `reception@demo-a.test` | `demo-a.localhost:3000` | Owner, Admin, Accountant, Receptionist |
| `teacher@demo-a.test` | `demo-a.localhost:3000` and `demo-b.localhost:3000` | Teacher in both academies |
| `parent@demo-a.test`, `student@demo-a.test` | `app.localhost:3000` (Family Hub) | Parent, Student of demo-a |
| `owner@demo-b.test` | `demo-b.localhost:3000` | Owner |
| `owner@setup-demo.test` | `setup-demo.localhost:3000` | Owner of the academy still setting up: legal step, Welcome and the guided setup (Phase 3) |
| `superadmin@academybees.test` | `console.localhost:3000` | Super Admin (TOTP enrolment on first sign-in, C-66): Academies list, Create academy, suspend / reactivate / archive, change address (Phase 3) |

Logos are stored in the local SeaweedFS (`pnpm infra:up`) and served from `http://localhost:8333/academybee-local/…` (C-97).
| http://localhost:3000/api/v1/health/ready | API through the web origin (DB + Redis) |
| http://localhost:4000/api/docs | OpenAPI (not in production) |
| http://localhost:8025 | Mailpit (email from Phase 2) |
| http://localhost:8888 | SeaweedFS S3 browser |

Academy hosts (`http://demo-a.localhost:3000`), the Family Hub (`app.localhost`) and the console (`console.localhost`) arrive with Phases 1–3.

**Checks** (the same as CI): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (Docker), `pnpm build`, `pnpm e2e` (builds, then Playwright), `pnpm perf:budget`, `pnpm perf:lighthouse`, `pnpm i18n:check`, `pnpm flags:check`.

**Troubleshooting**
- *Playwright: "error while loading shared libraries"* → `sudo pnpm dlx playwright@1.63.0 install-deps chromium webkit` once.
- *Ports 3000/4000/5432 busy* → stop old servers or `pnpm infra:down`; `pnpm infra:reset` wipes local data.
- *A package's changes don't show in the API/worker* → `pnpm dev` rebuilds packages in watch mode; when running `node dist/main.js` yourself, run `pnpm build` first.
- *Lighthouse in WSL leaves `C:\Users\…` folders* → temporary Chrome profiles, git-ignored and safe to delete.

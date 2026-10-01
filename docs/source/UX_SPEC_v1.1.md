**🐝 ACADEMYBEE**

**MASTER UI / UX DESIGN SPECIFICATION**

**International Premium SaaS Design System ****&**** Complete Screen Architecture**
Version 1.0 • September 2026 • Aligned with AcademyBee Final PRD v3.0
Product Design Owner Edition

*“Luxury simplicity for academy operations.”*

# Document Purpose

This document translates AcademyBee Final PRD v3.0 into the UI/UX strategy and screen architecture for the web application, PWA, teacher experience, parent experience, student experience and AcademyBee platform console.

AcademyBee must feel like a modern international SaaS product: calm, premium, intelligent, easy to learn and extremely fast for daily work.

# 1. Design Vision

Design ambition: Luxury simplicity for academy operations.

Primary UX promise: Show me what matters now.

Premium without being flashy.

Simple without being simplistic.

Powerful without exposing enterprise complexity.

Warm and human rather than corporate and cold.

Action-oriented rather than navigation-heavy.

Mobile-first for teachers and parents.

Context-aware for owners and administrators.

# 2. Product Design Mental Model

AcademyBee is understood through the daily operating loop: TODAY → RUN → MONEY → GROW → LEARN → COMMUNICATE → RETAIN → GROW.

| Area | Primary question |
| --- | --- |
| Today | What needs my attention now? |
| Run | Are classes, students and attendance under control? |
| Money | What was collected, what is due and what is overdue? |
| Grow | Which leads, trials and admissions need action? |
| Learn | How are students learning and progressing? |
| Communicate | What do parents and students need to know? |
| Retain | Which students need attention before they leave? |

# 3. Experience Architecture

| Experience | Users | Primary device | Mental model |
| --- | --- | --- | --- |
| Academy Management | Owner, Admin, Accountant, Receptionist | Desktop + tablet + mobile | Operate and grow the academy |
| Teacher PWA | Teacher / Instructor | Mobile-first | Today → Classes → Attendance → Students → Learning |
| Parent / Student | Parent, Student | Mobile-first | My child → Today → Attendance → Fees → Learning |
| Platform Console | Super Admin / Support | Desktop | Platform health → Tenants → Revenue → Operations |

# 4. Design Language

| Principle | Direction |
| --- | --- |
| Visual character | Premium, warm, calm, confident |
| Density | Comfortable whitespace; high information clarity |
| Color | Neutral foundation with restrained Bee Gold accent |
| Typography | Modern sans-serif such as Inter/Geist-style |
| Shape | Soft but not overly rounded |
| Motion | Subtle, purposeful, fast |
| Cards | Used selectively; avoid dashboard card overload |
| Data | Clear hierarchy, not spreadsheet-heavy by default |

# 5. Color System

| Token | Suggested value | Use |
| --- | --- | --- |
| Warm Ivory | #FAFAF7 | Primary background |
| Deep Ink | #171817 | Primary text/navigation |
| Bee Gold | #E6B94A | Brand accent/highlights |
| Soft Gold | #F5E7B8 | Selected/subtle brand surfaces |
| Success | #238B63 | Confirmed/healthy |
| Warning | #D99124 | Needs attention |
| Danger | #D95555 | Errors/overdue/destructive |
| Information | #4778C7 | Informational state |

Bee Gold should be an accent, not the dominant background.

# 6. Typography

| Level | Size | Purpose |
| --- | --- | --- |
| Display | 32–40px | Major product moments |
| Page title | 24–28px | Screen title |
| Section | 18–20px | Hierarchy |
| Body | 14–16px | Primary content |
| Metadata | 12–13px | Secondary information |

Use weight, spacing and hierarchy rather than excessive bold text.

# 7. Layout System

Desktop: contextual sidebar + top bar + primary workspace.

Tablet: compact sidebar + workspace.

Mobile: bottom navigation + contextual screens.

Teacher: mobile-first regardless of desktop availability.

Parent: mobile-first.

Never shrink desktop UI onto mobile.

# 8. Global Navigation

Owner/Admin navigation should be organized by outcomes, not database entities:

HOME: Today
RUN: Today • Timetable • Attendance • Batches • Students • Teachers
MONEY: Fees • Invoices • Payments • Expenses
GROW: Leads • Trials • Admissions
LEARN: Homework • Assessments • Progress
CONNECT: Messages • Announcements
INSIGHTS: Reports • Analytics
ACADEMY: Branches • Team • Settings

Keep navigation contextual and collapsible.

# 9. Global Command Center

## 9.1 Command Palette

Cmd/Ctrl + K: search students, parents, teachers, batches, invoices and leads; plus quick actions.

## 9.2 Global Add

+ Add: Student • Parent • Teacher • Lead • Batch • Invoice • Payment • Announcement

## 9.3 Activity

Important entities expose an Activity timeline.

# 10. Core UX Pattern — Context + Action

Where am I?

What needs my attention?

What can I do now?

What happened recently?

| Entity | Primary actions |
| --- | --- |
| Student | Attendance • Collect • Message • More |
| Batch | Attendance • Students • Schedule • More |
| Lead | Call • WhatsApp • Schedule Trial • More |
| Invoice | Collect • Send • Download • More |

# 11. Academy Owner / Admin

## 11.1 Owner Today

Signature screen: welcome, attention items, today's classes, financial pulse and growth pulse.

## 11.2 Owner Dashboard

Executive morning briefing: welcome → attention → today's schedule → finance → student growth → attendance → activity.

## 11.3 Student Management

Students list → search/filter → Student 360 workspace.

## 11.4 Student 360

Overview • Attendance • Fees • Learning • Progress • Communication • Documents • Activity.

## 11.5 Batch Workspace

Batch should be an operational workspace: students, attendance, schedule, fees and learning.

## 11.6 Timetable

Day, Week and Teacher views; desktop may support drag/drop, mobile uses chronological timeline.

# 12. Attendance UX

Attendance is a key AcademyBee differentiator.

Large touch targets; no tiny checkboxes.

Mark All Present then modify exceptions.

States: Present • Absent • Late • Leave.

Attendance is tied to a specific class session and student.

## 12.1 Offline Attendance

Offline banner: “Attendance will sync automatically when you're back online.”

Saved state: “Saved on this device — 24 records waiting to sync.”

Synced state: “All changes synced — synced just now.”

# 13. Finance UX

Finance should feel clear and trustworthy, not like accounting ERP.

Finance dashboard: Collected • Pending • Overdue • Collection trend • Needs attention.

Invoice workspace: student, fee components, total, paid, balance and primary actions.

Payment states: Initiated → Pending → Confirmed / Failed / Refunded.

Never imply online success before server confirmation.

# 14. Teacher PWA

Teacher navigation: Home • Classes • Students • Learning • More.

Teacher home centers today's classes and Take Attendance.

Teacher batch: Students • Attendance • Schedule • Learning.

Teacher learning: Homework • Assessments • Announcements • Drafts.

# 15. Parent Experience

Parent navigation: Home • Children • Schedule • Payments • More.

Home hierarchy: greeting → child status → next class → attendance → fees → homework → notifications.

Multiple children use a simple child selector.

Finance: due amount, invoices, payments, receipts and Pay Now.

# 16. Student Experience

If enabled: Home • Classes • Homework • Progress • Profile. Keep it lighter and motivational.

# 17. CRM & Admissions

Pipeline: New → Contacted → Trial Scheduled → Trial Completed → Interested → Admission → Lost.

Lead cards emphasize next action: Call • WhatsApp • Schedule Trial.

Trial workspace: date/time • teacher • reminder • attendance • feedback • follow-up • Convert to Student.

Admission should reuse trial/lead data without re-entry.

# 18. Learning UX

Use configurable learning terminology.

| Academy | Assessment examples |
| --- | --- |
| Tuition | Mathematics • Science • English |
| Karate | Technique • Discipline • Fitness • Forms |
| Dance | Rhythm • Technique • Expression • Performance |
| Music | Theory • Technique • Rhythm • Performance |

Navigation: Homework • Assignments • Assessments • Progress • Skills • Certificates.

# 19. Communication Center

Unified workspace: All • Parents • Teachers • System.

Composer: audience → channels → template → preview → schedule/send.

Channels: In-app • Push • Email • SMS • WhatsApp.

# 20. Reports & Analytics

Top-level sections: Academy • Students • Attendance • Finance • Admissions • Teachers • Retention.

Every insight should answer: What happened? Why? What should I do next?

# 21. Super Admin / Platform Console

The platform console should feel like a professional SaaS operations product and remain visually distinct from the academy application.

Navigation: Overview; Platform: Academies, Users, Branches; Revenue: Subscriptions, Plans, Payments; Growth: Acquisition, Usage, Retention; Operations: Support, Announcements, Audit Logs; System: Settings, Security.

Academy detail: Overview • Users • Students • Subscription • Payments • Activity • Support.

“Login as Academy” must be controlled, visibly indicated and audited.

# 22. Academy Onboarding

Welcome

Academy information

Academy type

First course

First batch

First students

Ready / first-class screen

Onboarding should be a guided setup, not a long registration form.

# 23. Settings

Categories: Academy • Branches • Team & Roles • Notifications • Payments • Communication • Integrations • Security • Subscription.

# 24. Global States

Empty: explain what to do next, never only “No data found.”

Loading: skeletons for primary workspaces.

Error: explain what happened and the next action.

Offline: show connection, pending-sync count and last successful sync.

Destructive actions: confirm with clear consequence language.

# 25. Mobile Navigation

| Role | Bottom navigation |
| --- | --- |
| Owner/Admin | Today • Students • Finance • More |
| Teacher | Home • Classes • Students • Learning • More |
| Parent | Home • Children • Schedule • Payments • More |
| Student | Home • Classes • Homework • Progress • Profile |

# 26. Design System Component Library

App Shell

Sidebar

Topbar

Bottom Navigation

Command Palette

Search

Global Add

Buttons

Inputs

Selects

Date/Time Picker

Tabs

Cards

KPI

Tables

Lists

Status Badges

Avatar

Timeline

Activity Feed

Drawer

Modal/Sheet

Toast

Confirmation

Empty State

Skeleton

File Upload

Offline Indicator

Sync Indicator

Charts

# 27. Screen Inventory

| Area | Approx. screens/states | Priority |
| --- | --- | --- |
| Platform Console | ~20 | P0/P1 |
| Academy Management | ~30 | P0 |
| Teacher | ~15 | P0 |
| Parent | ~12 | P0 |
| Student | ~8 | P1 |
| Finance | ~12 | P0 |
| CRM | ~10 | P1 |
| Learning | ~10 | P1 |
| Reports/Settings/Support | ~15 | P1 |
| Total | ~100–130 | Pattern-based, not 100 unique layouts |

# 28. Design Sprint Plan

| Sprint | Focus |
| --- | --- |
| 1 | Brand + Design System |
| 2 | Login + Shell + Command Center + Today |
| 3 | Owner Dashboard + Students + Student 360 + Parents + Teachers |
| 4 | Courses + Batches + Timetable + Attendance + Offline Attendance |
| 5 | Finance + Fees + Invoices + Payments + Receipts |
| 6 | Teacher PWA |
| 7 | Parent Portal |
| 8 | CRM + Trials + Admissions |
| 9 | Learning + Assessments + Progress + Certificates |
| 10 | Communication + Notifications + Automation |
| 11 | Reports + Analytics |
| 12 | Super Admin Platform Console |

# 29. Premium Priority Screens

| Tier | Screen |
| --- | --- |
| Tier 1 | Login |
| Tier 1 | Academy Onboarding |
| Tier 1 | Owner Today |
| Tier 1 | Owner Dashboard |
| Tier 1 | Student 360 |
| Tier 1 | Teacher Today |
| Tier 1 | Attendance |
| Tier 1 | Offline Attendance |
| Tier 1 | Finance Dashboard |
| Tier 1 | Parent Home |
| Tier 2 | Batch Workspace |
| Tier 2 | Timetable |
| Tier 2 | CRM |
| Tier 2 | Trial |
| Tier 2 | Learning |
| Tier 2 | Communication |
| Tier 2 | Reports |
| Tier 2 | Super Admin Dashboard |

# 30. Non-Negotiable UX Rules

Do not make users understand the database structure.

Do not expose every feature through main navigation.

Prefer contextual drawers/actions when they reduce navigation.

Do not force teachers through long forms during class.

Do not make parents learn an ERP.

Do not expose enterprise complexity to small academies.

Do not use cards merely as decoration.

Do not hide offline/sync status.

Do not make financial status ambiguous.

Design loading, empty, error, permission and success states with every screen.

Do not treat mobile as a smaller desktop.

Do not use animation that slows operational workflows.

# 31. Accessibility & Usability

Accessible contrast.

Keyboard/screen-reader consideration for core desktop flows.

Comfortable touch targets.

Color is never the only status indicator.

Precise field-level validation.

Critical actions discoverable without hover.

# 32. UX Performance

Prioritize perceived speed.

Skeletons for major workspaces.

Avoid unnecessary full-page reloads.

Prefetch predictable next screens when appropriate.

Teacher workflows must remain usable under weak connectivity.

Offline cached data should open quickly.

Large tables paginate/virtualize.

# 33. Design-to-Engineering Handoff

Desktop layout

Tablet behavior

Mobile behavior

Loading state

Empty state

Error state

Permission state

Offline state

Success confirmation

Destructive confirmation

Accessibility notes

Component references

Interaction rules

# 34. Recommended Build Order

AcademyBee Design System

Authentication and shell

Owner Today

Owner Dashboard

Students + Student 360

Courses + Batches + Timetable

Attendance + Offline Attendance

Fees + Payments

Teacher PWA

Parent Portal

CRM

Learning

Communication

Reports

Super Admin

# 35. Product Design Acceptance Criteria

| Criteria | Definition |
| --- | --- |
| Clarity | First-time user understands the primary action without training. |
| Consistency | Same component and interaction pattern is reused where applicable. |
| Efficiency | High-frequency actions require minimal navigation/input. |
| Responsive | Critical flows work comfortably on desktop, tablet and mobile. |
| Offline trust | Offline state and synchronization are visible and understandable. |
| Financial trust | Payment state is never ambiguous. |
| Accessibility | Core workflows use accessible interaction patterns. |
| Visual quality | Premium, restrained and consistent AcademyBee language. |
| Production readiness | Loading, empty, error, permission and success states are designed. |

# 36. Final Design Philosophy

AcademyBee should feel like this:

“I open the app and immediately know what matters.”

“I can finish my work without hunting through menus.”

“The product remembers context for me.”

“I trust the numbers.”

“My teachers can actually use this from their phones.”

“My parents don't need training.”

“It feels premium, but it isn't complicated.”

# 37. Final UX North Star

SHOW WHAT MATTERS → MAKE THE NEXT ACTION OBVIOUS → KEEP THE USER IN CONTEXT → CONFIRM THE RESULT

AcademyBee succeeds when the software disappears into the academy's daily routine.

# Appendix A — Recommended First UI Mockup Set

AcademyBee design system board

Academy login

Academy onboarding

Owner Today

Owner Dashboard

Students list

Student 360

Add Student

Batch workspace

Weekly timetable

Teacher attendance

Offline attendance

Finance dashboard

Invoice detail

Teacher home

Parent home

CRM pipeline

Trial workspace

Learning/assessment

Communication center

Super Admin dashboard

Super Admin academy detail

# Appendix B — Design Source of Truth

The AcademyBee PRD defines what the system must do; this document defines how users should experience it. New features must be evaluated against both before implementation.

# V1.1 Addendum — Academy Provisioning, Wildcard URL & Tenant Experience

Purpose: align the visual/product experience with the AcademyBee multi-tenant architecture by making academy URL provisioning, tenant branding and domain-aware states explicit UI/UX requirements.

## 1. Tenant URL Experience

Every academy receives a dedicated AcademyBee URL:

gurushethra.academybees.com

abcacademy.academybees.com

xyzacademy.academybees.com

The URL should feel like the academy's own digital workspace. Once the tenant is resolved, the interface should automatically apply the academy's name, logo, favicon and approved brand configuration.

## 2. Super Admin — Create Academy

Create Academy should be a focused guided form rather than a dense enterprise form.

Academy name.

Academy type.

Owner name and contact.

AcademyBee subdomain/slug with live availability feedback.

Plan/trial selection.

Optional initial branch.

Primary action: Create Academy. After success, show the tenant URL prominently with Copy URL and Open Academy actions.

## 3. Academy Provisioning Success

Success state should communicate:

Academy created.

AcademyBee URL.

Owner invitation/status.

Plan/trial.

Onboarding progress.

Open Academy.

Copy URL.

This should feel like a premium activation moment, not a technical deployment screen.

## 4. Academy First Visit

When the owner opens the new academy URL for the first time, show a tenant-branded welcome experience:

Academy logo/name.

Warm welcome message.

Simple setup progress.

Continue Setup primary action.

Estimated remaining setup effort.

Ability to resume later.

The user should immediately understand: “This is my academy workspace.”

## 5. Guided Academy Onboarding

Recommended sequence:

Academy Profile → Academy Type → First Course → First Teacher → First Batch → First Students → First Timetable → Ready.

Use progressive disclosure. Do not expose advanced settings during initial onboarding. Each step should show completion, allow back navigation and preserve entered information.

## 6. Academy Branding & Domain Settings

Add a dedicated settings experience:

Academy name.

Logo.

Favicon.

Primary brand color.

AcademyBee subdomain.

Verified custom domains.

Public academy profile controls.

Preview should show how the academy identity appears across login, navigation, parent-facing experiences and selected public surfaces.

## 7. Domain & Tenant States

Design explicit polished states for:

Unknown subdomain — academy not found.

Setup in progress — academy has been created but onboarding is incomplete.

Suspended academy — controlled status with appropriate next action.

Domain verification pending.

Custom domain verified.

Custom domain verification failed.

Subdomain unavailable during creation.

Tenant access denied.

Never expose raw technical errors such as database, tenantId or routing exceptions to academy users.

## 8. Tenant-Aware Navigation & Branding

The Academy Management shell should always make the active academy obvious without becoming visually heavy.

Academy logo/name in the shell.

Branch context when multi-branch is enabled.

Academy switcher only for users explicitly allowed to operate multiple academies.

Domain-aware links for academy-facing experiences.

Consistent branding across authenticated and approved public surfaces.

## 9. New Screen Inventory

Platform Create Academy.

Provisioning Success.

Academy Domain Overview.

Academy Branding Settings.

Academy First Visit.

Onboarding — Academy Profile.

Onboarding — Academy Type.

Onboarding — First Course.

Onboarding — First Teacher.

Onboarding — First Batch.

Onboarding — First Students.

Onboarding — First Timetable.

Onboarding — Ready.

Unknown Academy.

Suspended Academy.

Custom Domain Verification.

## 10. Design Acceptance Criteria

A newly created academy can immediately identify and open its dedicated URL.

The tenant URL and academy identity are visually clear.

The first-time owner experience is guided and low-friction.

Tenant branding is visible without overwhelming the core AcademyBee design system.

Domain failures and tenant status states are understandable to non-technical users.

Domain/subdomain settings do not expose implementation details such as tenant IDs.

The experience supports future custom domains without redesigning the tenant shell.

Design source-of-truth rule: the PRD defines tenant/domain behavior and acceptance; this UI/UX specification defines how that behavior is presented to Super Admins, academy owners and academy users.

AcademyBee Master UI/UX Design Specification v1.0 • September 2026
# V1.2 Addendum — Light and Dark Themes

*Product Owner direction, 2026-10-01 (DECISIONS C-49). This addendum extends §4–6 and §24; where it differs, it overrides them. The original .docx files predate it.*

## 1. Principle

AcademyBee has two themes, **Light** and **Dark**, with the same brand feel: premium, warm, calm. Dark is not an inverted light theme. It uses **deep warm charcoal** (never pure black), **ivory text**, and keeps **Bee Gold as the accent**, never a dominant background.

## 2. Choosing a theme

- The theme **follows the device** (`prefers-color-scheme`) until the user chooses.
- A **Light / Dark / System** control lives in the app shell (top bar or account menu) and on the public home header. Each option shows an icon and a label; the selected option is clearly marked (not by colour alone).
- The choice is remembered on the device now and moves to the user profile with accounts (Phase 2), so it follows the user across devices.
- The page **never flashes** the wrong theme on load: the theme is applied before the first paint.

## 3. Colour roles

Screens use **roles**, never raw colours. Both palettes keep every text/background pair at **≥ 4.5:1** and control borders and focus rings at **≥ 3:1** (WCAG 2.1 AA), checked automatically.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Background | Warm Ivory `#FAFAF7` | Warm charcoal `#191816` | Page |
| Surface | White `#FFFFFF` | `#22211E` | Cards, sheets, top bar, sidebar |
| Surface raised | `#ECEAE3` | `#2B2A26` | Hover, segmented controls, subtle fills |
| Border | `#DEDBD2` | `#3A3833` | Dividers, card outlines |
| Border strong | `#8A867C` | `#8C877C` | Input and control outlines |
| Text | Deep Ink `#171817` | Ivory `#F3F1EA` | Primary text |
| Text secondary | `#5C5A54` | `#B8B3A7` | Metadata |
| Accent | Bee Gold `#E6B94A` | Bee Gold `#E6B94A` | Highlights, brand moments |
| Accent soft / on | Soft Gold `#F5E7B8` / Ink | `#3A3222` / `#EBC664` | Selected navigation item |
| Primary button / text | Ink / Ivory | Ivory / Ink | Primary actions |
| Inverse / text | Ink / Ivory | Ivory / Ink | Offline banner, high-emphasis notices |
| Focus ring | `#3A63A6` | `#86AEEE` | Keyboard focus |
| Success text · surface | `#1D7453` · `#E6F3EC` | `#5BC796` · `#163126` | Paid, present, confirmed |
| Warning text · surface | `#8A5A12` · `#FBF0DC` | `#E9AE55` · `#33281A` | Needs attention, awaiting confirmation |
| Danger text · surface | `#B23B3B` · `#FBE7E7` | `#F08A84` · `#3A1F1E` | Overdue, errors, destructive |
| Info text · surface | `#3A63A6` · `#E6EDF8` | `#86AEEE` · `#1C2840` | Informational |

The §5 hues (`#238B63`, `#D99124`, `#D95555`, `#4778C7`) remain the brand reference; text and filled buttons use the AA-safe variants above. In Dark, filled status buttons use ink text on the lighter status colour.

## 4. Brand mark

The logo keeps its ink square and gold cell in both themes. In Dark, a **1 px warm-grey hairline** (`#4A4741`) outlines the square so it does not vanish into the background. App icons, emails, PDFs and receipts stay light.

## 5. Academy branding

An academy's brand colour tints identity surfaces only (§V1.1-8) and must pass contrast in **both** themes; status colours and the system palette are never overridden.

## 6. Acceptance

- Every screen is reviewed in Light and Dark on phone and desktop.
- Automated accessibility checks run in both themes.
- Switching themes never loses form input or scroll position and never reloads the page.

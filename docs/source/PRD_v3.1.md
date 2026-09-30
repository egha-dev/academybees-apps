**🐝 AcademyBee**

*Complete Product Requirements Document*

**Academy ****&**** Coaching Centre Management SaaS — Offline-First PWA**

Version 2.0 — Consolidated PRD

September 2026

Product Owner Edition

# Document Purpose

This document is the single product and engineering source of truth for AcademyBee. It defines the product vision, target customers, personas, roles, functional requirements, offline-first PWA architecture, data model, security, roadmap, MVP scope, acceptance criteria, metrics and development rules.

# 1. Product Vision

AcademyBee is a multi-tenant SaaS platform for tuition centres, dance, music, karate, sports, fitness, language, kids activity and other coaching academies. It replaces fragmented spreadsheets, paper registers, manual fee tracking and disconnected communication with one operating platform.

Discover → Enquire → Trial → Enrol → Schedule → Attend → Learn → Assess → Collect → Communicate → Retain → Grow

Product promise: “Manage Your Academy. Grow Together.”

Long-term positioning: “The operating system for coaching academies.”

# 2. Target Customers

Tuition and coaching centres: school tuition, board coaching, NEET/JEE, Abacus, Phonics, Spoken English and competitive coaching.

Skill academies: Dance, Bharatanatyam, Western dance, Music, Karate, Martial Arts, Yoga, Sports and Fitness.

Other coaching businesses: language, hobby, art, coding, kids activity and exam-preparation centres.

Single-location academies initially; multi-branch operators later.

# 3. Product Principles

Mobile-first: common teacher and parent tasks must work comfortably on phones.

Offline-first where it creates real value: especially teacher attendance and daily class operations.

Simple: a non-technical academy owner should understand the product quickly.

Configurable: support different academy types without hard-coded assumptions.

Automation-first: reduce repetitive fee, attendance and communication work.

Parent communication is core, not an add-on.

Financial integrity: never claim an online payment succeeded without server confirmation.

Tenant isolation: academy data must be strictly separated.

Modular architecture: start as a modular monolith and extract services only when justified.

Build in validated phases; do not expand scope before the current phase is production-ready.

# 4. Personas & Roles

| Role | Primary goals | Key access |
| --- | --- | --- |
| Super Admin | Operate AcademyBee SaaS | Tenants, plans, subscriptions, platform analytics, support, audit |
| Academy Owner | Run and grow academy | Full academy operations, finance, reports, settings |
| Academy Admin | Run daily operations | Students, batches, attendance, fees, communications |
| Teacher / Instructor | Run classes | Batches, students, attendance, homework, assessments |
| Accountant | Manage money | Fees, invoices, payments, receipts, expenses |
| Receptionist | Convert enquiries and manage admissions | Leads, trials, admissions, student registration |
| Parent | Manage children | Children, attendance, fees, timetable, homework, notifications |
| Student | Participate in learning | Classes, homework, assessments, progress, certificates |

# 5. Master Student Lifecycle

LEAD → CONTACT → TRIAL → INTERESTED → ADMISSION → STUDENT → COURSE/BATCH → TIMETABLE → ATTENDANCE

ATTENDANCE → HOMEWORK/ASSESSMENT → PROGRESS → FEES → PAYMENT → PARENT UPDATE → RETENTION

# 6. Product Module Map

Authentication & account security

Academy / tenant management

Branches

Users, roles & permissions

Students & parents

Teachers / instructors

Courses, levels & batches

Timetable and class sessions

Attendance

Fees, invoices, payments and receipts

Expenses

Homework and learning

Exams and assessments

Student progress

CRM, leads, trials and admissions

Notifications, announcements and WhatsApp

Certificates and events

Reports and dashboards

AcademyBee subscriptions and billing

Support and audit logs

Offline PWA and synchronization

Advanced analytics and AI

# 7. Offline-First PWA Strategy

AcademyBee should not attempt to make every feature fully offline. The correct strategy is: online when available, offline when necessary, and automatic synchronization when connectivity returns.

| Capability | Offline | Sync | Priority |
| --- | --- | --- | --- |
| Teacher session / app shell | Yes | No | P0 |
| Today's timetable | Yes | No | P0 |
| My batches | Yes | No | P0 |
| Student list/basic profile | Yes | No | P0 |
| Attendance | Yes | Yes | P0 |
| Attendance history | Cached | Yes | P0 |
| Homework drafts | Yes | Yes | P1 |
| Teacher notes | Yes | Yes | P1 |
| Announcements | Cached read-only | No | P1 |
| Fees/invoices | Cached read-only | No | P1 |
| Cash payment recording | Limited | Yes | P1 |
| Online UPI/card payment | No | No | P1 |
| Admin configuration | No | No | P1 |
| Subscription/billing | No | No | P1 |

# 8. Offline Technical Architecture

Next.js / React

        ↓

Service Worker + PWA App Shell

        ↓

Dexie.js → IndexedDB

        ↓

Local Cache + Sync Queue

        ↓

Sync Engine + Conflict Handler

        ↓

NestJS API

        ↓

PostgreSQL

Dexie.js is the recommended IndexedDB layer. It should be used as the local/offline database, while NestJS + PostgreSQL remain the authoritative server-side source of truth. AcademyBee should not introduce Dexie Cloud as a second backend unless a future product decision specifically requires it.

# 9. Offline Data Model

IndexedDB / Dexie

├── session

├── academy

├── branch

├── students

├── parents

├── courses

├── batches

├── timetable

├── attendance

├── homeworkDrafts

├── notifications

└── syncQueue

# 10. Sync Queue Requirements

Every offline mutation must create a durable sync-queue item.

Queue items must have a client-generated ID / idempotency key.

Sync should retry safely after temporary failures.

Successful server acknowledgement removes or marks the queue item as synced.

Failed operations should remain visible to the user rather than silently disappearing.

The UI must show Offline, Pending Sync and Fully Synced states.

The sync engine must prevent duplicate attendance/payment records.

Sync must be resumable after app restart.

# 11. Conflict Resolution

Attendance should use server validation and idempotent operations.

Concurrent edits must use versioning or updatedAt/version checks where necessary.

Financial records must never use blind last-write-wins for critical mutations.

For conflicting non-critical edits, the system may use a defined last-write or merge strategy.

User-visible conflicts should provide a clear resolution path.

The server remains authoritative.

# 12. Offline Security

Cache only the minimum data needed for the user's role.

Do not store passwords in IndexedDB.

Clear sensitive local data on logout where appropriate.

Use secure session handling and expiry.

Consider browser persistent-storage APIs for important offline data.

Do not expose another tenant's data through local cache.

Online-only financial and administrative operations must remain server-controlled.

# 13. Offline Attendance — Key Differentiator

Teacher opens app → Today's classes cached → Internet unavailable → Mark attendance → Save locally

Connection returns → Sync engine sends records → Server confirms → Parent notification can be triggered

Offline attendance is the first and most important offline workflow because it provides immediate value to dance, karate, sports, tuition and other teachers operating in unreliable connectivity environments.

# 14. Phase Roadmap

| Phase | Name | Scope |
| --- | --- | --- |
| Phase 0 | Foundation | Auth, multi-tenancy, RBAC, database, API architecture, PWA shell, Dexie, sync foundation, CI/CD. |
| Phase 1 | Super Admin | Platform dashboard, academies, users, plans, subscription payments, analytics, support, settings, audit. |
| Phase 2 | Academy Owner/Admin | Academy setup, dashboard, students, parents, teachers, courses, batches, timetable. |
| Phase 3 | Attendance | Online + offline attendance, bulk marking, history, attendance analytics, sync. |
| Phase 4 | Fees & Payments | Fee plans, invoices, discounts, payments, receipts, overdue tracking, reminders, online gateway. |
| Phase 5 | Parent Portal | Children, attendance, fees, receipts, timetable, homework, progress, notifications. |
| Phase 6 | Teacher Portal | Classes, batches, attendance, students, homework, assessments, announcements, offline workflows. |
| Phase 7 | Learning | Homework, assignments, submissions, exams, marks, grades, assessments, progress. |
| Phase 8 | CRM & Admissions | Leads, pipeline, follow-ups, trial classes, admissions, conversion analytics. |
| Phase 9 | Communication | In-app, push, email, SMS, WhatsApp templates, broadcasts, automated notifications. |
| Phase 10 | Reports & Analytics | Student, attendance, finance, CRM, teacher and management reports. |
| Phase 11 | Multi-Branch | Branches, branch staff, branch data, branch reporting, branch permissions. |
| Phase 12 | Certificates & Events | Certificates, events, workshops, competitions, parent meetings. |
| Phase 13 | Expenses | Operating expenses, salaries, equipment, maintenance and profitability. |
| Phase 14 | SaaS Billing | AcademyBee plans, trials, subscriptions, invoices, payments, upgrades, downgrades, cancellation. |
| Phase 15 | Advanced Analytics | MRR, ARR, churn, LTV, CAC, conversion, retention and academy performance. |
| Phase 16 | AI | Attendance insights, fee insights, lead assistant, message generation, reports and automation. |

# 15. Phase 0 — Foundation Requirements

Next.js + TypeScript frontend foundation.

NestJS + TypeScript backend foundation.

PostgreSQL schema and migrations.

Authentication and authorization.

Tenant context and tenant isolation.

Role and permission framework.

PWA manifest and service worker.

Dexie.js database and schema versioning.

Sync queue and connectivity detection.

API error/validation conventions.

Logging, audit foundation and monitoring.

CI/CD and environment configuration.

Reusable AcademyBee design system.

# 16. Phase 1 — Super Admin Requirements

Authentication: login, logout, forgot/reset password, protected routes.

Dashboard: total academies, active academies, students, MRR, growth and recent activity.

Academies: list, search, filters, create, detail, activate, suspend, subscription and activity.

Users: search, filter, role, academy, status, detail, activate/deactivate, reset and role assignment.

Plans: create/edit/disable plans, limits and feature flags.

Payments: successful, failed, pending and refunded subscription transactions.

Analytics: MRR, ARR, academy growth, trials, conversion, usage and churn.

Support: tickets, status, priority, conversations and resolution.

Settings: platform, payment, notification and security settings.

Audit logs: actor, action, tenant, object, time and relevant before/after values.

# 17. Phase 2 — Academy Owner/Admin Requirements

Academy onboarding and configuration.

Academy dashboard.

Student registration and profile management.

Parent relationships and multiple children.

Teacher management.

Courses and levels.

Batch creation, capacity, schedule and teachers.

Weekly timetable and class sessions.

Basic operational reports.

Academy settings and configurable terminology.

# 18. Phase 3 — Attendance Requirements

Teacher opens today's batch and sees student list.

Bulk mark all present and modify exceptions.

Present, absent, late and leave states.

Online attendance save.

Offline attendance save to Dexie.

Sync queue processing when connection returns.

Attendance history and monthly percentage.

Parent notification after confirmed server sync.

Duplicate prevention and idempotency.

# 19. Phase 4 — Fees & Payments Requirements

Monthly, quarterly, half-yearly, annual and custom fee plans.

Student-specific fees and discounts.

Invoices and invoice items.

Partial payments.

Payment history.

Receipts.

Overdue tracking.

Cash and offline payment recording with pending-sync state.

UPI/online gateway integration requiring server confirmation.

Fee reminders.

# 20. Phase 5 — Parent Portal Requirements

Parent account with multiple children.

Attendance view.

Fees, invoices, payments and receipts.

Timetable.

Homework and submissions.

Progress and assessments.

Notifications.

Mobile-first PWA experience.

Recent data cache with clear last-synced timestamp.

# 21. Phase 6 — Teacher Portal Requirements

Teacher dashboard.

Today's classes.

My batches.

Student list.

Attendance.

Homework.

Assessments.

Announcements.

Offline timetable/batch/student data.

Offline attendance and drafts.

# 22. Phase 7 — Learning Requirements

Homework creation and assignment.

File attachments.

Submission and completion tracking.

Exams and marks.

Grades and remarks.

Configurable assessment criteria for different academy types.

Student progress timeline.

# 23. Phase 8 — CRM & Admissions Requirements

Lead capture.

Lead source.

Follow-up date and notes.

Pipeline: New → Contacted → Trial → Interested → Admission → Lost.

Trial scheduling.

Trial attendance and feedback.

Admission conversion.

CRM dashboard and conversion reporting.

# 24. Phase 9 — Communication Requirements

Notification abstraction independent of a single provider.

In-app notifications.

Push notifications.

Email.

SMS.

WhatsApp Business/Cloud API.

Templates and automated triggers.

Fee reminders, attendance alerts, trial reminders and announcements.

Message history.

# 25. Phase 10+ Requirements

Reports and analytics for management.

Multi-branch support.

Certificates and events.

Expense tracking and profitability.

AcademyBee subscription billing.

Advanced SaaS and academy analytics.

AI features only after core workflows are stable and data quality is reliable.

# 26. Core Database Model

User
Tenant
Branch
TenantUser
Role
Permission
RolePermission

Student
Parent
ParentStudent
Teacher

Course
CourseLevel
Batch
BatchStudent
BatchTeacher
ClassSession
Attendance

FeePlan
Invoice
InvoiceItem
Payment
Receipt

Lead
TrialClass
Admission

Homework
HomeworkSubmission
Assessment
AssessmentResult

Notification
Announcement

SubscriptionPlan
Subscription
SubscriptionPayment

SupportTicket
AuditLog

# 27. Tenant Data Isolation

Tenant → Branch → Users / Students / Parents / Teachers / Courses / Batches / Sessions / Fees / Leads

Tenant-owned records must contain tenantId.

Branch-scoped records should additionally contain branchId.

Backend derives tenant context from authenticated authorization.

Frontend-provided tenantId must never be trusted as an authorization mechanism.

All tenant access must be tested explicitly.

# 28. Recommended Technology Stack

| Layer | Recommendation | Purpose |
| --- | --- | --- |
| Web/PWA | Next.js + TypeScript | Admin, teacher and parent experiences |
| UI | Material UI or chosen AcademyBee design system | Consistent responsive interface |
| API | NestJS + TypeScript | Domain APIs and authorization |
| Database | PostgreSQL | Authoritative transactional data |
| ORM | Prisma or equivalent | Type-safe database access |
| Local DB | Dexie.js + IndexedDB | Offline-first client data |
| PWA | Service Worker / Workbox-compatible approach | App shell and caching |
| Sync | Custom AcademyBee Sync Engine | Offline mutation synchronization |
| Jobs | Redis + BullMQ or equivalent | Notifications, reminders, background work |
| Storage | Object Storage | Documents, images, certificates |
| Deployment | Vercel + suitable cloud services | Web and backend deployment |

# 29. Security Requirements

Secure authentication and session management.

Role-based access control.

Strict tenant isolation.

Input validation and output sanitization.

Rate limiting.

Secure password hashing.

CSRF/XSS/SQL injection protections appropriate to architecture.

Secure file access.

Validated payment webhooks.

Secrets stored outside source control.

Audit logging for sensitive administrative actions.

Minimal offline cache based on role.

# 30. Financial Integrity Rules

Server is authoritative for financial state.

Offline cash receipt can be recorded as pending sync.

Offline mode must never mark an online gateway transaction as successful.

Payment IDs must be idempotent.

Refunds require server connectivity and authorization.

Financial mutations require audit records.

# 31. UX Requirements

Responsive desktop, tablet and mobile.

Consistent navigation and terminology.

Fast common actions.

Clear empty states.

Clear loading states.

Clear error messages.

Clear offline/online status.

Clear sync queue status.

Confirm destructive actions.

Avoid unnecessary multi-step workflows.

# 32. Key Dashboards

| Dashboard | Core metrics |
| --- | --- |
| Super Admin | Academies, active academies, students, MRR, growth, subscriptions, recent activity |
| Academy Owner | Students, teachers, batches, classes, collected fees, pending fees, leads, admissions, attendance |
| Teacher | Today's classes, batches, attendance, homework, assessments |
| Parent | Children, attendance, pending fees, next class, homework, notifications |

# 33. Product Metrics / KPIs

| Area | Metrics |
| --- | --- |
| Acquisition | New academy signups, trials, signup sources |
| Activation | Profile + course + batch + student + first attendance + first payment |
| Engagement | Weekly active academies, active teachers, parent logins, attendance usage |
| Revenue | MRR, ARR, paid academies, ARPA, churn |
| Retention | Academy retention, student retention, parent engagement |
| Offline | Offline attendance usage, pending syncs, sync success rate, conflict rate |

# 34. MVP Definition

The first sellable version should include:

Authentication and tenant foundation

Super Admin

Academy management

Users and roles

Students and parents

Teachers

Courses and batches

Timetable

Attendance

Offline attendance

Fees and basic payments

Parent portal

Teacher portal

Basic reports

CRM, trials and WhatsApp should follow as the first growth release.

# 35. Definition of Done

Requirements are documented.

User flow is approved.

UI is complete.

Database changes are complete.

API is complete.

Authorization is complete.

Validation and error handling are complete.

Loading/empty/error states are complete.

Mobile experience is verified.

Offline behavior is verified for applicable features.

Sync and conflict behavior is tested.

Audit logging is added where required.

Automated and manual testing is complete.

Production deployment is verified.

Product Owner acceptance is complete.

# 36. Development Workflow

Requirements → User Flow → UI → Database → API → Frontend → Permissions → Offline → Testing → Production → DONE

The team should not jump to the next major module until the current module has reached Definition of Done.

# 37. Release Strategy

| Release | Goal | Scope |
| --- | --- | --- |
| Foundation Release | Technical base | Phase 0 |
| MVP Release | First real academy operations | Phases 1–6 core subset |
| Growth Release | Acquire and retain more academies | Phases 7–10 |
| Scale Release | Larger academy businesses | Phases 11–15 |
| Intelligence Release | Automation and AI | Phase 16 |

# 38. Product Risks & Mitigation

| Risk | Mitigation |
| --- | --- |
| Too much scope | Strict phase gates and MVP boundaries |
| Tenant data leakage | Centralized authorization and tenant isolation tests |
| Offline conflicts | Idempotency, versioning, server authority and explicit conflict handling |
| Stale offline data | Last-synced indicators and controlled cache lifetime |
| Financial inconsistency | Online server authority for payment confirmation |
| Complex UX | Role-specific dashboards and short workflows |
| Premature microservices | Modular monolith until scale justifies extraction |
| WhatsApp dependency | Notification abstraction with multiple channels |
| Feature overload | Validate with real academies before expanding |

# 39. Current Build Position

The AcademyBee design process has already produced visual concepts for Super Admin Phase 1, Academy Management Phase 2 and User Management Phase 3. The next engineering focus should be to implement the foundation and Super Admin capabilities, while incorporating the offline PWA architecture from Phase 0 rather than retrofitting it later.

# 40. Product Owner Decision Rules

Build the core operational workflow before advanced features.

Validate important workflows with at least one real academy before large-scale expansion.

Prioritize teacher attendance and owner fee visibility as high-value workflows.

Keep offline capability focused on workflows where connectivity is genuinely unreliable.

Never compromise tenant isolation or financial integrity for offline convenience.

Use feature flags for plan-based features.

Keep the backend authoritative even when the client operates offline.

Treat the PRD as a living source of truth and version major changes.

# 41. Final Product Vision

RUN + GROW + LEARN + MONEY + COMMUNICATION + INTELLIGENCE

AcademyBee starts as a simple academy-management SaaS, becomes an operational platform for students, teachers, parents and owners, and eventually becomes the complete operating system for coaching businesses.

# 18. Scalability, Infrastructure & Cost Planning

**Objective. **AcademyBee must be architected from day one to support approximately 50,000–100,000 students without requiring a fundamental rewrite, while keeping early-stage infrastructure costs proportional to actual usage.

## 18.1 Scalability Principle

Design for 100K students; pay for current usage. The platform should use a modular, multi-tenant architecture that can scale horizontally as academy count, daily active users, attendance volume, notifications and reporting workloads increase.

Multi-tenant from day one; every tenant-owned record carries tenantId.

Branch-aware architecture; branch-scoped records carry branchId where applicable.

Server remains the source of truth for financial and security-sensitive data.

Use background jobs for notifications, reports, exports, reminders and other non-blocking workloads.

Cache and aggregate high-volume reporting data instead of repeatedly scanning raw transactional tables.

Keep teacher and parent offline caches scoped to only the data they are authorized to use.

Scale application instances horizontally rather than relying on one large application server.

Introduce database partitioning/read replicas only when measured workload justifies them.

## 18.2 Reference Production Architecture

Recommended target architecture for a mature AcademyBee deployment:

Frontend/PWA: Next.js + TypeScript, deployed behind a CDN.

API: NestJS + TypeScript, stateless and horizontally scalable.

Database: PostgreSQL with proper indexes, connection pooling, backups and optional read replicas.

Cache/queues: Redis with BullMQ or equivalent for jobs, caching and rate limiting.

Object storage: S3-compatible storage such as Cloudflare R2 for documents, homework files and certificates.

Offline storage: Dexie.js over IndexedDB; no server cost and no Dexie Cloud dependency initially.

Workers: Separate background worker processes for notifications, WhatsApp/SMS, reports, exports and scheduled jobs.

Observability: Error tracking, application metrics, logs, uptime monitoring and database monitoring.

Backups/DR: Automated PostgreSQL backups plus object-storage redundancy/versioning where appropriate.

Security: tenant isolation, RBAC, audit logs, rate limiting, encrypted transport and secure session management.

## 18.3 Scale Stages

| Stage | Approx. Students | Architecture | Planning Cost / Month |
| --- | --- | --- | --- |
| Stage 1 | 0–5K | Vercel/CDN + NestJS + managed PostgreSQL + Redis + object storage | ₹5K–₹20K |
| Stage 2 | 5K–25K | 2 API instances + worker + managed DB + Redis + monitoring | ₹15K–₹40K |
| Stage 3 | 25K–50K | Load balancing + stronger DB + caching + workers + backups | ₹30K–₹75K |
| Stage 4 | 50K–100K | Multiple API instances + DB scaling/read replica as needed + Redis + CDN + workers + observability | ₹50K–₹1.25L+ |
| Stage 5 | 100K+ | Measure bottlenecks and selectively introduce sharding/partitioning, additional replicas and dedicated services | Workload dependent |

These are planning ranges, not vendor quotes. Actual spend depends on traffic, database workload, storage, file delivery, notification volume, availability requirements and cloud region.

## 18.4 Example Cost Model for 50K–100K Students

| Component | Early | 50K–100K Planning Range | Scaling Note |
| --- | --- | --- | --- |
| Next.js / PWA / CDN | ₹2K–₹5K | ₹3K–₹10K | CDN and transfer scale with traffic |
| NestJS API | ₹3K–₹8K | ₹10K–₹25K | Use multiple stateless instances |
| PostgreSQL | ₹5K–₹15K | ₹15K–₹40K | Indexes, pooling, backups and replicas as needed |
| Redis / Queues | ₹1K–₹3K | ₹2K–₹10K | Jobs, caching and rate limiting |
| Object Storage / CDN | ₹1K–₹5K | ₹3K–₹15K | Depends heavily on file volume and delivery |
| Workers | ₹2K–₹5K | ₹5K–₹15K | Scale for messaging/report/export workloads |
| Monitoring / Logging | ₹0–₹5K | ₹5K–₹15K | Increase with retention and traffic |
| Backup / DR | ₹1K–₹5K | ₹5K–₹15K | Depends on retention and redundancy |

Indicative total: approximately ₹15K–₹50K/month for an early production system and ₹50K–₹1.25L+/month for a healthy 50K–100K-student deployment. WhatsApp, SMS, payment gateway fees, development salaries and other business costs are excluded.

## 18.5 Current Vendor Planning References

For budgeting, the architecture can start with managed services and migrate individual components when utilization justifies it. Current public pricing references used for planning include Vercel Pro at approximately $20/month, Supabase Pro at approximately $25/month before additional compute/usage, Upstash Redis with a free tier and usage-based/fixed plans, and Cloudflare R2 with low storage cost and no egress charge under its standard model. Pricing changes over time; procurement decisions must be checked against the provider's current pricing before production commitment.

## 18.6 High-Volume Data Considerations

Attendance is expected to be one of the largest transactional tables. For example, 100,000 students × 20 classes/month can generate approximately 2 million attendance records per month. At that volume, efficient indexes, pagination, retention strategy, batch writes and carefully designed queries are mandatory.

Do not load all students or all attendance records into the browser.

Use cursor/keyset pagination for large lists where appropriate.

Use composite indexes aligned with tenantId, branchId, studentId, batchId and date access patterns.

Use monthly/daily summary tables for dashboards and management analytics.

Partition very large tables only after monitoring demonstrates a need.

Use asynchronous exports for large CSV/Excel reports.

Keep raw transactional records separate from analytical summaries.

## 18.7 Notification Cost & Queue Architecture

WhatsApp and SMS can become a larger variable operating cost than core application hosting. All outbound messages should therefore pass through a notification abstraction and background queue so providers can be changed without rewriting business workflows.

Application creates notification intent.

Job is placed in Redis/BullMQ queue.

Worker validates recipient, template and provider.

Provider API is called with retry/backoff rules.

Delivery result is stored for audit and reporting.

Failed jobs remain visible and retry safely without duplicate sends.

## 18.8 Offline Architecture at Scale

Dexie.js + IndexedDB remains a client-side capability and does not add a proportional cloud infrastructure cost. Each user should cache only the minimum authorized working set.

Teacher: assigned batches, students, timetable, attendance and relevant drafts.

Parent: own children, timetable, attendance, fees and recent notifications.

Academy owner/admin: operational data needed for current branch/academy workflows.

Super Admin: aggregated platform data and paginated management views.

Never cache the entire platform dataset on a client device.

## 18.9 Reliability Targets

API services should be stateless so another instance can take traffic during failure.

Financial writes must be idempotent and server-authoritative.

Offline mutations must use client-generated idempotency keys and durable sync queues.

Database backups must be automated and periodically restore-tested.

Critical background jobs must support retry, dead-letter/error visibility and operational replay.

Monitoring should alert on API errors, database health, queue backlog, failed syncs and storage/traffic anomalies.

## 18.10 Product Owner Decision Rule

Do not over-engineer for 100K students before AcademyBee has that workload. The codebase must be capable of scaling, but infrastructure should scale progressively based on real metrics: active users, requests/second, database CPU, query latency, storage, queue depth, notification volume, error rate and uptime.

## 18.11 Scalability Acceptance Criteria

A new API instance can be added without code changes or session migration.

Tenant isolation remains enforced at every API/data access layer.

Attendance can be written in bulk and safely retried.

Large reports are generated asynchronously.

Dashboard queries use summary data where appropriate.

Offline sync survives browser restart and temporary network loss.

Financial transactions cannot be duplicated by retries.

Infrastructure can be scaled component-by-component.

Production cost is observable by major infrastructure component.

**🐝 ACADEMYBEE**

**FINAL PRODUCT REQUIREMENTS DOCUMENT**

**Product Owner + Principal Consultant Edition**

**Version 3.0 • September 2026**
Offline-First • Multi-Tenant • Financially Safe • Scalable to 100K Students

MASTER SOURCE OF TRUTH
Product • UX • Architecture • Engineering • QA • Operations

# Final Product Owner Statement

AcademyBee is not to be built as a collection of CRUD screens. It must be built as an operating system for coaching businesses. Every module must strengthen one of five business outcomes: acquire students, run classes, collect money, communicate with parents, or retain and grow the academy.

The architecture must be capable of serving 50K–100K students, but the product must remain simple for a 20–200 student academy. Scale must be achieved through architecture and automation, not by exposing enterprise complexity to small customers.

# Document Status & Authority

| Item | Decision |
| --- | --- |
| Document status | FINAL BASELINE — V3.0 |
| Primary authority | This PRD governs product scope and acceptance. |
| Engineering authority | Architecture decisions must satisfy this PRD and approved ADRs. |
| Design authority | Approved AcademyBee design system and role-specific UX. |
| Change control | Material scope changes require Product Owner approval and PRD versioning. |
| Scale target | Architecture ready for 50K–100K students; infrastructure scales progressively. |
| Primary product model | Multi-tenant SaaS with role-based access and optional multi-branch. |
| Offline model | Selective offline-first; server remains authoritative. |

# 1. Executive Product Definition

AcademyBee is a SaaS platform for tuition centres, dance, music, karate, martial arts, sports, fitness, language, coding, kids activity and other coaching businesses. It combines CRM, student management, scheduling, attendance, learning, fees, communication, reporting and academy administration in one role-based platform.

Core promise: “Manage Your Academy. Grow Together.”

Long-term positioning: “The operating system for coaching academies.”

North-star lifecycle:

Discover → Enquire → Trial → Enrol → Schedule → Attend → Learn → Assess → Collect → Communicate → Retain → Grow

# 2. Product Outcomes

| Outcome | Business problem | AcademyBee capability | Success signal |
| --- | --- | --- | --- |
| Acquire | Leads lost or follow-up is manual | CRM, trials, follow-ups, admissions | Trial-to-admission conversion |
| Run | Attendance, batches and schedules are fragmented | Batches, timetable, attendance, teacher portal | Daily operational completion |
| Collect | Fees are delayed or difficult to track | Invoices, payments, receipts, reminders | Collection rate / overdue reduction |
| Communicate | Parents lack timely information | Push, WhatsApp, SMS, email, announcements | Parent engagement / delivery rate |
| Retain & Grow | Owners cannot see academy health | Reports, retention, profitability, insights | Student retention / academy revenue |

# 3. Target Customer Strategy

Primary launch segment: small and mid-sized coaching academies where the owner is still personally involved in daily operations. The first product experience must therefore optimize for speed, simplicity and mobile usage.

Tuition and coaching centres

Dance / Bharatanatyam / music academies

Karate / martial arts / sports academies

Fitness / yoga / kids activity centres

Language / coding / hobby / skill academies

Multi-branch and larger academy groups are a scale segment, not a reason to complicate the MVP.

# 4. Explicit Non-Goals

The following are deliberately outside the initial product scope unless validated by real customer demand:

Full HR/payroll/tax compliance suite

General-purpose accounting/ERP replacement

Full school ERP or university SIS

Marketplace for finding academies

Consumer social network

Custom enterprise workflow engine in MVP

Microservices architecture before measured need

AI features before sufficient trusted product data exists

Non-goals protect delivery speed and prevent the product from becoming an unfocused ERP.

# 5. Product Roles & Permission Model

| Role | Primary responsibility | Default scope |
| --- | --- | --- |
| Super Admin | Operate AcademyBee platform | All platform tenants; audited |
| Academy Owner | Own and grow academy | All permitted academy/branch data |
| Academy Admin | Run daily operations | Assigned academy/branches |
| Teacher / Instructor | Run classes and learning | Assigned batches/students |
| Accountant | Manage financial operations | Financial scope only |
| Receptionist | Leads/admissions/front desk | CRM + registration scope |
| Parent | Manage children | Own linked children only |
| Student | Participate in learning | Own profile/learning data |

RBAC is mandatory, but permissions must be capability-based rather than hard-coded to UI routes. The API must authorize every sensitive operation independently of the frontend.

# 6. Academy & Tenant Lifecycle

| Object | Lifecycle |
| --- | --- |
| Academy | Draft → Pending Approval → Active → Suspended → Archived |
| Subscription | Trial → Active → Past Due → Grace → Suspended → Cancelled → Expired |
| Lead | New → Contacted → Trial Scheduled → Trial Completed → Interested → Admission → Lost |
| Student | Enquiry → Trial → Active → On Hold → Completed / Left |
| Class Session | Scheduled → Started → Completed / Cancelled / Rescheduled |
| Invoice | Draft → Issued → Partially Paid → Paid / Overdue / Cancelled |
| Payment | Initiated → Pending → Confirmed / Failed / Refunded |
| Sync Item | Pending → Processing → Synced / Failed / Conflict |

# 7. Core User Journeys

Every major journey must have a documented happy path, validation path, error path and permission path.

Academy signup → verification → onboarding → first course → first batch → first student → first attendance.

Lead → contact → trial scheduling → trial attendance → follow-up → admission.

Student → batch assignment → timetable → attendance → learning → assessment → progress.

Invoice → payment initiation → server confirmation → receipt → parent notification.

Teacher offline → cached class → attendance → local queue → reconnect → server sync → confirmation.

Owner → dashboard → identify overdue fees → reminder → payment → updated dashboard.

Subscription → trial expiry → grace period → payment recovery → active or suspension.

# 8. MVP Release Contract

MVP is not 'everything that has been coded'. MVP is the smallest version that allows a real academy to run daily operations and collect money reliably.

| MVP capability | Required for release |
| --- | --- |
| Identity & security | Authentication, tenant isolation, RBAC, password reset, audit foundation |
| Academy operations | Academy, branches foundation, students, parents, teachers |
| Scheduling | Courses, levels, batches, recurring timetable, class sessions |
| Attendance | Online + offline attendance, sync, history, duplicate protection |
| Finance | Fee plans, invoices, payments, receipts, overdue status |
| Portals | Owner/Admin, Teacher and Parent core experiences |
| Communication | In-app/push foundation; provider abstraction for future channels |
| Reporting | Operational dashboards and basic exports |
| PWA | Installable app shell + selected offline workflows |
| Operations | Logs, monitoring, backups, error handling, deployment pipeline |

# 9. Functional Module Specifications

The existing phase-by-phase requirements in this PRD remain authoritative. The following product rules are mandatory across those modules.

Students and parents must support one parent with multiple children and a child with multiple authorized parents.

Batch membership must be time-aware enough to preserve historical attendance and fee context.

Class sessions must be generated from recurring schedules but remain independently cancellable/reschedulable.

Attendance must be stored against a specific session and student, not merely against a batch/date.

Invoices and payments must be separate concepts; a payment may settle one or multiple invoice items according to the approved finance model.

Every financial record must have an immutable audit trail.

Deleted operational records should normally use soft-delete/archive semantics where historical reporting depends on them.

All exports must enforce the same authorization scope as the UI.

# 10. Offline-First Product Contract

Offline is a controlled capability, not a promise that the entire product works without a network.

| Workflow | Offline policy |
| --- | --- |
| Teacher timetable | Cached/read-only |
| Assigned students | Cached/read-only with controlled refresh |
| Attendance | Full offline create/update + durable sync |
| Homework draft | Offline draft + sync |
| Teacher notes | Offline draft + sync |
| Announcements | Cached/read-only |
| Fees/invoices | Cached/read-only |
| Offline cash recording | Allowed only as pending-sync transaction |
| Online payment | Online + server confirmation only |
| Refunds | Online only |
| Subscription/admin settings | Online only |

Offline UI must always expose connection state, pending-sync count, last successful sync time, and actionable failure information.

# 11. Sync Engine Contract

Every mutation gets a client-generated operation ID / idempotency key.

The same operation must be safe to retry without creating duplicates.

Sync ordering must respect dependencies where required.

Server response must return a definitive operation status.

Failed operations remain inspectable and retryable.

Conflict handling must be domain-specific; financial data must never silently use last-write-wins.

The queue must survive app/browser restart.

A sync event must be auditable without storing unnecessary sensitive payloads.

Sync metrics must include queue depth, age, success rate, retry count and conflict count.

# 12. Financial Domain Rules

Finance is a protected domain. UI state, offline state and provider callbacks are never treated as authoritative without server validation.

Invoice numbers/receipts must be generated server-side.

Payment gateway webhooks must be authenticated/validated and idempotent.

Payment status must transition only through allowed state transitions.

Refunds require authorization and server connectivity.

Offline cash entries are explicitly marked pending sync until accepted by the server.

No client can directly set a payment to 'successful'.

Financial audit events are append-oriented and retained according to the product retention policy.

Reconciliation reports must identify gateway transactions that do not match internal payments.

# 13. Multi-Tenant Security Architecture

Tenant context is derived from authenticated identity and authorization, never trusted from a request body.

Every repository/service query must enforce tenant scope.

Branch scope must be enforced where the role is branch-limited.

Cross-tenant access tests are mandatory in automated integration tests.

Background jobs must carry tenant context and must re-authorize before sensitive work.

Object-storage URLs must be scoped, short-lived or otherwise access controlled.

Support 'login as user' must require explicit authorization, visible session banner and audit logging.

Secrets must never be stored in source control or client-side bundles.

# 14. API & Engineering Contract

| Area | Standard |
| --- | --- |
| API | REST-first modular domain APIs; version when breaking contracts |
| Validation | DTO/schema validation at API boundary |
| Errors | Stable machine-readable error code + human-safe message |
| Pagination | Cursor/keyset for high-volume resources; page pagination only where appropriate |
| Idempotency | Required for financial writes and offline mutations |
| Transactions | Database transactions for multi-record invariants |
| Authorization | Service/API-level, not UI-only |
| Audit | Actor + tenant + object + action + timestamp + relevant metadata |
| Async | Queue non-critical long-running work |
| API docs | OpenAPI/Swagger maintained with implementation |

# 15. Database & Data Architecture Rules

PostgreSQL is the authoritative transactional store.

Use migrations; never make production schema changes manually without a migration record.

Index based on actual access patterns, especially tenantId, branchId, studentId, batchId and session date.

Unique constraints must encode business invariants where possible.

Use foreign keys for critical relationships.

Use timestamps consistently in UTC at the storage layer and localize in the UI.

Use soft-delete/archive only where business history requires it; do not blindly soft-delete everything.

Large tables such as Attendance must be designed for high write volume and historical reporting.

Analytical summaries should be maintained separately from raw transactional records.

# 16. Non-Functional Requirements

| Dimension | Target / rule |
| --- | --- |
| Availability | Target 99.9% for production core services once commercially required |
| API latency | Common authenticated reads should normally remain <500ms at p95 under expected load |
| Critical writes | Financial/attendance writes must prioritize correctness over latency |
| Offline recovery | Queued operations must resume after reconnect/app restart |
| Security | OWASP-aligned secure development practices |
| Backups | Automated database backups; restore testing required |
| Observability | Errors, latency, DB health, queue health, sync health and infrastructure usage |
| Scalability | Stateless API; horizontally scalable workers and application instances |
| Accessibility | Keyboard and screen-reader friendly core web flows where practical |
| Mobile | Teacher/parent critical flows optimized for phone screens |

# 17. Reliability, Backup & Disaster Recovery

| Control | Requirement |
| --- | --- |
| RPO | Define target before production SLA; initial planning target ≤24h, improve as business maturity increases |
| RTO | Define target before production SLA; initial planning target ≤8h, improve for paid higher tiers |
| Database backups | Automated and monitored |
| Restore test | Periodic restore verification, not merely backup existence |
| Object storage | Versioning/retention where business-critical |
| Incident logs | Centralized and retained |
| Failure mode | Degraded functionality must be preferable to corrupting data |

# 18. Observability & Operations

Application error tracking with release/version correlation.

Structured logs with tenant-safe identifiers and no sensitive secrets.

Metrics for request rate, error rate, latency, DB saturation, queue depth and worker failures.

Offline sync metrics: pending operations, failure rate, conflict rate and operation age.

Payment metrics: webhook failures, unmatched payments and reconciliation exceptions.

Operational alerts must be actionable and routed to an owned support channel.

Every production deployment must have a rollback strategy.

# 19. Academy Onboarding & Time-to-Value

The first academy should reach its first meaningful operational outcome quickly.

| Milestone | Target experience |
| --- | --- |
| Signup | Owner understands what AcademyBee does immediately |
| Onboarding | Academy profile + course + first batch can be configured without consultant help |
| First student | Student can be registered and assigned to a batch quickly |
| First class | Teacher can see today's class and mark attendance |
| First fee | Invoice/payment/receipt workflow is understandable |
| First parent | Parent receives a useful notification or portal access |
| First insight | Owner sees attendance and fee status on dashboard |

# 20. Pricing & Packaging Principles

Use feature flags and entitlement checks rather than branching product code per plan.

Plan limits should be explicit: students, staff, branches, communications, storage and advanced features as applicable.

Never block critical data access without a defined grace period and export/communication path.

Trial conversion should be measurable.

Upgrade/downgrade must preserve historical data.

Subscription billing must be separate from academy operational finance.

# 21. Reporting & Analytics Architecture

Operational screens query transactional data with proper indexes.

Dashboards use summary tables/materialized aggregates where raw scans become expensive.

Large exports run asynchronously and notify the user when ready.

Every report must define timezone, date range and data scope.

Metrics definitions must be centrally documented to avoid different screens showing different numbers.

# 22. AI & Automation Guardrails

AI is an assistive layer, not the system of record.

AI-generated messages require user-visible review where the communication could materially affect a parent/student.

AI must not invent attendance, payment, assessment or student facts.

Sensitive data sent to AI providers must follow the approved data-processing policy.

AI features must have measurable business value before entering production.

# 23. QA & Test Strategy

| Test layer | Mandatory coverage |
| --- | --- |
| Unit | Domain rules, state transitions, calculations |
| Integration | DB transactions, tenant isolation, permissions, payments |
| API | Validation, auth, pagination, idempotency, error contracts |
| E2E | Critical owner/teacher/parent journeys |
| Offline | Offline create, restart, reconnect, retry, conflict |
| Security | Cross-tenant, privilege escalation, file access, webhook abuse |
| Performance | Attendance writes, dashboards, high-volume lists, exports |
| Regression | Release-critical workflows |

# 24. Release Gates

A phase cannot be marked DONE merely because the UI works.

Requirements approved.

User journey approved.

UI/UX approved.

Database schema and migrations complete.

API and authorization complete.

Frontend complete with loading/empty/error states.

Mobile behavior verified.

Offline behavior verified where applicable.

Automated tests pass.

Security/tenant isolation tests pass.

Observability and audit requirements complete.

Production deployment verified.

Rollback path verified.

Real academy pilot feedback reviewed.

Product Owner acceptance recorded.

# 25. Pilot & Validation Strategy

Before broad commercialization, AcademyBee should be operated with a small set of real academies representing different workflows, for example one tuition centre and one activity academy. The objective is not to prove that every feature exists; it is to prove that daily operations are easier, faster and more reliable.

Measure onboarding completion.

Measure daily attendance completion.

Measure fee collection workflow completion.

Measure teacher adoption.

Measure parent engagement.

Capture offline failures and sync conflicts.

Record support requests by category.

Do not expand feature scope solely because a pilot requests a feature; identify the underlying problem first.

# 26. Scale & Infrastructure Baseline

The v2.1 scalability section remains part of this final baseline. The target architecture is Next.js/PWA + stateless NestJS + PostgreSQL + Redis/BullMQ + object storage + observability, with progressive scaling from approximately ₹5K–₹20K/month at very early scale to roughly ₹50K–₹1.25L+/month for a healthy 50K–100K student deployment, excluding variable messaging, payment and development costs. These are planning ranges, not guarantees or vendor quotes.

The platform must not pre-purchase 100K-scale infrastructure. Capacity should increase when measured metrics demonstrate the need.

# 27. Product Analytics & North-Star Metrics

| Category | Metrics |
| --- | --- |
| Acquisition | Academy signups, trial starts, source |
| Activation | Academy setup completion, first batch, first student, first attendance, first payment |
| Engagement | Weekly active academies, active teachers, parent engagement |
| Operations | Attendance completion, sync success, session completion |
| Finance | Collection rate, overdue amount, successful payments, reconciliation exceptions |
| Retention | Academy retention, student retention, batch continuity |
| SaaS | MRR, ARR, ARPA, trial conversion, churn |
| Reliability | API error rate, p95 latency, queue age, sync failure/conflict rate |

# 28. Security & Privacy Operating Principles

Collect only data needed for product operation.

Separate authentication identity from profile/business data where practical.

Encrypt data in transit; protect sensitive data at rest using platform capabilities.

Apply least privilege to staff roles.

Provide auditability for privileged actions.

Define retention/deletion policies before production launch.

Provide a controlled data export process for academies.

Define a tenant offboarding process that prevents accidental immediate destructive deletion.

# 29. Future Architecture Evolution

AcademyBee starts as a modular monolith. Candidate extraction boundaries, only when justified by scale or team ownership, are: Notifications, Payments, Reporting/Analytics, Search and AI/Automation. Extraction must be driven by measured bottlenecks, deployment independence or organizational ownership—not architectural fashion.

# 30. Final Product Roadmap

| Release | Primary objective | Scope |
| --- | --- | --- |
| Foundation | Build trustworthy platform core | Auth, tenancy, RBAC, DB, API, PWA, Dexie, sync, CI/CD |
| MVP | Run a real academy | Super Admin, academy operations, students, batches, attendance, fees, portals |
| Growth | Acquire and retain | CRM, trials, communication, WhatsApp, learning, richer reports |
| Scale | Serve larger academy groups | Multi-branch, expenses, advanced billing, analytics, operational controls |
| Intelligence | Automate decisions and work | AI insights, follow-up assistant, message generation, automation |

# 31. Final Product Owner Decisions

Build one role/module to DONE before opening the next major role/module.

The first operational wedge is attendance + fees + parent communication.

Offline attendance is a differentiator, not a reason to make every feature offline.

Financial correctness always overrides offline convenience.

Tenant isolation is a release blocker, not a backlog item.

The server is the source of truth.

Use a modular monolith until measured evidence supports service extraction.

Build for 100K architecturally; spend for today's workload.

Do not add AI before the underlying workflow is reliable.

Do not add features without a clear user problem, measurable outcome and owner.

Every phase must have acceptance criteria and production verification.

Real academy usage is the final validation layer.

# 32. Immediate Build Order — FINAL

| Order | Workstream | Exit condition |
| --- | --- | --- |
| 1 | Foundation | Auth + tenancy + RBAC + DB + API + PWA + Dexie + CI/CD |
| 2 | Super Admin | Academy/user/platform administration works end-to-end |
| 3 | Academy Owner/Admin | Academy can be configured and operated |
| 4 | Students / Parents / Teachers | Core people and relationships work |
| 5 | Courses / Batches / Timetable | Teacher has a reliable daily schedule |
| 6 | Attendance | Online + offline attendance + sync is production-safe |
| 7 | Fees / Payments | Invoice → payment → receipt is authoritative |
| 8 | Teacher Portal | Teacher can run daily operations from phone |
| 9 | Parent Portal | Parent can see useful child information and money status |
| 10 | Learning | Homework + assessments + progress |
| 11 | CRM / Admissions | Lead → trial → admission is measurable |
| 12 | Communication | Automated multi-channel communication |
| 13 | Reports / Analytics | Owner sees operational and financial health |
| 14 | Scale / Multi-branch / Expenses | Larger academy operations |
| 15 | AI | Only after data quality and core workflows are proven |

# 33. Final Definition of DONE

A feature is DONE only when it is usable, secure, testable, observable, mobile-ready, permission-correct, production-deployed and accepted by the Product Owner. For offline features, sync, retry, conflict and restart behavior are part of DONE—not optional enhancements.

# 34. Final Vision

**RUN  +  GROW  +  LEARN  +  MONEY  +  COMMUNICATION  +  INTELLIGENCE**

AcademyBee should feel simple to a small academy, powerful to a growing academy, and reliable enough for a multi-branch academy group.

# V3.1 Addendum — Academy Provisioning & Tenant Domain Architecture

Status: Approved baseline extension to PRD v3.0. This addendum makes academy-specific URL provisioning and tenant resolution explicit, rather than leaving them implicit within the multi-tenant architecture.

## A. Product Requirement

Every AcademyBee academy is a first-class tenant with a unique AcademyBee subdomain. When a Super Admin creates an academy, the platform provisions a unique tenant identity and URL such as:

academybee.com — public/platform entry point

gurushethra.academybee.com — Gurushethra tenant

abcacademy.academybee.com — ABC Academy tenant

xyzacademy.academybee.com — XYZ Academy tenant

The academy URL must resolve directly to that academy's branded workspace and configuration without requiring the user to select an academy after the tenant has been resolved.

## B. Academy Provisioning Flow

Super Admin → Create Academy → validate unique slug → create tenant → provision academy subdomain identity → create owner/invitation → apply plan/entitlements → launch guided onboarding.

Academy name, academy type, owner details and plan are captured during provisioning.

The system generates or validates a human-readable unique slug/subdomain.

Reserved words and unsafe/invalid subdomains must be rejected.

Academy creation must be idempotent and auditable.

The generated URL is displayed immediately after successful creation with actions to open/copy it.

An academy may remain in a setup/pending state until required onboarding steps are completed.

Suspended academies must resolve to a controlled suspension/tenant-status experience rather than exposing operational data.

## C. Tenant Resolution & Security Contract

The request hostname is used to resolve the candidate tenant, but hostname/subdomain is not an authorization mechanism by itself.

Hostname/subdomain → academy lookup → authenticated user → authorization scope.

The authenticated tenant context must be established server-side for every protected request.

The frontend must never be trusted to provide or override tenantId.

Every tenant-owned query, command, job and storage operation must enforce tenant isolation.

Cross-tenant access attempts must be rejected and logged.

Tenant resolution must work consistently for web requests, API requests, background jobs and generated links.

Platform/Super Admin cross-tenant access must be explicit, permission-controlled and audited.

## D. Academy Tenant Configuration

Each tenant must have an academy configuration record covering at minimum:

Academy identity: name, slug, academy type and status.

Branding: logo, favicon, primary/secondary brand settings and supported theme configuration.

Contact: phone, email, WhatsApp, address and operating details.

Localization: timezone, locale and currency.

Operational defaults: academic/class settings, notification defaults and payment configuration.

Subscription/entitlements: plan, limits, feature flags, trial/grace status and billing state.

Public profile settings where an academy chooses to expose a public-facing academy page.

## E. Data Model Additions

The Academy/Tenant entity must support at least:

id — immutable tenant identifier.

name — academy display name.

slug — unique normalized tenant slug.

subdomain — unique AcademyBee subdomain identity.

status — setup, active, suspended, archived or equivalent controlled states.

logoUrl / faviconUrl and branding configuration.

academyType and contact/localization settings.

plan/subscription linkage and entitlement configuration.

createdAt, updatedAt and audit metadata.

All tenant-owned entities continue to carry tenantId; branch-scoped entities additionally carry branchId.

## F. Wildcard Domain Infrastructure

Production deployment must support wildcard routing for the AcademyBee tenant namespace (for example, *.academybee.com). The application layer must resolve the hostname and map it to the tenant configuration.

Wildcard DNS/TLS strategy must be defined before production launch.

Unknown subdomains must resolve to a controlled not-found/academy-unavailable experience.

Subdomain changes must be controlled, validated and audited because URLs may be externally shared.

Changing a slug/subdomain must not change the immutable academy ID.

Redirect/deprecation strategy should be available when a tenant URL is changed.

## G. Future Custom Domains

The architecture must allow an academy to connect a verified custom domain later without changing the tenant model. Example: academy.example.com or www.gurushethra.com → same AcademyBee tenant.

Custom domains map to the immutable academy ID.

Domain ownership/verification is required before activation.

A tenant may have one primary AcademyBee subdomain and optional verified custom domains.

Branding and tenant data remain identical regardless of the approved domain used.

## H. Academy Onboarding Requirements

The first visit to a newly provisioned tenant must enter a guided onboarding experience:

Welcome and academy identity.

Academy type.

First course.

First batch.

First teacher.

First students.

First timetable/class.

Payment/fee setup where applicable.

Ready/first-class completion state.

Onboarding progress must be tenant-specific, resumable and safe to abandon and continue later.

## I. Required Platform Screens

Super Admin — Create Academy.

Super Admin — Academy Provisioning Success.

Super Admin — Academy Detail with domain/subdomain status.

Super Admin — Domain Management.

Academy — First Visit / Welcome.

Academy — Guided Onboarding.

Academy — Academy Branding & Domain Settings.

Tenant Unavailable / Suspended / Unknown Subdomain states.

## J. Acceptance Criteria

Creating an academy produces a unique, valid AcademyBee subdomain.

Opening the subdomain loads only that academy's tenant experience.

A tenant cannot access another tenant by manipulating a tenantId in the client or API request.

Academy branding/configuration is loaded from tenant configuration.

Suspended/unknown tenants receive controlled status pages.

Owner onboarding is resumable and tenant-specific.

Super Admin domain actions are permission-controlled and audited.

The design supports future verified custom domains without changing core tenant ownership.

This addendum is part of the AcademyBee product and engineering source of truth. Any implementation that provisions tenants without these domain, resolution, isolation and onboarding rules is incomplete.

AcademyBee FINAL PRD v3.0 • Product Owner + Principal Consultant Edition • September 2026
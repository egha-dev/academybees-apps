# Changelog

## 0.1.0 (2026-10-11)


### Features

* **api:** @Can capabilities, scope policies, cross-tenant session checks ([#36](https://github.com/egha-dev/academybees-apps/issues/36)) ([c90d2eb](https://github.com/egha-dev/academybees-apps/commit/c90d2eb660fa80e4c7784e12c9a04015c83d5aa4))
* **api:** core API pipeline with errors, idempotency, audit, outbox and flags (S5) ([#8](https://github.com/egha-dev/academybees-apps/issues/8)) ([a6d008b](https://github.com/egha-dev/academybees-apps/commit/a6d008bc41870236a6f3bcaa6a7c395a8da2c415))
* **api:** resolve the academy from the request host; cross-tenant suite ([#24](https://github.com/egha-dev/academybees-apps/issues/24)) ([9ab75fc](https://github.com/egha-dev/academybees-apps/commit/9ab75fcad951b50a623eafb0373a50fc47781680))
* **api:** sign-in, refresh rotation, sign-out, AuthGuard and rate limits ([#35](https://github.com/egha-dev/academybees-apps/issues/35)) ([e7e5f15](https://github.com/egha-dev/academybees-apps/commit/e7e5f150cf0a9a91a3875299c668f1d044158815))
* **auth:** packages/auth, session keys and secrets config, demo passwords ([#34](https://github.com/egha-dev/academybees-apps/issues/34)) ([4b1ee2e](https://github.com/egha-dev/academybees-apps/commit/4b1ee2e9e81aafa7c3b1a558b78776d890c45834))
* **contracts:** shared Zod contracts for errors, pagination, permissions, sync, analytics (S3) ([#6](https://github.com/egha-dev/academybees-apps/issues/6)) ([eadda65](https://github.com/egha-dev/academybees-apps/commit/eadda65e5312c21d344a0a954403d07f45371aeb))
* **database:** schema, roles/grants, seed guard and Testcontainers helpers (S4) ([#7](https://github.com/egha-dev/academybees-apps/issues/7)) ([27913b9](https://github.com/egha-dev/academybees-apps/commit/27913b9e8412aeebb4a2267c0ca4806c4beb00b9))
* **database:** tenant tables, forced RLS on every tenant table, demo academy seeds ([#22](https://github.com/egha-dev/academybees-apps/issues/22)) ([b1f7c12](https://github.com/egha-dev/academybees-apps/commit/b1f7c124ab20bea395180baa99fd4ac23f3d3de9))
* **database:** tenant-bound Prisma client, isolation matrix and RLS benchmark ([#23](https://github.com/egha-dev/academybees-apps/issues/23)) ([70171f3](https://github.com/egha-dev/academybees-apps/commit/70171f3f99521e661d11624bbb8630535a171a96))
* **i18n:** en-IN catalogues, Intl formatters, Unicode names and analytics port (S7) ([#10](https://github.com/egha-dev/academybees-apps/issues/10)) ([21f0b97](https://github.com/egha-dev/academybees-apps/commit/21f0b977f8ca4ea300ce57c87dfd100e1141656c))
* **infra:** Docker images, staging/production deploy workflows and Sentry (S12) ([#15](https://github.com/egha-dev/academybees-apps/issues/15)) ([1868d57](https://github.com/egha-dev/academybees-apps/commit/1868d57ad3ffe4146889e4e4c835b8cb1ad2c427))
* **infra:** local infrastructure stack and database roles (S2) ([#4](https://github.com/egha-dev/academybees-apps/issues/4)) ([8bde4b3](https://github.com/egha-dev/academybees-apps/commit/8bde4b33ae45058c956e5bc31bcfd04106a5d6c1))
* **marketing:** academybees.com static site for Cloudflare Pages ([#42](https://github.com/egha-dev/academybees-apps/issues/42)) ([6c51a5f](https://github.com/egha-dev/academybees-apps/commit/6c51a5f44cb72cc96508fd19cc4016a9b07e57be))
* **p2:** academy sign-in, password reset and invite accept screens ([#38](https://github.com/egha-dev/academybees-apps/issues/38)) ([004471c](https://github.com/egha-dev/academybees-apps/commit/004471c0580c56a802e6694b71d011ab98b382f2))
* **p2:** account security — 2FA on every host, Security page, devices & sessions (S9) ([#50](https://github.com/egha-dev/academybees-apps/issues/50)) ([42dab31](https://github.com/egha-dev/academybees-apps/commit/42dab315409c49a65521e39bfe1b06957b46567b))
* **p2:** family hub and console sessions with mandatory TOTP ([#41](https://github.com/egha-dev/academybees-apps/issues/41)) ([32d2e89](https://github.com/egha-dev/academybees-apps/commit/32d2e899f6c2c58acf4e283a1ce730430cad7b61))
* **p2:** identity schema with user-bound RLS, role templates, demo users; Phase 2 start ([#33](https://github.com/egha-dev/academybees-apps/issues/33)) ([ed96d7b](https://github.com/egha-dev/academybees-apps/commit/ed96d7b6636f760fe419f39765072c488b8cc15e))
* **p2:** signed-in academy shell, navigation and Team page ([#40](https://github.com/egha-dev/academybees-apps/issues/40)) ([edc83eb](https://github.com/egha-dev/academybees-apps/commit/edc83eb38a8618a999f9129ae57b721cb608a930))
* **p2:** staging bootstrap — gate academies, users per role, console admin ([#46](https://github.com/egha-dev/academybees-apps/issues/46)) ([e2555b3](https://github.com/egha-dev/academybees-apps/commit/e2555b373f541485bd40b5d842f82b2a9939ba3f))
* **p2:** staging deploys from GitHub (Wait for CI), migrations as the last CI job ([#44](https://github.com/egha-dev/academybees-apps/issues/44)) ([b5b24dd](https://github.com/egha-dev/academybees-apps/commit/b5b24dd06150b4cf604d64060704339c7333ca49))
* **p2:** staging on Railway — web image, railway up deploys, managed roles ([#43](https://github.com/egha-dev/academybees-apps/issues/43)) ([7aa143f](https://github.com/egha-dev/academybees-apps/commit/7aa143f807c1e06df9a6ea20c13796475de3e7d2))
* **p2:** transactional email, staff invitations, password reset and team API ([#37](https://github.com/egha-dev/academybees-apps/issues/37)) ([db4357f](https://github.com/egha-dev/academybees-apps/commit/db4357f0cc2f6d9ab816d2f802a61a35c12a0205))
* **p3:** media storage, academy settings and branding (S6) ([#62](https://github.com/egha-dev/academybees-apps/issues/62)) ([50c0d10](https://github.com/egha-dev/academybees-apps/commit/50c0d107c5362f424100a3fa0c098969ed84e203))
* **p3:** onboarding API, setup routing, R2 decision (S5) ([#61](https://github.com/egha-dev/academybees-apps/issues/61)) ([354fc7c](https://github.com/egha-dev/academybees-apps/commit/354fc7c46c5ec26a24861728911ee30f74ac7c91))
* **p3:** onboarding screens (S7) ([#63](https://github.com/egha-dev/academybees-apps/issues/63)) ([b91b254](https://github.com/egha-dev/academybees-apps/commit/b91b25453f52a1d2d0376992063b16a51f27805e))
* **p3:** people and scheduling schema (S2) ([#58](https://github.com/egha-dev/academybees-apps/issues/58)) ([de720f6](https://github.com/egha-dev/academybees-apps/commit/de720f648edab8b797e8ae950a44cf87606d0e7b))
* **p3:** plans, entitlements, legal acceptance (S1) ([#57](https://github.com/egha-dev/academybees-apps/issues/57)) ([bd6504d](https://github.com/egha-dev/academybees-apps/commit/bd6504d86c6e053327859610cde883223f21585a))
* **p3:** provisioning and console academy API (S3) ([#59](https://github.com/egha-dev/academybees-apps/issues/59)) ([2a0d1df](https://github.com/egha-dev/academybees-apps/commit/2a0d1df2dca84c2411bf720e31d62cfd4bd8dca7))
* **p3:** provisioning console screens (S4) ([#60](https://github.com/egha-dev/academybees-apps/issues/60)) ([8ff2261](https://github.com/egha-dev/academybees-apps/commit/8ff22613bb0a7dbfb90158a9a47e723b47501fd0))
* **p4:** import students from spreadsheets, private media, student photos (S5) ([#71](https://github.com/egha-dev/academybees-apps/issues/71)) ([27f4f95](https://github.com/egha-dev/academybees-apps/commit/27f4f9584f66588ee907ab3dd4c86725601de1b4))
* **p4:** parent invites, privacy notice, Join QR poster and join requests (S6) ([#72](https://github.com/egha-dev/academybees-apps/issues/72)) ([ecf1d71](https://github.com/egha-dev/academybees-apps/commit/ecf1d71a559864fffc4496183cf9fefeab21af86))
* **p4:** Phase 4 exit journey, flag removal, photo metadata stripping (S7) ([#73](https://github.com/egha-dev/academybees-apps/issues/73)) ([91dc9e1](https://github.com/egha-dev/academybees-apps/commit/91dc9e1922c7f0afb8e7ef6bf021bea3ed44e604))
* **p4:** Students list, Student 360, parents, custom fields UI (S3) ([#69](https://github.com/egha-dev/academybees-apps/issues/69)) ([8d34267](https://github.com/egha-dev/academybees-apps/commit/8d34267d735f0298043f023170cb3afc86ae8074))
* **p4:** students, parents, health notes, consent, custom fields API (S2) ([#68](https://github.com/egha-dev/academybees-apps/issues/68)) ([42eccc7](https://github.com/egha-dev/academybees-apps/commit/42eccc7dd84775c626ae124f7cac9c25eeccdbc1))
* **p4:** Teachers workspace, scope-aware search, command palette (S4) ([#70](https://github.com/egha-dev/academybees-apps/issues/70)) ([f1faf27](https://github.com/egha-dev/academybees-apps/commit/f1faf2774fd6f7cd930469a5a0fc98c2f67fd518))
* **sync:** Dexie sync queue, backoff, connectivity, Web Lock runner and hooks (S10) ([#13](https://github.com/egha-dev/academybees-apps/issues/13)) ([770c452](https://github.com/egha-dev/academybees-apps/commit/770c4522700d390df610afb53cee5f1a8137cb4b))
* **tenant:** Phase 1 start — shared host classifier, slug rules, decisions C-51…C-54 ([#21](https://github.com/egha-dev/academybees-apps/issues/21)) ([4ba00d9](https://github.com/egha-dev/academybees-apps/commit/4ba00d94f7e920d3c64ea2206fa84498ad06ad07))
* **ui:** design tokens, themed components and React lint profile (S8) ([#11](https://github.com/egha-dev/academybees-apps/issues/11)) ([32aca21](https://github.com/egha-dev/academybees-apps/commit/32aca21b08e2faee76b0f154e352b29e20ccb03b))
* **ui:** light and dark themes with Light/Dark/System toggle (C-49) ([#18](https://github.com/egha-dev/academybees-apps/issues/18)) ([cc2c1a9](https://github.com/egha-dev/academybees-apps/commit/cc2c1a92a441ac486703ecee83f319b9d2587f60))
* **web:** academy branding, per-academy manifest, Family Hub placeholder, tenant E2E ([#26](https://github.com/egha-dev/academybees-apps/issues/26)) ([472075f](https://github.com/egha-dev/academybees-apps/commit/472075fcea2d100b657c27547ddf3d8935c43faf))
* **web:** host routing and designed academy status pages ([#25](https://github.com/egha-dev/academybees-apps/issues/25)) ([40ae8f7](https://github.com/egha-dev/academybees-apps/commit/40ae8f7a2f8f25e6022224659eb51c566697ddf4))
* **web:** Next.js shell with PWA, error pages, design system and flag probe (S9) ([#12](https://github.com/egha-dev/academybees-apps/issues/12)) ([8a9e369](https://github.com/egha-dev/academybees-apps/commit/8a9e369c3a60eb666e9733d4f362545adaca9efa))
* **worker:** BullMQ worker with heartbeat and exactly-once outbox relay (S6) ([#9](https://github.com/egha-dev/academybees-apps/issues/9)) ([9962cef](https://github.com/egha-dev/academybees-apps/commit/9962cef8624fd4239f77ad92e82177d28e3bc59e))


### Bug fixes

* **api:** keep the idempotency key locked when storing the response fails ([#19](https://github.com/egha-dev/academybees-apps/issues/19)) ([b3587bb](https://github.com/egha-dev/academybees-apps/commit/b3587bb5cd1aa5b0168523b2692af0798aab659e))
* **p0:** make pnpm dev and db:seed work from a clean clone (P0-3) ([#17](https://github.com/egha-dev/academybees-apps/issues/17)) ([9afcd86](https://github.com/egha-dev/academybees-apps/commit/9afcd8633d3bb0937b7337bba8299c0bcfa5b1ee))
* **p1:** review L3, L4, L5, L8, L9 (routes, colours, RLS coverage, audit rows, spoof tests) ([#31](https://github.com/egha-dev/academybees-apps/issues/31)) ([cade406](https://github.com/egha-dev/academybees-apps/commit/cade406890d6dd80d221eb1b032c4798a1ac7e5e))
* **p1:** review M1–M3 (client IP, tenant grants, junk hosts); C-55 accepted ([#30](https://github.com/egha-dev/academybees-apps/issues/30)) ([9f481f7](https://github.com/egha-dev/academybees-apps/commit/9f481f72621025caf97454b2748935dfc61ec2fd))
* **p2:** bootstrap transactions allow 60 s for the remote staging database ([#47](https://github.com/egha-dev/academybees-apps/issues/47)) ([cc4e555](https://github.com/egha-dev/academybees-apps/commit/cc4e5558515c0e50215d931196820e349543e832))
* **p2:** idempotency lease + fencing, log safety, remaining E2E (S10) ([#52](https://github.com/egha-dev/academybees-apps/issues/52)) ([c31426a](https://github.com/egha-dev/academybees-apps/commit/c31426a1a08a405be9201a4eed8493f8967a7077))
* **p2:** review fixes 1 — link tokens out of URLs, real sign-out, atomic refresh ([#54](https://github.com/egha-dev/academybees-apps/issues/54)) ([7af2d58](https://github.com/egha-dev/academybees-apps/commit/7af2d58d27794df773a6a4f5ab999bd1ed959a4d))
* **p2:** review fixes 2 — read-only claims release, inviter re-check, 2FA signs out others ([#55](https://github.com/egha-dev/academybees-apps/issues/55)) ([7a9360a](https://github.com/egha-dev/academybees-apps/commit/7a9360aae10debf8311b077f2bb450079a35a0b1))
* **p2:** say how long to wait after too many sign-in attempts (gate) ([#53](https://github.com/egha-dev/academybees-apps/issues/53)) ([024498f](https://github.com/egha-dev/academybees-apps/commit/024498f16687717187347516dffd1b66244e1749))
* **p2:** staging deploys with railway up (environment-scoped token) — staging live ([#45](https://github.com/egha-dev/academybees-apps/issues/45)) ([64f580b](https://github.com/egha-dev/academybees-apps/commit/64f580b44a50691bc7c7c35411f3477cf2c2bc52))
* **p2:** worker sends email over Resend's HTTPS API (Railway blocks SMTP on Hobby) ([#48](https://github.com/egha-dev/academybees-apps/issues/48)) ([82de9ef](https://github.com/egha-dev/academybees-apps/commit/82de9ef8c61c662dc2a07c38aacda26658eaea0b))
* **p3:** review fixes — setup redirect loop, timezone, revoke failed invites ([#65](https://github.com/egha-dev/academybees-apps/issues/65)) ([dc41f94](https://github.com/egha-dev/academybees-apps/commit/dc41f947836bd98ac4dd7c0e6d7caa6b970f55a6))
* use the product domain academybees.com everywhere (C-57) ([#28](https://github.com/egha-dev/academybees-apps/issues/28)) ([0874e63](https://github.com/egha-dev/academybees-apps/commit/0874e637e2837a0ad150f1ad5042d4eda79c426f))


### Performance

* **p4:** shell diet, health/import capabilities, Phase 4 plan (S1) ([#67](https://github.com/egha-dev/academybees-apps/issues/67)) ([acb402f](https://github.com/egha-dev/academybees-apps/commit/acb402fe98470b1e934d3700c09945f4416cfbdb))

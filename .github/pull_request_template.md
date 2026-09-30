## Summary
<!-- Phase · slice · what changed and why. Link the plan task(s) and PRD/UX refs (e.g. PRD v3 §12, UX v1.1 §7). -->

## Decisions
<!-- New or changed C-/ADR/OD entries in docs/DECISIONS.md, or "none". -->

## Release flags
<!-- Flags added/changed (key, default per environment, owner, removal phase), or "none". -->

## Definition of Done (CLAUDE.md §13)
Tick what applies; write N/A with a reason for the rest.
- [ ] Database + migration + RLS
- [ ] API + validation + authorization (capability & scope)
- [ ] Tenant isolation test added to the cross-tenant suite for every new tenant-scoped endpoint
- [ ] Idempotency / audit where required
- [ ] Product analytics events (no PII)
- [ ] UI strings externalised (`packages/i18n`), money/dates via Intl helpers, logical CSS
- [ ] UI matches UX spec with loading / empty / error / permission / success (+ offline) states
- [ ] Responsive (phone-first where the flow is) and accessibility considered
- [ ] Unit + integration + E2E tests
- [ ] Offline features: local schema, sync op schema, retry, ack, conflict, offline UI, restart recovery, network-interruption tests
- [ ] `pnpm lint`, `typecheck`, `test`, `build` green
- [ ] Docs updated (plan status, ARCHITECTURE if changed, DECISIONS for any decision)

## How to verify
<!-- Commands, URLs, demo logins. -->

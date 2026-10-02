import { type CrossTenantRoute } from '@academybee/testing';

/**
 * Every API route that resolves an academy (host policy `tenant` or `any`). Add new
 * tenant-scoped endpoints here in the same PR (CLAUDE.md §5) — `cross-tenant.int.spec.ts` fails
 * for any route missing from this list.
 */
export const CROSS_TENANT_ROUTES: CrossTenantRoute[] = [
  { method: 'GET', path: '/api/v1/tenant/context' },
  { method: 'GET', path: '/api/v1/flags' },
  // Auth (Phase 2). The sign-in body is filled with academy A's fixture user by the suite.
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/refresh', session: true },
  { method: 'POST', path: '/api/v1/auth/logout', session: true, body: {} },
  { method: 'GET', path: '/api/v1/auth/me', session: true },
  // Test-only signed-in routes guarded by @Can + a scope policy (shape of domain endpoints).
  {
    method: 'GET',
    path: '/api/v1/test/secure/settings',
    session: true,
    capability: 'academy.settings.manage',
  },
  {
    method: 'POST',
    path: '/api/v1/test/secure/settings',
    session: true,
    capability: 'academy.settings.manage',
    body: {},
  },
  { method: 'GET', path: '/api/v1/test/secure/members', session: true, capability: 'team.read' },
  {
    method: 'GET',
    path: '/api/v1/test/secure/members/:id',
    session: true,
    capability: 'team.read',
  },
  // Test-only academy routes (the shape of every domain endpoint from Phase 2).
  { method: 'GET', path: '/api/v1/test/academy/probe' },
  { method: 'POST', path: '/api/v1/test/academy/probe', body: { note: 'x' } },
  { method: 'GET', path: '/api/v1/test/academy/any-status' },
];

/** Test-harness helpers that are not academy routes (error/validation/idempotency fixtures). */
export const NOT_TENANT_ROUTES = new Set([
  'POST /api/v1/test/echo',
  'GET /api/v1/test/request-context',
  'GET /api/v1/test/domain-error',
  'GET /api/v1/test/crash',
  'POST /api/v1/test/unique',
  'POST /api/v1/test/payments',
  'POST /api/v1/test/failing-payments',
]);

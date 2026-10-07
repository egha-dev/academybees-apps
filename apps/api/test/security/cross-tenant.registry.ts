import { type CrossTenantRoute, FIXTURE_PASSWORD } from '@academybee/testing';

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
  // Password recovery (C-67): uniform 202; the reset link is single-use.
  { method: 'POST', path: '/api/v1/auth/password/forgot', body: { email: 'nobody@example.test' } },
  {
    method: 'POST',
    path: '/api/v1/auth/password/reset',
    body: { token: 'x'.repeat(43), password: 'Another#Pass2026' },
    spoof: { skip: 'team.int.spec.ts › password reset' },
  },
  // Sign-in second factor (C-66, C-80): public, the single-use MFA token is the credential and is
  // bound to the academy it was issued in.
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/enrol/start',
    body: { token: 'x'.repeat(43) },
    spoof: { skip: 'account-security.int.spec.ts › mfa token' },
  },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/enrol/confirm',
    body: { token: 'x'.repeat(43), code: '123456' },
    spoof: { skip: 'account-security.int.spec.ts › mfa token' },
  },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/verify',
    body: { token: 'x'.repeat(43), code: '123456' },
    spoof: { skip: 'account-security.int.spec.ts › mfa token' },
  },
  // Account security (G-11, C-80): the caller's own account; sessions of this academy only.
  { method: 'GET', path: '/api/v1/auth/security', session: true },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/setup/start',
    session: true,
    body: { password: FIXTURE_PASSWORD },
    spoof: 'status',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/setup/confirm',
    session: true,
    body: { code: '123456' },
    spoof: { skip: 'account-security.int.spec.ts › set up 2FA' },
  },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/recovery-codes',
    session: true,
    body: { password: 'x' },
    spoof: { skip: 'account-security.int.spec.ts › recovery codes' },
  },
  {
    method: 'POST',
    path: '/api/v1/auth/mfa/disable',
    session: true,
    body: { password: 'x' },
    spoof: { skip: 'account-security.int.spec.ts › turn 2FA off' },
  },
  {
    method: 'POST',
    path: '/api/v1/auth/password/change',
    session: true,
    body: { currentPassword: 'x', newPassword: 'Another#Pass2026' },
    spoof: { skip: 'account-security.int.spec.ts › change password' },
  },
  { method: 'GET', path: '/api/v1/auth/sessions', session: true, spoof: 'status' },
  { method: 'POST', path: '/api/v1/auth/sessions/revoke-others', session: true, spoof: 'status' },
  {
    method: 'POST',
    path: '/api/v1/auth/sessions/:id/revoke',
    session: true,
    spoof: { skip: 'account-security.int.spec.ts › sessions' },
  },
  // Academy settings: the 2FA rule (G-11).
  {
    method: 'GET',
    path: '/api/v1/settings/security',
    session: true,
    capability: 'academy.settings.read',
  },
  {
    method: 'PATCH',
    path: '/api/v1/settings/security',
    session: true,
    capability: 'academy.settings.manage',
    // A no-op change (same rule, version 1) is repeatable.
    body: { version: 1, requireMfaForRoles: [] },
  },
  // Team (C-67).
  {
    method: 'GET',
    path: '/api/v1/team/members',
    session: true,
    capability: 'team.read',
    volatile: ['lastLoginAt'],
  },
  {
    method: 'PATCH',
    path: '/api/v1/team/members/:id',
    session: true,
    capability: 'team.manage',
    params: { id: 'limited-membership' },
    // A no-op change (same status, version 1) is repeatable.
    body: { version: 1, status: 'ACTIVE' },
  },
  { method: 'GET', path: '/api/v1/team/roles', session: true, capability: 'team.read' },
  { method: 'GET', path: '/api/v1/team/invitations', session: true, capability: 'team.read' },
  {
    method: 'POST',
    path: '/api/v1/team/invitations',
    session: true,
    capability: 'team.invite',
    idempotent: true,
    body: { email: 'new-teacher@example.test', roles: ['teacher'] },
    spoof: 'status',
  },
  {
    method: 'POST',
    path: '/api/v1/team/invitations/:id/resend',
    session: true,
    capability: 'team.invite',
    params: { id: 'spare-invitation' },
    spoof: 'status',
  },
  {
    method: 'POST',
    path: '/api/v1/team/invitations/:id/revoke',
    session: true,
    capability: 'team.invite',
    params: { id: 'spare-invitation' },
    spoof: { skip: 'team.int.spec.ts › invitations › revoke' },
  },
  // The invite link (public; the token is the credential).
  {
    method: 'GET',
    path: '/api/v1/invitations/:token',
    params: { token: 'invitation-token' },
  },
  {
    method: 'POST',
    path: '/api/v1/invitations/:token/accept',
    params: { token: 'invitation-token' },
    body: { name: 'New Teacher', password: 'Another#Pass2026' },
    spoof: { skip: 'team.int.spec.ts › accept' },
  },
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
  'POST /api/v1/test/ledger',
]);

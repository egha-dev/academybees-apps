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
  // The invite link (public; the token is the credential, sent in the body — C-83).
  {
    method: 'POST',
    path: '/api/v1/invitations/preview',
    body: { token: '@fixture:invitation-token' },
  },
  {
    method: 'POST',
    path: '/api/v1/invitations/accept',
    body: { token: '@fixture:invitation-token', name: 'New Teacher', password: 'Another#Pass2026' },
    spoof: { skip: 'team.int.spec.ts › accept' },
  },
  // Legal acceptance (G-06, ADR-034): the signed-in user's own acceptances.
  { method: 'GET', path: '/api/v1/legal/current', session: true },
  {
    method: 'POST',
    path: '/api/v1/legal/accept',
    session: true,
    body: { documentIds: ['019a0000-0000-7000-8000-00000000a001'] },
    spoof: 'status',
  },
  // Guided setup (C-85, C-87, C-92): the owner of A after accepting the legal documents. A is
  // open (onboarding finished), so writes answer 409 there; their isolation is in the dedicated test.
  {
    method: 'GET',
    path: '/api/v1/onboarding',
    session: true,
    capability: 'academy.onboarding.manage',
  },
  {
    method: 'PUT',
    path: '/api/v1/onboarding/steps/:step',
    params: { step: 'step-course' },
    session: true,
    capability: 'academy.onboarding.manage',
    idempotent: true,
    body: { action: 'save', version: 1, data: { name: 'Course' } },
    spoof: { skip: 'onboarding.int.spec.ts › another academy' },
  },
  {
    method: 'POST',
    path: '/api/v1/onboarding/complete',
    session: true,
    capability: 'academy.onboarding.manage',
    idempotent: true,
    body: {},
    spoof: { skip: 'onboarding.int.spec.ts › another academy' },
  },
  // Settings → Academy, Branding & Domain (UX v1.1 §6, C-97). Writes change versions or need
  // storage, so their spoof cases live in the dedicated test.
  {
    method: 'GET',
    path: '/api/v1/academy/settings',
    session: true,
    capability: 'academy.settings.read',
  },
  {
    method: 'PATCH',
    path: '/api/v1/academy/settings',
    session: true,
    capability: 'academy.settings.manage',
    body: { version: 1, name: 'Cross Academy A' },
    spoof: { skip: 'academy-branding.int.spec.ts › academies are isolated' },
  },
  {
    method: 'GET',
    path: '/api/v1/academy/branding',
    session: true,
    capability: 'academy.settings.read',
  },
  {
    method: 'PATCH',
    path: '/api/v1/academy/branding',
    session: true,
    capability: 'academy.branding.manage',
    body: { version: 1 },
    spoof: { skip: 'academy-branding.int.spec.ts › academies are isolated' },
  },
  ...(['logo', 'favicon'] as const).flatMap((kind) => [
    {
      method: 'PUT' as const,
      path: `/api/v1/academy/branding/${kind}`,
      session: true,
      capability: 'academy.branding.manage',
      spoof: { skip: 'academy-branding.int.spec.ts › academies are isolated' },
    },
    {
      method: 'DELETE' as const,
      path: `/api/v1/academy/branding/${kind}`,
      session: true,
      capability: 'academy.branding.manage',
    },
  ]),
  // Students, parents, health notes, consent, custom fields (Phase 4 S2). Writes that change a
  // version or a one-off state compare statuses only or are covered by the dedicated test.
  { method: 'GET', path: '/api/v1/students', session: true, capability: 'student.read' },
  {
    method: 'POST',
    path: '/api/v1/students',
    session: true,
    capability: 'student.create',
    idempotent: true,
    body: { fullName: 'Cross Student' },
    spoof: 'status',
  },
  ...(
    [
      ['GET', '', 'student.read'],
      ['GET', '/activity', 'student.read'],
      ['GET', '/health-note', 'student.health.read'],
      ['GET', '/consents', 'parent.read'],
    ] as const
  ).map(([method, suffix, capability]) => ({
    method,
    path: `/api/v1/students/:id${suffix}`,
    params: { id: 'student' },
    session: true,
    capability,
  })),
  ...(
    [
      ['PATCH', '', 'student.update', { version: 1, grade: 'x' }],
      ['POST', '/status', 'student.update', { version: 1, status: 'ON_HOLD', reason: 'x' }],
      ['POST', '/archive', 'student.archive', { version: 1 }],
      ['POST', '/restore', 'student.archive', { version: 1 }],
    ] as const
  ).map(([method, suffix, capability, body]) => ({
    method,
    path: `/api/v1/students/:id${suffix}`,
    params: { id: 'student' },
    session: true,
    capability,
    body,
    spoof: { skip: 'students.int.spec.ts › another academy' },
  })),
  {
    method: 'POST',
    path: '/api/v1/students/:id/parents',
    params: { id: 'student' },
    session: true,
    capability: 'parent.manage',
    idempotent: true,
    body: { parent: { fullName: 'Cross Parent' } },
    spoof: 'status',
  },
  {
    method: 'PATCH',
    path: '/api/v1/students/:id/parents/:linkId',
    params: { id: 'student', linkId: 'parent-link' },
    session: true,
    capability: 'parent.manage',
    body: { pickupAuthorised: true },
  },
  {
    method: 'DELETE',
    path: '/api/v1/students/:id/parents/:linkId',
    params: { id: 'student', linkId: 'parent-link' },
    session: true,
    capability: 'parent.manage',
    spoof: { skip: 'students.int.spec.ts › another academy' },
  },
  {
    method: 'PUT',
    path: '/api/v1/students/:id/health-note',
    params: { id: 'student' },
    session: true,
    capability: 'student.health.manage',
    body: { notes: 'x' },
    spoof: { skip: 'students.int.spec.ts › another academy' },
  },
  {
    method: 'POST',
    path: '/api/v1/students/:id/consents',
    params: { id: 'student' },
    session: true,
    capability: 'parent.manage',
    idempotent: true,
    body: { parentId: '@fixture:parent', action: 'GRANT', purposes: ['service'], channel: 'PAPER' },
    spoof: 'status',
  },
  {
    method: 'GET',
    path: '/api/v1/parents/duplicates',
    session: true,
    capability: 'parent.read',
    // Needs a phone or email query; covered by the dedicated test.
    spoof: { skip: 'students.int.spec.ts › another academy' },
  },
  {
    method: 'GET',
    path: '/api/v1/parents/:id',
    params: { id: 'parent' },
    session: true,
    capability: 'parent.read',
  },
  {
    method: 'GET',
    path: '/api/v1/parents/:id/activity',
    params: { id: 'parent' },
    session: true,
    capability: 'parent.read',
  },
  {
    method: 'PATCH',
    path: '/api/v1/parents/:id',
    params: { id: 'parent' },
    session: true,
    capability: 'parent.manage',
    body: { version: 1, fullName: 'x' },
    spoof: { skip: 'students.int.spec.ts › another academy' },
  },
  { method: 'GET', path: '/api/v1/custom-fields', session: true, capability: 'student.read' },
  {
    method: 'POST',
    path: '/api/v1/custom-fields',
    session: true,
    capability: 'academy.settings.manage',
    idempotent: true,
    body: { label: 'Cross field', type: 'TEXT' },
    spoof: { skip: 'students.int.spec.ts › another academy' },
  },
  {
    method: 'PATCH',
    path: '/api/v1/custom-fields/:id',
    params: { id: 'custom-field' },
    session: true,
    capability: 'academy.settings.manage',
    body: { required: false },
  },
  // Teachers and search (Phase 4 S4).
  { method: 'GET', path: '/api/v1/teachers', session: true, capability: 'teacher.read' },
  {
    method: 'POST',
    path: '/api/v1/teachers',
    session: true,
    capability: 'teacher.manage',
    idempotent: true,
    body: { mode: 'name', fullName: 'Cross Teacher' },
    spoof: 'status',
  },
  {
    method: 'GET',
    path: '/api/v1/teachers/linkable-members',
    session: true,
    capability: 'teacher.manage',
  },
  {
    method: 'GET',
    path: '/api/v1/teachers/:id',
    params: { id: 'teacher' },
    session: true,
    capability: 'teacher.read',
  },
  {
    method: 'GET',
    path: '/api/v1/teachers/:id/activity',
    params: { id: 'teacher' },
    session: true,
    capability: 'teacher.read',
  },
  {
    method: 'PATCH',
    path: '/api/v1/teachers/:id',
    params: { id: 'teacher' },
    session: true,
    capability: 'teacher.manage',
    body: { version: 1, subjects: ['x'] },
    spoof: { skip: 'teachers.int.spec.ts › search finds what the caller may see' },
  },
  {
    method: 'GET',
    path: '/api/v1/search',
    session: true,
    // Needs `?q=`; per-academy results are covered by the dedicated test.
    spoof: { skip: 'teachers.int.spec.ts › search finds what the caller may see' },
  },
  // Student import (Phase 4 S5). The job routes are exercised end to end, including another
  // academy's attempts, in the dedicated test (needs storage and a job in flight).
  {
    method: 'GET',
    path: '/api/v1/students/import/template',
    session: true,
    capability: 'student.import',
  },
  ...(
    [
      ['POST', '/api/v1/students/import'],
      ['GET', '/api/v1/students/import/:id'],
      ['PUT', '/api/v1/students/import/:id/mapping'],
      ['POST', '/api/v1/students/import/:id/commit'],
      ['GET', '/api/v1/students/import/:id/errors.csv'],
    ] as const
  ).map(([method, path]) => ({
    method,
    path,
    params: { id: 'missing-import' },
    session: true,
    capability: 'student.import',
    ...(method === 'GET' ? {} : { idempotent: true, body: { version: 1, mapping: {} } }),
    spoof: { skip: 'import.int.spec.ts › roles and academies' },
  })),
  // Student photos (Phase 4 S5): need private storage; covered by student-photo.int.spec.ts.
  ...(
    [
      ['GET', 'student.read'],
      ['PUT', 'student.update'],
      ['DELETE', 'student.update'],
    ] as const
  ).map(([method, capability]) => ({
    method,
    path: '/api/v1/students/:id/photo',
    params: { id: 'student' },
    session: true,
    capability,
    spoof: { skip: "student-photo.int.spec.ts › another academy can't see" },
  })),
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
  {
    method: 'POST',
    path: '/api/v1/test/secure/branches',
    session: true,
    capability: 'academy.settings.manage',
    body: {},
  },
  // Academy A is on Pro (advanced reports, 5 branches) so the baseline succeeds.
  {
    method: 'GET',
    path: '/api/v1/test/secure/advanced-reports',
    session: true,
    capability: 'academy.settings.read',
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

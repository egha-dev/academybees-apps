import { describe, expect, it } from 'vitest';

import { isCapability, isPlatformCapability, type Capability } from './permissions.js';
import {
  canGrantRole,
  mergeGrants,
  PLATFORM_ROLE_GRANTS,
  primaryExperience,
  ROLE_KEYS,
  ROLE_TEMPLATES,
  STAFF_ROLE_KEYS,
} from './roles.js';

const caps = (key: (typeof ROLE_KEYS)[number]) =>
  Object.keys(ROLE_TEMPLATES[key].grants) as Capability[];

describe('role templates (ARCHITECTURE §7.3)', () => {
  it('grant only catalogue capabilities, never platform ones', () => {
    for (const key of ROLE_KEYS)
      for (const c of caps(key)) {
        expect(isCapability(c), `${key}: ${c}`).toBe(true);
        expect(isPlatformCapability(c), `${key}: ${c}`).toBe(false);
      }
  });

  it('owner can do everything an admin can, plus settings, refunds, subscription and audit', () => {
    for (const c of caps('admin')) expect(caps('owner'), c).toContain(c);
    for (const c of [
      'academy.settings.manage',
      'payment.refund',
      'subscription.manage',
      'audit.read',
    ])
      expect(caps('owner')).toContain(c);
    expect(caps('admin')).not.toContain('payment.refund');
  });

  it('money: verify for owner/admin/accountant; refund for owner/accountant; report for parents only', () => {
    const holders = (c: Capability) => ROLE_KEYS.filter((k) => caps(k).includes(c));
    expect(holders('payment.verify')).toEqual(['owner', 'admin', 'accountant']);
    expect(holders('payment.refund')).toEqual(['owner', 'accountant']);
    expect(holders('payment.report')).toEqual(['parent']);
    // Cash is off by default for teachers and receptionists (grantable per academy, C-14).
    expect(holders('payment.record_cash')).toEqual(['owner', 'admin', 'accountant']);
  });

  it('teachers work on ASSIGNED records; parents only LINKED; students only SELF', () => {
    expect(ROLE_TEMPLATES.teacher.grants['attendance.mark']).toBe('ASSIGNED');
    expect(new Set(Object.values(ROLE_TEMPLATES.parent.grants))).toEqual(new Set(['LINKED']));
    expect(new Set(Object.values(ROLE_TEMPLATES.student.grants))).toEqual(new Set(['SELF']));
    expect(caps('teacher').some((c) => c.startsWith('fee.') || c.startsWith('payment.'))).toBe(
      false,
    );
  });

  it('opens each role on its experience', () => {
    expect(primaryExperience(['teacher', 'owner'])).toBe('manage');
    expect(primaryExperience(['teacher'])).toBe('teach');
    expect(primaryExperience(['parent', 'student'])).toBe('hub');
    expect(primaryExperience([])).toBeUndefined();
  });

  it('platform roles grant only platform capabilities', () => {
    for (const list of Object.values(PLATFORM_ROLE_GRANTS))
      for (const c of list) expect(isPlatformCapability(c)).toBe(true);
  });

  it('merges several roles to the widest scope per capability', () => {
    expect(
      mergeGrants([
        { capability: 'student.read', scope: 'ASSIGNED' },
        { capability: 'student.read', scope: 'BRANCH' },
        { capability: 'attendance.mark', scope: 'ASSIGNED' },
      ]),
    ).toEqual({ 'student.read': 'BRANCH', 'attendance.mark': 'ASSIGNED' });
  });
});

describe('canGrantRole (C-67)', () => {
  const as = (key: keyof typeof ROLE_TEMPLATES) => ({
    roles: [key],
    capabilities: ROLE_TEMPLATES[key].grants,
  });

  it('owners grant every staff role, including owner', () => {
    for (const role of STAFF_ROLE_KEYS) expect(canGrantRole(as('owner'), role), role).toBe(true);
  });

  it('admins add admins, teachers and receptionists, not accountants or owners', () => {
    const admin = as('admin');
    expect(canGrantRole(admin, 'teacher')).toBe(true);
    expect(canGrantRole(admin, 'receptionist')).toBe(true);
    expect(canGrantRole(admin, 'accountant')).toBe(false);
    expect(canGrantRole(admin, 'admin')).toBe(true);
    expect(canGrantRole(admin, 'owner')).toBe(false);
  });

  it('nobody grants family or unknown roles through the team', () => {
    for (const role of ['parent', 'student', 'superuser']) {
      expect(canGrantRole(as('owner'), role), role).toBe(false);
    }
  });
});

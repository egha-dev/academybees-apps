import { describe, expect, it } from 'vitest';

import { readTerminology, TERMINOLOGY_TEMPLATES, toAcademyType } from './academy-types.js';
import { nextTenantStatus } from './console.js';

describe('academy lifecycle (C-87)', () => {
  it('suspends setting-up and active academies only', () => {
    expect(nextTenantStatus('suspend', 'ACTIVE', null)).toBe('SUSPENDED');
    expect(nextTenantStatus('suspend', 'SETUP', null)).toBe('SUSPENDED');
    expect(nextTenantStatus('suspend', 'ARCHIVED', null)).toBeNull();
    expect(nextTenantStatus('suspend', 'SUSPENDED', 'ACTIVE')).toBeNull();
  });

  it('reactivate restores the status before suspension', () => {
    expect(nextTenantStatus('reactivate', 'SUSPENDED', 'SETUP')).toBe('SETUP');
    expect(nextTenantStatus('reactivate', 'SUSPENDED', 'ACTIVE')).toBe('ACTIVE');
    expect(nextTenantStatus('reactivate', 'SUSPENDED', null)).toBe('ACTIVE');
    expect(nextTenantStatus('reactivate', 'ACTIVE', null)).toBeNull();
  });

  it('activate only finishes setup; archive from anywhere but archived', () => {
    expect(nextTenantStatus('activate', 'SETUP', null)).toBe('ACTIVE');
    expect(nextTenantStatus('activate', 'SUSPENDED', 'SETUP')).toBeNull();
    for (const s of ['SETUP', 'ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'] as const)
      expect(nextTenantStatus('archive', s, null)).toBe('ARCHIVED');
    expect(nextTenantStatus('archive', 'ARCHIVED', null)).toBeNull();
  });
});

describe('terminology (ADR-029)', () => {
  it('has a template for every type and reads stored values defensively', () => {
    expect(TERMINOLOGY_TEMPLATES.sports).toEqual({
      batch: 'group',
      course: 'program',
      teacher: 'coach',
    });
    expect(readTerminology({ batch: 'class', teacher: 'wizard' })).toEqual({
      batch: 'class',
      course: 'course',
      teacher: 'teacher',
    });
    expect(readTerminology(null).batch).toBe('batch');
  });

  it('maps older type names', () => {
    expect(toAcademyType('karate')).toBe('martial_arts');
    expect(toAcademyType('dance')).toBe('dance');
    expect(toAcademyType('underwater-basket')).toBe('other');
  });
});

import { z } from 'zod';

/**
 * People profile shapes (G-05, C-09). The full student/parent/teacher contracts grow with the
 * Phase 4 workspaces; Phase 3 needs the shared vocabularies and the onboarding create commands.
 */
export const PARENT_RELATIONSHIPS = [
  'MOTHER',
  'FATHER',
  'GUARDIAN',
  'GRANDPARENT',
  'OTHER',
] as const;
export const ParentRelationshipSchema = z.enum(PARENT_RELATIONSHIPS);
export type ParentRelationship = z.infer<typeof ParentRelationshipSchema>;

/** What a parent consents to (G-06). Marketing is always a separate, optional purpose. */
export const CONSENT_PURPOSES = ['service', 'photos', 'marketing'] as const;
export const ConsentPurposeSchema = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const STUDENT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT'] as const;
export const StudentStatusSchema = z.enum(STUDENT_STATUSES);

/** TenantSequence keys (C-91). */
export const SEQUENCE_KEYS = { admission: 'admission' } as const;

/** `ADM-0001`: prefix + the sequence value zero-padded to at least 4 digits (C-91). */
export function formatAdmissionNo(prefix: string, value: number): string {
  return `${prefix}${String(value).padStart(4, '0')}`;
}

export const DEFAULT_ADMISSION_PREFIX = 'ADM-';

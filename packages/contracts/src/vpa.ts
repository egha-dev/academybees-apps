import { z } from 'zod';

/**
 * A UPI ID (virtual payment address): `name@bank`. Its own file because onboarding needs it and
 * finance already reaches onboarding through students.
 */
export const VpaSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9]{1,63}$/, 'invalid_vpa');

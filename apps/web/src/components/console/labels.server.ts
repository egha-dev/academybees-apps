import 'server-only';

import { loginLabels, mfaLabels } from '@/components/auth/labels.server';

/** Console sign-in: password, then the mandatory second step (C-66). */
export async function consoleSignInLabels() {
  const [login, mfa] = await Promise.all([loginLabels(), mfaLabels()]);
  return { login, mfa };
}

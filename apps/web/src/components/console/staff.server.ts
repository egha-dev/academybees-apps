import 'server-only';

import { type Capability, type MeResponse, PLATFORM_ROLE_GRANTS } from '@academybee/contracts';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getSession } from '@/lib/session.server';

export type PlatformRole = NonNullable<MeResponse['platform']>['role'];

export type ConsoleStaff =
  | { state: 'expired' }
  | { state: 'signed-in'; me: MeResponse; role: PlatformRole; can: (c: Capability) => boolean };

/**
 * The signed-in platform staff member for a console page (C-02, C-66). Signed out (or not
 * staff) → sign-in. What the role may do decides what the page offers; the API checks again.
 */
export const consoleStaff = cache(async (): Promise<ConsoleStaff> => {
  const session = await getSession();
  if (session.state === 'signed-out') redirect('/login');
  if (session.state === 'expired') return { state: 'expired' };
  const role = session.me.platform?.role;
  if (!role) redirect('/login');
  const grants: readonly Capability[] = PLATFORM_ROLE_GRANTS[role];
  return { state: 'signed-in', me: session.me, role, can: (c) => grants.includes(c) };
});

export { academyUrl } from '@/lib/academy-url';

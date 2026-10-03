import 'server-only';

import { type MeResponse } from '@academybee/contracts';
import { notFound, redirect } from 'next/navigation';

import { academyName, hostContext } from '@/lib/host-context.server';
import { getSession, homeFor } from '@/lib/session.server';

/**
 * A page's view of the signed-in member. The layout already guards the session, but Next renders
 * pages alongside layouts, so pages check again (cached per request) and never assume.
 */
export async function signedInMember(options: { experience?: 'manage' | 'teach' } = {}): Promise<{
  me: MeResponse & { academy: NonNullable<MeResponse['academy']> };
  academy: string;
}> {
  const [session, { context }] = await Promise.all([getSession(), hostContext()]);
  const academy = academyName(context);
  if (!academy) notFound();
  if (session.state !== 'signed-in' || !session.me.academy) redirect('/login');
  const me = session.me as MeResponse & { academy: NonNullable<MeResponse['academy']> };
  if (options.experience && !me.academy.experiences.includes(options.experience))
    redirect(homeFor(me));
  return { me, academy };
}

/** Does the member hold a capability (any scope)? */
export function holds(me: MeResponse, capability: string): boolean {
  return (
    (me.academy?.capabilities as Record<string, string | undefined> | undefined)?.[capability] !==
    undefined
  );
}

import { redirect } from 'next/navigation';

import { getSession, homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

/**
 * `/` on an academy host (plan 2.16): signed-in members go to their home (Manage `/today`,
 * Teacher `/teach`); everyone else signs in. An expired access token goes to the home, whose
 * session guard refreshes it.
 */
export default async function AcademyRoot() {
  const session = await getSession();
  if (session.state === 'signed-in') redirect(homeFor(session.me));
  if (session.state === 'expired') redirect('/today');
  redirect('/login');
}

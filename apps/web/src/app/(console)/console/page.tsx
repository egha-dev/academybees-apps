import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session.server';

/** Console home: the academies list for staff (C-02), sign-in for everyone else. */
export default async function ConsoleHome() {
  const session = await getSession();
  redirect(session.state === 'signed-out' ? '/login' : '/academies');
}

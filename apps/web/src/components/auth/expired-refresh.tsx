'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { refreshSession } from '@/lib/api';

/**
 * The server saw an expired access token: refresh once on the client and re-render, or go to
 * sign-in when the session cannot be restored (Family Hub and console pages, plan 2.15).
 */
export function ExpiredRefresh() {
  const router = useRouter();
  useEffect(() => {
    void refreshSession().then((ok) => {
      if (ok) router.refresh();
      // A full load: nothing of the ended session stays in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      else window.location.assign('/login');
    });
  }, [router]);
  return null;
}

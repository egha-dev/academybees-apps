import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { flagEnabled } from '@/lib/flags.server';
import { hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

/**
 * Route group: Family Hub (`app.`, G-31, ADR-039). Sign-in, the handoff from academy sign-in
 * (C-61) and a signed-in placeholder, all behind release flag `p1-hub-placeholder` until Parent
 * Core ships in Phase 7P. With the flag off the host sends visitors to the marketing site.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const [h, { apexUrl }] = await Promise.all([headers(), hostContext()]);
  if (!(await flagEnabled('p1-hub-placeholder', h.get('host') ?? ''))) redirect(apexUrl);
  return children;
}

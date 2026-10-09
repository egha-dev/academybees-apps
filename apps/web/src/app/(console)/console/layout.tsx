import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * Route group: Console (`console.`, C-02). Sign-in with mandatory TOTP (C-66), the set-password
 * link from `platform:create-admin`, and (Phase 3) the provisioning console under `(staff)`;
 * Phase 14 adds the rest of the console.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

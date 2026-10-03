import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * Route group: Console (`console.`, C-02). Phase 2: sign-in with mandatory TOTP (C-66), the
 * set-password link from `platform:create-admin`, and a signed-in placeholder behind
 * `p2-console-home`. Phase 3 adds provisioning; Phase 14 the full console.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

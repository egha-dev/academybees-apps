import type { ReactNode } from 'react';

/**
 * Route group: Academy experiences (*.academybee.com, rewritten to /t/{slug}) — from Phase 1.
 * Host routing in src/proxy.ts rewrites into this group once the phase lands; until then it has
 * no pages (hidden navigation — no "coming soon" screens, CLAUDE.md §10).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

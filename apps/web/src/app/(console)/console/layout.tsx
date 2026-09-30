import type { ReactNode } from 'react';

/**
 * Route group: Console (console.academybee.com) — Phase 3 provisioning slice, Phase 14 full console.
 * Host routing in src/proxy.ts rewrites into this group once the phase lands; until then it has
 * no pages (hidden navigation — no "coming soon" screens, CLAUDE.md §10).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

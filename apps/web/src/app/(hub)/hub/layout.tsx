import type { ReactNode } from 'react';

/**
 * Route group: Family Hub (app.academybees.com) — Phase 7P / 11.
 * Host routing in src/proxy.ts rewrites into this group once the phase lands; until then it has
 * no pages (hidden navigation — no "coming soon" screens, CLAUDE.md §10).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

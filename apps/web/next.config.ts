import { withSerwist } from '@serwist/turbopack';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repo's root CLAUDE.md is the single source of agent instructions (as with turbo's agentGuidance).
  agentRules: false,
  // Pseudo-locale E2E builds go to their own folder (.next-xa, .next-long) — see build:pseudo.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Workspace packages are consumed from their built ESM output.
  transpilePackages: [],
  // The Docker image (apps/web/Dockerfile) builds a standalone server; local and E2E builds keep
  // `next start` (C-75). Tracing starts at the repo root so workspace packages are included.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};

export default withSerwist(withNextIntl(config));

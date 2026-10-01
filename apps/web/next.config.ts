import { withSerwist } from '@serwist/turbopack';
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
};

export default withSerwist(withNextIntl(config));

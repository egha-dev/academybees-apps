import { spawnSync } from 'node:child_process';

import { createSerwistRoute } from '@serwist/turbopack';

// Precache revision for the offline page: the deployed commit (Vercel) or local git HEAD.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout.trim() ||
    crypto.randomUUID());

/** Serves the compiled service worker at /serwist/sw.js (scope `/`, C-46). */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    additionalPrecacheEntries: [{ url: '/offline', revision }],
    swSrc: 'src/app/sw.ts',
    useNativeEsbuild: true,
  },
);

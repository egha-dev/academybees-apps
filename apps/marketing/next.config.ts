import type { NextConfig } from 'next';

/**
 * academybees.com (C-74): a fully static export for Cloudflare Pages — no server, no API calls,
 * no analytics. Every page is HTML in `out/`; `trailingSlash` makes `/privacy/` a folder with an
 * index.html, which static hosts serve without rewrites.
 */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  images: { unoptimized: true },
};

export default config;

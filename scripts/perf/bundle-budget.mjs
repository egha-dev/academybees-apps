#!/usr/bin/env node
// Route JS budget (G-24, ADR-035, C-47, C-68): sum the gzipped JavaScript each route loads in a
// modern browser and fail when a route exceeds its budget. Run after `next build`.
// - Prerendered routes: the scripts in the route's HTML (module scripts; `noModule` legacy
//   polyfills excluded).
// - Dynamic routes (sign-in, homes): the route's client-reference manifest — the root main files,
//   the route's entry JS and every non-lazy client chunk it references. An upper bound; on `/`
//   it gives exactly the HTML figure.
//
//   node scripts/perf/bundle-budget.mjs [--dist apps/web/.next]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const KB = 1024;
/** Budgets in gzipped KB. Family Hub routes join this list in their phases. */
const ACADEMY = '(tenant)/t/[slug]';
const BUDGETS = [
  { route: '/', file: 'index.html', kb: 200 },
  { route: '/offline', file: 'offline.html', kb: 200 },
  { route: '/_not-found', file: '_not-found.html', kb: 200 },
  { route: '/login', page: `${ACADEMY}/login`, kb: 200 },
  { route: '/forgot-password', page: `${ACADEMY}/forgot-password`, kb: 200 },
  { route: '/reset-password', page: `${ACADEMY}/reset-password`, kb: 200 },
  { route: '/invite', page: `${ACADEMY}/invite`, kb: 200 },
  { route: '/today', page: `${ACADEMY}/(app)/today`, kb: 200 },
  { route: '/teach', page: `${ACADEMY}/(app)/teach`, kb: 200 },
  { route: '/more', page: `${ACADEMY}/(app)/more`, kb: 200 },
  // Every staff member's own Security page, teachers on phones included (G-11, G-24).
  { route: '/settings/security', page: `${ACADEMY}/(app)/settings/security`, kb: 200 },
  { route: '/settings/academy', page: `${ACADEMY}/(app)/settings/academy`, kb: 200 },
  { route: '/settings/branding', page: `${ACADEMY}/(app)/settings/branding`, kb: 200 },
  { route: '/settings/custom-fields', page: `${ACADEMY}/(app)/settings/custom-fields`, kb: 200 },
  { route: '/students', page: `${ACADEMY}/(app)/students`, kb: 200 },
  { route: '/students/[id]', page: `${ACADEMY}/(app)/students/[id]`, kb: 200 },
  { route: '/teachers', page: `${ACADEMY}/(app)/teachers`, kb: 200 },
  { route: '/students/import', page: `${ACADEMY}/(app)/students/import`, kb: 200 },
  { route: '/onboarding/import', page: `${ACADEMY}/(setup)/onboarding/import`, kb: 200 },
  { route: '/join-requests', page: `${ACADEMY}/(app)/join-requests`, kb: 200 },
  { route: '/settings/parent-app', page: `${ACADEMY}/(app)/settings/parent-app`, kb: 200 },
  { route: '/privacy', page: `${ACADEMY}/privacy`, kb: 200 },
  { route: '/teachers/[id]', page: `${ACADEMY}/(app)/teachers/[id]`, kb: 200 },
  // The owner's guided setup (UX v1.1 §5), phone-first.
  { route: '/legal', page: `${ACADEMY}/(setup)/legal`, kb: 200 },
  { route: '/welcome', page: `${ACADEMY}/(setup)/welcome`, kb: 200 },
  { route: '/onboarding/[step]', page: `${ACADEMY}/(setup)/onboarding/[step]`, kb: 200 },
];

const distArg = process.argv.indexOf('--dist');
const dist = path.resolve(distArg > 0 ? process.argv[distArg + 1] : 'apps/web/.next');

function routeScripts(html) {
  const scripts = new Set();
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    if (/\bnomodule\b/i.test(tag)) continue;
    const src = /\bsrc="(\/_next\/static\/[^"]+\.js)"/.exec(tag)?.[1];
    if (src) scripts.add(src);
  }
  for (const m of html.matchAll(
    /<link\b[^>]*rel="preload"[^>]*as="script"[^>]*href="(\/_next\/static\/[^"]+\.js)"/g,
  )) {
    scripts.add(m[1]);
  }
  return [...scripts];
}

/** Scripts of a dynamic route, from its client-reference manifest (see header). */
function manifestScripts(page) {
  const file = path.join(dist, 'server/app', page, 'page_client-reference-manifest.js');
  if (!existsSync(file)) return undefined;
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const manifest = sandbox.__RSC_MANIFEST[`/${page}/page`];
  const norm = (f) => `/_next/${f.replace(/^\/?(_next\/)?/, '')}`;
  const scripts = new Set();
  const build = JSON.parse(readFileSync(path.join(dist, 'build-manifest.json'), 'utf8'));
  for (const f of build.rootMainFiles ?? []) scripts.add(norm(f));
  for (const files of Object.values(manifest.entryJSFiles ?? {}))
    for (const f of files) scripts.add(norm(f));
  for (const mod of Object.values(manifest.clientModules))
    if (!mod.async) for (const f of mod.chunks) scripts.add(norm(f));
  return [...scripts].filter((f) => f.endsWith('.js'));
}

let failed = false;
const rows = [];
for (const { route, file, page, kb } of BUDGETS) {
  const htmlPath = file && path.join(dist, 'server/app', file);
  const scripts = page
    ? manifestScripts(page)
    : existsSync(htmlPath)
      ? routeScripts(readFileSync(htmlPath, 'utf8'))
      : undefined;
  if (!scripts) {
    console.error(`✖ ${route}: build output not found — run the web build first`);
    failed = true;
    continue;
  }
  const bytes = scripts.reduce((sum, src) => {
    const file = path.join(dist, src.replace(/^\/_next\//, ''));
    return sum + gzipSync(readFileSync(file), { level: 9 }).length;
  }, 0);
  const ok = bytes <= kb * KB;
  failed ||= !ok;
  rows.push(
    `${ok ? '✔' : '✖'} ${route.padEnd(17)} ${(bytes / KB).toFixed(1).padStart(7)} KB gz / ${kb} KB  (${scripts.length} scripts)`,
  );
}
console.log(rows.join('\n'));
if (failed) {
  console.error(
    '\nRoute JS budget exceeded (G-24). Keep heavy UI out of the shell: lazy-load it or import from @academybee/ui/components/*.',
  );
  process.exit(1);
}

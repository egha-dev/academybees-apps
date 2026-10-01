#!/usr/bin/env node
// Route JS budget (G-24, ADR-035, C-47): sum the gzipped JavaScript each prerendered route
// loads in a modern browser (module scripts; `noModule` legacy polyfills excluded) and fail
// when a route exceeds its budget. Run after `next build`.
//
//   node scripts/perf/bundle-budget.mjs [--dist apps/web/.next]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;
/** Budgets in gzipped KB. Teacher (/teach) and Family Hub routes join this list in their phases. */
const BUDGETS = [
  { route: '/', file: 'index.html', kb: 200 },
  { route: '/offline', file: 'offline.html', kb: 200 },
  { route: '/_not-found', file: '_not-found.html', kb: 200 },
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

let failed = false;
const rows = [];
for (const { route, file, kb } of BUDGETS) {
  const htmlPath = path.join(dist, 'server/app', file);
  if (!existsSync(htmlPath)) {
    console.error(`✖ ${route}: ${htmlPath} not found — run the web build first`);
    failed = true;
    continue;
  }
  const scripts = routeScripts(readFileSync(htmlPath, 'utf8'));
  const bytes = scripts.reduce((sum, src) => {
    const file = path.join(dist, src.replace(/^\/_next\//, ''));
    return sum + gzipSync(readFileSync(file), { level: 9 }).length;
  }, 0);
  const ok = bytes <= kb * KB;
  failed ||= !ok;
  rows.push(
    `${ok ? '✔' : '✖'} ${route.padEnd(14)} ${(bytes / KB).toFixed(1).padStart(7)} KB gz / ${kb} KB  (${scripts.length} scripts)`,
  );
}
console.log(rows.join('\n'));
if (failed) {
  console.error(
    '\nRoute JS budget exceeded (G-24). Keep heavy UI out of the shell: lazy-load it or import from @academybee/ui/components/*.',
  );
  process.exit(1);
}

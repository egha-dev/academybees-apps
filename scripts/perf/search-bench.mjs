#!/usr/bin/env node
// Search latency benchmark (ADR-026, C-105; Phase 4 exit gate: p95 < 300 ms with 50K students).
// Needs a running API (`pnpm dev`, or `node apps/api/dist/main.js`) and `pnpm db:seed:perf`.
//   pnpm perf:search [--api http://localhost:4000] [--runs 200]
// Signs in as the demo-b owner and times the command palette search (`/search`) and the Students
// list search (`/students?q=`) with realistic queries: part of a name, an admission number prefix
// and a phone fragment. Prints p50/p95 per endpoint; exits 1 if a p95 is over the budget.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const API = arg('api', process.env.API_ORIGIN ?? 'http://localhost:4000');
const RUNS = Number(arg('runs', '200'));
const BUDGET_MS = 300;
const HOST = 'demo-b.localhost';

// The API resolves the academy the way it does behind the web proxy: forwarded host + secret.
try {
  process.loadEnvFile('apps/api/.env');
} catch {
  // use the environment
}
const SECRET = process.env.TRUSTED_PROXY_SECRET ?? '';
const headers = (extra = {}) => ({
  accept: 'application/json',
  'x-forwarded-host': HOST,
  'x-ab-proxy-secret': SECRET,
  ...extra,
});

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: headers({ 'content-type': 'application/json' }),
  body: JSON.stringify({ identifier: 'owner@demo-b.test', password: 'AcademyBees#2026' }),
});
if (!login.ok) {
  console.error(`✖ sign-in failed (${login.status}). Is the API running and seeded?`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

const NAMES = [
  'aar',
  'vihaan',
  'ana',
  'diya',
  'kab',
  'meera',
  'sharma',
  'iyer',
  'reddy',
  'nair',
  'pat',
  'kulk',
  'zara',
  'dhr',
  'tara',
];
function query(i) {
  switch (i % 4) {
    case 0:
      return NAMES[i % NAMES.length];
    case 1:
      return `${NAMES[(i * 7) % NAMES.length]} ${(i * 37) % 9}`;
    case 2:
      return `PERF-0${(i * 13) % 5}`;
    default:
      return String(97000 + ((i * 101) % 999)).padStart(5, '0');
  }
}

async function time(path) {
  const start = performance.now();
  const res = await fetch(`${API}${path}`, { headers: headers({ cookie }) });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return performance.now() - start;
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

const targets = {
  '/search': (q) => `/api/v1/search?q=${encodeURIComponent(q)}`,
  '/students?q=': (q) => `/api/v1/students?limit=50&q=${encodeURIComponent(q)}`,
};
let failed = false;
for (const [name, path] of Object.entries(targets)) {
  for (let i = 0; i < 20; i += 1) await time(path(query(i))); // warm up
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) samples.push(await time(path(query(i + 20))));
  const p50 = pct(samples, 50);
  const p95 = pct(samples, 95);
  const ok = p95 < BUDGET_MS;
  failed ||= !ok;
  console.log(
    `${ok ? '✔' : '✖'} ${name.padEnd(14)} p50 ${p50.toFixed(0).padStart(4)} ms · p95 ${p95.toFixed(0).padStart(4)} ms (budget ${BUDGET_MS} ms, ${RUNS} runs)`,
  );
}
process.exit(failed ? 1 : 0);

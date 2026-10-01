// Lighthouse CI (ADR-035, G-24, C-47): performance + accessibility budgets on the shell, with
// Lighthouse's default mobile emulation and simulated 4G throttling. Installability is checked
// in Playwright (Lighthouse 12+ has no PWA category). Run after the web build: `pnpm perf:lighthouse`.
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm --filter @academybee/web start',
      startServerReadyPattern: 'Ready in|Local:',
      startServerReadyTimeout: 60000,
      url: ['http://localhost:3000/', 'http://localhost:3000/offline'],
      // 5 runs (median): CI runners vary ±0.5 s on the same build; 3 runs flapped around the
      // 2.5 s budget (C-58). The budget itself is unchanged.
      numberOfRuns: 5,
      settings: { chromeFlags: '--no-sandbox --headless=new' },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 2500, aggregationMethod: 'median' },
        ],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        'total-blocking-time': ['warn', { maxNumericValue: 300, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:performance': ['warn', { minScore: 0.85 }],
      },
    },
    upload: { target: 'filesystem', outputDir: 'e2e/artifacts/lighthouse' },
  },
};

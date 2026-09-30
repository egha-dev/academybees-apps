import { describe, expect, it } from 'vitest';

import { classifyHost } from './host.js';

describe('classifyHost (Phase 0 stub)', () => {
  it.each([
    ['localhost:3000', 'marketing'],
    ['academybee.com', 'marketing'],
    ['www.academybee.com', 'marketing'],
    ['console.localhost:3000', 'console'],
    ['console.academybee.com', 'console'],
    ['app.localhost:3000', 'hub'],
    ['app.academybee.com', 'hub'],
    ['demo-a.localhost:3000', 'tenant'],
    ['Sunrise-Dance.AcademyBee.com.', 'tenant'],
  ])('%s → %s', (host, kind) => {
    expect(classifyHost(host)).toBe(kind);
  });
});

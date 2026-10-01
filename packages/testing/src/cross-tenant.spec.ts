import { describe, expect, it } from 'vitest';

import { leaksTenant, missingFromRegistry, tenantSpoofAttempts } from './cross-tenant.js';

const victim = { id: 'b-id', slug: 'academy-b', name: 'Academy B', host: 'academy-b.localhost' };

describe('cross-tenant scaffold', () => {
  it('lists unregistered routes', () => {
    expect(
      missingFromRegistry(
        [
          { method: 'get', path: '/api/v1/a' },
          { method: 'POST', path: '/api/v1/b' },
        ],
        [{ method: 'GET', path: '/api/v1/a' }],
      ),
    ).toEqual(['POST /api/v1/b']);
  });

  it('covers query, body, header and forwarded-host attempts', () => {
    const names = tenantSpoofAttempts(victim).map((a) => a.name);
    expect(names.join(' ')).toMatch(/query.*body.*header.*Forwarded-Host/);
  });

  it('detects any mention of the victim', () => {
    expect(leaksTenant({ ok: true }, victim)).toEqual([]);
    expect(leaksTenant({ nested: ['Academy B'] }, victim)).toEqual(['Academy B']);
  });
});

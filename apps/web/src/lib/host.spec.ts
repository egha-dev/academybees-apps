import { describe, expect, it } from 'vitest';

import { classifyRequestHost, platformRootDomain } from './host.js';

describe('platformRootDomain', () => {
  it('uses the configured root', () => {
    expect(
      platformRootDomain({
        APP_ENV: 'staging',
        PLATFORM_ROOT_DOMAIN: 'staging.academybee.com',
      }),
    ).toBe('staging.academybee.com');
  });

  it('defaults to localhost only in local and ci', () => {
    expect(platformRootDomain({ APP_ENV: 'local' })).toBe('localhost');
    expect(platformRootDomain({ APP_ENV: 'ci' })).toBe('localhost');
    expect(() => platformRootDomain({ APP_ENV: 'production' })).toThrow();
  });
});

describe('classifyRequestHost', () => {
  const env = { APP_ENV: 'local' };
  it.each([
    ['localhost:3000', 'marketing'],
    ['console.localhost:3000', 'console'],
    ['app.localhost:3000', 'hub'],
    ['demo-a.localhost:3000', 'tenant'],
    ['127.0.0.1:3000', 'invalid'],
  ])('%s → %s', (host, kind) => {
    expect(classifyRequestHost(host, env).kind).toBe(kind);
  });
});

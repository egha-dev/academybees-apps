import { describe, expect, it } from 'vitest';

import { InvalidConfigError, loadApiConfig } from './config.schema.js';

const base = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://ab_app:secret-password@localhost:5432/academybee',
  REDIS_URL: 'redis://localhost:6379',
  TRUSTED_PROXY_SECRET: 'local-proxy-secret-123',
  ANALYTICS_HASH_SALT: 'local-salt',
};

describe('loadApiConfig', () => {
  it('parses a valid environment with defaults', () => {
    const cfg = loadApiConfig(base);
    expect(cfg.PORT).toBe(4000);
    expect(cfg.PAYMENT_PROVIDERS).toEqual(['manual']);
    expect(cfg.TRUSTED_PROXY_IPS).toEqual([]);
  });

  it('refuses to start on missing or invalid values, naming variables but never values', () => {
    try {
      loadApiConfig({ ...base, APP_ENV: 'prod', DATABASE_URL: 'mysql://x:secret-password@h/db' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      const message = (error as Error).message;
      expect(message).toContain('APP_ENV');
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain('secret-password');
    }
  });

  it('refuses the payment simulator in production (ADR-038)', () => {
    expect(() =>
      loadApiConfig({
        ...base,
        APP_ENV: 'production',
        TRUSTED_PROXY_SECRET: 'a-real-production-secret',
        PAYMENT_PROVIDERS: 'manual,simulator',
      }),
    ).toThrow(/SimulatorProvider is not allowed/);
    expect(
      loadApiConfig({ ...base, APP_ENV: 'ci', PAYMENT_PROVIDERS: 'manual,simulator' })
        .PAYMENT_PROVIDERS,
    ).toEqual(['manual', 'simulator']);
  });

  it('refuses the local proxy secret in production', () => {
    expect(() => loadApiConfig({ ...base, APP_ENV: 'production' })).toThrow(/real secret/);
  });
});

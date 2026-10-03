import { generateMasterKey } from '@academybee/auth';
import { describe, expect, it } from 'vitest';

import { InvalidWorkerConfigError, loadWorkerConfig } from './config.js';

const base = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://ab_app:pw-secret@localhost:5432/academybee',
  PLATFORM_DATABASE_URL: 'postgresql://ab_platform:pw-secret@localhost:5432/academybee',
  REDIS_URL: 'redis://localhost:6379',
  ANALYTICS_HASH_SALT: 'local-salt',
  SECRETS_MASTER_KEY: generateMasterKey(),
};

describe('loadWorkerConfig', () => {
  it('applies defaults', () => {
    const cfg = loadWorkerConfig(base);
    expect(cfg.OUTBOX_BATCH_SIZE).toBe(100);
    expect(cfg.OUTBOX_POLL_INTERVAL_MS).toBe(1000);
  });

  it('refuses invalid config without echoing secrets', () => {
    try {
      loadWorkerConfig({
        ...base,
        PLATFORM_DATABASE_URL: 'http://pw-secret@x',
        OUTBOX_BATCH_SIZE: '0',
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidWorkerConfigError);
      expect((e as Error).message).toContain('PLATFORM_DATABASE_URL');
      expect((e as Error).message).toContain('OUTBOX_BATCH_SIZE');
      expect((e as Error).message).not.toContain('pw-secret');
    }
  });

  it('refuses localhost email and http links outside local/ci', () => {
    expect(() =>
      loadWorkerConfig({ ...base, APP_ENV: 'staging', WEB_PUBLIC_PROTOCOL: 'http' }),
    ).toThrow(/SMTP_URL[\s\S]*WEB_PUBLIC_PROTOCOL/);
    const ok = loadWorkerConfig({
      ...base,
      APP_ENV: 'staging',
      SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
    });
    expect(ok.WEB_PUBLIC_PROTOCOL).toBe('https');
  });
});

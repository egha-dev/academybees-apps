import { generateKeyPairSync, randomBytes } from 'node:crypto';

/**
 * Throwaway session secrets for tests (C-64): an Ed25519 signing key set and a secrets master
 * key, generated per process — never committed.
 */
export function testAuthEnv(): { AUTH_SIGNING_KEYS: string; SECRETS_MASTER_KEY: string } {
  const kid = 'test';
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = { ...privateKey.export({ format: 'jwk' }), kid, alg: 'EdDSA' };
  return {
    AUTH_SIGNING_KEYS: JSON.stringify({ current: kid, keys: [jwk] }),
    SECRETS_MASTER_KEY: `test:${randomBytes(32).toString('base64')}`,
  };
}

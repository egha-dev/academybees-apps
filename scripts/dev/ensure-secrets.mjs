#!/usr/bin/env node
// Local secrets for `pnpm env:init` (C-64): an Ed25519 signing key set for access tokens and an
// AES-256 master key for secrets at rest. Added to apps/api/.env (and the same master key to
// apps/worker/.env) only when missing — existing values are never overwritten. Local/ci only.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const valueOf = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';

function ensure(file, key, make) {
  const text = read(file);
  if (!text) return;
  if (valueOf(text, key)) return console.log(`kept    ${key} in ${file}`);
  const line = `${key}=${make()}`;
  const next = new RegExp(`^${key}=.*$`, 'm').test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(file, next);
  console.log(`created ${key} in ${file}`);
}

const api = 'apps/api/.env';
const worker = 'apps/worker/.env';

ensure(api, 'AUTH_SIGNING_KEYS', () => {
  const kid = `local-${Date.now()}`;
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = { ...privateKey.export({ format: 'jwk' }), kid, alg: 'EdDSA' };
  return `'${JSON.stringify({ current: kid, keys: [jwk] })}'`;
});

const sharedMaster =
  valueOf(read(api), 'SECRETS_MASTER_KEY') ||
  valueOf(read(worker), 'SECRETS_MASTER_KEY') ||
  `local1:${randomBytes(32).toString('base64')}`;
ensure(api, 'SECRETS_MASTER_KEY', () => sharedMaster);
ensure(worker, 'SECRETS_MASTER_KEY', () => sharedMaster);

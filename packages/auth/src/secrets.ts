import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for secrets at rest (ADR-033; MFA secrets, outbox link tokens C-62): each
 * value gets a random data key; the data key is encrypted with the master key; both with
 * AES-256-GCM. Format: `ab1.<keyId>.<edek>.<iv>.<ciphertext>.<tag>` (base64url parts).
 * The master key ring comes from `SECRETS_MASTER_KEY` (`<keyId>:<base64 32 bytes>`, comma-separated,
 * first = current) so keys can rotate without re-encrypting immediately.
 */
export type MasterKeyRing = { currentId: string; keys: Map<string, Buffer> };

export function loadMasterKeys(value: string): MasterKeyRing {
  const keys = new Map<string, Buffer>();
  let currentId: string | undefined;
  for (const entry of value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [id, b64] = entry.split(':');
    const key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
    if (!id || !/^[A-Za-z0-9_-]{1,20}$/.test(id) || key.length !== 32)
      throw new Error('SECRETS_MASTER_KEY entries must be <id>:<base64 32-byte key>');
    keys.set(id, key);
    currentId ??= id;
  }
  if (!currentId) throw new Error('SECRETS_MASTER_KEY is empty');
  return { currentId, keys };
}

export function generateMasterKey(id = 'm1'): string {
  return `${id}:${randomBytes(32).toString('base64')}`;
}

function seal(key: Buffer, plaintext: Buffer): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ct, tag: cipher.getAuthTag() };
}

function open(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

const b64 = (b: Buffer) => b.toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url');

export function encryptSecret(plaintext: string, ring: MasterKeyRing): string {
  const master = ring.keys.get(ring.currentId);
  if (!master) throw new Error('current master key missing');
  const dataKey = randomBytes(32);
  const wrapped = seal(master, dataKey);
  const body = seal(dataKey, Buffer.from(plaintext, 'utf8'));
  const edek = Buffer.concat([wrapped.iv, wrapped.tag, wrapped.ct]);
  return ['ab1', ring.currentId, b64(edek), b64(body.iv), b64(body.ct), b64(body.tag)].join('.');
}

export function decryptSecret(sealed: string, ring: MasterKeyRing): string {
  const [version, keyId, edek, iv, ct, tag] = sealed.split('.');
  if (version !== 'ab1' || !keyId || !edek || !iv || !ct || !tag)
    throw new Error('not a sealed secret');
  const master = ring.keys.get(keyId);
  if (!master) throw new Error('unknown master key');
  const wrapped = unb64(edek);
  const dataKey = open(
    master,
    wrapped.subarray(0, 12),
    wrapped.subarray(28),
    wrapped.subarray(12, 28),
  );
  return open(dataKey, unb64(iv), unb64(ct), unb64(tag)).toString('utf8');
}

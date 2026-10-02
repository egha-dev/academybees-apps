import {
  type CryptoKey,
  errors,
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK,
  jwtVerify,
  SignJWT,
} from 'jose';

/**
 * Access tokens (ADR-007, ARCHITECTURE §6.2): EdDSA (Ed25519) JWTs, 15 minutes, claims
 * `sub, sid, aud, ver` plus `tid` for TENANT sessions only (C-32). The signing key set comes from
 * `AUTH_SIGNING_KEYS` (C-64): the `current` key signs, every key verifies, so keys rotate by adding
 * a new key, switching `current`, and removing the old key after the token lifetime.
 */
export type Audience = 'TENANT' | 'CONSOLE' | 'HUB';

export type AccessClaims = {
  /** User id. */
  sub: string;
  /** Session id. */
  sid: string;
  aud: Audience;
  /** Academy, only for TENANT sessions. */
  tid?: string;
  /** Session version (bumped on password change, sign-out everywhere). */
  ver: number;
};

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'academybee';
const AUDIENCE_URN: Record<Audience, string> = {
  TENANT: 'urn:academybee:tenant',
  CONSOLE: 'urn:academybee:console',
  HUB: 'urn:academybee:hub',
};

export type KeyRing = {
  current: string;
  signing: CryptoKey;
  verifying: Map<string, CryptoKey>;
};

/** `{ "current": "k1", "keys": [<Ed25519 private JWK with kid>] }` (the env value). */
export async function loadKeyRing(json: string): Promise<KeyRing> {
  const parsed = JSON.parse(json) as { current?: string; keys?: JWK[] };
  if (!parsed.current || !Array.isArray(parsed.keys) || parsed.keys.length === 0)
    throw new Error('AUTH_SIGNING_KEYS must be { current, keys: [...] }');
  const verifying = new Map<string, CryptoKey>();
  let signing: CryptoKey | undefined;
  for (const jwk of parsed.keys) {
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.kid || !jwk.d)
      throw new Error('AUTH_SIGNING_KEYS entries must be Ed25519 private JWKs with a kid');
    const { d: _d, ...publicJwk } = jwk;
    verifying.set(jwk.kid, (await importJWK(publicJwk, 'EdDSA')) as CryptoKey);
    if (jwk.kid === parsed.current) signing = (await importJWK(jwk, 'EdDSA')) as CryptoKey;
  }
  if (!signing) throw new Error(`AUTH_SIGNING_KEYS has no key with kid "${parsed.current}"`);
  return { current: parsed.current, signing, verifying };
}

/** A fresh key set for `pnpm env:init` and CI (one Ed25519 key). */
export async function generateKeyRingJson(kid = `k${Date.now()}`): Promise<string> {
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const jwk = { ...(await exportJWK(privateKey)), kid, alg: 'EdDSA' };
  return JSON.stringify({ current: kid, keys: [jwk] });
}

export async function signAccessToken(
  claims: AccessClaims,
  keys: KeyRing,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  if ((claims.aud === 'TENANT') !== (claims.tid !== undefined))
    throw new Error('tid is required for TENANT tokens and forbidden otherwise');
  return new SignJWT({
    sid: claims.sid,
    ver: claims.ver,
    ...(claims.tid ? { tid: claims.tid } : {}),
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: keys.current, typ: 'at+jwt' })
    .setSubject(claims.sub)
    .setAudience(AUDIENCE_URN[claims.aud])
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keys.signing);
}

export class AccessTokenError extends Error {
  constructor(readonly reason: 'expired' | 'invalid') {
    super(`access token ${reason}`);
    this.name = 'AccessTokenError';
  }
}

/** Verify signature, issuer, expiry and the expected audience. */
export async function verifyAccessToken(
  token: string,
  keys: KeyRing,
  audience: Audience,
): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(
      token,
      (header) => {
        const key = header.kid ? keys.verifying.get(header.kid) : undefined;
        if (!key) throw new AccessTokenError('invalid');
        return Promise.resolve(key);
      },
      {
        issuer: ISSUER,
        audience: AUDIENCE_URN[audience],
        algorithms: ['EdDSA'],
        typ: 'at+jwt',
        clockTolerance: 30,
      },
    );
    const { sub, sid, ver, tid } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof sid !== 'string' || typeof ver !== 'number')
      throw new AccessTokenError('invalid');
    if ((audience === 'TENANT') !== (typeof tid === 'string'))
      throw new AccessTokenError('invalid');
    return { sub, sid, ver, aud: audience, ...(typeof tid === 'string' ? { tid } : {}) };
  } catch (error) {
    if (error instanceof AccessTokenError) throw error;
    if (error instanceof errors.JWTExpired) throw new AccessTokenError('expired');
    throw new AccessTokenError('invalid');
  }
}

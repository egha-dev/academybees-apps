import { describe, expect, it } from 'vitest';

import {
  AccessTokenError,
  generateKeyRingJson,
  loadKeyRing,
  signAccessToken,
  verifyAccessToken,
} from './jwt.js';

const claims = {
  sub: '01a0fcde-79da-77c3-98c7-694de7df4a7a',
  sid: '01a0fcde-7a82-77e9-a77b-863d765d9ee8',
  aud: 'TENANT' as const,
  tid: '01a0f76f-f6b7-7509-a8c2-25059adb97fb',
  ver: 1,
};

describe('access tokens (EdDSA)', async () => {
  const ring = await loadKeyRing(await generateKeyRingJson('k1'));

  it('signs and verifies claims for the expected audience', async () => {
    const token = await signAccessToken(claims, ring);
    expect(await verifyAccessToken(token, ring, 'TENANT')).toEqual(claims);
  });

  it('rejects the wrong audience (tenant token on the hub or console)', async () => {
    const token = await signAccessToken(claims, ring);
    await expect(verifyAccessToken(token, ring, 'HUB')).rejects.toMatchObject({
      reason: 'invalid',
    });
    await expect(verifyAccessToken(token, ring, 'CONSOLE')).rejects.toBeInstanceOf(
      AccessTokenError,
    );
  });

  it('requires tid exactly for TENANT tokens (C-32)', async () => {
    await expect(signAccessToken({ ...claims, aud: 'HUB' }, ring)).rejects.toThrow(/tid/);
    const { tid: _tid, ...noTid } = claims;
    await expect(signAccessToken(noTid, ring)).rejects.toThrow(/tid/);
    const hub = await signAccessToken({ ...noTid, aud: 'HUB' }, ring);
    expect(await verifyAccessToken(hub, ring, 'HUB')).toEqual({ ...noTid, aud: 'HUB' });
  });

  it('reports expiry separately from tampering', async () => {
    const expired = await signAccessToken(claims, ring, -60);
    await expect(verifyAccessToken(expired, ring, 'TENANT')).rejects.toMatchObject({
      reason: 'expired',
    });
    const token = await signAccessToken(claims, ring);
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), tid: 'other' }),
    ).toString('base64url');
    await expect(verifyAccessToken(`${h}.${forged}.${s}`, ring, 'TENANT')).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('rejects tokens from an unknown key and accepts old keys during rotation', async () => {
    const other = await loadKeyRing(await generateKeyRingJson('k9'));
    const foreign = await signAccessToken(claims, other);
    await expect(verifyAccessToken(foreign, ring, 'TENANT')).rejects.toMatchObject({
      reason: 'invalid',
    });

    const oldJson = JSON.parse(await generateKeyRingJson('old')) as { keys: unknown[] };
    const newJson = JSON.parse(await generateKeyRingJson('new')) as { keys: unknown[] };
    const before = await loadKeyRing(JSON.stringify({ current: 'old', keys: oldJson.keys }));
    const after = await loadKeyRing(
      JSON.stringify({ current: 'new', keys: [...newJson.keys, ...oldJson.keys] }),
    );
    const issuedBefore = await signAccessToken(claims, before);
    expect((await verifyAccessToken(issuedBefore, after, 'TENANT')).sub).toBe(claims.sub);
  });

  it('refuses a malformed key set', async () => {
    await expect(loadKeyRing('{"current":"x","keys":[]}')).rejects.toThrow();
    await expect(
      loadKeyRing(JSON.stringify({ current: 'x', keys: [{ kty: 'oct', k: 'abc', kid: 'x' }] })),
    ).rejects.toThrow(/Ed25519/);
  });
});

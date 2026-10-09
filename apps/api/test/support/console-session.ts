import {
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  loadMasterKeys,
  totpCode,
} from '@academybee/auth';
import { newId } from '@academybee/contracts';
import { FIXTURE_PASSWORD } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { expect } from 'vitest';

import { testConfig } from './test-app.js';

export const CONSOLE_HOST = 'console.localhost';

export type ConsoleSession = { cookie: string; csrf: string; email: string; userId: string };

/**
 * Platform staff with a confirmed TOTP factor (C-66), signed in on the console host. Created
 * directly in the database (the CLI + enrolment flow is covered by hub-console.int.spec.ts).
 */
export async function consoleSession(
  app: INestApplication,
  superuserUrl: string,
  role: 'SUPER_ADMIN' | 'SUPPORT' | 'FINANCE_OPS' = 'SUPER_ADMIN',
): Promise<ConsoleSession> {
  const userId = newId();
  const email = `staff-${userId.slice(-12)}@academybees.test`;
  const secret = generateTotpSecret();
  const keys = loadMasterKeys(testConfig().SECRETS_MASTER_KEY);
  const su = new pg.Client({ connectionString: superuserUrl });
  await su.connect();
  try {
    await su.query(
      `INSERT INTO "user" (id, email, name, email_verified_at, updated_at) VALUES ($1, $2, 'Console Staff', now(), now())`,
      [userId, email],
    );
    await su.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [userId, await hashPassword(FIXTURE_PASSWORD)],
    );
    await su.query(
      `INSERT INTO platform_staff (user_id, platform_role, updated_at) VALUES ($1, $2, now())`,
      [userId, role],
    );
    await su.query(
      `INSERT INTO mfa_factor (id, user_id, type, secret_encrypted, confirmed_at) VALUES ($1, $2, 'TOTP', $3, now())`,
      [newId(), userId, encryptSecret(secret, keys)],
    );
  } finally {
    await su.end();
  }
  const http = () => request(app.getHttpServer());
  const login = await http()
    .post('/api/v1/auth/login')
    .set('Host', CONSOLE_HOST)
    .send({ identifier: email, password: FIXTURE_PASSWORD });
  expect(login.body.mfa?.step, 'console sign-in asks for the code').toBe('verify');
  const verified = await http()
    .post('/api/v1/auth/mfa/verify')
    .set('Host', CONSOLE_HOST)
    .send({ token: login.body.mfa.token as string, code: totpCode(secret) });
  expect(verified.status, 'console second factor').toBe(200);
  const pairs = ([] as string[])
    .concat(verified.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0]!);
  return {
    cookie: pairs.join('; '),
    csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    email,
    userId,
  };
}

import { newId, ROLE_TEMPLATES, type RoleKey } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp } from '../support/test-app.js';

/**
 * Fee plans, fee assignments and Settings → Payments (Phase 7 S2; PRD v2 §19, G-04, ADR-038,
 * C-139…C-143): who may do what, the rules on assignments, and another academy's records.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));

describe('fees and payment settings', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let accountant: Session;
  let reception: Session;
  const http = () => request(app.getHttpServer());

  async function signIn(t: TenantFixture, email: string): Promise<Session> {
    const host = `${t.slug}.localhost`;
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}`).toBe(200);
    const pairs = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0]!);
    return {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
  }
  const get = (s: Session, path: string) =>
    http().get(`/api/v1${path}`).set('Host', s.host).set('Cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'patch', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);
  const plan = (name = 'Monthly tuition') => ({
    name,
    cycle: 'MONTHLY',
    components: [
      { name: 'Tuition', amountMinor: 250_000 },
      { name: 'Materials', amountMinor: 20_000, taxable: false },
    ],
  });
  async function student(name: string, status = 'ACTIVE') {
    const id = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, status,
         updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, now())`,
      [id, a.id, a.branchId, name, `FEE-${id.slice(-6)}`, status],
    );
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Fees Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Fees Academy', plan: 'pro' }),
    ]);
    for (const key of ['accountant', 'receptionist'] as const)
      await addMemberFixture(urls.migrator, a.id, {
        email: `${key}-${a.slug}@example.test`,
        roleKey: key,
        grants: templateGrants(key),
      });
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    owner = await signIn(a, a.user.email);
    accountant = await signIn(a, `accountant-${a.slug}@example.test`);
    reception = await signIn(a, `receptionist-${a.slug}@example.test`);
  });

  it('fee plans: create, read, change from a version, archive; reception reads only', async () => {
    const made = await send(accountant, 'post', '/fee-plans', plan());
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({
      name: 'Monthly tuition',
      cycle: 'MONTHLY',
      cycleMonths: null,
      totalMinor: 270_000,
      assignedCount: 0,
      version: 1,
    });
    expect((made.body.components as { name: string }[]).map((c) => c.name)).toEqual([
      'Tuition',
      'Materials',
    ]);
    const id = made.body.id as string;
    expect((await get(reception, `/fee-plans/${id}`)).status).toBe(200);
    expect((await send(reception, 'post', '/fee-plans', plan('Nope'))).status).toBe(403);

    const changed = await send(owner, 'patch', `/fee-plans/${id}`, {
      version: 1,
      cycle: 'CUSTOM',
      cycleMonths: 2,
      components: [{ name: 'Tuition', amountMinor: 480_000 }],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({ cycle: 'CUSTOM', cycleMonths: 2, totalMinor: 480_000 });
    const stale = await send(owner, 'patch', `/fee-plans/${id}`, { version: 1, name: 'Stale' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const noMonths = await send(owner, 'patch', `/fee-plans/${id}`, {
      version: 2,
      cycle: 'CUSTOM',
      cycleMonths: null,
    });
    expect(noMonths.status).toBe(400);

    await send(owner, 'patch', `/fee-plans/${id}`, { version: 2, status: 'ARCHIVED' });
    const active = (await get(owner, '/fee-plans')).body.items as { id: string }[];
    const archived = (await get(owner, '/fee-plans?status=ARCHIVED')).body.items as {
      id: string;
    }[];
    expect(active.some((p) => p.id === id)).toBe(false);
    expect(archived.some((p) => p.id === id)).toBe(true);
  });

  it('assignments: listed students or a whole batch; never twice on one plan; active students only', async () => {
    const p = (await send(owner, 'post', '/fee-plans', plan('Assign plan'))).body as { id: string };
    const s1 = await student('Fee Student One');
    const left = await student('Fee Student Left', 'LEFT');

    const one = await send(accountant, 'post', '/fee-assignments', {
      planId: p.id,
      studentIds: [s1],
      startsOn: '2026-11-01',
      discount: { kind: 'PERCENT', value: 1000 },
      discountReason: 'Scholarship',
      instalments: 3,
    });
    expect(one.status, JSON.stringify(one.body)).toBe(201);
    expect(one.body.items).toEqual([
      expect.objectContaining({
        studentId: s1,
        studentName: 'Fee Student One',
        planName: 'Assign plan',
        startsOn: '2026-11-01',
        endsOn: null,
        discount: { kind: 'PERCENT', value: 1000 },
        instalments: 3,
        status: 'ACTIVE',
      }),
    ]);

    // The batch's roster on the start date: the fixture's enrolled student.
    const batch = await send(owner, 'post', '/fee-assignments', {
      planId: p.id,
      batchId: a.people.batchId,
      startsOn: '2026-12-01',
    });
    expect(batch.status, JSON.stringify(batch.body)).toBe(201);
    expect((batch.body.items as { studentId: string }[]).map((x) => x.studentId)).toEqual([
      a.people.studentId,
    ]);
    expect((await get(owner, `/fee-plans/${p.id}`)).body.assignedCount).toBe(2);

    const twice = await send(owner, 'post', '/fee-assignments', {
      planId: p.id,
      studentIds: [s1],
      startsOn: '2027-01-01',
    });
    expect(twice.status).toBe(409);
    expect(twice.body.error.details).toEqual([
      { path: `studentIds.${s1}`, issue: 'already_assigned' },
    ]);
    // After it ends, the same plan can start again.
    const assignment = one.body.items[0] as { id: string };
    const ended = await send(owner, 'patch', `/fee-assignments/${assignment.id}`, {
      version: 1,
      endsOn: '2026-12-31',
    });
    expect(ended.status, JSON.stringify(ended.body)).toBe(200);
    expect(
      (
        await send(owner, 'post', '/fee-assignments', {
          planId: p.id,
          studentIds: [s1],
          startsOn: '2027-01-01',
        })
      ).status,
    ).toBe(201);

    const gone = await send(owner, 'post', '/fee-assignments', {
      planId: p.id,
      studentIds: [left],
      startsOn: '2026-11-01',
    });
    expect(gone.status).toBe(409);
    expect(gone.body.error.details).toEqual([
      { path: `studentIds.${left}`, issue: 'student_inactive' },
    ]);
    expect(
      (
        await send(reception, 'post', '/fee-assignments', {
          planId: p.id,
          studentIds: [s1],
          startsOn: '2026-11-01',
        })
      ).status,
    ).toBe(403);
    const listed = await get(reception, `/fee-assignments?studentId=${s1}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(2);
    expect((await get(owner, '/fee-assignments')).status).toBe(400); // a filter is required
  });

  it('settings → payments: defaults, UPI preview, validation, owner only, prefixes lock once used', async () => {
    const first = await get(accountant, '/settings/finance');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      settings: { upi: null, tax: null, prefixes: { INVOICE: 'INV', RECEIPT: 'RCT' } },
      upiPreview: null,
      gateway: { connected: false, provider: null },
      prefixesLocked: { INVOICE: false, RECEIPT: false },
    });
    const version = first.body.version as number;
    const upi = { vpa: 'Fees.Academy@OKHDFC', payeeName: 'Fees Academy' };
    expect((await send(accountant, 'patch', '/settings/finance', { version, upi })).status).toBe(
      403,
    );
    expect(
      (await send(owner, 'patch', '/settings/finance', { version, upi: { ...upi, vpa: 'nope' } }))
        .status,
    ).toBe(400);
    const saved = await send(owner, 'patch', '/settings/finance', {
      version,
      upi,
      tax: { gstin: '29abcde1234f1z5', rateBps: 1800, mode: 'EXCLUSIVE' },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.settings.upi).toEqual({
      vpa: 'fees.academy@okhdfc',
      payeeName: 'Fees Academy',
    });
    expect(saved.body.settings.tax).toEqual({
      gstin: '29ABCDE1234F1Z5',
      rateBps: 1800,
      mode: 'EXCLUSIVE',
      label: 'GST',
    });
    expect(saved.body.upiPreview).toBe(
      'upi://pay?pa=fees.academy%40okhdfc&pn=Fees%20Academy&cu=INR',
    );
    // Untouched sections keep their values; a stale version is a conflict.
    expect(saved.body.settings.methods.CHEQUE).toBe(true);
    expect((await send(owner, 'patch', '/settings/finance', { version, upi })).status).toBe(409);

    // An invoice number taken this fiscal year locks the invoice prefix (C-142).
    const { rows } = await su.query<{ fy: string }>(
      `SELECT CASE WHEN extract(month FROM now() AT TIME ZONE 'Asia/Kolkata') >= 4
                   THEN to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' ||
                        to_char((now() AT TIME ZONE 'Asia/Kolkata') + interval '1 year', 'YY')
                   ELSE to_char((now() AT TIME ZONE 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' ||
                        to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YY') END AS fy`,
    );
    await su.query(
      `INSERT INTO number_sequence (tenant_id, kind, fiscal_year, prefix, last_value, updated_at)
       VALUES ($1, 'INVOICE', $2, 'INV', 1, now())`,
      [a.id, rows[0]!.fy],
    );
    const now = await get(owner, '/settings/finance');
    expect(now.body.prefixesLocked).toEqual({ INVOICE: true, RECEIPT: false });
    const prefix = await send(owner, 'patch', '/settings/finance', {
      version: now.body.version,
      prefixes: { INVOICE: 'FEE', RECEIPT: 'REC' },
    });
    expect(prefix.status).toBe(409);
    expect(prefix.body.error.details).toEqual([
      { path: 'prefixes.INVOICE', issue: 'prefix_in_use' },
    ]);
    const receiptOnly = await send(owner, 'patch', '/settings/finance', {
      version: now.body.version,
      prefixes: { INVOICE: 'INV', RECEIPT: 'REC' },
    });
    expect(receiptOnly.status, JSON.stringify(receiptOnly.body)).toBe(200);
  });

  it('another academy’s plans, assignments and settings are out of reach', async () => {
    const otherOwner = await signIn(b, b.user.email);
    // B's plan and assignment from A: 404, read or change.
    expect((await get(owner, `/fee-plans/${b.people.feePlanId}`)).status).toBe(404);
    expect(
      (await send(owner, 'patch', `/fee-plans/${b.people.feePlanId}`, { version: 1, name: 'X' }))
        .status,
    ).toBe(404);
    expect((await get(owner, `/fee-assignments/${b.people.feeAssignmentId}`)).status).toBe(404);
    expect(
      (
        await send(owner, 'patch', `/fee-assignments/${b.people.feeAssignmentId}`, {
          version: 1,
          endsOn: '2020-01-15',
        })
      ).status,
    ).toBe(404);
    // Assigning with B's plan or B's student: 404; B's batch: 404.
    const mine = (await send(owner, 'post', '/fee-plans', plan('Mine'))).body as { id: string };
    for (const body of [
      { planId: b.people.feePlanId, studentIds: [a.people.studentId], startsOn: '2026-11-01' },
      { planId: mine.id, studentIds: [b.people.studentId], startsOn: '2026-11-01' },
      { planId: mine.id, batchId: b.people.batchId, startsOn: '2026-11-01' },
    ])
      expect((await send(owner, 'post', '/fee-assignments', body)).status).toBe(404);
    // B's lists never show A's records; A's settings change leaves B's alone.
    const theirs = (await get(otherOwner, '/fee-plans')).body.items as { id: string }[];
    expect(theirs.some((p) => p.id === mine.id)).toBe(false);
    expect((await get(otherOwner, '/settings/finance')).body.settings.upi).toBeNull();
  });
});

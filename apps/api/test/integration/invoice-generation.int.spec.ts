import { newId, ROLE_TEMPLATES } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { FinanceDailyProcessor } from '../../src/modules/finance/finance-daily.processor.js';
import type { FinanceDailyJob } from '../../src/modules/finance/finance-daily.queue.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Billing fee assignments (Phase 7 S3b; G-04, C-139, C-140, C-147), on a fixed date far from the
 * fixtures: each cycle billed once, cancelled stays cancelled, pause, mid-cycle rules, siblings,
 * instalments.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
type Row = {
  id: string;
  kind: string;
  status: string;
  number: string | null;
  total_minor: number;
  discount_minor: number;
  due_date: string;
  cycle_start: string;
  cycle_end: string;
  instalment_no: number | null;
  instalment_of: number | null;
  note: string | null;
  version: number;
};
/** 3 June 2030, morning in India: June is running, July is not yet within 5 days. */
const JUNE = new Date('2030-06-03T04:00:00Z');
const POLICY = {
  midCycle: 'FULL',
  sibling: null,
  autoApplyCredit: true,
  lateFee: null,
  generateDaysBefore: 5,
  dueDay: 10,
};

describe('invoice generation', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let plan: string;
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
  const get = (path: string) =>
    http().get(`/api/v1${path}`).set('Host', owner.host).set('Cookie', owner.cookie);
  const send = (method: 'post' | 'patch', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', owner.host)
      .set('Cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);

  async function newStudent(status = 'ACTIVE', admitted = '2030-01-01') {
    const id = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, status, updated_at)
       VALUES ($1, $2, $3, 'Billed Student', $4, $5, $6, now())`,
      [id, a.id, a.branchId, `GEN-${id.slice(-8)}`, admitted, status],
    );
    return id;
  }
  async function newPlan(cycle: string, amounts = [100_000]) {
    const res = await send('post', '/fee-plans', {
      name: `Plan ${newId().slice(-6)}`,
      cycle,
      components: amounts.map((amountMinor, i) => ({
        name: `Part ${i + 1}`,
        amountMinor,
        taxable: false,
      })),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { id: string }).id;
  }
  async function assign(studentId: string, over: object = {}, planId = plan) {
    const res = await send('post', '/fee-assignments', {
      planId,
      studentIds: [studentId],
      startsOn: '2030-01-01',
      ...over,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { items: { id: string }[] }).items[0]!.id;
  }
  async function setPolicy(change: object = {}) {
    const { version } = (await get('/settings/finance')).body as { version: number };
    const res = await send('patch', '/settings/finance', {
      version,
      policy: { ...POLICY, ...change },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  const run = (now = JUNE, tenantId = a.id) =>
    app.get(FinanceDailyProcessor).process({ data: { tenantId } } as Job<FinanceDailyJob>, now);
  const invoicesOf = async (studentId: string) =>
    (
      await su.query<Row>(
        'SELECT * FROM invoice WHERE student_id = $1 ORDER BY cycle_start, instalment_no, id',
        [studentId],
      )
    ).rows;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    // Calendar dates stay text: the machine's timezone must not move them.
    su.setTypeParser(1082, (v: string) => v);
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Billing Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Billing Academy', plan: 'pro' }),
    ]);
    await addMemberFixture(urls.migrator, a.id, {
      email: `accountant-${a.slug}@example.test`,
      roleKey: 'accountant',
      grants: Object.entries(ROLE_TEMPLATES.accountant.grants).map(([capability, scope]) => ({
        capability,
        scope,
      })),
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
    plan ??= await newPlan('MONTHLY');
    await setPolicy();
  });

  it('bills a running cycle once, however many times it runs', async () => {
    const student = await newStudent();
    await assign(student);
    expect((await run()).failed).toBe(0);
    await run();
    await run();
    const rows = await invoicesOf(student);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'REGULAR', status: 'ISSUED', total_minor: 100_000 });
    expect(rows[0]!.number).toMatch(/^INV\//);
    expect(rows[0]!.cycle_start).toBe('2030-06-01');
    expect(rows[0]!.cycle_end).toBe('2030-06-30');
    expect(rows[0]!.due_date).toBe('2030-06-10');
  });

  it('bills the next cycle from 5 days before, and never past cycles', async () => {
    const student = await newStudent();
    await assign(student);
    await run(new Date('2030-06-27T04:00:00Z'));
    await run(new Date('2030-06-28T04:00:00Z'));
    const rows = await invoicesOf(student);
    // Assigned since January: only June (running) and July (starts within 5 days).
    expect(rows.map((r) => r.cycle_start)).toEqual(['2030-06-01', '2030-07-01']);
  });

  it('does not make a cancelled invoice again', async () => {
    const student = await newStudent();
    await assign(student);
    await run();
    const [invoice] = await invoicesOf(student);
    const res = await send('post', `/invoices/${invoice!.id}/cancel`, {
      version: invoice!.version,
      reason: 'Billed by mistake',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await run();
    const rows = await invoicesOf(student);
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED']);
  });

  it('skips students on hold or gone, and ended or archived assignments', async () => {
    const held = await newStudent();
    const left = await newStudent();
    const ended = await newStudent();
    const archived = await newStudent();
    await assign(ended, { endsOn: '2030-05-31' });
    const id = await assign(archived);
    for (const s of [held, left]) await assign(s);
    await su.query(`UPDATE student SET status = 'ON_HOLD' WHERE id = $1`, [held]);
    await su.query(`UPDATE student SET status = 'LEFT' WHERE id = $1`, [left]);
    const res = await send('patch', `/fee-assignments/${id}`, { version: 1, status: 'ARCHIVED' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await run();
    for (const s of [held, left, ended, archived]) expect(await invoicesOf(s)).toEqual([]);
  });

  it('applies each mid-cycle rule to a joiner', async () => {
    const joined = { startsOn: '2030-06-16' };
    const full = await newStudent();
    await assign(full, joined);
    await run();
    expect((await invoicesOf(full))[0]).toMatchObject({ total_minor: 100_000, note: null });
    expect((await invoicesOf(full))[0]!.due_date).toBe('2030-06-16');

    await setPolicy({ midCycle: 'PRORATE_DAYS' });
    const days = await newStudent();
    await assign(days, joined);
    await run();
    const [prorated] = await invoicesOf(days);
    expect(prorated).toMatchObject({ total_minor: 50_000 });
    expect(prorated!.note).toContain('15');

    await setPolicy({ midCycle: 'NEXT_CYCLE' });
    const next = await newStudent();
    await assign(next, joined);
    await run();
    expect(await invoicesOf(next)).toEqual([]);
    await run(new Date('2030-06-28T04:00:00Z'));
    expect((await invoicesOf(next)).map((r) => r.cycle_start)).toEqual(['2030-07-01']);
  });

  it('prorates by the classes the batch’s weekly pattern gives', async () => {
    await setPolicy({ midCycle: 'PRORATE_SESSIONS' });
    const batchId = newId();
    await su.query(
      `INSERT INTO batch (id, tenant_id, branch_id, course_id, name, updated_at)
       SELECT $1, tenant_id, branch_id, course_id, 'Mondays', now() FROM batch WHERE id = $2`,
      [batchId, a.people.batchId],
    );
    await su.query(
      `INSERT INTO schedule_rule (id, tenant_id, batch_id, weekday, start_minute, end_minute, effective_from, updated_at)
       VALUES ($1, $2, $3, 1, 1020, 1080, '2030-01-01', now())`,
      [newId(), a.id, batchId],
    );
    const student = await newStudent();
    // June 2030 has Mondays on 3, 10, 17, 24: joining on the 8th uses 3 of 4.
    await assign(student, { startsOn: '2030-06-08', batchId });
    await run();
    expect((await invoicesOf(student))[0]).toMatchObject({ total_minor: 75_000 });
    // No batch: falls back to days.
    const noBatch = await newStudent();
    await assign(noBatch, { startsOn: '2030-06-16' });
    await run();
    expect((await invoicesOf(noBatch))[0]).toMatchObject({ total_minor: 50_000 });
  });

  it('treats a student back from a pause mid-cycle as a joiner', async () => {
    await setPolicy({ midCycle: 'PRORATE_DAYS' });
    const student = await newStudent();
    await assign(student);
    await su.query(`UPDATE student SET status_changed_on = '2030-06-16' WHERE id = $1`, [student]);
    await run();
    expect((await invoicesOf(student))[0]).toMatchObject({ total_minor: 50_000 });
  });

  it('gives the sibling discount to the second child only', async () => {
    await setPolicy({ sibling: { kind: 'PERCENT', value: 1000 } });
    const elder = await newStudent('ACTIVE', '2029-04-01');
    const younger = await newStudent('ACTIVE', '2029-06-01');
    const parent = newId();
    await su.query(
      `INSERT INTO parent (id, tenant_id, full_name, updated_at) VALUES ($1, $2, 'One Parent', now())`,
      [parent, a.id],
    );
    for (const s of [elder, younger])
      await su.query(
        `INSERT INTO parent_student (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
         VALUES ($1, $2, $3, $4, 'MOTHER', true)`,
        [newId(), a.id, parent, s],
      );
    await assign(elder);
    await assign(younger);
    await run();
    expect((await invoicesOf(elder))[0]).toMatchObject({ total_minor: 100_000, discount_minor: 0 });
    const [second] = await invoicesOf(younger);
    expect(second).toMatchObject({ total_minor: 90_000, discount_minor: 10_000 });
    const lines = await su.query<{ label: string; amount_minor: number }>(
      `SELECT label, amount_minor FROM invoice_line WHERE invoice_id = $1 AND kind = 'DISCOUNT'`,
      [second!.id],
    );
    expect(lines.rows).toEqual([{ label: 'Sibling discount', amount_minor: -10_000 }]);
  });

  it('splits a cycle into instalments that add up, once', async () => {
    const quarterly = await newPlan('QUARTERLY', [100_000]);
    const student = await newStudent();
    await assign(
      student,
      { instalments: 3, discount: { kind: 'FIXED', value: 10_000 }, discountReason: 'Scholarship' },
      quarterly,
    );
    await run(new Date('2030-04-02T04:00:00Z'));
    await run(new Date('2030-04-02T04:00:00Z'));
    const rows = await invoicesOf(student);
    expect(rows.map((r) => r.kind)).toEqual(['INSTALMENT', 'INSTALMENT', 'INSTALMENT']);
    expect(rows.map((r) => r.instalment_no)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.instalment_of === 3)).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.total_minor, 0)).toBe(90_000);
    expect(rows.map((r) => r.due_date)).toEqual(['2030-04-10', '2030-05-10', '2030-06-10']);
    expect(new Set(rows.map((r) => r.number)).size).toBe(3);
  });

  it('applies the student’s credit when billing', async () => {
    const student = await newStudent();
    await su.query(
      `INSERT INTO credit_entry (id, tenant_id, student_id, kind, amount_minor) VALUES ($1, $2, $3, 'MANUAL', 30000)`,
      [newId(), a.id, student],
    );
    await assign(student);
    await run();
    expect((await invoicesOf(student))[0]).toMatchObject({
      status: 'PARTIALLY_PAID',
      credit_applied_minor: 30_000,
    });
  });

  describe('transfer and status effects (G-27)', () => {
    const NOV = '2030-06-16';
    it('shows what a change does before anyone confirms', async () => {
      const student = await newStudent();
      const id = await assign(student, { batchId: a.people.batchId });
      await run();
      const effects = async (query: string) =>
        (await get(`/fee-assignments/effects?studentId=${student}&date=${NOV}&${query}`)).body as {
          openBalanceMinor: number;
          creditMinor: number;
          items: {
            assignmentId: string;
            effect: string;
            nextCycleStart: string;
            billedMinor: number;
            unusedMinor: number;
          }[];
        };
      const hold = await effects('change=ON_HOLD');
      expect(hold.openBalanceMinor).toBe(100_000);
      expect(hold.items).toEqual([
        expect.objectContaining({
          assignmentId: id,
          effect: 'PAUSES',
          nextCycleStart: '2030-07-01',
          billedMinor: 100_000,
          unusedMinor: 50_000,
        }),
      ]);
      expect((await effects('change=LEFT')).items[0]!.effect).toBe('STOPS');
      expect((await effects('change=ACTIVE')).items[0]!.effect).toBe('RESUMES');
      expect(
        (await effects(`change=TRANSFER&fromBatchId=${a.people.batchId}`)).items[0]!.effect,
      ).toBe('SWITCHABLE');
      expect((await effects(`change=TRANSFER&fromBatchId=${newId()}`)).items[0]!.effect).toBe(
        'UNCHANGED',
      );
      const missing = await get(`/fee-assignments/effects?studentId=${student}&change=TRANSFER`);
      expect(missing.status).toBe(400);
    });

    it('a status change records its date, and pauses from the next cycle', async () => {
      const student = await newStudent();
      await assign(student);
      await run();
      const { version } = (await get(`/students/${student}`)).body as { version: number };
      const res = await send('post', `/students/${student}/status`, {
        version,
        status: 'ON_HOLD',
        reason: 'Family travel',
      });
      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
      const row = await su.query<{ status_changed_on: string | null }>(
        'SELECT status_changed_on FROM student WHERE id = $1',
        [student],
      );
      expect(row.rows[0]!.status_changed_on).not.toBeNull();
      await run(new Date('2030-06-28T04:00:00Z'));
      // June, billed before the pause, stands; July is not billed.
      expect((await invoicesOf(student)).map((r) => r.cycle_start)).toEqual(['2030-06-01']);
    });

    it('moves a fee from the next cycle, with nothing billed twice', async () => {
      const dearer = await newPlan('MONTHLY', [150_000]);
      const student = await newStudent();
      const id = await assign(student, { discount: { kind: 'PERCENT', value: 1000 } });
      await run();
      const res = await send('post', `/fee-assignments/${id}/switch`, {
        version: 1,
        toPlanId: dearer,
        date: NOV,
        mode: 'NEXT_CYCLE',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({
        creditedMinor: 0,
        assignment: {
          startsOn: '2030-07-01',
          planId: dearer,
          discount: { kind: 'PERCENT', value: 1000 },
        },
      });
      await run(new Date('2030-06-28T04:00:00Z'));
      const rows = await invoicesOf(student);
      expect(rows.map((r) => [r.cycle_start, r.total_minor])).toEqual([
        ['2030-06-01', 90_000],
        ['2030-07-01', 135_000],
      ]);
    });

    it('prorating credits the unused share once, and bills the new plan by the rule', async () => {
      await setPolicy({ midCycle: 'PRORATE_DAYS' });
      const other = await newPlan('MONTHLY', [200_000]);
      const student = await newStudent();
      const id = await assign(student);
      await run();
      const res = await send('post', `/fee-assignments/${id}/switch`, {
        version: 1,
        toPlanId: other,
        date: NOV,
        mode: 'PRORATE',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ creditedMinor: 50_000 });
      const credit = await su.query<{ sum: string }>(
        'SELECT sum(amount_minor) FROM credit_entry WHERE student_id = $1',
        [student],
      );
      expect(Number(credit.rows[0]!.sum)).toBe(50_000);
      const again = await send('post', `/fee-assignments/${id}/switch`, {
        version: 2,
        toPlanId: other,
        date: '2030-06-20',
        mode: 'PRORATE',
      });
      expect(again.status).toBe(409);
      await run(new Date('2030-06-17T04:00:00Z'));
      // The new plan's half of June, less the credit from the old one.
      const rows = await invoicesOf(student);
      expect(rows.map((r) => r.total_minor)).toEqual([100_000, 100_000]);
      expect(rows[1]).toMatchObject({ credit_applied_minor: 50_000 });
    });

    it('refuses a switch when a later cycle is already billed', async () => {
      const other = await newPlan('MONTHLY', [200_000]);
      const student = await newStudent();
      const id = await assign(student);
      await run(new Date('2030-06-28T04:00:00Z'));
      const res = await send('post', `/fee-assignments/${id}/switch`, {
        version: 1,
        toPlanId: other,
        date: NOV,
        mode: 'NEXT_CYCLE',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.details[0].issue).toBe('later_cycle_billed');
    });
  });

  it('runs only for the academy it was given, and not for one that is closed', async () => {
    const count = async () =>
      Number(
        (
          await su.query<{ n: string }>('SELECT count(*) AS n FROM invoice WHERE tenant_id = $1', [
            b.id,
          ])
        ).rows[0]!.n,
      );
    const before = await count();
    await su.query(
      `INSERT INTO fee_assignment (id, tenant_id, branch_id, student_id, plan_id, starts_on, created_by_id, updated_at)
       SELECT $1, tenant_id, branch_id, student_id, plan_id, '2030-01-01', created_by_id, now()
         FROM fee_assignment WHERE id = $2`,
      [newId(), b.people.feeAssignmentId],
    );
    await run();
    expect(await count()).toBe(before);
    await su.query(`UPDATE tenant SET status = 'SUSPENDED' WHERE id = $1`, [b.id]);
    expect(await run(JUNE, b.id)).toEqual({ overdue: 0, generated: 0, failed: 0 });
    expect(await count()).toBe(before);
  });
});

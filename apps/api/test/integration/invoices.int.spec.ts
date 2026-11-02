import { addDays, localDate, newId, ROLE_TEMPLATES, type RoleKey } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type Grant,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { fiscalYearOf } from '../../src/modules/finance/domain/numbering.js';
import { FinanceDailyProcessor } from '../../src/modules/finance/finance-daily.processor.js';
import type { FinanceDailyJob } from '../../src/modules/finance/finance-daily.queue.js';
import { createTestApp } from '../support/test-app.js';

/**
 * Invoices (Phase 7 S3; ARCHITECTURE §12.1, C-140…C-143): drafts, issue with numbering and
 * credit, cancel, write-off, overdue and late fees; who may; another academy.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
type Inv = {
  id: string;
  number: string | null;
  status: string;
  version: number;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  creditAppliedMinor: number;
  writtenOffMinor: number;
  balanceMinor: number;
  overdue: boolean;
  lines: { kind: string; label: string; amountMinor: number; quantity: number }[];
};
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');

describe('invoices', () => {
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
  const send = (
    s: Session,
    method: 'post' | 'patch' | 'delete',
    path: string,
    body: unknown = {},
    key: string = crypto.randomUUID(),
  ) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', key)
      .send(body as object);
  async function newStudent() {
    const id = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, updated_at)
       VALUES ($1, $2, $3, 'Invoice Student', $4, CURRENT_DATE, now())`,
      [id, a.id, a.branchId, `INV-${id.slice(-8)}`],
    );
    return id;
  }
  const invoiceFor = (studentId: string, over: object = {}) => ({
    studentId,
    dueDate: addDays(today(), 10),
    charges: [{ label: 'Admission fee', amountMinor: 100_000 }],
    ...over,
  });
  async function issued(studentId: string, over: object = {}): Promise<Inv> {
    const res = await send(
      owner,
      'post',
      '/invoices',
      invoiceFor(studentId, { issue: true, ...over }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Inv;
  }
  async function setSettings(change: object) {
    const { version } = (await get(owner, '/settings/finance')).body as { version: number };
    const res = await send(owner, 'patch', '/settings/finance', { version, ...change });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  const giveCredit = (studentId: string, minor: number) =>
    su.query(
      `INSERT INTO credit_entry (id, tenant_id, student_id, kind, amount_minor) VALUES ($1, $2, $3, 'MANUAL', $4)`,
      [newId(), a.id, studentId, minor],
    );
  const creditOf = async (studentId: string) =>
    Number(
      (
        await su.query<{ sum: string | null }>(
          'SELECT sum(amount_minor) FROM credit_entry WHERE student_id = $1',
          [studentId],
        )
      ).rows[0]!.sum ?? 0,
    );

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Invoice Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Invoice Academy', plan: 'pro' }),
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

  it('a draft changes freely and has no number; issuing numbers it and freezes it', async () => {
    const student = await newStudent();
    const draft = await send(
      accountant,
      'post',
      '/invoices',
      invoiceFor(student, {
        charges: [{ label: 'Kit', amountMinor: 50_000, quantity: 2 }],
        discounts: [{ label: 'Scholarship', amountMinor: 10_000 }],
      }),
    );
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const d = draft.body as Inv;
    expect(d).toMatchObject({ status: 'DRAFT', number: null, totalMinor: 90_000, version: 1 });
    const edited = await send(accountant, 'patch', `/invoices/${d.id}`, {
      version: 1,
      charges: [{ label: 'Kit', amountMinor: 60_000, quantity: 2 }],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    // Discounts not sent stay; the totals follow.
    expect(edited.body).toMatchObject({ totalMinor: 110_000, discountMinor: 10_000, version: 2 });
    expect(
      (await send(accountant, 'patch', `/invoices/${d.id}`, { version: 1, note: 'Stale' })).status,
    ).toBe(409);

    const res = await send(accountant, 'post', `/invoices/${d.id}/issue`, { version: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const inv = res.body as Inv;
    expect(inv.status).toBe('ISSUED');
    expect(inv.number).toMatch(new RegExp(`^INV/${fiscalYearOf(today())}/\\d{5}$`));
    // One set of lines (never duplicated by the recompute), and they add up to the total.
    expect(inv.lines.map((l) => [l.kind, l.quantity, l.amountMinor])).toEqual([
      ['CHARGE', 2, 120_000],
      ['DISCOUNT', 1, -10_000],
    ]);
    // Issued: it can't be edited or deleted, by the service or the database.
    expect(
      (await send(accountant, 'patch', `/invoices/${d.id}`, { version: 3, note: 'No' })).status,
    ).toBe(409);
    expect((await send(accountant, 'delete', `/invoices/${d.id}?version=3`)).status).toBe(409);
    expect((await send(accountant, 'post', `/invoices/${d.id}/issue`, { version: 3 })).status).toBe(
      409,
    );
    const { rows } = await su.query<{ snapshot: { student: { name: string } } }>(
      'SELECT snapshot FROM invoice WHERE id = $1',
      [d.id],
    );
    expect(rows[0]!.snapshot.student.name).toBe('Invoice Student');
  });

  it('a draft can be deleted; replaying an issue with its key does not take a second number', async () => {
    const student = await newStudent();
    const d = (await send(owner, 'post', '/invoices', invoiceFor(student))).body as Inv;
    expect((await send(owner, 'delete', `/invoices/${d.id}?version=1`)).status).toBe(204);
    expect((await get(owner, `/invoices/${d.id}`)).status).toBe(404);

    const again = (await send(owner, 'post', '/invoices', invoiceFor(student))).body as Inv;
    const key = crypto.randomUUID();
    const first = await send(owner, 'post', `/invoices/${again.id}/issue`, { version: 1 }, key);
    const replay = await send(owner, 'post', `/invoices/${again.id}/issue`, { version: 1 }, key);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(replay.status).toBe(200);
    expect((replay.body as Inv).number).toBe((first.body as Inv).number);
  });

  it('numbers never repeat when many invoices are issued at once', async () => {
    const student = await newStudent();
    const drafts = await Promise.all(
      Array.from({ length: 12 }, () => send(owner, 'post', '/invoices', invoiceFor(student))),
    );
    const res = await Promise.all(
      drafts.map((d) =>
        send(owner, 'post', `/invoices/${(d.body as Inv).id}/issue`, { version: 1 }),
      ),
    );
    for (const r of res) expect(r.status, JSON.stringify(r.body)).toBe(200);
    const numbers = res.map((r) => (r.body as Inv).number);
    expect(new Set(numbers).size).toBe(12);
  });

  it('credit is applied at issue, never spent twice, and returns when cancelled', async () => {
    const student = await newStudent();
    await giveCredit(student, 150_000);
    // Two invoices of ₹1,000 issued together: ₹1,500 of credit covers exactly that much.
    const [x, y] = await Promise.all([issued(student), issued(student)]);
    expect(x.creditAppliedMinor + y.creditAppliedMinor).toBe(150_000);
    expect([x.status, y.status].sort()).toEqual(['PAID', 'PARTIALLY_PAID']);
    expect(await creditOf(student)).toBe(0);
    // No money was received, so a mistaken invoice can be cancelled; its credit comes back.
    const paid = x.status === 'PAID' ? x : y;
    const cancelled = await send(owner, 'post', `/invoices/${paid.id}/cancel`, {
      version: paid.version,
      reason: 'Issued by mistake',
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', creditAppliedMinor: 0 });
    expect(await creditOf(student)).toBe(100_000);
  });

  it('auto-applied credit can be switched off (C-140)', async () => {
    await setSettings({
      policy: {
        midCycle: 'FULL',
        sibling: null,
        autoApplyCredit: false,
        lateFee: null,
        generateDaysBefore: 5,
        dueDay: 10,
      },
    });
    const student = await newStudent();
    await giveCredit(student, 50_000);
    const inv = await issued(student);
    expect(inv).toMatchObject({ status: 'ISSUED', creditAppliedMinor: 0 });
    expect(await creditOf(student)).toBe(50_000);
    await setSettings({
      policy: {
        midCycle: 'FULL',
        sibling: null,
        autoApplyCredit: true,
        lateFee: null,
        generateDaysBefore: 5,
        dueDay: 10,
      },
    });
  });

  it('GST (OD-10): tax on the discounted amount, frozen at issue', async () => {
    await setSettings({ tax: { gstin: '29ABCDE1234F1Z5', rateBps: 1800, mode: 'EXCLUSIVE' } });
    const student = await newStudent();
    const inv = await issued(student, {
      discounts: [{ label: 'Sibling', amountMinor: 10_000 }],
    });
    expect(inv).toMatchObject({
      subtotalMinor: 100_000,
      discountMinor: 10_000,
      taxMinor: 16_200,
      totalMinor: 106_200,
    });
    expect(inv.lines.find((l) => l.kind === 'TAX')).toMatchObject({
      label: 'GST',
      amountMinor: 16_200,
    });
    await setSettings({ tax: null });
    expect(((await get(owner, `/invoices/${inv.id}`)).body as Inv).taxMinor).toBe(16_200);
  });

  it('write-off closes the balance with a reason; cancel is refused once money came in', async () => {
    const student = await newStudent();
    const inv = await issued(student);
    expect(
      (await send(owner, 'post', `/invoices/${inv.id}/write-off`, { version: inv.version })).status,
    ).toBe(400);
    const off = await send(owner, 'post', `/invoices/${inv.id}/write-off`, {
      version: inv.version,
      reason: 'Family left town',
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body).toMatchObject({
      status: 'WRITTEN_OFF',
      writtenOffMinor: 100_000,
      balanceMinor: 0,
    });
    expect(
      (
        await send(owner, 'post', `/invoices/${inv.id}/cancel`, {
          version: inv.version + 1,
          reason: 'Too late',
        })
      ).status,
    ).toBe(409);

    const paid = await issued(student);
    await su.query(
      `UPDATE invoice SET paid_minor = 1000, status = 'PARTIALLY_PAID' WHERE id = $1`,
      [paid.id],
    );
    const refused = await send(owner, 'post', `/invoices/${paid.id}/cancel`, {
      version: paid.version,
      reason: 'Mistake',
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toEqual([{ path: 'paidMinor', issue: 'has_payments' }]);
  });

  it('overdue is derived; the nightly run marks it and clears it', async () => {
    const student = await newStudent();
    const late = await issued(student);
    await su.query(`UPDATE invoice SET due_date = CURRENT_DATE - 3 WHERE id = $1`, [late.id]);
    expect(((await get(owner, `/invoices/${late.id}`)).body as Inv).overdue).toBe(true);
    const list = (await get(owner, `/invoices?status=OVERDUE&studentId=${student}`)).body
      .items as Inv[];
    expect(list.map((i) => i.id)).toEqual([late.id]);

    const run = () =>
      app.get(FinanceDailyProcessor).process({ data: { tenantId: a.id } } as Job<FinanceDailyJob>);
    expect((await run()).overdue).toBeGreaterThanOrEqual(1);
    const since = await su.query<{ overdue_since: Date | null }>(
      'SELECT overdue_since FROM invoice WHERE id = $1',
      [late.id],
    );
    expect(since.rows[0]!.overdue_since).not.toBeNull();
    await send(owner, 'post', `/invoices/${late.id}/write-off`, {
      version: late.version,
      reason: 'Closing it',
    });
    await run();
    const cleared = await su.query<{ overdue_since: Date | null }>(
      'SELECT overdue_since FROM invoice WHERE id = $1',
      [late.id],
    );
    expect(cleared.rows[0]!.overdue_since).toBeNull();
  });

  it('late fees are suggested after the threshold and charged once, only when approved', async () => {
    const policy = {
      midCycle: 'FULL',
      sibling: null,
      autoApplyCredit: true,
      generateDaysBefore: 5,
      dueDay: 10,
    };
    const student = await newStudent();
    const inv = await issued(student);
    await su.query(`UPDATE invoice SET due_date = CURRENT_DATE - 9 WHERE id = $1`, [inv.id]);
    expect((await get(owner, '/invoices/late-fee-suggestions')).body).toEqual({
      rule: null,
      items: [],
    });
    expect((await send(owner, 'post', `/invoices/${inv.id}/late-fee`)).status).toBe(409); // no rule

    await setSettings({ policy: { ...policy, lateFee: { afterDays: 7, amountMinor: 5_000 } } });
    const sugg = (await get(owner, '/invoices/late-fee-suggestions')).body as {
      items: { invoice: { id: string }; amountMinor: number; daysOverdue: number }[];
    };
    const mine = sugg.items.find((s) => s.invoice.id === inv.id)!;
    expect(mine.amountMinor).toBe(5_000);
    expect(mine.daysOverdue).toBeGreaterThanOrEqual(8);
    // Suggesting charges nothing.
    expect((await get(owner, `/invoices?kind=LATE_FEE&studentId=${student}`)).body.items).toEqual(
      [],
    );

    const fee = await send(owner, 'post', `/invoices/${inv.id}/late-fee`);
    expect(fee.status, JSON.stringify(fee.body)).toBe(201);
    expect(fee.body).toMatchObject({
      kind: 'LATE_FEE',
      status: 'ISSUED',
      forInvoiceId: inv.id,
      totalMinor: 5_000,
    });
    expect((fee.body as Inv).lines[0]!.label).toBe(`Late fee for ${inv.number}`);
    const twice = await send(owner, 'post', `/invoices/${inv.id}/late-fee`);
    expect(twice.status).toBe(409);
    expect(twice.body.error.details).toEqual([{ path: 'forInvoiceId', issue: 'already_charged' }]);
    const after = (await get(owner, '/invoices/late-fee-suggestions')).body as {
      items: { invoice: { id: string } }[];
    };
    expect(after.items.some((s) => s.invoice.id === inv.id)).toBe(false);
    await setSettings({ policy: { ...policy, lateFee: null } });
  });

  it('who may: reception reads only; lists page by keyset', async () => {
    const student = await newStudent();
    const inv = await issued(student);
    await issued(student);
    expect((await get(reception, `/invoices/${inv.id}`)).status).toBe(200);
    expect((await send(reception, 'post', '/invoices', invoiceFor(student))).status).toBe(403);
    expect(
      (await send(reception, 'post', `/invoices/${inv.id}/cancel`, { version: 1, reason: 'Nope' }))
        .status,
    ).toBe(403);
    const first = (await get(owner, `/invoices?studentId=${student}&limit=1`)).body as {
      items: Inv[];
      nextCursor: string;
    };
    expect(first.items).toHaveLength(1);
    const second = (
      await get(owner, `/invoices?studentId=${student}&limit=1&cursor=${first.nextCursor}`)
    ).body as { items: Inv[]; nextCursor: string | null };
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(second.nextCursor).toBeNull();
    expect((await get(owner, '/invoices?cursor=garbage')).status).toBe(400);
  });

  it('another academy’s invoices and students are 404', async () => {
    const theirs = b.people.invoiceId;
    expect((await get(owner, `/invoices/${theirs}`)).status).toBe(404);
    for (const [path, body] of [
      [`/invoices/${theirs}/issue`, { version: 1 }],
      [`/invoices/${theirs}/cancel`, { version: 1, reason: 'Not mine' }],
      [`/invoices/${theirs}/write-off`, { version: 1, reason: 'Not mine' }],
      [`/invoices/${theirs}/late-fee`, {}],
    ] as const)
      expect((await send(owner, 'post', path, body)).status, path).toBe(404);
    expect(
      (await send(owner, 'patch', `/invoices/${theirs}`, { version: 1, note: 'X' })).status,
    ).toBe(404);
    expect((await send(owner, 'post', '/invoices', invoiceFor(b.people.studentId))).status).toBe(
      404,
    );
    const other = await signIn(b, b.user.email);
    const mine = await issued(await newStudent());
    expect((await get(other, `/invoices/${mine.id}`)).status).toBe(404);
  });
});

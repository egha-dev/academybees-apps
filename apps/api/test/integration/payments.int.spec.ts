import { addDays, localDate, newId, ROLE_TEMPLATES, type RoleKey } from '@academybee/contracts';
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
 * Payments (Phase 7 S4; ARCHITECTURE §12.1, ADR-038, C-150): recording, allocation under lock,
 * credit, receipts, the verify queue, cheques, refunds; who may; another academy.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };
type Inv = {
  id: string;
  status: string;
  version: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  writtenOffMinor: number;
};
type Pay = {
  id: string;
  status: string;
  version: number;
  receiptNumber: string | null;
  duplicateFlag: boolean;
  refundedMinor: number;
  allocations: { invoiceId: string; invoiceNumber: string | null; amountMinor: number }[];
  creditMinor: number;
  refunds: { amountMinor: number; reason: string; method: string }[];
};
const templateGrants = (key: RoleKey): Grant[] =>
  Object.entries(ROLE_TEMPLATES[key].grants).map(([capability, scope]) => ({ capability, scope }));
const today = () => localDate(new Date(), 'Asia/Kolkata');
let utr = 100_000;
const nextUtr = () => `UTR${++utr}`;

describe('payments', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let admin: Session;
  let reception: Session;
  let cashOnly: Session;
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
    method: 'post' | 'patch',
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
       VALUES ($1, $2, $3, 'Paying Student', $4, CURRENT_DATE, now())`,
      [id, a.id, a.branchId, `PAY-${id.slice(-8)}`],
    );
    return id;
  }
  async function issued(studentId: string, amountMinor = 100_000, dueIn = 10): Promise<Inv> {
    const res = await send(owner, 'post', '/invoices', {
      studentId,
      dueDate: addDays(today(), dueIn),
      charges: [{ label: 'Tuition', amountMinor }],
      issue: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Inv;
  }
  const invoice = async (id: string) => (await get(owner, `/invoices/${id}`)).body as Inv;
  const cash = async (studentId: string, amountMinor: number, over: object = {}) => {
    const res = await send(owner, 'post', '/payments/cash', { studentId, amountMinor, ...over });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Pay;
  };
  const cheque = async (studentId: string, amountMinor: number, over: object = {}) => {
    const res = await send(owner, 'post', '/payments', {
      studentId,
      amountMinor,
      method: 'CHEQUE',
      reference: nextUtr(),
      chequeBank: 'State Bank',
      chequeDate: today(),
      ...over,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Pay;
  };
  const creditOf = async (studentId: string) =>
    Number(
      (
        await su.query<{ sum: string | null }>(
          'SELECT sum(amount_minor) FROM credit_entry WHERE student_id = $1',
          [studentId],
        )
      ).rows[0]!.sum ?? 0,
    );
  async function setSettings(change: object) {
    const { version } = (await get(owner, '/settings/finance')).body as { version: number };
    const res = await send(owner, 'patch', '/settings/finance', { version, ...change });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    su.setTypeParser(1082, (v) => v);
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Payments Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Payments Academy', plan: 'pro' }),
    ]);
    for (const key of ['admin', 'receptionist'] as const)
      await addMemberFixture(urls.migrator, a.id, {
        email: `${key}-${a.slug}@example.test`,
        roleKey: key,
        grants: templateGrants(key),
      });
    await addMemberFixture(urls.migrator, a.id, {
      email: `cash-${a.slug}@example.test`,
      roleKey: 'accountant',
      grants: [
        { capability: 'payment.read', scope: 'TENANT' },
        { capability: 'payment.record_cash', scope: 'TENANT' },
        { capability: 'student.read', scope: 'TENANT' },
      ],
    });
    await addMemberFixture(urls.migrator, a.id, {
      email: `verify-${a.slug}@example.test`,
      roleKey: 'accountant',
      grants: [
        { capability: 'payment.read', scope: 'TENANT' },
        { capability: 'payment.verify', scope: 'TENANT' },
      ],
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
    admin = await signIn(a, `admin-${a.slug}@example.test`);
    reception = await signIn(a, `receptionist-${a.slug}@example.test`);
    cashOnly = await signIn(a, `cash-${a.slug}@example.test`);
  });

  describe('recording', () => {
    it('cash in full: confirmed by the server, invoice paid, one numbered receipt', async () => {
      const st = await newStudent();
      const inv = await issued(st);
      const p = await cash(st, 100_000);
      expect(p.status).toBe('CONFIRMED');
      expect(p.receiptNumber).toMatch(/^RCT\/\d{4}-\d{2}\/\d{5}$/);
      expect(p.allocations).toEqual([
        { invoiceId: inv.id, invoiceNumber: expect.any(String), amountMinor: 100_000 },
      ]);
      expect(p.creditMinor).toBe(0);
      const after = await invoice(inv.id);
      expect(after.status).toBe('PAID');
      expect(after.balanceMinor).toBe(0);
      const audit = await su.query(
        `SELECT 1 FROM audit_log WHERE action = 'finance.payment_recorded' AND entity_id = $1`,
        [p.id],
      );
      expect(audit.rowCount).toBe(1);
    });

    it('spreads oldest due first; what is left becomes credit', async () => {
      const st = await newStudent();
      const later = await issued(st, 60_000, 20);
      const sooner = await issued(st, 50_000, 5);
      const first = await cash(st, 70_000);
      expect(first.allocations.map((x) => [x.invoiceId, x.amountMinor])).toEqual(
        expect.arrayContaining([
          [sooner.id, 50_000],
          [later.id, 20_000],
        ]),
      );
      expect((await invoice(sooner.id)).status).toBe('PAID');
      expect((await invoice(later.id)).status).toBe('PARTIALLY_PAID');
      const second = await cash(st, 50_000);
      expect(second.allocations).toHaveLength(1);
      expect(second.creditMinor).toBe(10_000);
      expect(await creditOf(st)).toBe(10_000);
      // The next invoice uses it (C-140).
      const next = await issued(st, 30_000);
      expect(next.balanceMinor).toBe(20_000);
    });

    it('an advance with nothing open is all credit, still with a receipt', async () => {
      const st = await newStudent();
      const p = await cash(st, 5_000);
      expect(p.status).toBe('CONFIRMED');
      expect(p.receiptNumber).not.toBeNull();
      expect(p.creditMinor).toBe(5_000);
    });

    it('chosen invoices come first and only they are paid; the rest is credit', async () => {
      const st = await newStudent();
      const older = await issued(st, 10_000, 1);
      const newer = await issued(st, 10_000, 30);
      const p = await cash(st, 15_000, { invoiceIds: [newer.id] });
      expect(p.allocations.map((x) => x.invoiceId)).toEqual([newer.id]);
      expect(p.creditMinor).toBe(5_000);
      expect((await invoice(older.id)).paidMinor).toBe(0);
    });

    it('refuses invoices that are not this student’s, not issued or closed', async () => {
      const st = await newStudent();
      const other = await issued(await newStudent());
      const stranger = await send(owner, 'post', '/payments/cash', {
        studentId: st,
        amountMinor: 100,
        invoiceIds: [other.id],
      });
      expect(stranger.status).toBe(404);
      const draft = await send(owner, 'post', '/invoices', {
        studentId: st,
        dueDate: today(),
        charges: [{ label: 'Draft', amountMinor: 100 }],
      });
      expect(
        (
          await send(owner, 'post', '/payments/cash', {
            studentId: st,
            amountMinor: 100,
            invoiceIds: [draft.body.id],
          })
        ).status,
      ).toBe(404);
      const paid = await issued(st, 100);
      await cash(st, 100, { invoiceIds: [paid.id] });
      const closed = await send(owner, 'post', '/payments/cash', {
        studentId: st,
        amountMinor: 100,
        invoiceIds: [paid.id],
      });
      expect(closed.status).toBe(409);
      expect(closed.body.error.details).toEqual([
        { path: `invoiceIds.${paid.id}`, issue: 'invoice_not_open' },
      ]);
    });

    it('needs a reference (and bank and date for a cheque), no future date, an enabled method', async () => {
      const st = await newStudent();
      const noRef = await send(owner, 'post', '/payments', {
        studentId: st,
        amountMinor: 100,
        method: 'UPI',
      });
      expect(noRef.status).toBe(400);
      const noBank = await send(owner, 'post', '/payments', {
        studentId: st,
        amountMinor: 100,
        method: 'CHEQUE',
        reference: nextUtr(),
      });
      expect(noBank.status).toBe(400);
      const future = await send(owner, 'post', '/payments/cash', {
        studentId: st,
        amountMinor: 100,
        paidOn: addDays(today(), 1),
      });
      expect(future.status).toBe(400);
      expect(future.body.error.details).toEqual([{ path: 'paidOn', issue: 'future_date' }]);
      await setSettings({
        methods: { CASH: true, UPI: true, BANK_TRANSFER: true, CHEQUE: true, CARD_POS: false },
      });
      const off = await send(owner, 'post', '/payments', {
        studentId: st,
        amountMinor: 100,
        method: 'CARD_POS',
        reference: nextUtr(),
      });
      expect(off.status).toBe(409);
      expect(off.body.error.details).toEqual([{ path: 'method', issue: 'method_disabled' }]);
      await setSettings({
        methods: { CASH: true, UPI: true, BANK_TRANSFER: true, CHEQUE: true, CARD_POS: true },
      });
    });

    it('no client can set a payment confirmed: a cheque stays pending whatever the body says', async () => {
      const st = await newStudent();
      const res = await send(owner, 'post', '/payments', {
        studentId: st,
        amountMinor: 100,
        method: 'CHEQUE',
        reference: nextUtr(),
        chequeBank: 'State Bank',
        chequeDate: today(),
        status: 'CONFIRMED',
        receiptNumber: 'RCT/FAKE',
        confirmedAt: new Date().toISOString(),
      });
      if (res.status === 201) {
        expect(res.body.status).toBe('PENDING');
        expect(res.body.receiptNumber).toBeNull();
      } else expect(res.status).toBe(400);
    });

    it('replaying a key records once', async () => {
      const st = await newStudent();
      const key = crypto.randomUUID();
      const body = { studentId: st, amountMinor: 1_000 };
      const one = await send(owner, 'post', '/payments/cash', body, key);
      const two = await send(owner, 'post', '/payments/cash', body, key);
      expect(two.body.id).toBe(one.body.id);
      const rows = await su.query('SELECT 1 FROM payment WHERE student_id = $1', [st]);
      expect(rows.rowCount).toBe(1);
    });

    it('each capability guards its own methods', async () => {
      const st = await newStudent();
      const body = { studentId: st, amountMinor: 100 };
      expect((await send(reception, 'post', '/payments/cash', body)).status).toBe(403);
      expect((await send(cashOnly, 'post', '/payments/cash', body)).status).toBe(201);
      expect(
        (
          await send(cashOnly, 'post', '/payments', {
            ...body,
            method: 'UPI',
            reference: nextUtr(),
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('references (ADR-038)', () => {
    it('the same UTR twice for a method is refused, spacing and case aside', async () => {
      const st = await newStudent();
      const body = { studentId: st, amountMinor: 100, method: 'UPI' };
      const utrValue = nextUtr();
      const first = await send(owner, 'post', '/payments', { ...body, reference: utrValue });
      expect(first.status).toBe(201);
      const again = await send(owner, 'post', '/payments', {
        ...body,
        reference: ` ${utrValue.slice(0, 4)} ${utrValue.slice(4).toLowerCase()} `,
      });
      expect(again.status).toBe(409);
      expect(again.body.error.details).toEqual([
        { path: 'reference', issue: 'duplicate_reference' },
      ]);
    });

    it('two racing requests with one UTR: one wins, the other gets the same 409', async () => {
      const st = await newStudent();
      const reference = nextUtr();
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          send(owner, 'post', '/payments', {
            studentId: st,
            amountMinor: 100,
            method: 'BANK_TRANSFER',
            reference,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      for (const r of results.filter((x) => x.status === 409))
        expect(r.body.error.details).toEqual([{ path: 'reference', issue: 'duplicate_reference' }]);
    });

    it('the same reference on another method is allowed but flagged', async () => {
      const st = await newStudent();
      const reference = nextUtr();
      const body = { studentId: st, amountMinor: 100, reference };
      const upi = await send(owner, 'post', '/payments', { ...body, method: 'UPI' });
      expect(upi.body.duplicateFlag).toBe(false);
      const bank = await send(owner, 'post', '/payments', { ...body, method: 'BANK_TRANSFER' });
      expect(bank.status).toBe(201);
      expect(bank.body.duplicateFlag).toBe(true);
    });

    it('a bounced cheque’s number can be used again', async () => {
      const st = await newStudent();
      const reference = nextUtr();
      const bounced = await cheque(st, 100, { reference });
      await send(owner, 'post', `/payments/${bounced.id}/reject`, {
        version: bounced.version,
        reason: 'Refer to drawer',
      });
      await cheque(st, 100, { reference });
    });
  });

  describe('cheques and the verify queue', () => {
    it('a cheque waits: no allocation, no receipt, in the queue; clearing confirms once', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const c = await cheque(st, 10_000, { invoiceIds: [inv.id] });
      expect(c.status).toBe('PENDING');
      expect(c.receiptNumber).toBeNull();
      expect(c.allocations).toEqual([]);
      expect((await invoice(inv.id)).paidMinor).toBe(0);
      const queue = await get(owner, `/payments?status=PENDING&studentId=${st}`);
      expect((queue.body as { items: Pay[] }).items.map((p) => p.id)).toEqual([c.id]);

      const denied = await send(reception, 'post', `/payments/${c.id}/confirm`, {
        version: c.version,
      });
      expect(denied.status).toBe(403);

      const cleared = await send(admin, 'post', `/payments/${c.id}/confirm`, {
        version: c.version,
      });
      expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
      expect(cleared.body.status).toBe('CONFIRMED');
      expect(cleared.body.receiptNumber).not.toBeNull();
      expect((await invoice(inv.id)).status).toBe('PAID');
      expect(
        (await send(admin, 'post', `/payments/${c.id}/confirm`, { version: c.version })).status,
      ).toBe(409);
      expect(
        (
          await send(admin, 'post', `/payments/${c.id}/reject`, {
            version: cleared.body.version,
            reason: 'Too late',
          })
        ).status,
      ).toBe(409);
    });

    it('confirming twice at once gives one receipt and one allocation', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const c = await cheque(st, 10_000);
      const results = await Promise.all(
        [1, 2, 3, 4].map(() =>
          send(admin, 'post', `/payments/${c.id}/confirm`, { version: c.version }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const rows = await su.query('SELECT 1 FROM payment_allocation WHERE payment_id = $1', [c.id]);
      expect(rows.rowCount).toBe(1);
      expect((await invoice(inv.id)).paidMinor).toBe(10_000);
    });

    it('a stale version is refused', async () => {
      const c = await cheque(await newStudent(), 100);
      const res = await send(admin, 'post', `/payments/${c.id}/confirm`, {
        version: c.version + 1,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERSION_CONFLICT');
    });

    it('a bounce keeps the reason and can bill a charge; nothing was applied', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const c = await cheque(st, 10_000);
      const res = await send(admin, 'post', `/payments/${c.id}/reject`, {
        version: c.version,
        reason: 'Insufficient funds',
        bounceChargeMinor: 50_000,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe('FAILED');
      expect(res.body.rejectionReason).toBe('Insufficient funds');
      expect(res.body.receiptNumber).toBeNull();
      expect((await invoice(inv.id)).paidMinor).toBe(0);
      const list = await get(owner, `/invoices?studentId=${st}&kind=ONE_TIME`);
      const charge = (list.body as { items: Inv[] }).items.filter((i) => i.totalMinor === 50_000);
      expect(charge).toHaveLength(1);
      expect(charge[0]!.status).toBe('ISSUED');
    });

    it('a bounce charge is for cheques only and takes invoice rights', async () => {
      const st = await newStudent();
      const upi = await send(owner, 'post', '/payments/cash', { studentId: st, amountMinor: 100 });
      expect(upi.status).toBe(201);
      // A waiting UPI payment, as a parent's report would be.
      const reported = newId();
      await su.query(
        `INSERT INTO payment (id, tenant_id, branch_id, student_id, method, source, status, amount_minor,
           reference, paid_on, reported_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, 'UPI', 'PARENT_REPORTED', 'PENDING', 100, $5, CURRENT_DATE, $6, now())`,
        [reported, a.id, a.branchId, st, nextUtr(), a.user.id],
      );
      const notCheque = await send(admin, 'post', `/payments/${reported}/reject`, {
        version: 1,
        reason: 'No such UTR',
        bounceChargeMinor: 100,
      });
      expect(notCheque.status).toBe(400);
      expect(notCheque.body.error.details).toEqual([
        { path: 'bounceChargeMinor', issue: 'not_a_cheque' },
      ]);
      // The whole decision rolled back.
      expect((await get(owner, `/payments/${reported}`)).body.status).toBe('PENDING');

      const c = await cheque(st, 100);
      const verifier = await signIn(a, `verify-${a.slug}@example.test`);
      const noRights = await send(verifier, 'post', `/payments/${c.id}/reject`, {
        version: c.version,
        reason: 'Refer to drawer',
        bounceChargeMinor: 100,
      });
      expect(noRights.status).toBe(403);
      expect((await get(owner, `/payments/${c.id}`)).body.status).toBe('PENDING');
      // Without a charge the same person can bounce it.
      const plain = await send(verifier, 'post', `/payments/${c.id}/reject`, {
        version: c.version,
        reason: 'Refer to drawer',
      });
      expect(plain.status).toBe(200);
    });

    it('staff can’t decide a gateway payment: only the gateway can (§12.3)', async () => {
      const st = await newStudent();
      const id = newId();
      await su.query(
        `INSERT INTO payment (id, tenant_id, branch_id, student_id, method, source, status, amount_minor,
           paid_on, updated_at)
         VALUES ($1, $2, $3, $4, 'ONLINE_GATEWAY', 'GATEWAY', 'PENDING', 100, CURRENT_DATE, now())`,
        [id, a.id, a.branchId, st],
      );
      const res = await send(owner, 'post', `/payments/${id}/confirm`, { version: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('lists page by keyset: the queue oldest first, history newest first', async () => {
      const st = await newStudent();
      const first = await cheque(st, 100);
      const second = await cheque(st, 100);
      const queue = await get(owner, `/payments?status=PENDING&studentId=${st}&limit=1`);
      expect(queue.body.items[0].id).toBe(first.id);
      const page2 = await get(
        owner,
        `/payments?status=PENDING&studentId=${st}&limit=1&cursor=${queue.body.nextCursor}`,
      );
      expect(page2.body.items[0].id).toBe(second.id);
      const history = await get(owner, `/payments?studentId=${st}&limit=1`);
      expect(history.body.items[0].id).toBe(second.id);
      expect((await get(owner, '/payments?cursor=nonsense')).status).toBe(400);
    });
  });

  describe('under concurrency', () => {
    it('20 collects on one invoice never over-allocate; the rest is credit', async () => {
      const st = await newStudent();
      const inv = await issued(st, 100_000);
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          send(owner, 'post', '/payments/cash', { studentId: st, amountMinor: 10_000 }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
      const after = await invoice(inv.id);
      expect(after.status).toBe('PAID');
      expect(after.paidMinor).toBe(100_000);
      const sum = await su.query<{ s: string }>(
        'SELECT sum(amount_minor) AS s FROM payment_allocation WHERE invoice_id = $1',
        [inv.id],
      );
      expect(Number(sum.rows[0]!.s)).toBe(100_000);
      expect(await creditOf(st)).toBe(100_000);
    }, 60_000);

    it('receipt numbers are unique and sequential', async () => {
      const students = await Promise.all(Array.from({ length: 12 }, () => newStudent()));
      const results = await Promise.all(students.map((st) => cash(st, 100)));
      const seqs = results
        .map((p) => Number(p.receiptNumber!.split('/').at(-1)))
        .sort((x, y) => x - y);
      expect(new Set(seqs).size).toBe(12);
      expect(seqs.at(-1)! - seqs[0]!).toBe(11);
    }, 60_000);
  });

  describe('refunds (C-150)', () => {
    const refund = (s: Session, p: Pay, over: object = {}) =>
      send(s, 'post', `/payments/${p.id}/refund`, {
        version: p.version,
        amountMinor: 1_000,
        method: 'CASH',
        reason: 'Fee waived',
        ...over,
      });

    it('needs payment.refund; a non-cash refund needs a reference', async () => {
      const p = await cash(await newStudent(), 1_000);
      expect((await refund(admin, p)).status).toBe(403);
      expect((await refund(owner, p, { method: 'UPI' })).status).toBe(400);
      expect((await refund(owner, p, { reason: '' })).status).toBe(400);
    });

    it('partly, then fully: the invoice owes it again and the history stays', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const p = await cash(st, 10_000);
      const part = await refund(owner, p, { amountMinor: 4_000 });
      expect(part.status, JSON.stringify(part.body)).toBe(200);
      expect(part.body.status).toBe('PARTIALLY_REFUNDED');
      expect(part.body.receiptNumber).toBe(p.receiptNumber);
      expect(part.body.allocations[0].amountMinor).toBe(6_000);
      let after = await invoice(inv.id);
      expect(after.status).toBe('PARTIALLY_PAID');
      expect(after.balanceMinor).toBe(4_000);

      const tooMuch = await refund(owner, part.body as Pay, { amountMinor: 6_001 });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.error.details).toEqual([
        { path: 'amountMinor', issue: 'exceeds_refundable' },
      ]);

      const rest = await refund(owner, part.body as Pay, {
        amountMinor: 6_000,
        method: 'UPI',
        reference: nextUtr(),
      });
      expect(rest.status).toBe(200);
      expect(rest.body.status).toBe('REFUNDED');
      expect(rest.body.refunds).toHaveLength(2);
      expect(rest.body.allocations).toEqual([]);
      after = await invoice(inv.id);
      expect(after.status).toBe('ISSUED');
      expect(after.balanceMinor).toBe(10_000);

      const again = await refund(owner, rest.body as Pay);
      expect(again.status).toBe(409);
      // Nothing was rewritten: the original allocation is still there beside its reversals.
      const rows = await su.query<{ amount_minor: number }>(
        'SELECT amount_minor FROM payment_allocation WHERE payment_id = $1 ORDER BY id',
        [p.id],
      );
      expect(rows.rows.map((r) => r.amount_minor)).toEqual([10_000, -4_000, -6_000]);
      // And a fully refunded invoice can now be cancelled.
      const cancelled = await send(owner, 'post', `/invoices/${inv.id}/cancel`, {
        version: after.version,
        reason: 'Left the academy',
      });
      expect(cancelled.status).toBe(200);
    });

    it('takes unused credit first and leaves the invoice settled', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const p = await cash(st, 15_000);
      expect(p.creditMinor).toBe(5_000);
      const res = await refund(owner, p, { amountMinor: 5_000 });
      expect(res.status).toBe(200);
      expect(res.body.creditMinor).toBe(0);
      expect(await creditOf(st)).toBe(0);
      expect((await invoice(inv.id)).status).toBe('PAID');
    });

    it('credit already spent can’t be refunded from here', async () => {
      const st = await newStudent();
      const p = await cash(st, 5_000);
      await issued(st, 5_000);
      const res = await refund(owner, p, { amountMinor: 5_000 });
      expect(res.status).toBe(409);
      expect(res.body.error.details).toEqual([
        { path: 'amountMinor', issue: 'credit_already_used' },
      ]);
    });

    it('a written-off invoice stays closed with nothing owed', async () => {
      const st = await newStudent();
      const inv = await issued(st, 10_000);
      const p = await cash(st, 4_000);
      const before = await invoice(inv.id);
      const off = await send(owner, 'post', `/invoices/${inv.id}/write-off`, {
        version: before.version,
        reason: 'Family moved away',
      });
      expect(off.status).toBe(200);
      expect((await refund(owner, p, { amountMinor: 4_000 })).status).toBe(200);
      const after = await invoice(inv.id);
      expect(after.status).toBe('WRITTEN_OFF');
      expect(after.paidMinor).toBe(0);
      expect(after.writtenOffMinor).toBe(10_000);
      expect(after.balanceMinor).toBe(0);
    });

    it('two refunds at once never exceed the payment', async () => {
      const st = await newStudent();
      await issued(st, 10_000);
      const p = await cash(st, 10_000);
      const results = await Promise.all(
        [1, 2, 3].map(() => refund(owner, p, { amountMinor: 6_000 })),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const now = (await get(owner, `/payments/${p.id}`)).body as Pay;
      expect(now.refundedMinor).toBe(6_000);
    });
  });

  it('another academy’s payments and students are 404', async () => {
    const foreign = b.people.paymentId;
    const body = { version: 1 };
    for (const path of [`/payments/${foreign}/confirm`, `/payments/${foreign}/refund`])
      expect(
        (
          await send(owner, 'post', path, {
            ...body,
            amountMinor: 1,
            method: 'CASH',
            reason: 'xxx',
          })
        ).status,
      ).toBe(404);
    expect(
      (await send(owner, 'post', `/payments/${foreign}/reject`, { ...body, reason: 'xxx' })).status,
    ).toBe(404);
    expect((await get(owner, `/payments/${foreign}`)).status).toBe(404);
    expect((await get(owner, `/payments/${foreign}/evidence`)).status).toBe(404);
    expect(
      (
        await send(owner, 'post', '/payments/cash', {
          studentId: b.people.studentId,
          amountMinor: 100,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(owner, 'post', '/payments', {
          studentId: b.people.studentId,
          amountMinor: 100,
          method: 'UPI',
          reference: nextUtr(),
        })
      ).status,
    ).toBe(404);
    const st = await newStudent();
    expect(
      (
        await send(owner, 'post', '/payments/cash', {
          studentId: st,
          amountMinor: 100,
          invoiceIds: [b.people.invoiceId],
        })
      ).status,
    ).toBe(404);
    const list = await get(owner, `/payments?studentId=${b.people.studentId}`);
    expect(list.body.items).toEqual([]);
  });

  it('branch-limited staff see and record only their branch', async () => {
    const otherBranch = newId();
    await su.query(
      `INSERT INTO branch (id, tenant_id, name, updated_at) VALUES ($1, $2, 'Second', now())`,
      [otherBranch, a.id],
    );
    await addMemberFixture(urls.migrator, a.id, {
      email: `branch-${a.slug}@example.test`,
      roleKey: 'accountant',
      branchIds: [otherBranch],
      grants: [
        { capability: 'payment.read', scope: 'BRANCH' },
        { capability: 'payment.record_cash', scope: 'BRANCH' },
        { capability: 'payment.verify', scope: 'BRANCH' },
        { capability: 'student.read', scope: 'TENANT' },
      ],
    });
    const limited = await signIn(a, `branch-${a.slug}@example.test`);
    const st = await newStudent();
    const p = await cash(st, 100);
    expect((await get(limited, `/payments/${p.id}`)).status).toBe(404);
    const c = await cheque(st, 100);
    expect(
      (await send(limited, 'post', `/payments/${c.id}/confirm`, { version: c.version })).status,
    ).toBe(404);
    expect(
      (await send(limited, 'post', '/payments/cash', { studentId: st, amountMinor: 100 })).status,
    ).toBe(404);
    const list = await get(limited, `/payments?studentId=${st}`);
    expect(list.body.items).toEqual([]);
  });
});

import { decryptSecret, type MasterKeyRing } from '@academybee/auth';
import { addDays, currentNoticeVersion, localDate, newId } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import { hashPassword } from '@academybee/auth';
import { type INestApplication, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { MASTER_KEYS } from '../../src/core/auth/keys.js';
import { FeatureFlagService } from '../../src/core/flags/feature-flag.service.js';
import { ReconciliationProcessor } from '../../src/modules/finance/reconciliation.processor.js';
import {
  SIMULATOR_SIGNATURE_HEADER,
  SimulatorProvider,
} from '../../src/modules/finance/providers/simulator.provider.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Paying online on the simulator (G-01, ADR-033, §12.3). The browser is never believed: only a
 * signature made with that account's own secret, or the server asking the gateway itself, can
 * confirm. Any replay, in any order, ends in exactly one confirmation and one receipt.
 */
const urls = inject('databaseUrls');
const HUB = 'app.localhost';
const today = () => localDate(new Date(), 'Asia/Kolkata');

type Session = { host: string; cookie: string; csrf: string };

describe('online payments', () => {
  let app: INestApplication;
  let su: pg.Client;
  let redis: Redis;
  let a: TenantFixture;
  let b: TenantFixture;
  let ownerA: Session;
  let ownerB: Session;
  const http = () => request(app.getHttpServer());

  async function login(host: string, email: string): Promise<Session> {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email} on ${host}: ${JSON.stringify(res.body)}`).toBe(200);
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
  const send = (s: Session, path: string, body: unknown = {}, key: string = crypto.randomUUID()) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', key)
      .send(body as object);

  async function hubParent(t: TenantFixture) {
    const userId = newId();
    const email = `online-${userId.slice(-10)}@example.test`;
    await su.query(
      `INSERT INTO "user" (id, email, name, email_verified_at, updated_at) VALUES ($1, $2, 'Online Parent', now(), now())`,
      [userId, email],
    );
    await su.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [userId, await hashPassword(FIXTURE_PASSWORD)],
    );
    const membershipId = newId();
    await su.query(
      `INSERT INTO membership (id, tenant_id, user_id, status, updated_at) VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [membershipId, t.id, userId],
    );
    await su.query(
      `INSERT INTO membership_role (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [t.id, membershipId, t.roleIds.parent],
    );
    const parentId = newId();
    await su.query(
      `INSERT INTO parent (id, tenant_id, full_name, user_id, updated_at) VALUES ($1, $2, 'Online Parent', $3, now())`,
      [parentId, t.id, userId],
    );
    return { userId, parentId, session: await login(HUB, email) };
  }
  async function issued(s: Session, studentId: string, amountMinor: number) {
    const res = await send(s, '/invoices', {
      studentId,
      dueDate: addDays(today(), 10),
      charges: [{ label: 'Tuition', amountMinor }],
      issue: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; version: number };
  }
  /** A parent with a child, consent, and an open invoice, in academy `t`. */
  async function family(
    t: TenantFixture,
    owner: Session,
    amountMinor = 100_000,
    { consented = true } = {},
  ) {
    const parent = await hubParent(t);
    const studentId = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, updated_at)
       VALUES ($1, $2, $3, 'Online Child', $4, CURRENT_DATE, now())`,
      [studentId, t.id, t.branchId, `ON-${studentId.slice(-8)}`],
    );
    await su.query(
      `INSERT INTO parent_student (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
       VALUES ($1, $2, $3, $4, 'MOTHER', true)`,
      [newId(), t.id, parent.parentId, studentId],
    );
    if (consented)
      await su.query(
        `INSERT INTO consent_record (id, tenant_id, parent_id, student_id, action, purposes, notice_version, channel)
         VALUES ($1, $2, $3, $4, 'GRANT', $5, $6, 'FAMILY_HUB')`,
        [newId(), t.id, parent.parentId, studentId, ['service'], currentNoticeVersion()],
      );
    const invoice = await issued(owner, studentId, amountMinor);
    return { parent, studentId, invoice };
  }
  const pay = (s: Session, slug: string, invoiceId: string, body: object = {}, key?: string) =>
    send(s, `/hub/academies/${slug}/invoices/${invoiceId}/pay`, body, key);
  const simulate = (s: Session, slug: string, paymentId: string, body: object) =>
    send(s, `/hub/academies/${slug}/payments/${paymentId}/simulate-checkout`, body);

  /** The live account's address and (for signing as the gateway would) its webhook secret. */
  async function accountOf(t: TenantFixture) {
    const { rows } = await su.query<{ account_ref: string; webhook_cipher: string; id: string }>(
      `SELECT id, account_ref, webhook_cipher FROM tenant_payment_account
       WHERE tenant_id = $1 AND provider = 'simulator' AND account_ref NOT LIKE 'fixture-%'
       ORDER BY id DESC LIMIT 1`,
      [t.id],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      ref: row.account_ref,
      secret: decryptSecret(row.webhook_cipher, app.get<MasterKeyRing>(MASTER_KEYS)),
    };
  }
  /** Deliver bytes to the webhook as a gateway does: no cookie, no academy host. */
  const deliver = (ref: string, body: Buffer, signature: string) =>
    http()
      .post(`/api/v1/webhooks/payments/simulator/${ref}`)
      .set('Content-Type', 'application/json')
      .set(SIMULATOR_SIGNATURE_HEADER, signature)
      .send(body.toString('utf8'));
  const event = (over: object) =>
    Buffer.from(
      JSON.stringify({
        id: `sim_evt_${newId()}`,
        type: 'payment.captured',
        orderId: 'sim_order_none',
        providerPaymentId: `SIM${newId().replaceAll('-', '').toUpperCase()}`,
        amountMinor: 100_000,
        reason: null,
        ...over,
      }),
    );
  const orderOf = async (paymentId: string) =>
    (
      await su.query<{ provider_order_id: string }>(
        `SELECT provider_order_id FROM payment WHERE id = $1`,
        [paymentId],
      )
    ).rows[0]!.provider_order_id;
  /** Started and pending, with its order id. */
  async function started(t: TenantFixture, owner: Session, amountMinor = 100_000) {
    const fam = await family(t, owner, amountMinor);
    const res = await pay(fam.parent.session, t.slug, fam.invoice.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const paymentId = (res.body as { paymentId: string }).paymentId;
    return { ...fam, paymentId, orderId: await orderOf(paymentId) };
  }
  const exceptions = (t: TenantFixture, kind: string) =>
    su.query<{ id: string; reference: string; payment_id: string | null }>(
      `SELECT id, reference, payment_id FROM reconciliation_exception WHERE tenant_id = $1 AND kind = $2`,
      [t.id, kind],
    );

  beforeAll(async () => {
    app = await createTestApp(testConfig({ PAYMENT_PROVIDERS: 'manual,simulator' }));
    su = new pg.Client({ connectionString: urls.superuser });
    su.setTypeParser(1082, (v) => v);
    await su.connect();
    redis = new Redis(inject('redisUrl'));
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Online Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Online Academy', plan: 'pro' }),
    ]);
    ownerA = await login(`${a.slug}.localhost`, a.user.email);
    ownerB = await login(`${b.slug}.localhost`, b.user.email);
    // The fixture's disabled account stands in for one from before; these connect a live one.
    expect((await send(ownerA, '/settings/finance/gateway/simulator')).status).toBe(201);
    expect((await send(ownerB, '/settings/finance/gateway/simulator')).status).toBe(201);
  });
  afterAll(async () => {
    await redis.quit();
    await su.end();
    await app.close();
  });
  beforeEach(async () => {
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });

  it('pay → pending, no receipt; a signed success → confirmed, allocated, one receipt', async () => {
    const { parent, studentId, invoice } = await family(a, ownerA);
    const res = await pay(parent.session, a.slug, invoice.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      amountMinor: 100_000,
      provider: 'simulator',
    });
    const id = (res.body as { paymentId: string }).paymentId;

    const waiting = await get(parent.session, `/hub/academies/${a.slug}/payments/${id}`);
    expect(waiting.body).toMatchObject({ status: 'PENDING', receiptNumber: null });
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(0);

    const done = await simulate(parent.session, a.slug, id, { outcome: 'SUCCESS' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({ status: 'CONFIRMED' });
    expect((done.body as { receiptNumber: string }).receiptNumber).toMatch(/^RCT\//);
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body).toMatchObject({
      status: 'PAID',
      paidMinor: 100_000,
    });
    const staff = await get(ownerA, `/payments/${id}`);
    expect(staff.body).toMatchObject({ method: 'ONLINE_GATEWAY', source: 'GATEWAY' });
    const { rows: intents } = await su.query<{ kind: string }>(
      `SELECT kind FROM notification_intent WHERE student_id = $1`,
      [studentId],
    );
    expect(intents.map((i) => i.kind)).toEqual(['PAYMENT_CONFIRMED']);
  });

  it('a part payment leaves the balance open', async () => {
    const { parent, invoice } = await family(a, ownerA);
    const res = await pay(parent.session, a.slug, invoice.id, { amountMinor: 40_000 });
    expect(res.status).toBe(201);
    const id = (res.body as { paymentId: string }).paymentId;
    await simulate(parent.session, a.slug, id, { outcome: 'SUCCESS' });
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body).toMatchObject({
      status: 'PARTIALLY_PAID',
      paidMinor: 40_000,
    });
  });

  it('a failure changes nothing, says why, and lets the parent try again', async () => {
    const { parent, studentId, invoice } = await family(a, ownerA);
    const first = await pay(parent.session, a.slug, invoice.id);
    const id = (first.body as { paymentId: string }).paymentId;
    const done = await simulate(parent.session, a.slug, id, { outcome: 'FAILURE' });
    expect(done.body).toMatchObject({
      status: 'FAILED',
      receiptNumber: null,
      rejectionReason: 'Simulated failure',
    });
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body).toMatchObject({
      status: 'ISSUED',
      paidMinor: 0,
    });
    const { rows } = await su.query<{ kind: string }>(
      `SELECT kind FROM notification_intent WHERE student_id = $1`,
      [studentId],
    );
    expect(rows.map((r) => r.kind)).toEqual(['PAYMENT_REJECTED']);
    expect((await pay(parent.session, a.slug, invoice.id)).status).toBe(201);
  });

  it('webhook replay ×10, some at once, gives one confirmation and one receipt', async () => {
    const { paymentId, orderId, invoice } = await started(a, ownerA);
    const account = await accountOf(a);
    const body = event({ orderId });
    const signature = SimulatorProvider.sign(account.secret, body);
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => deliver(account.ref, body, signature)),
    );
    for (let i = 0; i < 5; i++) answers.push(await deliver(account.ref, body, signature));
    expect(answers.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(answers.filter((r) => !(r.body as { duplicate: boolean }).duplicate)).toHaveLength(1);

    const { rows: events } = await su.query<{ processed_at: Date; payment_id: string }>(
      `SELECT processed_at, payment_id FROM gateway_event WHERE tenant_id = $1 AND payload->>'orderId' = $2`,
      [a.id, orderId],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.payment_id).toBe(paymentId);
    expect(events[0]!.processed_at).toBeTruthy();
    const { rows: allocations } = await su.query(
      `SELECT 1 FROM payment_allocation WHERE payment_id = $1`,
      [paymentId],
    );
    expect(allocations).toHaveLength(1);
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(100_000);

    // A second event for the same order (a new id, as gateways send): still one receipt.
    const again = event({ orderId });
    const res = await deliver(account.ref, again, SimulatorProvider.sign(account.secret, again));
    expect(res.status).toBe(200);
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(100_000);
  });

  it('the simulator’s double delivery confirms once', async () => {
    const { parent, paymentId, invoice } = await started(a, ownerA);
    const done = await simulate(parent.session, a.slug, paymentId, {
      outcome: 'SUCCESS',
      delivery: 'TWICE',
    });
    expect(done.body).toMatchObject({ status: 'CONFIRMED' });
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(100_000);
  });

  it('anything refused looks the same (401), is logged, and changes nothing', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const { paymentId, orderId } = await started(a, ownerA);
    const account = await accountOf(a);
    const body = event({ orderId });
    const forged = await deliver(account.ref, body, 'f'.repeat(64));
    const short = await deliver(account.ref, body, 'nope');
    const unsigned = await http()
      .post(`/api/v1/webhooks/payments/simulator/${account.ref}`)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
    const tampered = await deliver(
      account.ref,
      event({ orderId, amountMinor: 1 }),
      SimulatorProvider.sign(account.secret, body),
    );
    const unknown = await deliver('sim_nobody', body, SimulatorProvider.sign('x', body));
    const wrongProvider = await http()
      .post(`/api/v1/webhooks/payments/manual/${account.ref}`)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
    const nobody = await http()
      .post(`/api/v1/webhooks/payments/razorpay/${account.ref}`)
      .set('Content-Type', 'application/json')
      .send(body.toString('utf8'));
    for (const res of [forged, short, unsigned, tampered, unknown, wrongProvider, nobody])
      expect(res.status).toBe(401);
    expect(unknown.body.error.code).toBe(forged.body.error.code);
    const reasons = warn.mock.calls
      .filter((c) => c[1] === 'payment.webhook.rejected')
      .map((c) => (c[0] as { reason: string }).reason);
    expect(reasons).toEqual(
      expect.arrayContaining(['bad_signature', 'unknown_account', 'provider_not_enabled']),
    );
    warn.mockRestore();
    expect((await get(ownerA, `/payments/${paymentId}`)).body).toMatchObject({ status: 'PENDING' });
  });

  it('one academy’s webhook never touches another’s payment', async () => {
    const victim = await started(b, ownerB);
    const accountA = await accountOf(a);
    const accountB = await accountOf(b);
    const body = event({ orderId: victim.orderId });
    // A's secret, on B's address: refused.
    const crossed = await deliver(
      accountB.ref,
      body,
      SimulatorProvider.sign(accountA.secret, body),
    );
    expect(crossed.status).toBe(401);
    // A's own address naming B's order: nothing of B's is found; A's people are told.
    const own = await deliver(accountA.ref, body, SimulatorProvider.sign(accountA.secret, body));
    expect(own.status).toBe(200);
    expect((await get(ownerB, `/payments/${victim.paymentId}`)).body).toMatchObject({
      status: 'PENDING',
    });
    expect((await exceptions(a, 'UNKNOWN_ORDER')).rows.map((r) => r.reference)).toContain(
      victim.orderId,
    );
    expect((await exceptions(b, 'UNKNOWN_ORDER')).rows.map((r) => r.reference)).not.toContain(
      victim.orderId,
    );
    // The same event id in B is B's own and is processed: ids don't collide across academies.
    const sameId = await deliver(accountB.ref, body, SimulatorProvider.sign(accountB.secret, body));
    expect(sameId.body).toEqual({ received: true, duplicate: false });
    expect((await get(ownerB, `/payments/${victim.paymentId}`)).body).toMatchObject({
      status: 'CONFIRMED',
    });
  });

  it('money that doesn’t add up isn’t confirmed: a person looks at it', async () => {
    const { paymentId, orderId, invoice } = await started(a, ownerA);
    const account = await accountOf(a);
    const body = event({ orderId, amountMinor: 99_999 });
    expect(
      (await deliver(account.ref, body, SimulatorProvider.sign(account.secret, body))).status,
    ).toBe(200);
    expect((await get(ownerA, `/payments/${paymentId}`)).body).toMatchObject({ status: 'PENDING' });
    expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(0);
    expect((await exceptions(a, 'AMOUNT_MISMATCH')).rows.map((r) => r.payment_id)).toContain(
      paymentId,
    );
  });

  it('paid after it failed gets flagged rather than quietly receipted', async () => {
    const { parent, paymentId, orderId } = await started(a, ownerA);
    await simulate(parent.session, a.slug, paymentId, { outcome: 'FAILURE' });
    const account = await accountOf(a);
    const body = event({ orderId });
    await deliver(account.ref, body, SimulatorProvider.sign(account.secret, body));
    expect((await get(ownerA, `/payments/${paymentId}`)).body).toMatchObject({ status: 'FAILED' });
    expect((await exceptions(a, 'PAID_AFTER_FAILED')).rows.map((r) => r.payment_id)).toContain(
      paymentId,
    );
  });

  it('an account disconnected later still gets its events: money was received', async () => {
    const t = await createTenantFixture(urls.migrator, { name: 'Leaving Academy', plan: 'pro' });
    const owner = await login(`${t.slug}.localhost`, t.user.email);
    await send(owner, '/settings/finance/gateway/simulator');
    const { paymentId, orderId, parent, invoice } = await started(t, owner);
    const account = await accountOf(t);
    const off = await http()
      .delete('/api/v1/settings/finance/gateway')
      .set('Host', owner.host)
      .set('Cookie', owner.cookie)
      .set('x-csrf-token', owner.csrf);
    expect(off.status).toBe(204);
    const body = event({ orderId });
    expect(
      (await deliver(account.ref, body, SimulatorProvider.sign(account.secret, body))).status,
    ).toBe(200);
    expect((await get(owner, `/payments/${paymentId}`)).body).toMatchObject({
      status: 'CONFIRMED',
    });
    // New payments have stopped.
    const next = await issued(
      owner,
      (await get(owner, `/invoices/${invoice.id}`)).body.studentId,
      5000,
    );
    const refused = await pay(parent.session, t.slug, next.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details[0].issue).toBe('gateway_not_connected');
  });

  it('who may pay: consent, own child, own academy; never more than is owed or twice at once', async () => {
    const { parent, invoice } = await family(a, ownerA, 100_000);
    const stranger = await hubParent(a);
    expect((await pay(stranger.session, a.slug, invoice.id)).status).toBe(404);
    const noConsent = await family(a, ownerA, 100_000, { consented: false });
    expect((await pay(noConsent.parent.session, a.slug, noConsent.invoice.id)).status).toBe(404);
    expect((await pay(parent.session, b.slug, invoice.id)).status).toBe(404);

    const over = await pay(parent.session, a.slug, invoice.id, { amountMinor: 100_001 });
    expect(over.status).toBe(400);
    expect(over.body.error.details[0].issue).toBe('exceeds_balance');

    const key = crypto.randomUUID();
    const first = await pay(parent.session, a.slug, invoice.id, {}, key);
    expect(first.status).toBe(201);
    const replay = await pay(parent.session, a.slug, invoice.id, {}, key);
    expect(replay.body).toEqual(first.body);
    const twice = await pay(parent.session, a.slug, invoice.id);
    expect(twice.status).toBe(409);
    expect(twice.body.error.details[0].issue).toBe('payment_in_progress');
    // Someone else's payment isn't there to poll or finish.
    const id = (first.body as { paymentId: string }).paymentId;
    expect((await get(stranger.session, `/hub/academies/${a.slug}/payments/${id}`)).status).toBe(
      404,
    );
    expect((await simulate(stranger.session, a.slug, id, { outcome: 'SUCCESS' })).status).toBe(404);
  });

  it('a client can’t confirm: nothing in a body or a redirect moves money', async () => {
    const { parent, paymentId } = await started(a, ownerA);
    const res = await pay(parent.session, a.slug, newId(), { status: 'CONFIRMED' });
    expect(res.status).toBe(404);
    const undelivered = await simulate(parent.session, a.slug, paymentId, {
      outcome: 'SUCCESS',
      delivery: 'NONE',
    });
    // The customer finished at the gateway, but no event came: still pending, never assumed.
    expect(undelivered.body).toMatchObject({ status: 'PENDING', receiptNumber: null });
  });

  describe('reconciliation', () => {
    const run = (t: TenantFixture, at = new Date(Date.now() + 20 * 60_000)) =>
      app.get(ReconciliationProcessor).process({ data: { tenantId: t.id } }, at);

    it('a missed webhook is found by asking the gateway, once', async () => {
      const { parent, paymentId, invoice } = await started(a, ownerA);
      await simulate(parent.session, a.slug, paymentId, { outcome: 'SUCCESS', delivery: 'NONE' });
      await run(a);
      expect((await get(ownerA, `/payments/${paymentId}`)).body).toMatchObject({
        status: 'CONFIRMED',
      });
      await run(a);
      expect((await get(ownerA, `/invoices/${invoice.id}`)).body.paidMinor).toBe(100_000);
      const { rows } = await su.query(`SELECT 1 FROM payment_allocation WHERE payment_id = $1`, [
        paymentId,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('a young payment is left alone; a day-old one with no answer becomes an exception', async () => {
      const { paymentId, orderId } = await started(a, ownerA);
      await run(a, new Date());
      expect((await exceptions(a, 'STUCK_PENDING')).rows.map((r) => r.reference)).not.toContain(
        orderId,
      );
      await run(a, new Date(Date.now() + 25 * 3_600_000));
      await run(a, new Date(Date.now() + 26 * 3_600_000));
      const stuck = (await exceptions(a, 'STUCK_PENDING')).rows.filter(
        (r) => r.reference === orderId,
      );
      expect(stuck.map((r) => r.payment_id)).toEqual([paymentId]);
      expect((await get(ownerA, `/payments/${paymentId}`)).body).toMatchObject({
        status: 'PENDING',
      });
    });

    it('an order that never started is given up on', async () => {
      const { invoice } = await family(a, ownerA);
      const account = await accountOf(a);
      const id = newId();
      await su.query(
        `INSERT INTO payment (id, tenant_id, branch_id, student_id, method, source, status, amount_minor, currency, paid_on, allocate_to, provider_account_id, updated_at)
         SELECT $1, tenant_id, branch_id, student_id, 'ONLINE_GATEWAY', 'GATEWAY', 'INITIATED', 1000, currency, CURRENT_DATE, ARRAY[id], $2, now()
         FROM invoice WHERE id = $3`,
        [id, account.id, invoice.id],
      );
      await run(a);
      expect((await get(ownerA, `/payments/${id}`)).body).toMatchObject({ status: 'FAILED' });
    });

    it('a settlement that matches nothing is flagged; matching ones aren’t', async () => {
      const account = await accountOf(b);
      const { parent, paymentId } = await started(b, ownerB);
      await simulate(parent.session, b.slug, paymentId, { outcome: 'SUCCESS' });
      await redis.rpush(
        `simulator:settlements:${account.ref}`,
        JSON.stringify({ reference: 'sim_settle_stray', orderId: 'sim_order_x', amountMinor: 500 }),
      );
      await run(b);
      await run(b);
      expect((await exceptions(b, 'SETTLEMENT_MISMATCH')).rows.map((r) => r.reference)).toEqual([
        'sim_settle_stray',
      ]);
    });

    it('exceptions are listed and resolved by finance.reconcile; another academy can’t see or resolve one', async () => {
      const list = await get(ownerB, '/reconciliation/exceptions');
      expect(list.status).toBe(200);
      const open = (list.body as { items: { id: string; kind: string }[] }).items;
      expect(open.length).toBeGreaterThan(0);
      const id = open[0]!.id;

      const otherList = await get(ownerA, '/reconciliation/exceptions');
      expect((otherList.body as { items: { id: string }[] }).items.map((e) => e.id)).not.toContain(
        id,
      );
      const other = await send(ownerA, `/reconciliation/exceptions/${id}/resolve`, {
        resolution: 'Not ours to touch',
      });
      expect(other.status).toBe(404);

      const done = await send(ownerB, `/reconciliation/exceptions/${id}/resolve`, {
        resolution: 'Checked with the bank',
      });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(done.body).toMatchObject({ status: 'RESOLVED', resolution: 'Checked with the bank' });
      const twice = await send(ownerB, `/reconciliation/exceptions/${id}/resolve`, {
        resolution: 'Again',
      });
      expect(twice.status).toBe(409);
    });
  });

  it('credentials never reach a response, a log line or the event table', async () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) =>
      vi.spyOn(Logger.prototype, m),
    );
    const { parent, paymentId, orderId } = await started(a, ownerA);
    const account = await accountOf(a);
    const { rows } = await su.query<{ credentials_cipher: string; webhook_cipher: string }>(
      `SELECT credentials_cipher, webhook_cipher FROM tenant_payment_account WHERE id = $1`,
      [account.id],
    );
    const ciphers = rows[0]!;
    const keys = app.get<MasterKeyRing>(MASTER_KEYS);
    const secrets = [
      account.secret,
      decryptSecret(ciphers.credentials_cipher, keys),
      ciphers.credentials_cipher,
      ciphers.webhook_cipher,
    ];
    // Sealed at rest.
    expect(ciphers.webhook_cipher).not.toContain(account.secret);

    const gateway = await get(ownerA, '/settings/finance/gateway');
    expect(gateway.body.account).toMatchObject({ provider: 'simulator', mode: 'TEST' });
    const settings = await get(ownerA, '/settings/finance');
    expect(settings.body.gateway).toEqual({ connected: true, provider: 'simulator' });
    const paid = await simulate(parent.session, a.slug, paymentId, { outcome: 'SUCCESS' });
    const forged = await deliver(account.ref, event({ orderId }), 'f'.repeat(64));
    const haystack = JSON.stringify([
      gateway.body,
      settings.body,
      paid.body,
      forged.body,
      spies.map((s) => s.mock.calls),
      (await su.query(`SELECT payload FROM gateway_event WHERE tenant_id = $1`, [a.id])).rows,
      (await su.query(`SELECT metadata, before, after FROM audit_log WHERE tenant_id = $1`, [a.id]))
        .rows,
    ]);
    for (const secret of secrets) expect(haystack).not.toContain(secret);
    spies.forEach((s) => s.mockRestore());
  });

  describe('with only the manual provider (production’s setting)', () => {
    let manualApp: INestApplication;
    const manual = () => request(manualApp.getHttpServer());

    beforeAll(async () => {
      manualApp = await createTestApp(testConfig({ PAYMENT_PROVIDERS: 'manual' }));
    });
    afterAll(async () => {
      await manualApp.close();
    });

    it('the simulator does not exist: connect, pay, checkout 404 or refuse; webhooks 401', async () => {
      const auth = (r: request.Test, s: Session) =>
        r
          .set('Host', s.host)
          .set('Cookie', s.cookie)
          .set('x-csrf-token', s.csrf)
          .set('Idempotency-Key', crypto.randomUUID());
      const t = await createTenantFixture(urls.migrator, { name: 'Manual Academy', plan: 'pro' });
      const owner = await login(`${t.slug}.localhost`, t.user.email);
      const connect = await auth(
        manual().post('/api/v1/settings/finance/gateway/simulator'),
        owner,
      ).send({});
      expect(connect.status).toBe(404);

      // A row left over from before is not "connected" here, and can't take payments.
      const { parent, paymentId, invoice } = await started(a, ownerA);
      const settings = await auth(manual().get('/api/v1/settings/finance'), ownerA);
      expect(settings.body.gateway).toEqual({ connected: false, provider: null });
      const pays = await auth(
        manual().post(`/api/v1/hub/academies/${a.slug}/invoices/${invoice.id}/pay`),
        parent.session,
      ).send({});
      expect(pays.status).toBe(409);
      const checkout = await auth(
        manual().post(`/api/v1/hub/academies/${a.slug}/payments/${paymentId}/simulate-checkout`),
        parent.session,
      ).send({ outcome: 'SUCCESS' });
      expect(checkout.status).toBe(404);
      const account = await accountOf(a);
      const body = event({ orderId: 'x' });
      const hook = await manual()
        .post(`/api/v1/webhooks/payments/simulator/${account.ref}`)
        .set('Content-Type', 'application/json')
        .set(SIMULATOR_SIGNATURE_HEADER, SimulatorProvider.sign(account.secret, body))
        .send(body.toString('utf8'));
      expect(hook.status).toBe(401);
    });
  });

  it('flag off: online payment routes are the same 404 as everything else', async () => {
    const flags = app.get(FeatureFlagService);
    const spy = vi.spyOn(flags, 'isEnabled').mockResolvedValue(false);
    const { parent, invoice } = await family(a, ownerA);
    const res = await pay(parent.session, a.slug, invoice.id);
    spy.mockRestore();
    expect(res.status).toBe(404);
  });
});

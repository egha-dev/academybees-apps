import { hashPassword } from '@academybee/auth';
import { addDays, currentNoticeVersion, localDate, newId } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { FeatureFlagService } from '../../src/core/flags/feature-flag.service.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * "I've paid" from the Family Hub (G-30, C-144, ADR-039): a report is only a claim until staff
 * decide, and only a linked parent with current consent for that child can make one. Anything
 * else is the same 404.
 */
const urls = inject('databaseUrls');
const HUB = 'app.localhost';
const today = () => localDate(new Date(), 'Asia/Kolkata');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

type Session = { host: string; cookie: string; csrf: string };
let utr = 500_000;
const nextUtr = () => `HUB${++utr}`;

describe('hub reported payments', () => {
  let app: INestApplication;
  let su: pg.Client;
  let s3: Server;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  const objects = new Map<string, Buffer>();
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
  const send = (s: Session, path: string, body: unknown = {}, key = crypto.randomUUID()) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', key)
      .send(body as object);

  async function newStudent(t: TenantFixture) {
    const id = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, updated_at)
       VALUES ($1, $2, $3, 'Hub Child', $4, CURRENT_DATE, now())`,
      [id, t.id, t.branchId, `HUB-${id.slice(-8)}`],
    );
    return id;
  }
  /** A signed-in hub user, an ACTIVE parent member of `t` (no child linked yet). */
  async function hubParent(t: TenantFixture) {
    const userId = newId();
    const email = `hub-${userId.slice(-10)}@example.test`;
    await su.query(
      `INSERT INTO "user" (id, email, name, email_verified_at, updated_at) VALUES ($1, $2, 'Hub Parent', now(), now())`,
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
      `INSERT INTO parent (id, tenant_id, full_name, user_id, updated_at) VALUES ($1, $2, 'Hub Parent', $3, now())`,
      [parentId, t.id, userId],
    );
    return { userId, parentId, email, membershipId, session: await login(HUB, email) };
  }
  const link = (t: TenantFixture, parentId: string, studentId: string) =>
    su.query(
      `INSERT INTO parent_student (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
       VALUES ($1, $2, $3, $4, 'MOTHER', true)`,
      [newId(), t.id, parentId, studentId],
    );
  const consent = (
    t: TenantFixture,
    parentId: string,
    studentId: string,
    action: 'GRANT' | 'WITHDRAW' = 'GRANT',
    channel: 'FAMILY_HUB' | 'PAPER' = 'FAMILY_HUB',
    purposes = ['service'],
  ) =>
    su.query(
      `INSERT INTO consent_record (id, tenant_id, parent_id, student_id, action, purposes, notice_version, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId(), t.id, parentId, studentId, action, purposes, currentNoticeVersion(), channel],
    );
  async function issued(s: Session, studentId: string, amountMinor = 100_000) {
    const res = await send(s, '/invoices', {
      studentId,
      dueDate: addDays(today(), 10),
      charges: [{ label: 'Tuition', amountMinor }],
      issue: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; version: number };
  }
  /** A parent linked to a child with current consent, and that child's open invoice. */
  async function family(amountMinor = 100_000) {
    const parent = await hubParent(a);
    const studentId = await newStudent(a);
    await link(a, parent.parentId, studentId);
    await consent(a, parent.parentId, studentId);
    const invoice = await issued(owner, studentId, amountMinor);
    return { parent, studentId, invoice };
  }
  const reportOn = (s: Session, invoiceId: string, over: object = {}, slug = a.slug) =>
    send(s, `/hub/academies/${slug}/invoices/${invoiceId}/reported-payments`, {
      reference: nextUtr(),
      amountMinor: 100_000,
      ...over,
    });
  const intents = (studentId: string) =>
    su.query<{ kind: string; payload: { reason?: string; receiptNumber?: string } }>(
      `SELECT kind, payload FROM notification_intent WHERE student_id = $1 ORDER BY id`,
      [studentId],
    );

  beforeAll(async () => {
    s3 = createServer((r: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => {
        const path = (r.url ?? '').split('?')[0]!;
        if (r.method === 'PUT') objects.set(path, Buffer.concat(chunks));
        if (r.method === 'DELETE') objects.delete(path);
        res.writeHead(r.method === 'DELETE' ? 204 : 200).end();
      });
    });
    await new Promise<void>((resolve) => s3.listen(0, '127.0.0.1', resolve));
    const port = (s3.address() as AddressInfo).port;
    app = await createTestApp(
      testConfig({
        MEDIA_S3_ENDPOINT: `http://127.0.0.1:${port}`,
        MEDIA_S3_ACCESS_KEY_ID: 'test-key',
        MEDIA_S3_SECRET_ACCESS_KEY: 'test-secret',
        MEDIA_PUBLIC_BUCKET: 'public-branding',
        MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
        MEDIA_PRIVATE_BUCKET: 'private-media',
      }),
    );
    su = new pg.Client({ connectionString: urls.superuser });
    su.setTypeParser(1082, (v) => v);
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Hub Pay Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Hub Pay Academy', plan: 'pro' }),
    ]);
  });
  afterAll(async () => {
    await su.end();
    await app.close();
    await new Promise((resolve) => s3.close(resolve));
  });
  beforeEach(async () => {
    const redis = new Redis(inject('redisUrl'));
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    owner = await login(`${a.slug}.localhost`, a.user.email);
  });

  it('a report waits: PENDING, nothing applied, no receipt; staff are told', async () => {
    const { parent, studentId, invoice } = await family();
    const res = await reportOn(parent.session, invoice.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ invoiceId: invoice.id, status: 'PENDING' });

    const staffView = await get(owner, `/payments/${res.body.id}`);
    expect(staffView.body).toMatchObject({
      source: 'PARENT_REPORTED',
      method: 'UPI',
      status: 'PENDING',
      receiptNumber: null,
      allocations: [],
    });
    expect((await get(owner, `/invoices/${invoice.id}`)).body.paidMinor).toBe(0);
    const queue = await get(owner, `/payments?status=PENDING&studentId=${studentId}`);
    expect((queue.body as { items: { id: string }[] }).items.map((p) => p.id)).toEqual([
      res.body.id,
    ]);

    const told = await get(owner, '/notifications');
    const note = (told.body as { items: { kind: string }[] }).items.find(
      (n) => n.kind === 'PAYMENT_REPORTED',
    );
    expect(note).toMatchObject({ params: { student: 'Hub Child' } });
    // Parents don't get the staff note.
    const parentNotes = await su.query('SELECT 1 FROM notification WHERE recipient_id = $1', [
      parent.membershipId,
    ]);
    expect(parentNotes.rowCount).toBe(0);
  });

  it('verify: confirmed, applied to that invoice, exactly one receipt, the parent’s intent', async () => {
    const { parent, studentId, invoice } = await family();
    const { body: reported } = await reportOn(parent.session, invoice.id);
    const staff = (await get(owner, `/payments/${reported.id}`)).body;
    const res = await send(owner, `/payments/${reported.id}/confirm`, { version: staff.version });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.receiptNumber).toMatch(/^RCT\//);
    expect(res.body.allocations).toEqual([
      { invoiceId: invoice.id, invoiceNumber: expect.any(String), amountMinor: 100_000 },
    ]);
    expect((await get(owner, `/invoices/${invoice.id}`)).body.status).toBe('PAID');
    const { rows } = await intents(studentId);
    expect(rows.map((r) => r.kind)).toEqual(['PAYMENT_CONFIRMED']);
    expect(rows[0]!.payload.receiptNumber).toBe(res.body.receiptNumber);
    const verified = await su.query<{ verified_by_id: string | null }>(
      'SELECT verified_by_id FROM payment WHERE id = $1',
      [reported.id],
    );
    expect(verified.rows[0]!.verified_by_id).not.toBeNull();
  });

  it('reject: failed, no receipt, nothing applied, the parent’s intent carries the reason', async () => {
    const { parent, studentId, invoice } = await family();
    const { body: reported } = await reportOn(parent.session, invoice.id);
    const res = await send(owner, `/payments/${reported.id}/reject`, {
      version: 1,
      reason: 'No such UTR in our bank statement',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: 'FAILED', receiptNumber: null, allocations: [] });
    expect((await get(owner, `/invoices/${invoice.id}`)).body.paidMinor).toBe(0);
    const { rows } = await intents(studentId);
    expect(rows.map((r) => r.kind)).toEqual(['PAYMENT_REJECTED']);
    expect(rows[0]!.payload.reason).toBe('No such UTR in our bank statement');
  });

  it('a parent cannot verify their own report, by any route', async () => {
    const { parent, invoice } = await family();
    const { body: reported } = await reportOn(parent.session, invoice.id);
    const denied = await send(parent.session, `/payments/${reported.id}/confirm`, { version: 1 });
    expect([401, 403, 404]).toContain(denied.status);
    expect((await get(owner, `/payments/${reported.id}`)).body.status).toBe('PENDING');
    // The body can't ask for it either.
    const sneaky = await reportOn(parent.session, invoice.id, {
      status: 'CONFIRMED',
      receiptNumber: 'RCT/FAKE',
    });
    if (sneaky.status === 201) {
      expect(sneaky.body.status).toBe('PENDING');
      const row = (await get(owner, `/payments/${sneaky.body.id}`)).body;
      expect(row.receiptNumber).toBeNull();
    } else expect(sneaky.status).toBe(400);
  });

  it('the same UTR twice is refused; after a rejection it can be reported again', async () => {
    const { parent, invoice } = await family();
    const reference = nextUtr();
    const first = await reportOn(parent.session, invoice.id, { reference });
    expect(first.status).toBe(201);
    const twice = await reportOn(parent.session, invoice.id, { reference });
    expect(twice.status).toBe(409);
    expect(twice.body.error.details).toEqual([{ path: 'reference', issue: 'duplicate_reference' }]);
    await send(owner, `/payments/${first.body.id}/reject`, { version: 1, reason: 'Wrong amount' });
    expect((await reportOn(parent.session, invoice.id, { reference })).status).toBe(201);
  });

  it('a replayed key reports once', async () => {
    const { parent, studentId, invoice } = await family();
    const key = crypto.randomUUID();
    const body = { reference: nextUtr(), amountMinor: 100_000 };
    const path = `/hub/academies/${a.slug}/invoices/${invoice.id}/reported-payments`;
    const one = await send(parent.session, path, body, key);
    const two = await send(parent.session, path, body, key);
    expect(one.status).toBe(201);
    expect(two.body.id).toBe(one.body.id);
    const rows = await su.query('SELECT 1 FROM payment WHERE student_id = $1', [studentId]);
    expect(rows.rowCount).toBe(1);
  });

  it('nothing tells a stranger anything: every refusal is the same 404', async () => {
    const { parent, studentId, invoice } = await family();
    const expectHidden = (res: request.Response) => {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    };
    // Another child in the same academy (IDOR).
    const otherChild = await newStudent(a);
    const otherInvoice = await issued(owner, otherChild);
    expectHidden(await reportOn(parent.session, otherInvoice.id));
    // Linked to a child, but with no consent on record.
    const noConsent = await newStudent(a);
    await link(a, parent.parentId, noConsent);
    expectHidden(await reportOn(parent.session, (await issued(owner, noConsent)).id));
    // Consent on paper is not the hub's service consent (C-144).
    const paper = await newStudent(a);
    await link(a, parent.parentId, paper);
    await consent(a, parent.parentId, paper, 'GRANT', 'FAMILY_HUB', ['photos']);
    expectHidden(await reportOn(parent.session, (await issued(owner, paper)).id));
    await consent(a, parent.parentId, paper, 'GRANT', 'PAPER');
    expectHidden(await reportOn(parent.session, (await issued(owner, paper)).id));
    // Withdrawn since.
    const withdrawn = await newStudent(a);
    await link(a, parent.parentId, withdrawn);
    await consent(a, parent.parentId, withdrawn);
    const open = await issued(owner, withdrawn);
    expect((await reportOn(parent.session, open.id)).status).toBe(201);
    await consent(a, parent.parentId, withdrawn, 'WITHDRAW');
    expectHidden(await reportOn(parent.session, open.id));
    // A draft is not there yet.
    const draft = await send(owner, '/invoices', {
      studentId,
      dueDate: today(),
      charges: [{ label: 'Draft', amountMinor: 100 }],
    });
    expectHidden(await reportOn(parent.session, draft.body.id));
    // No such academy; another academy's invoice under this academy's address, and the reverse.
    expectHidden(await reportOn(parent.session, invoice.id, {}, 'no-such-academy'));
    expectHidden(await reportOn(parent.session, invoice.id, {}, b.slug));
    const foreign = b.people.invoiceId;
    expectHidden(await reportOn(parent.session, foreign));
    // A hub user with no membership in this academy.
    const outsider = await hubParent(b);
    expectHidden(await reportOn(outsider.session, invoice.id));
    // Linked with consent, but a role without `payment.report` (a staff member on the hub).
    const staffOnHub = await hubParent(a);
    await su.query('UPDATE membership_role SET role_id = $1 WHERE membership_id = $2', [
      a.roleIds.teacher,
      staffOnHub.membershipId,
    ]);
    // Role changes clear the membership cache; hub sign-in has just filled it.
    const redis = new Redis(inject('redisUrl'));
    await redis.del(`auth:mem:${a.id}:${staffOnHub.userId}`);
    await redis.quit();
    await link(a, staffOnHub.parentId, studentId);
    await consent(a, staffOnHub.parentId, studentId);
    const roles = await su.query<{ key: string }>(
      `SELECT r.key FROM membership_role mr JOIN role r ON r.id = mr.role_id WHERE mr.membership_id = $1`,
      [staffOnHub.membershipId],
    );
    expect(roles.rows).toEqual([{ key: 'teacher' }]);
    expectHidden(await reportOn(staffOnHub.session, invoice.id));
  });

  it('a closed invoice can’t be reported on', async () => {
    const { parent, studentId, invoice } = await family(10_000);
    await send(owner, '/payments/cash', { studentId, amountMinor: 10_000 });
    const closed = await reportOn(parent.session, invoice.id);
    expect(closed.status).toBe(409);
    expect(closed.body.error.details).toEqual([
      { path: `invoiceIds.${invoice.id}`, issue: 'invoice_not_open' },
    ]);
  });

  it('only on the Family Hub host, signed in', async () => {
    const { invoice } = await family();
    const onAcademy = await reportOn(owner, invoice.id);
    expect(onAcademy.status).toBe(404);
    const anonymous = await http()
      .post(`/api/v1/hub/academies/${a.slug}/invoices/${invoice.id}/reported-payments`)
      .set('Host', HUB)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reference: nextUtr(), amountMinor: 100 });
    expect(anonymous.status).toBe(401);
  });

  it('the flag off hides the route for that academy', async () => {
    const { parent, invoice } = await family();
    const flags = app.get(FeatureFlagService);
    await su.query(
      `INSERT INTO feature_flag (key, description, owner, expires_on, updated_at)
       VALUES ('p7-hub-payments', 'test', 'PO', '2027-06-30', now()) ON CONFLICT (key) DO NOTHING`,
    );
    const id = newId();
    await su.query(
      `INSERT INTO feature_flag_override (id, flag_key, tenant_id, enabled, updated_at)
       VALUES ($1, 'p7-hub-payments', $2, false, now())`,
      [id, a.id],
    );
    flags.invalidate();
    try {
      expect((await reportOn(parent.session, invoice.id)).status).toBe(404);
    } finally {
      await su.query('DELETE FROM feature_flag_override WHERE id = $1', [id]);
      flags.invalidate();
    }
    expect((await reportOn(parent.session, invoice.id)).status).toBe(201);
  });

  describe('screenshot (optional)', () => {
    const upload = (s: Session, paymentId: string, slug = a.slug) =>
      http()
        .put(`/api/v1/hub/academies/${slug}/reported-payments/${paymentId}/evidence`)
        .set('Host', s.host)
        .set('Cookie', s.cookie)
        .set('x-csrf-token', s.csrf)
        .set('content-type', 'image/png')
        .send(PNG);

    it('goes to the private bucket; staff with payment.verify get a short link, audited', async () => {
      const { parent, invoice } = await family();
      const { body: reported } = await reportOn(parent.session, invoice.id);
      expect((await upload(parent.session, reported.id)).status).toBe(204);
      expect([...objects.keys()].some((k) => k.includes('/private-media/t/'))).toBe(true);
      const staff = await get(owner, `/payments/${reported.id}`);
      expect(staff.body.hasEvidence).toBe(true);
      const link = await get(owner, `/payments/${reported.id}/evidence`);
      expect(link.status, JSON.stringify(link.body)).toBe(200);
      expect(link.body.url).toContain('X-Amz-Expires=300');
      const audit = await su.query(
        `SELECT 1 FROM audit_log WHERE action = 'finance.payment_evidence_viewed' AND entity_id = $1`,
        [reported.id],
      );
      expect(audit.rowCount).toBe(1);
    });

    it('another academy can’t read a screenshot', async () => {
      const { parent, invoice } = await family();
      const { body: reported } = await reportOn(parent.session, invoice.id);
      expect((await upload(parent.session, reported.id)).status).toBe(204);
      const otherOwner = await login(`${b.slug}.localhost`, b.user.email);
      expect((await get(otherOwner, `/payments/${reported.id}/evidence`)).status).toBe(404);
      expect((await get(otherOwner, `/payments/${reported.id}`)).status).toBe(404);
      // Nor can the parent read it back through the staff route.
      expect((await get(parent.session, `/payments/${reported.id}/evidence`)).status).not.toBe(200);
    });

    it('only their own report, only images, only while it waits', async () => {
      const { parent, invoice } = await family();
      const { body: reported } = await reportOn(parent.session, invoice.id);
      const other = await family();
      expect((await upload(other.parent.session, reported.id)).status).toBe(404);
      const text = await http()
        .put(`/api/v1/hub/academies/${a.slug}/reported-payments/${reported.id}/evidence`)
        .set('Host', parent.session.host)
        .set('Cookie', parent.session.cookie)
        .set('x-csrf-token', parent.session.csrf)
        .set('content-type', 'application/octet-stream')
        .send(Buffer.from('not an image at all'));
      expect(text.status).toBe(400);
      await send(owner, `/payments/${reported.id}/reject`, { version: 1, reason: 'Wrong UTR' });
      expect((await upload(parent.session, reported.id)).status).toBe(409);
    });
  });
});

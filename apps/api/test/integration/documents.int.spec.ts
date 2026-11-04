import { hashToken } from '@academybee/auth';
import { addDays, localDate, newId } from '@academybee/contracts';
import { createTenantFixture, FIXTURE_PASSWORD, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { DocumentsProcessor } from '../../src/modules/finance/documents/documents.processor.js';
import { PdfRenderer } from '../../src/modules/finance/documents/pdf-renderer.js';
import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Receipts and invoices as files (G-18, C-137, C-160), printed by real Chromium. A document says
 * what was true when it was issued, for ever, and leaves the academy only through a link that can
 * expire and be revoked.
 */
const urls = inject('databaseUrls');
const today = () => localDate(new Date(), 'Asia/Kolkata');
const GSTIN = '29ABCDE1234F1Z5';

type Session = { host: string; cookie: string; csrf: string };

async function pdfText(bytes: Uint8Array) {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
    text += '\n';
  }
  const first = await doc.getPage(1);
  const [, , width] = first.getViewport({ scale: 1 }).viewBox as [number, number, number, number];
  return { text, width, pages: doc.numPages };
}

describe('finance documents', () => {
  let app: INestApplication;
  let su: pg.Client;
  let s3: Server;
  let a: TenantFixture;
  let b: TenantFixture;
  let ownerA: Session;
  let ownerB: Session;
  const objects = new Map<string, Buffer>();
  const http = () => request(app.getHttpServer());

  async function login(host: string, email: string): Promise<Session> {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Host', host)
      .send({ identifier: email, password: FIXTURE_PASSWORD });
    expect(res.status, `sign-in ${email}: ${JSON.stringify(res.body)}`).toBe(200);
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
  const send = (s: Session, path: string, body: unknown = {}) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);

  async function newStudent(t: TenantFixture, name = 'Document Child') {
    const id = newId();
    await su.query(
      `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, now())`,
      [id, t.id, t.branchId, name, `DOC-${id.slice(-8)}`],
    );
    return id;
  }
  async function issued(s: Session, studentId: string, amountMinor = 100_000) {
    const res = await send(s, '/invoices', {
      studentId,
      dueDate: addDays(today(), 10),
      charges: [{ label: 'Tuition', amountMinor }],
      issue: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; number: string; version: number };
  }
  async function paid(s: Session, studentId: string, amountMinor = 100_000) {
    const res = await send(s, '/payments/cash', { studentId, amountMinor, paidOn: today() });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; receiptNumber: string };
  }
  /** Ask for it, wait for the job, return the file. */
  async function ready(s: Session, base: string, layout: 'A4' | 'MOBILE' = 'A4') {
    const started = await send(s, `${base}/documents/${layout}`);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    for (let i = 0; i < 300; i++) {
      const res = await get(s, `${base}/documents/${layout}`);
      if (res.body.status === 'READY') {
        const key = decodeURIComponent(new URL(res.body.url as string).pathname);
        return { url: res.body.url as string, key, bytes: objects.get(key)! };
      }
      expect(res.body.status).not.toBe('FAILED');
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('document never became ready');
  }
  const receiptBase = (id: string) => `/payments/${id}`;
  const invoiceBase = (id: string) => `/invoices/${id}`;
  const open = (host: string, url: string) =>
    http()
      .get(new URL(url).pathname)
      .set('Host', host)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    s3 = createServer((r: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => {
        const path = decodeURIComponent((r.url ?? '').split('?')[0]!);
        if (r.method === 'PUT') objects.set(path, Buffer.concat(chunks));
        if (r.method === 'DELETE') objects.delete(path);
        if (r.method === 'GET') {
          const found = objects.get(path);
          res.writeHead(found ? 200 : 404).end(found);
          return;
        }
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
      createTenantFixture(urls.migrator, { name: 'Document Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Document Academy', plan: 'pro' }),
    ]);
    ownerA = await login(`${a.slug}.localhost`, a.user.email);
    ownerB = await login(`${b.slug}.localhost`, b.user.email);
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
  });

  it('a receipt prints names in Indian scripts, with its number and amount', async () => {
    const names = [
      'आरव शर्मा',
      'கார்த்திக்',
      'సాయి',
      'ಅನನ್ಯ',
      'മീര',
      'অরিন্দম',
      'ગૌરવ',
      'ਗੁਰਪ੍ਰੀਤ',
      'ଅନିଲ',
    ];
    const studentId = await newStudent(a, names.join(' '));
    await issued(ownerA, studentId);
    const p = await paid(ownerA, studentId);
    const { bytes } = await ready(ownerA, receiptBase(p.id));
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    const { text, width } = await pdfText(bytes);
    expect(text).toContain(p.receiptNumber);
    expect(text).toContain('1,000.00');
    expect(text).toContain('₹');
    // Shaped text comes back from a PDF with simple runs intact: each script's first letters.
    for (const letters of ['आ', 'க', 'స', 'ಅ', 'മ', 'অ', 'ગ', 'ਗ', 'ଅ'])
      expect(text, `script of ${letters}`).toContain(letters);
    expect(width).toBeGreaterThan(590);
  }, 60_000);

  it('the mobile version is its own narrow file', async () => {
    const studentId = await newStudent(a);
    await issued(ownerA, studentId);
    const p = await paid(ownerA, studentId);
    const a4 = await ready(ownerA, receiptBase(p.id));
    const mobile = await ready(ownerA, receiptBase(p.id), 'MOBILE');
    expect(mobile.key).not.toBe(a4.key);
    const { width, pages, text } = await pdfText(mobile.bytes);
    expect(width).toBeLessThan(320);
    expect(pages).toBe(1);
    expect(text).toContain(p.receiptNumber);
  }, 60_000);

  it('an invoice shows lines, GSTIN, how to pay, credit and the balance', async () => {
    const version = (await get(ownerA, '/settings/finance')).body.version as number;
    const set = await http()
      .patch('/api/v1/settings/finance')
      .set('Host', ownerA.host)
      .set('Cookie', ownerA.cookie)
      .set('x-csrf-token', ownerA.csrf)
      .send({
        version,
        tax: { gstin: GSTIN, rateBps: 1800, mode: 'EXCLUSIVE' },
        upi: { vpa: 'academy@upi', payeeName: 'Document Academy' },
        bank: {
          accountName: 'Document Academy',
          accountNumber: '123456789012',
          ifsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
        },
      });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const studentId = await newStudent(a);
    const inv = await issued(ownerA, studentId);
    const { bytes } = await ready(ownerA, invoiceBase(inv.id));
    const { text } = await pdfText(bytes);
    for (const expected of [
      inv.number,
      'Tuition',
      GSTIN,
      'academy@upi',
      'HDFC0001234',
      '1,180.00',
      'Balance due',
    ])
      expect(text, expected).toContain(expected);
    // Off again for the tests after this one.
    const after = (await get(ownerA, '/settings/finance')).body.version as number;
    await http()
      .patch('/api/v1/settings/finance')
      .set('Host', ownerA.host)
      .set('Cookie', ownerA.cookie)
      .set('x-csrf-token', ownerA.csrf)
      .send({ version: after, tax: null });
  }, 60_000);

  it('hostile text prints as text; the page runs nothing and loads nothing', async () => {
    const hostile = `<img src="http://127.0.0.1:9/x" onerror="alert(1)"><script>document.title='x'</script>`;
    const studentId = await newStudent(a, 'Hostile Child');
    await su.query(`UPDATE student SET full_name = $1 WHERE id = $2`, [hostile, studentId]);
    await issued(ownerA, studentId);
    const p = await paid(ownerA, studentId);
    const { text } = await pdfText((await ready(ownerA, receiptBase(p.id))).bytes);
    expect(text.replace(/\s+/g, '')).toContain('<script>');
  }, 60_000);

  it('a document never changes: later edits don’t reach it, reprints are the same file', async () => {
    const studentId = await newStudent(a, 'Original Name');
    await issued(ownerA, studentId);
    const p = await paid(ownerA, studentId);
    const first = await ready(ownerA, receiptBase(p.id));

    await su.query(`UPDATE student SET full_name = 'Changed Name' WHERE id = $1`, [studentId]);
    await su.query(`UPDATE tenant_branding SET display_name = 'Renamed' WHERE tenant_id = $1`, [
      a.id,
    ]);
    // A layout asked for only now still prints what was true at confirmation.
    const late = await ready(ownerA, receiptBase(p.id), 'MOBILE');
    const { text } = await pdfText(late.bytes);
    expect(text).toContain('Original Name');
    expect(text).not.toContain('Changed Name');
    expect(text).not.toContain('Renamed');
    await su.query(
      `UPDATE tenant_branding SET display_name = 'Document Academy' WHERE tenant_id = $1`,
      [a.id],
    );

    const again = await ready(ownerA, receiptBase(p.id));
    expect(again.key).toBe(first.key);
    expect(again.bytes.equals(first.bytes)).toBe(true);

    // And the database agrees, even for the app's own role.
    const role = new pg.Client({ connectionString: urls.app });
    await role.connect();
    await role.query(`BEGIN`);
    await role.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
    await expect(
      role.query(`UPDATE payment SET snapshot = '{}' WHERE id = $1`, [p.id]),
    ).rejects.toThrow(/snapshot never changes/);
    await role.query(`ROLLBACK`);
    await role.query(`BEGIN`);
    await role.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.id]);
    await expect(
      role.query(`UPDATE finance_document SET storage_key = 'x' WHERE payment_id = $1`, [p.id]),
    ).rejects.toThrow(/document never changes/);
    await role.query(`ROLLBACK`);
    await role.end();
  }, 60_000);

  it('nothing to print yet: drafts, waiting payments and cancelled invoices', async () => {
    const studentId = await newStudent(a);
    const draft = await send(ownerA, '/invoices', {
      studentId,
      dueDate: addDays(today(), 10),
      charges: [{ label: 'Tuition', amountMinor: 5000 }],
    });
    const res = await send(ownerA, `/invoices/${(draft.body as { id: string }).id}/documents/A4`);
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].issue).toBe('document_unavailable');

    const cheque = await send(ownerA, '/payments', {
      studentId,
      amountMinor: 5000,
      method: 'CHEQUE',
      chequeBank: 'HDFC Bank',
      chequeDate: today(),
      reference: `CHQ${newId().slice(-6)}`,
      paidOn: today(),
    });
    expect(cheque.status, JSON.stringify(cheque.body)).toBe(201);
    const waiting = await send(
      ownerA,
      `/payments/${(cheque.body as { id: string }).id}/documents/A4`,
    );
    expect(waiting.status).toBe(409);

    const inv = await issued(ownerA, studentId, 7000);
    const cancelled = await send(ownerA, `/invoices/${inv.id}/cancel`, {
      version: inv.version,
      reason: 'Issued by mistake',
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect((await send(ownerA, `/invoices/${inv.id}/documents/A4`)).status).toBe(409);
  });

  it('a render that keeps failing says so, and asking again retries it', async () => {
    const studentId = await newStudent(a);
    await issued(ownerA, studentId);
    const p = await paid(ownerA, studentId);
    const renderer = app.get(PdfRenderer);
    const spy = vi.spyOn(renderer, 'render').mockRejectedValue(new Error('no browser'));
    const id = newId();
    await su.query(
      `INSERT INTO finance_document (id, tenant_id, kind, payment_id, layout) VALUES ($1, $2, 'RECEIPT', $3, 'A4')`,
      [id, a.id, p.id],
    );
    await expect(
      app
        .get(DocumentsProcessor)
        .process({ data: { tenantId: a.id, documentId: id }, attemptsMade: 2 }),
    ).rejects.toThrow('no browser');
    spy.mockRestore();
    const failed = await get(ownerA, `/payments/${p.id}/documents/A4`);
    expect(failed.body).toEqual({ layout: 'A4', status: 'FAILED', url: null });
    await ready(ownerA, receiptBase(p.id));
  }, 60_000);

  describe('share links', () => {
    async function shared() {
      const studentId = await newStudent(a, 'Private Name');
      const inv = await issued(ownerA, studentId);
      await ready(ownerA, invoiceBase(inv.id));
      const res = await send(ownerA, `${invoiceBase(inv.id)}/documents/A4/share-links`);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return {
        inv,
        link: res.body as {
          id: string;
          url: string;
          message: string;
          expiresAt: string;
          openCount: number;
        },
      };
    }

    it('open without signing in, for 7 days, with nothing personal in the address', async () => {
      const { inv, link } = await shared();
      expect(link.url).not.toContain('Private');
      expect(link.url).not.toContain(inv.id);
      expect(link.message).toContain(inv.number);
      expect(link.message).toContain(link.url);
      const days = (new Date(link.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);

      const res = await open(`${a.slug}.localhost`, link.url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['x-robots-tag']).toBe('noindex');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const token = new URL(link.url).pathname.split('/').pop()!;
      const { rows } = await su.query<{ token_hash: string; open_count: number }>(
        `SELECT token_hash, open_count FROM share_link WHERE id = $1`,
        [link.id],
      );
      expect(rows[0]!.token_hash).toBe(hashToken(token));
      expect(rows[0]!.token_hash).not.toContain(token);
      expect(rows[0]!.open_count).toBe(1);
    }, 60_000);

    it('revoked, expired, tampered, another academy’s host or a cancelled invoice: all 404', async () => {
      const { inv, link } = await shared();
      const host = `${a.slug}.localhost`;
      expect((await open(`${b.slug}.localhost`, link.url)).status).toBe(404);
      expect((await open(host, `${link.url}x`)).status).toBe(404);
      expect((await open(host, 'http://x/api/v1/share/short')).status).toBe(404);

      const expired = await shared();
      await su.query(
        `UPDATE share_link SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [expired.link.id],
      );
      expect((await open(host, expired.link.url)).status).toBe(404);

      expect((await open(host, link.url)).status).toBe(200);
      const revoked = await send(ownerA, `${invoiceBase(inv.id)}/share-links/${link.id}/revoke`);
      expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
      expect(revoked.body.revokedAt).toBeTruthy();
      expect((await open(host, link.url)).status).toBe(404);
      const list = await get(ownerA, `${invoiceBase(inv.id)}/share-links`);
      expect((list.body as { items: { id: string }[] }).items.map((l) => l.id)).toEqual([link.id]);

      const later = await shared();
      expect((await open(host, later.link.url)).status).toBe(200);
      const c = await send(ownerA, `/invoices/${later.inv.id}/cancel`, {
        version: later.inv.version,
        reason: 'Issued by mistake',
      });
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      expect((await open(host, later.link.url)).status).toBe(404);
    }, 90_000);

    it('a document that isn’t ready can’t be shared', async () => {
      const inv = await issued(ownerA, await newStudent(a));
      const res = await send(ownerA, `${invoiceBase(inv.id)}/documents/A4/share-links`);
      expect(res.status).toBe(409);
      expect(res.body.error.details[0].issue).toBe('document_not_ready');
    });

    it('opening is rate limited', async () => {
      const { link } = await shared();
      const host = `${a.slug}.localhost`;
      let last = 200;
      for (let i = 0; i < 31; i++) last = (await open(host, `${link.url.slice(0, -2)}zz`)).status;
      expect(last).toBe(429);
    }, 60_000);

    it('another academy can’t reach a document or its links', async () => {
      const { inv, link } = await shared();
      const studentId = await newStudent(a);
      await issued(ownerA, studentId);
      const p = await paid(ownerA, studentId);
      await ready(ownerA, receiptBase(p.id));
      for (const base of [invoiceBase(inv.id), receiptBase(p.id)]) {
        expect((await get(ownerB, `${base}/documents/A4`)).status).toBe(404);
        expect((await send(ownerB, `${base}/documents/A4`)).status).toBe(404);
        expect((await send(ownerB, `${base}/documents/A4/share-links`)).status).toBe(404);
        expect((await get(ownerB, `${base}/share-links`)).status).toBe(404);
        expect((await send(ownerB, `${base}/share-links/${link.id}/revoke`)).status).toBe(404);
      }
      // A link of one invoice can't be revoked through another of the same academy.
      const other = await issued(ownerA, studentId, 3000);
      expect(
        (await send(ownerA, `${invoiceBase(other.id)}/share-links/${link.id}/revoke`)).status,
      ).toBe(404);
      expect((await open(`${a.slug}.localhost`, link.url)).status).toBe(200);
    }, 60_000);
  });
});

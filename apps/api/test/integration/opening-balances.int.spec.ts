import { type ImportJob, newId, ROLE_TEMPLATES } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Opening balances (G-02 acceptance, ADR-036): 500 rows with 20 bad → 480 invoices and 20 reported
 * with reasons; the corrected file adds only the 20, never a second invoice; who may; another
 * academy's students and jobs.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };

describe('opening balances', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  let owner: Session;
  let reception: Session;
  let other: Session;
  let s3: Server;
  const objects = new Map<string, Buffer>();
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
  const send = (s: Session, path: string, body: unknown = {}) =>
    http()
      .post(`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);
  const upload = (s: Session, csv: string) =>
    http()
      .post('/api/v1/opening-balances/import')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('content-type', 'text/csv')
      .set('x-file-name', 'dues.csv')
      .send(Buffer.from(csv));
  async function until(s: Session, id: string, states: ImportJob['status'][]): Promise<ImportJob> {
    for (let i = 0; i < 300; i += 1) {
      const res = await get(s, `/opening-balances/import/${id}`);
      expect(res.status).toBe(200);
      if (states.includes(res.body.status)) return res.body as ImportJob;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`import ${id} did not reach ${states.join('/')}`);
  }
  async function newStudents(count: number, tag: string, tenant = a) {
    const numbers: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const number = `${tag}-${i}`;
      numbers.push(number);
      await su.query(
        `INSERT INTO student (id, tenant_id, branch_id, full_name, admission_no, admission_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, '2026-04-01', now())`,
        [newId(), tenant.id, tenant.branchId, `Dues ${number}`, number],
      );
    }
    return numbers;
  }
  const invoiceCount = async (like: string) =>
    Number(
      (
        await su.query<{ n: string }>(
          `SELECT count(*) AS n FROM invoice i JOIN student s ON s.id = i.student_id
            WHERE i.kind = 'OPENING_BALANCE' AND s.admission_no LIKE $1`,
          [like],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    s3 = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const path = (req.url ?? '').split('?')[0]!;
        if (req.method === 'PUT') {
          objects.set(path, Buffer.concat(chunks));
          res.writeHead(200).end();
        } else if (req.method === 'GET') {
          const body = objects.get(path);
          if (body) res.writeHead(200).end(body);
          else res.writeHead(404).end();
        } else {
          objects.delete(path);
          res.writeHead(204).end();
        }
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
    su.setTypeParser(1082, (v: string) => v);
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Dues Academy', plan: 'pro' }),
      createTenantFixture(urls.migrator, { name: 'Other Dues Academy', plan: 'pro' }),
    ]);
    await addMemberFixture(urls.migrator, a.id, {
      email: `receptionist-${a.slug}@example.test`,
      roleKey: 'receptionist',
      grants: Object.entries(ROLE_TEMPLATES.receptionist.grants).map(([capability, scope]) => ({
        capability,
        scope,
      })),
    });
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
    owner = await signIn(a, a.user.email);
    reception = await signIn(a, `receptionist-${a.slug}@example.test`);
    other = await signIn(b, b.user.email);
  });

  it('500 rows with 20 bad → 480 invoices, 20 reported; the corrected file adds only the 20 (G-02)', async () => {
    const tag = `T${Date.now()}`;
    const numbers = await newStudents(500, tag);
    const file = (fixed: boolean) =>
      `Admission number,Amount due,As of\n${numbers
        .map((n, i) => `${n},${!fixed && i < 20 ? 'twelve' : `"1,250.50"`},31/03/2026`)
        .join('\n')}\n`;

    const started = await upload(owner, file(false));
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const preview = await until(owner, started.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(preview).toMatchObject({
      status: 'PREVIEW_READY',
      totalRows: 500,
      validRows: 480,
      errorRows: 20,
      duplicateRows: 0,
    });
    expect(await invoiceCount(`${tag}-%`)).toBe(0);
    const committing = await send(owner, `/opening-balances/import/${preview.id}/commit`, {
      version: preview.version,
    });
    expect(committing.status, JSON.stringify(committing.body)).toBe(200);
    const done = await until(owner, preview.id, ['COMPLETED', 'FAILED']);
    expect(done).toMatchObject({ status: 'COMPLETED', createdRows: 480 });
    expect(await invoiceCount(`${tag}-%`)).toBe(480);

    const report = await get(owner, `/opening-balances/import/${preview.id}/errors.csv`);
    expect(report.status).toBe(200);
    expect(report.text.trim().split('\r\n')).toHaveLength(21);
    expect(report.text).toContain('Not an amount');

    const again = await upload(owner, file(true));
    const second = await until(owner, again.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(second).toMatchObject({ validRows: 20, errorRows: 0, duplicateRows: 480 });
    await send(owner, `/opening-balances/import/${second.id}/commit`, { version: second.version });
    await until(owner, second.id, ['COMPLETED', 'FAILED']);
    expect(await invoiceCount(`${tag}-%`)).toBe(500);

    const { rows } = await su.query<{
      status: string;
      number: string;
      issue_date: string;
      due_date: string;
      total_minor: number;
      tax_minor: number;
    }>(
      `SELECT i.* FROM invoice i JOIN student s ON s.id = i.student_id
        WHERE i.kind = 'OPENING_BALANCE' AND s.admission_no = $1`,
      [numbers[100]],
    );
    expect(rows[0]).toMatchObject({
      status: 'ISSUED',
      issue_date: '2026-03-31',
      due_date: '2026-03-31',
      total_minor: 125_050,
      tax_minor: 0,
    });
    expect(rows[0]!.number).toMatch(/^INV\//);
  }, 180_000);

  it('reports unknown students, repeats, bad dates and missing columns', async () => {
    const tag = `R${Date.now()}`;
    const [one, two, three] = await newStudents(3, tag);
    const started = await upload(
      owner,
      `Admission number,Amount due,As of\n${one},100,\n${one},100,\nNOPE,100,\n,100,\n${two},100,2099-01-01\n${three},0,\n`,
    );
    const job = await until(owner, started.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(job).toMatchObject({ totalRows: 6, validRows: 1, errorRows: 5 });
    const issues = job.preview.flatMap((r) => r.issues.map((i) => i.issue)).sort();
    expect(issues).toEqual([
      'duplicate_in_file',
      'invalid_amount',
      'invalid_date',
      'required',
      'unknown_student',
    ]);

    const noColumns = await upload(owner, 'Name,Dues\nSomeone,100\n');
    const failed = await until(owner, noColumns.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(failed).toMatchObject({ status: 'FAILED', failure: 'missing_columns' });
  }, 60_000);

  it('one typed in: dated, one per student, no future dates', async () => {
    const tag = `E${Date.now()}`;
    const [number] = await newStudents(1, tag);
    const { rows } = await su.query<{ id: string }>(
      'SELECT id FROM student WHERE admission_no = $1',
      [number],
    );
    const studentId = rows[0]!.id;
    const future = await send(owner, '/opening-balances', {
      studentId,
      amountMinor: 5_000,
      asOf: '2099-01-01',
    });
    expect(future.status).toBe(400);
    const res = await send(owner, '/opening-balances', {
      studentId,
      amountMinor: 5_000,
      asOf: '2026-03-31',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'OPENING_BALANCE',
      status: 'ISSUED',
      totalMinor: 5_000,
    });
    const second = await send(owner, '/opening-balances', { studentId, amountMinor: 1_000 });
    expect(second.status).toBe(409);
    await expect(
      su.query(
        `INSERT INTO invoice (id, tenant_id, branch_id, student_id, kind, due_date, updated_at)
         VALUES ($1, $2, $3, $4, 'OPENING_BALANCE', '2026-03-31', now())`,
        [newId(), a.id, a.branchId, studentId],
      ),
    ).rejects.toThrow(/invoice_one_opening_balance/);
  });

  it('needs invoice.create', async () => {
    expect((await get(reception, '/opening-balances/import/template')).status).toBe(403);
    expect((await upload(reception, 'a,b\n1,2\n')).status).toBe(403);
  });

  it('another academy sees neither the students nor the jobs', async () => {
    const tag = `X${Date.now()}`;
    const [number] = await newStudents(1, tag);
    const started = await upload(other, `Admission number,Amount due\n${number},100\n`);
    const job = await until(other, started.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(job).toMatchObject({ validRows: 0, errorRows: 1 });
    expect(job.preview[0]!.issues[0]!.issue).toBe('unknown_student');

    const mine = await upload(owner, `Admission number,Amount due\n${number},100\n`);
    const ready = await until(owner, mine.body.id, ['PREVIEW_READY', 'FAILED']);
    expect((await get(other, `/opening-balances/import/${ready.id}`)).status).toBe(404);
    expect((await get(other, `/opening-balances/import/${ready.id}/errors.csv`)).status).toBe(404);
    expect(
      (await send(other, `/opening-balances/import/${ready.id}/commit`, { version: ready.version }))
        .status,
    ).toBe(404);
    const { rows } = await su.query<{ id: string }>(
      'SELECT id FROM student WHERE admission_no = $1',
      [number],
    );
    expect(
      (await send(other, '/opening-balances', { studentId: rows[0]!.id, amountMinor: 100 })).status,
    ).toBe(404);
    expect(await invoiceCount(`${tag}-%`)).toBe(0);
  }, 60_000);

  it('a student-import route does not open an opening-balance job', async () => {
    const tag = `K${Date.now()}`;
    const [number] = await newStudents(1, tag);
    const mine = await upload(owner, `Admission number,Amount due\n${number},100\n`);
    const ready = await until(owner, mine.body.id, ['PREVIEW_READY', 'FAILED']);
    expect((await get(owner, `/students/import/${ready.id}`)).status).toBe(404);
    expect(
      (await send(owner, `/students/import/${ready.id}/commit`, { version: ready.version })).status,
    ).toBe(404);
  }, 60_000);
});

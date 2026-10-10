import { type ImportJob, OWNER_LEGAL_DOCUMENTS, ROLE_TEMPLATES } from '@academybee/contracts';
import {
  addMemberFixture,
  createTenantFixture,
  FIXTURE_PASSWORD,
  type TenantFixture,
} from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { createTestApp, testConfig } from '../support/test-app.js';

/**
 * Student import (G-02 acceptance, ADR-036, C-100, C-101): 500 rows with 20 bad → 480 created
 * and 20 reported; uploading the corrected file again adds only the 20; the plan limit is
 * checked before commit; XLSX works; files go to the private bucket; academies are isolated.
 */
const urls = inject('databaseUrls');

type Session = { host: string; cookie: string; csrf: string };

/** 500 students; rows 1–20 have a bad mobile number unless `fixed`. */
function roster(tag: string, fixed: boolean): string {
  const lines = ['Student name,Date of birth,Parent name,Parent mobile,Gender'];
  for (let i = 1; i <= 500; i += 1) {
    const bad = !fixed && i <= 20;
    const day = String((i % 28) + 1).padStart(2, '0');
    lines.push(
      `Student ${tag} ${i},${day}/04/2015,Parent ${tag} ${i},${bad ? '12345' : `98${String(10_000_000 + i * 7)}`},${i % 2 ? 'F' : 'M'}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

describe('student import', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let owner: Session;
  let s3: Server;
  /** The fake object store: path → bytes (keeps what the API puts, serves it back). */
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
    const s = {
      host,
      cookie: pairs.join('; '),
      csrf: pairs.find((p) => p.startsWith('ab_csrf='))?.slice('ab_csrf='.length) ?? '',
    };
    await http()
      .post('/api/v1/legal/accept')
      .set('Host', host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send({ documentIds: OWNER_LEGAL_DOCUMENTS.map((d) => d.id) });
    return s;
  }
  const get = (s: Session, path: string) =>
    http().get(`/api/v1${path}`).set('Host', s.host).set('Cookie', s.cookie);
  const send = (s: Session, method: 'post' | 'put', path: string, body: unknown = {}) =>
    http()
      [method](`/api/v1${path}`)
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body as object);
  const upload = (s: Session, bytes: Buffer | string, name: string, type = 'text/csv') =>
    http()
      .post('/api/v1/students/import')
      .set('Host', s.host)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('content-type', type)
      .set('x-file-name', encodeURIComponent(name))
      .send(typeof bytes === 'string' ? Buffer.from(bytes) : bytes);
  /** Poll until the job settles in one of `states`. */
  async function until(s: Session, id: string, states: ImportJob['status'][]): Promise<ImportJob> {
    for (let i = 0; i < 100; i += 1) {
      const res = await get(s, `/students/import/${id}`);
      expect(res.status).toBe(200);
      if (states.includes(res.body.status)) return res.body as ImportJob;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`import ${id} did not reach ${states.join('/')}`);
  }
  async function students(tenantId: string, like: string): Promise<number> {
    const { rows } = await su.query<{ n: string }>(
      `SELECT count(*) AS n FROM student WHERE tenant_id = $1 AND full_name LIKE $2`,
      [tenantId, like],
    );
    return Number(rows[0]!.n);
  }

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
    await su.connect();
    a = await createTenantFixture(urls.migrator, { name: 'Import Academy', plan: 'pro' });
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
  });

  it('offers a template with every field and the academy’s custom fields', async () => {
    const res = await get(owner, '/students/import/template');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Student name');
    expect(res.text).toContain('Parent mobile');
    expect(res.text).toContain('School bus'); // the fixture's custom field
  });

  it('500 rows with 20 bad → 480 imported, 20 reported; the corrected file adds only the 20 (G-02)', async () => {
    const tag = `t${Date.now()}`;
    const first = await upload(owner, roster(tag, false), 'register.csv');
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    // Stored in the private bucket only (C-97).
    expect(objects.has(`/private-media/t/${a.id}/imports/${first.body.id}.csv`)).toBe(true);
    expect([...objects.keys()].some((k) => k.startsWith('/public-branding/'))).toBe(false);
    const preview = await until(owner, first.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(preview).toMatchObject({
      status: 'PREVIEW_READY',
      totalRows: 500,
      validRows: 480,
      errorRows: 20,
      duplicateRows: 0,
    });
    expect(preview.mapping).toMatchObject({
      fullName: 0,
      dateOfBirth: 1,
      parentName: 2,
      parentPhone: 3,
      gender: 4,
    });
    expect(preview.preview[0]).toMatchObject({
      n: 2,
      status: 'error',
      issues: [{ field: 'parentPhone', issue: 'invalid_phone' }],
    });

    const commit = await send(owner, 'post', `/students/import/${preview.id}/commit`, {
      version: preview.version,
    });
    expect(commit.status, JSON.stringify(commit.body)).toBe(200);
    const done = await until(owner, preview.id, ['COMPLETED', 'FAILED']);
    expect(done).toMatchObject({ status: 'COMPLETED', createdRows: 480 });
    expect(await students(a.id, `Student ${tag} %`)).toBe(480);

    const report = await get(owner, `/students/import/${preview.id}/errors.csv`);
    expect(report.status).toBe(200);
    const lines = report.text.trim().split(/\r\n/);
    expect(lines).toHaveLength(21); // header + 20 problems
    expect(lines[1]).toContain('Not a mobile number');

    // The corrected file: the 480 are already here; only the 20 fixed rows are added.
    const second = await upload(owner, roster(tag, true), 'register-fixed.csv');
    const again = await until(owner, second.body.id, ['PREVIEW_READY', 'FAILED']);
    expect(again).toMatchObject({ validRows: 20, duplicateRows: 480, errorRows: 0 });
    await send(owner, 'post', `/students/import/${again.id}/commit`, { version: again.version });
    await until(owner, again.id, ['COMPLETED', 'FAILED']);
    expect(await students(a.id, `Student ${tag} %`)).toBe(500);
    // Each student has their parent; the private file is gone after commit.
    const { rows } = await su.query<{ n: string }>(
      `SELECT count(*) AS n FROM parent_student ps JOIN student s ON s.id = ps.student_id
        WHERE s.tenant_id = $1 AND s.full_name LIKE $2`,
      [a.id, `Student ${tag} %`],
    );
    expect(Number(rows[0]!.n)).toBe(500);
    const { rows: job } = await su.query('SELECT file_key FROM import_job WHERE id = $1', [
      again.id,
    ]);
    expect(job[0].file_key).toBeNull();
  });

  it('reads Excel files, and lets columns be matched again', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Register');
    sheet.addRow(['Roll', 'Kid', 'Born']);
    sheet.addRow(['1', 'Excel Kid One', new Date(Date.UTC(2016, 0, 15))]);
    sheet.addRow(['2', 'Excel Kid Two', new Date(Date.UTC(2017, 5, 1))]);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await upload(
      owner,
      bytes,
      'register.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.status).toBe(201);
    const job = await until(owner, res.body.id, ['PREVIEW_READY', 'FAILED']);
    // "Kid" isn't a known header: nothing maps the name, so every row needs it.
    expect(job).toMatchObject({ errorRows: 2, validRows: 0 });
    const matched = await send(owner, 'put', `/students/import/${job.id}/mapping`, {
      version: job.version,
      mapping: { fullName: 1, dateOfBirth: 2 },
    });
    expect(matched.status).toBe(200);
    expect(matched.body).toMatchObject({ validRows: 2, errorRows: 0 });
    const stale = await send(owner, 'put', `/students/import/${job.id}/mapping`, {
      version: job.version,
      mapping: { fullName: 1 },
    });
    expect(stale.status).toBe(409);
  });

  it('refuses what isn’t a spreadsheet, empty files and files over 5 MB', async () => {
    const binary = await upload(owner, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 1]), 'x.csv');
    expect(binary.status).toBe(400);
    expect(binary.body.error.details).toEqual([{ path: 'file', issue: 'unsupported_type' }]);
    const big = await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 10, 0x41), 'big.csv');
    expect(big.status).toBe(400);
    expect(big.body.error.details).toEqual([{ path: 'file', issue: 'too_large' }]);
    const empty = await upload(owner, 'Student name\n', 'empty.csv');
    const failed = await until(owner, empty.body.id, ['FAILED', 'PREVIEW_READY']);
    expect(failed).toMatchObject({ status: 'FAILED', failure: 'empty' });
  });

  it("checks the plan's student limit before importing anything", async () => {
    const t = await createTenantFixture(urls.migrator, { name: 'Small Import Academy' });
    const s = await signIn(t, t.user.email);
    await su.query(
      `INSERT INTO subscription_override (id, tenant_id, key, kind, "limit", reason)
       VALUES (gen_random_uuid(), $1, 'students', 'LIMIT', 3, 'test')`,
      [t.id],
    );
    const res = await upload(s, 'Student name\nLimit Aa\nLimit Bb\nLimit Cc\n', 'three.csv');
    const job = await until(s, res.body.id, ['PREVIEW_READY']);
    expect(job).toMatchObject({ validRows: 3, seatsLeft: 2 });
    const commit = await send(s, 'post', `/students/import/${job.id}/commit`, {
      version: job.version,
    });
    expect(commit.status).toBe(403);
    expect(commit.body.error.code).toBe('ENTITLEMENT_LIMIT_REACHED');
    expect(await students(t.id, 'Limit %')).toBe(0);
  });

  it('roles and academies: only importers, and never another academy’s job', async () => {
    const reception = await addMemberFixture(urls.migrator, a.id, {
      email: `reception-import-${a.slug}@example.test`,
      roleKey: 'receptionist',
      grants: Object.entries(ROLE_TEMPLATES.receptionist.grants).map(([capability, scope]) => ({
        capability,
        scope,
      })),
    });
    const r = await signIn(a, reception.email);
    expect((await upload(r, 'Student name\nX\n', 'x.csv')).status).toBe(403);
    const mine = await upload(owner, 'Student name\nIsolated Kid\n', 'mine.csv');
    const b = await createTenantFixture(urls.migrator, { name: 'Other Import Academy' });
    const other = await signIn(b, b.user.email);
    expect((await get(other, `/students/import/${mine.body.id}`)).status).toBe(404);
    expect((await get(other, `/students/import/${mine.body.id}/errors.csv`)).status).toBe(404);
    expect(
      (await send(other, 'post', `/students/import/${mine.body.id}/commit`, { version: 1 })).status,
    ).toBe(404);
  });
});

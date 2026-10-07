import { newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * People and scheduling invariants in the database itself (C-09, ARCHITECTURE §8.4, ADR-025,
 * ADR-034): composite keys keep links inside one academy, history is kept, rows are well-formed.
 */
const urls = inject('databaseUrls');

describe('people and scheduling schema', () => {
  let a: TenantFixture;
  let b: TenantFixture;
  let su: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator),
      createTenantFixture(urls.migrator),
    ]);
    su = new pg.Client({ connectionString: urls.superuser });
    app = new pg.Client({ connectionString: urls.app });
    await Promise.all([su.connect(), app.connect()]);
  });
  afterAll(async () => {
    await Promise.all([su.end(), app.end()]);
  });

  /** Run as the app role inside academy `tenantId`; always rolled back. */
  async function asApp(tenantId: string, sql: string, params: unknown[]) {
    await app.query('BEGIN');
    try {
      await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      return await app.query(sql, params);
    } finally {
      await app.query('ROLLBACK');
    }
  }

  it('a student cannot be placed in another academy’s branch (composite key)', async () => {
    await expect(
      su.query(
        `INSERT INTO student (id, tenant_id, branch_id, admission_no, full_name, admission_date, updated_at)
         VALUES ($1, $2, $3, 'X-1', 'Cross', CURRENT_DATE, now())`,
        [newId(), a.id, b.branchId],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('a batch cannot enrol another academy’s student', async () => {
    await expect(
      su.query(
        `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, now())`,
        [newId(), a.id, a.people.batchId, b.people.studentId],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('admission numbers are unique per academy, not across academies', async () => {
    expect(a.people.admissionNo).toBe(b.people.admissionNo);
    await expect(
      su.query(
        `INSERT INTO student (id, tenant_id, branch_id, admission_no, full_name, admission_date, updated_at)
         VALUES ($1, $2, $3, $4, 'Duplicate', CURRENT_DATE, now())`,
        [newId(), a.id, a.branchId, a.people.admissionNo],
      ),
    ).rejects.toThrow(/unique/);
  });

  it('one open enrolment per student and batch; a closed one can be followed by a new one', async () => {
    const enrol = () =>
      su.query(
        `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, now())`,
        [newId(), b.id, b.people.batchId, b.people.studentId],
      );
    await expect(enrol()).rejects.toThrow(/batch_enrolment_one_open/);
    await su.query(`BEGIN`);
    try {
      await su.query(
        `UPDATE batch_enrolment SET ended_on = CURRENT_DATE WHERE tenant_id = $1 AND student_id = $2`,
        [b.id, b.people.studentId],
      );
      await expect(enrol()).resolves.toBeTruthy();
    } finally {
      await su.query(`ROLLBACK`);
    }
  });

  it('consent records are append-only for the app role (ADR-034)', async () => {
    await expect(
      asApp(a.id, `UPDATE consent_record SET purposes = '{marketing}' WHERE tenant_id = $1`, [
        a.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asApp(a.id, `DELETE FROM consent_record WHERE tenant_id = $1`, [a.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it('students, parents and enrolments are never deleted by the app role (ADR-025)', async () => {
    for (const table of ['student', 'parent', 'teacher', 'batch_enrolment', 'tenant_sequence'])
      await expect(
        asApp(a.id, `DELETE FROM ${table} WHERE tenant_id = $1`, [a.id]),
        table,
      ).rejects.toThrow(/permission denied/);
  });

  it('refuses malformed schedule rules and sessions', async () => {
    const rule = (weekday: number, start: number, end: number) =>
      su.query(
        `INSERT INTO schedule_rule (id, tenant_id, batch_id, weekday, start_minute, end_minute, effective_from, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, now())`,
        [newId(), a.id, a.people.batchId, weekday, start, end],
      );
    await expect(rule(0, 600, 660)).rejects.toThrow(/schedule_rule_shape/);
    await expect(rule(1, 660, 600)).rejects.toThrow(/schedule_rule_shape/);
    await expect(rule(7, 1380, 1441)).rejects.toThrow(/schedule_rule_shape/);
    await expect(
      su.query(
        `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, session_date, starts_at, ends_at, origin, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, now(), now() + interval '1 hour', 'GENERATED', now())`,
        [newId(), a.id, a.branchId, a.people.batchId],
      ),
    ).rejects.toThrow(/class_session_origin/);
  });

  it('a generated session is unique per rule and date (re-running generation is safe)', async () => {
    await expect(
      su.query(
        `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, schedule_rule_id, session_date,
           starts_at, ends_at, origin, updated_at)
         SELECT $1, tenant_id, branch_id, batch_id, schedule_rule_id, session_date, starts_at, ends_at,
                'GENERATED', now()
           FROM class_session WHERE id = $2`,
        [newId(), a.people.sessionId],
      ),
    ).rejects.toThrow(/unique/);
  });

  it('parent contact details are well-formed', async () => {
    await expect(
      su.query(
        `INSERT INTO parent (id, tenant_id, full_name, phone, updated_at) VALUES ($1, $2, 'P', '98400', now())`,
        [newId(), a.id],
      ),
    ).rejects.toThrow(/parent_shape/);
  });
});

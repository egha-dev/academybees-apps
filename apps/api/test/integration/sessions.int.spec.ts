import { addDays, isoWeekday, localDate, newId } from '@academybee/contracts';
import { createTenantFixture, type TenantFixture } from '@academybee/testing';
import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { SessionGenerationProcessor } from '../../src/modules/scheduling/generation.processor.js';
import type { SessionGenerationJob } from '../../src/modules/scheduling/generation.queue.js';
import { SessionGenerationScheduler } from '../../src/platform/jobs/session-generation.scheduler.js';
import { createTestApp } from '../support/test-app.js';

/**
 * The rolling 28-day session job (ADR-024, C-112, C-113): idempotent, never touches cancelled or
 * changed sessions, skips holidays, and runs per academy in its own context.
 */
const urls = inject('databaseUrls');

describe('session generation job', () => {
  let app: INestApplication;
  let su: pg.Client;
  let a: TenantFixture;
  let b: TenantFixture;
  const run = (tenantId: string) =>
    app
      .get(SessionGenerationProcessor)
      .process({ data: { tenantId, reason: 'manual' } } as Job<SessionGenerationJob>);
  const sessions = async (tenantId: string) =>
    (
      await su.query<{ session_date: string; status: string; modified_at: Date | null }>(
        `SELECT session_date::text AS session_date, status, modified_at FROM class_session WHERE tenant_id = $1 AND origin = 'GENERATED' ORDER BY session_date`,
        [tenantId],
      )
    ).rows;

  beforeAll(async () => {
    app = await createTestApp();
    su = new pg.Client({ connectionString: urls.superuser });
    await su.connect();
    [a, b] = await Promise.all([
      createTenantFixture(urls.migrator, { name: 'Generation Academy A' }),
      createTenantFixture(urls.migrator, { name: 'Generation Academy B' }),
    ]);
  });
  afterAll(async () => {
    await su.end();
    await app.close();
  });

  it('fills 28 days of Mondays once; a second run adds nothing; other academies untouched', async () => {
    const before = (await sessions(b.id)).length;
    await run(a.id);
    const first = await sessions(a.id);
    // The fixture's slot is Monday 17:00–18:00 IST from today: 4 Mondays in 28 days (one already
    // there from the fixture), minus today's if it has started.
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first.every((s) => isoWeekday(s.session_date) === 1)).toBe(true);
    expect(await run(a.id)).toBe(0);
    expect(await sessions(a.id)).toHaveLength(first.length);
    expect(await sessions(b.id)).toHaveLength(before);
  });

  it('never recreates or changes cancelled and edited sessions, and skips holidays', async () => {
    const [first, second] = await sessions(a.id);
    await su.query(
      `UPDATE class_session SET status = 'CANCELLED', cancel_reason = 'OTHER', cancelled_at = now(),
              modified_at = now() WHERE tenant_id = $1 AND session_date = $2`,
      [a.id, first!.session_date],
    );
    await su.query(
      `UPDATE class_session SET starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour',
              modified_at = now() WHERE tenant_id = $1 AND session_date = $2`,
      [a.id, second!.session_date],
    );
    expect(await run(a.id)).toBe(0);
    const after = await sessions(a.id);
    expect(after.find((s) => s.session_date === first!.session_date)?.status).toBe('CANCELLED');
    expect(after.filter((s) => s.session_date === second!.session_date)).toHaveLength(1);

    // A holiday on next-but-three Monday: once its untouched session is gone, it is never refilled.
    const today = localDate(new Date(), 'Asia/Kolkata');
    let monday = addDays(today, 1);
    while (isoWeekday(monday) !== 1) monday = addDays(monday, 1);
    const holidayDay = addDays(monday, 21);
    await su.query(
      `INSERT INTO holiday (id, tenant_id, name, start_date, end_date, updated_at)
       VALUES ($1, $2, 'Test holiday', $3, $3, now())`,
      [newId(), b.id, holidayDay],
    );
    await su.query(`DELETE FROM class_session WHERE tenant_id = $1 AND session_date = $2`, [
      b.id,
      holidayDay,
    ]);
    await run(b.id);
    const bDates = (await sessions(b.id)).map((s) => s.session_date);
    expect(bDates).not.toContain(holidayDay);
    expect(bDates.length).toBeGreaterThanOrEqual(2);
  });

  it('the nightly fan-out queues every open academy and leaves a platform audit row', async () => {
    const queued = await app.get(SessionGenerationScheduler).queueAll('manual');
    expect(queued).toBeGreaterThanOrEqual(2);
    const { rows } = await su.query<{ metadata: { academies: number } }>(
      `SELECT metadata FROM audit_log WHERE action = 'platform.sessions_generation_queued' AND tenant_id IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows[0]!.metadata.academies).toBe(queued);
  });
});

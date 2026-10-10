// pnpm db:seed:perf — 50,000 students (with parents) in demo-b for the search benchmark
// (ADR-026, C-105, Phase 4 exit gate: search p95 < 300 ms). Local/CI only (same guard as db:seed).
// Idempotent: students it created earlier (admission numbers PERF-…) are kept, missing ones added.
import pg from 'pg';

import { requireEnv } from '../cli/env.js';
import { assertSeedAllowed, SeedNotAllowedError } from './guard.js';
import { DEV_TENANTS } from './tenants.js';

const TOTAL = Number(process.env.PERF_STUDENTS ?? 50_000);
const FIRST = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Vihaan',
  'Arjun',
  'Sai',
  'Reyansh',
  'Ayaan',
  'Krishna',
  'Ishaan',
  'Ananya',
  'Diya',
  'Saanvi',
  'Aadhya',
  'Pari',
  'Myra',
  'Ira',
  'Kiara',
  'Navya',
  'Riya',
  'Kabir',
  'Rohan',
  'Meera',
  'Tara',
  'Zara',
  'Arnav',
  'Dhruv',
  'Kavya',
  'Siya',
  'Yuvraj',
];
const LAST = [
  'Sharma',
  'Iyer',
  'Khan',
  'Verma',
  'Reddy',
  'Nair',
  'Mehta',
  'Kapoor',
  'Gupta',
  'Joshi',
  'Das',
  'Pillai',
  'Banerjee',
  'Singh',
  'Rao',
  'Kulkarni',
  'Menon',
  'Shaikh',
  'Patel',
  'Ali',
];

try {
  assertSeedAllowed(process.env.APP_ENV);
} catch (error) {
  if (error instanceof SeedNotAllowedError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const tenant = DEV_TENANTS.find((t) => t.slug === 'demo-b');
if (!tenant) throw new Error('demo-b missing — run pnpm db:seed first');
const client = new pg.Client({ connectionString: requireEnv('MIGRATOR_DATABASE_URL') });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant.id]);
  const started = Date.now();
  // Names are combined from the lists plus a number, so prefixes and trigrams behave like real data.
  const { rowCount } = await client.query(
    `WITH n AS (SELECT g FROM generate_series(1, $2::int) g),
          s AS (
            INSERT INTO student (id, tenant_id, branch_id, admission_no, full_name, admission_date, updated_at)
            SELECT gen_random_uuid(), $1::uuid, $3::uuid, 'PERF-' || lpad(g::text, 6, '0'),
                   ($4::text[])[1 + g % array_length($4::text[], 1)] || ' ' ||
                   ($5::text[])[1 + (g / 7) % array_length($5::text[], 1)] || ' ' || g,
                   CURRENT_DATE, now()
              FROM n
            ON CONFLICT (tenant_id, admission_no) DO NOTHING
            RETURNING id, full_name, admission_no
          ),
          p AS (
            INSERT INTO parent (id, tenant_id, full_name, phone, updated_at)
            SELECT gen_random_uuid(), $1::uuid, 'Parent of ' || s.full_name,
                   '+9197' || lpad(substr(s.admission_no, 6)::text, 8, '0'), now()
              FROM s
            RETURNING id, full_name
          )
     INSERT INTO parent_student (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
     SELECT gen_random_uuid(), $1::uuid, p.id, s.id, 'GUARDIAN', true
       FROM s JOIN p ON p.full_name = 'Parent of ' || s.full_name`,
    [tenant.id, TOTAL, tenant.branchId, FIRST, LAST],
  );
  await client.query('COMMIT');
  await client.query('ANALYZE student; ANALYZE parent; ANALYZE parent_student;');
  console.warn(
    `Perf seed: ${rowCount ?? 0} new students with parents in demo-b (target ${TOTAL}) in ${Math.round((Date.now() - started) / 1000)} s.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

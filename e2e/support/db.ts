import pg from 'pg';

const MIGRATOR_URL =
  process.env.E2E_MIGRATOR_DATABASE_URL ??
  'postgresql://ab_migrator:ab_migrator_local@localhost:5432/academybee';

/** Run SQL as the schema owner (flag overrides are not writable by the app role). */
export async function asMigrator<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: MIGRATOR_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Read an academy's rows under its own RLS context (E2E checks of what reached the database).
 * The academy is found by its host label, as the API's resolver does (C-51); nothing is written.
 */
export async function inAcademy<T>(
  slug: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return asMigrator(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query(`SELECT set_config('app.lookup_host', $1, true)`, [slug]);
      const { rows } = await db.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM tenant_domain WHERE hostname = $1`,
        [slug],
      );
      await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [rows[0]!.tenant_id]);
      return (await db.query(sql, params)).rows as T[];
    } finally {
      await db.query('ROLLBACK');
    }
  });
}

/**
 * Write in an academy under its RLS context (E2E set-up the API refuses on purpose, such as a
 * class that already happened today). Committed.
 */
export async function writeInAcademy(
  slug: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await asMigrator(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query(`SELECT set_config('app.lookup_host', $1, true)`, [slug]);
      const { rows } = await db.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM tenant_domain WHERE hostname = $1`,
        [slug],
      );
      await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [rows[0]!.tenant_id]);
      await db.query(sql, [rows[0]!.tenant_id, ...params]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
}

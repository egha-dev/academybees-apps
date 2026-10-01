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

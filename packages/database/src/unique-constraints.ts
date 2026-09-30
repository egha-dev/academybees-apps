import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prisma/migrations',
);

const CREATE = /CREATE UNIQUE INDEX\s+"([^"]+)"\s+ON\s+"[^"]+"\s*\(([^)]*)\)/gi;
const DROP = /DROP INDEX\s+(?:IF EXISTS\s+)?"([^"]+)"/gi;
const PKEY_OR_UNIQUE_CONSTRAINT = /CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(([^)]*)\)/gi;

const camel = (column: string) =>
  column.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/** Parse committed migrations (in order) into unique index name → Prisma field names. */
export function parseUniqueIndexes(migrationSqls: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const sql of migrationSqls) {
    for (const regex of [CREATE, PKEY_OR_UNIQUE_CONSTRAINT]) {
      for (const m of sql.matchAll(regex)) {
        const fields = (m[2] ?? '')
          .split(',')
          .map((c) => c.trim().replace(/^"|"$/g, ''))
          .filter(Boolean)
          .map(camel);
        map.set(m[1] ?? '', fields);
      }
    }
    for (const m of sql.matchAll(DROP)) map.delete(m[1] ?? '');
  }
  return map;
}

let cache: Map<string, string[]> | undefined;

function load(): Map<string, string[]> {
  try {
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    return parseUniqueIndexes(
      dirs.map((d) => readFileSync(path.join(MIGRATIONS_DIR, d, 'migration.sql'), 'utf8')),
    );
  } catch {
    return new Map();
  }
}

/**
 * Field names behind a unique index, for CONFLICT error details. With driver adapters Prisma
 * reports only the index name for P2002, so we read it from the committed migrations.
 */
export function uniqueIndexFields(indexName: string): string[] | undefined {
  cache ??= load();
  return cache.get(indexName);
}

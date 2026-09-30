import { describe, expect, it } from 'vitest';

import { parseUniqueIndexes, uniqueIndexFields } from './unique-constraints.js';

describe('unique index map', () => {
  it('parses unique indexes and constraints, honouring later drops', () => {
    const map = parseUniqueIndexes([
      `CREATE UNIQUE INDEX "a_scope_key_key" ON "a"("scope", "key");
       CREATE UNIQUE INDEX "old_idx" ON "b"("x");
       ALTER TABLE "c" ADD CONSTRAINT "c_email_key" UNIQUE ("user_email");`,
      `DROP INDEX "old_idx";`,
    ]);
    expect(map.get('a_scope_key_key')).toEqual(['scope', 'key']);
    expect(map.get('c_email_key')).toEqual(['userEmail']);
    expect(map.has('old_idx')).toBe(false);
  });

  it('reads the committed migrations', () => {
    expect(uniqueIndexFields('idempotency_record_scope_key_key')).toEqual(['scope', 'key']);
    expect(uniqueIndexFields('ffo_env_tenant_key')).toEqual(['flagKey', 'environment', 'tenantId']);
    expect(uniqueIndexFields('nope')).toBeUndefined();
  });
});

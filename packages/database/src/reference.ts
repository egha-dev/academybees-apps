// Platform reference data from the catalogues in @academybee/contracts (C-89, ADR-034): plans,
// their entitlements and legal documents, plus system-role grants added since an academy was
// created (C-104). Synced as the schema owner after every migrate/deploy (and in test databases),
// so every environment has the same rows without seeds. Idempotent.
import {
  type EntitlementSnapshot,
  LEGAL_DOCUMENTS,
  PLAN_CATALOGUE,
  type PlanDefinition,
  ROLE_KEYS,
  ROLE_TEMPLATES,
} from '@academybee/contracts';
import type pg from 'pg';

function entitlementRows(planKey: string, e: EntitlementSnapshot): unknown[][] {
  return [
    ...Object.entries(e.limits).map(([key, limit]) => [planKey, key, 'LIMIT', limit, null]),
    ...Object.entries(e.features).map(([key, enabled]) => [planKey, key, 'FEATURE', null, enabled]),
  ];
}

export async function syncReferenceData(client: pg.Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const plans = Object.entries(PLAN_CATALOGUE) as [string, PlanDefinition][];
    for (const [key, plan] of plans) {
      await client.query(
        `INSERT INTO plan (key, name, sort_order, trial_days, active, updated_at)
         VALUES ($1, $2, $3, $4, true, now())
         ON CONFLICT (key) DO UPDATE SET name = $2, sort_order = $3, trial_days = $4,
           active = true, updated_at = now()`,
        [key, plan.name, plan.sortOrder, plan.trialDays],
      );
      const rows = entitlementRows(key, plan.entitlements);
      for (const row of rows)
        await client.query(
          `INSERT INTO plan_entitlement (plan_key, key, kind, "limit", enabled)
           VALUES ($1, $2, $3::entitlement_kind, $4, $5)
           ON CONFLICT (plan_key, key) DO UPDATE SET kind = $3::entitlement_kind, "limit" = $4,
             enabled = $5`,
          row,
        );
      await client.query(
        `DELETE FROM plan_entitlement WHERE plan_key = $1 AND NOT (key = ANY($2))`,
        [key, rows.map((r) => r[1])],
      );
    }
    // A plan dropped from the catalogue stays (subscriptions reference it) but is no longer offered.
    await client.query(
      `UPDATE plan SET active = false, updated_at = now() WHERE NOT (key = ANY($1))`,
      [plans.map(([key]) => key)],
    );

    // Published legal versions are immutable: insert new ones, never rewrite accepted text.
    for (const doc of LEGAL_DOCUMENTS)
      await client.query(
        `INSERT INTO legal_document (id, kind, version, published_at, variants)
         VALUES ($1, $2::legal_document_kind, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [doc.id, doc.kind, doc.version, doc.publishedAt, JSON.stringify(doc.variants)],
      );
    await syncSystemRoleGrants(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Every (role key, capability, scope) the code templates grant. */
export function systemRoleGrantRows(): [string, string, string][] {
  return ROLE_KEYS.flatMap((key) =>
    Object.entries(ROLE_TEMPLATES[key].grants).map(
      ([capability, scope]) => [key, capability, scope] as [string, string, string],
    ),
  );
}

/**
 * Roles are copied per academy at provisioning (ensureSystemRoles), so a capability added to a
 * template later (C-104) would never reach existing academies. This **adds** the missing grants to
 * every academy's system roles — it never removes or changes a row, so an academy's own edits
 * (`role.manage`, later) survive — and bumps `permissions_version` of members whose roles gained
 * something, so cached capabilities refresh at once (ARCHITECTURE §6.2).
 *
 * Runs inside the caller's transaction as the table owner. FORCE ROW LEVEL SECURITY is lifted for
 * the statement and restored before commit: DDL is transactional, and the ACCESS EXCLUSIVE locks
 * mean no other session ever sees the tables without it.
 */
export async function syncSystemRoleGrants(client: pg.Client): Promise<number> {
  const tables = ['role', 'role_permission', 'membership_role', 'membership'];
  for (const table of tables)
    await client.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
  const rows = systemRoleGrantRows();
  const { rows: added } = await client.query<{ role_id: string }>(
    `WITH grants (role_key, capability, scope) AS (
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     )
     INSERT INTO role_permission (tenant_id, role_id, capability, scope)
     SELECT r.tenant_id, r.id, g.capability, g.scope::role_scope
       FROM role r JOIN grants g ON g.role_key = r.key
      WHERE r.is_system
     ON CONFLICT (role_id, capability) DO NOTHING
     RETURNING role_id`,
    [rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2])],
  );
  if (added.length > 0)
    await client.query(
      `UPDATE membership m SET permissions_version = permissions_version + 1, updated_at = now()
        WHERE EXISTS (SELECT 1 FROM membership_role mr
                       WHERE mr.membership_id = m.id AND mr.role_id = ANY($1::uuid[]))`,
      [[...new Set(added.map((a) => a.role_id))]],
    );
  for (const table of tables) await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  return added.length;
}

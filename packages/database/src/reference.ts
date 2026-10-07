// Platform reference data from the catalogues in @academybee/contracts (C-89, ADR-034): plans,
// their entitlements and legal documents. Synced as the schema owner after every migrate/deploy
// (and in test databases), so every environment has the same rows without seeds. Idempotent.
import {
  type EntitlementSnapshot,
  LEGAL_DOCUMENTS,
  PLAN_CATALOGUE,
  type PlanDefinition,
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

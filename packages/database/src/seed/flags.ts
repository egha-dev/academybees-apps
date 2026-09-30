import { FEATURE_FLAGS } from '@academybee/contracts';

import type { PrismaClient } from '../generated/prisma/client.js';

/** Mirror the code flag registry into feature_flag (definitions only; overrides untouched). */
export async function syncFeatureFlagDefinitions(db: PrismaClient): Promise<number> {
  const entries = Object.entries(FEATURE_FLAGS);
  for (const [key, def] of entries) {
    const data = {
      description: def.description,
      owner: def.owner,
      expiresOn: new Date(`${def.expiresOn}T00:00:00.000Z`),
    };
    await db.featureFlag.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  return entries.length;
}

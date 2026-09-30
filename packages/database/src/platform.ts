// The platform (cross-tenant) client. Lint confines imports of `@academybee/database/platform`
// to apps/api/src/platform/** and apps/worker/src/platform/**, and every use is audited (ADR-005).
import { type DatabaseClientOptions } from './clients.js';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

/** Client connected as `ab_platform` (BYPASSRLS). Only for console modules and platform jobs. */
export function createPlatformClient(
  url: string,
  options: DatabaseClientOptions = {},
): PrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: options.maxConnections ?? 5 });
  return new PrismaClient({ adapter, log: options.log ?? [] });
}

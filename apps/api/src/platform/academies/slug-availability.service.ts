import { type SlugAvailability } from '@academybee/contracts';
import { type TransactionClient } from '@academybee/database';
import { slugAlternatives, validateSlug } from '@academybee/tenant';
import { Injectable } from '@nestjs/common';

import { PlatformDb } from '../platform-db.js';

type Reader = Pick<TransactionClient, 'tenantDomain' | 'tenant'>;

/**
 * Is a subdomain free for a new academy (C-88)? Shape, reserved and impersonating names first,
 * then every academy's current and old subdomains: a REDIRECT row keeps its slug forever, so an
 * old address can never start serving someone else (ARCHITECTURE §5.1).
 */
@Injectable()
export class SlugAvailabilityService {
  constructor(private readonly platform: PlatformDb) {}

  async check(input: string, db: Reader = this.platform.db): Promise<SlugAvailability> {
    const v = validateSlug(input);
    if (!v.ok)
      return v.problem === 'reserved'
        ? { slug: v.slug, status: 'reserved', suggestions: [] }
        : { slug: v.slug, status: 'invalid', problem: v.problem, suggestions: [] };
    if (await this.taken(v.slug, db))
      return { slug: v.slug, status: 'taken', suggestions: await this.suggestions(v.slug, db) };
    return { slug: v.slug, status: 'available', suggestions: [] };
  }

  /** Up to three free alternatives to `slug`. */
  async suggestions(slug: string, db: Reader = this.platform.db): Promise<string[]> {
    const candidates = slugAlternatives(slug);
    if (!candidates.length) return [];
    const used = new Set(
      (
        await db.tenantDomain.findMany({
          where: { hostname: { in: candidates } },
          select: { hostname: true },
        })
      ).map((d) => d.hostname),
    );
    return candidates.filter((c) => !used.has(c)).slice(0, 3);
  }

  private async taken(slug: string, db: Reader): Promise<boolean> {
    const [domain, tenant] = await Promise.all([
      db.tenantDomain.findUnique({ where: { hostname: slug }, select: { id: true } }),
      db.tenant.findUnique({ where: { slug }, select: { id: true } }),
    ]);
    return domain !== null || tenant !== null;
  }
}

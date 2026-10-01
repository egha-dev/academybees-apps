import { type TenantContextResponse, TenantContextResponseSchema } from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Controller, Get, Inject } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { ZodResponse } from '../validation/zod-dto.js';
import { AnyHost } from './host-policy.js';

/** Branding is decoration: a malformed colour falls back to the neutral tile, never a 500 (L4). */
const hexOrNull = (value: string | null | undefined) =>
  value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : null;

/**
 * Public academy identity for the request host (ARCHITECTURE §5.3) — used by the web proxy to
 * route, brand the shell and pick a status page. The academy comes only from the host.
 */
@Controller({ path: 'tenant', version: '1' })
export class TenantContextController {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Get('context')
  @AnyHost()
  @ZodResponse(TenantContextResponseSchema)
  async context(): Promise<TenantContextResponse> {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind === 'redirect') return { status: 'REDIRECT', host: resolved.host };
    if (resolved?.kind !== 'tenant') throw new DomainError('NOT_FOUND', 'not an academy host');

    const { status } = resolved.tenant;
    if (status === 'ARCHIVED') return { status };
    // Runs under the resolved tenant's context (RLS), set by the TenantGuard.
    const tenant = await this.db.tenant.findFirst({
      select: {
        slug: true,
        timezone: true,
        locale: true,
        branding: {
          select: { displayName: true, primaryColor: true, secondaryColor: true, logoKey: true },
        },
        name: true,
      },
    });
    if (!tenant) throw new DomainError('NOT_FOUND', 'academy row not visible');
    const displayName = tenant.branding?.displayName ?? tenant.name;
    if (status === 'SUSPENDED') return { status, displayName };
    return {
      // PENDING_APPROVAL (future self-serve signup) is shown like SETUP.
      status: status === 'ACTIVE' ? 'ACTIVE' : 'SETUP',
      slug: tenant.slug,
      displayName,
      timezone: tenant.timezone,
      locale: tenant.locale,
      branding: {
        primaryColor: hexOrNull(tenant.branding?.primaryColor),
        secondaryColor: hexOrNull(tenant.branding?.secondaryColor),
        hasLogo: Boolean(tenant.branding?.logoKey),
      },
    };
  }
}

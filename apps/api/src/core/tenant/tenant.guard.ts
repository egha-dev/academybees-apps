import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';
import { DomainError } from '../errors/domain-error.js';
import { DEFAULT_TENANT_STATUSES, HOST_POLICY, type HostPolicy } from './host-policy.js';
import { TenantResolver } from './tenant-resolver.service.js';

/**
 * First step of the request pipeline (ARCHITECTURE §9.2: TenantResolver → … → service):
 * resolves the request host to an academy, puts it in the request context — where the
 * tenant-bound database client, audit, outbox and idempotency read it — and applies the route's
 * host policy. Client-supplied tenant IDs (body, query, headers) are never consulted.
 * - non-academy or unknown host on an academy route → 404 NOT_FOUND (nothing leaks);
 * - academy not in an allowed status → 403 TENANT_UNAVAILABLE (UI shows the status page).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly resolver: TenantResolver,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<HostPolicy | undefined>(HOST_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? { kind: 'tenant', statuses: DEFAULT_TENANT_STATUSES };
    if (policy.kind === 'none') return true;

    const resolved = await this.resolver.resolve(this.cls.get('host'));
    this.cls.set('resolvedHost', resolved);
    if (resolved.kind === 'tenant') this.cls.set('tenantId', resolved.tenant.id);

    if (policy.kind === 'any') return true;
    if (resolved.kind !== 'tenant') throw new DomainError('NOT_FOUND', `host is ${resolved.kind}`);
    if (!policy.statuses.includes(resolved.tenant.status))
      throw new DomainError('TENANT_UNAVAILABLE', `academy is ${resolved.tenant.status}`);
    return true;
  }
}

import { type Capability } from '@academybee/contracts';
import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';

import { IS_PUBLIC } from '../auth/public.decorator.js';
import { type RequestContext } from '../context/request-context.js';
import { DomainError } from '../errors/domain-error.js';
import { HOST_POLICY, type HostPolicy } from '../tenant/host-policy.js';
import { REQUIRED_CAPABILITY, SIGNED_IN_ONLY } from './can.decorator.js';

/**
 * `@Can(capability)` (ARCHITECTURE §9.2: … Membership → TenantStatus → PermissionGuard). Runs after
 * the AuthGuard. A route without `@Can` or `@SignedIn` is refused (fail closed) — a programming
 * error the route-coverage test catches before it ships. Platform capabilities (console) arrive
 * with console sign-in in S8.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<HostPolicy | undefined>(HOST_POLICY, targets)?.kind ===
      'none'
    )
      return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(SIGNED_IN_ONLY, targets)) return true;

    const capability = this.reflector.getAllAndOverride<Capability | undefined>(
      REQUIRED_CAPABILITY,
      targets,
    );
    if (!capability) {
      this.logger.error(
        { handler: `${context.getClass().name}.${context.getHandler().name}` },
        'Route declares neither @Can nor @SignedIn; refusing',
      );
      throw new DomainError('FORBIDDEN', 'route has no capability declared');
    }
    const granted = this.cls.get('membership')?.capabilities[capability];
    if (!granted) throw new DomainError('FORBIDDEN', `missing ${capability}`);
    return true;
  }
}

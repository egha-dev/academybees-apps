import {
  AccessTokenError,
  cookieSpecs,
  CSRF_HEADER,
  csrfMatches,
  type KeyRing,
  verifyAccessToken,
} from '@academybee/auth';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../audit/audit.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { DomainError } from '../errors/domain-error.js';
import { HOST_POLICY, type HostPolicy } from '../tenant/host-policy.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { hostAudience, readCookies } from './http.js';
import { AUTH_KEYS } from './keys.js';
import { MembershipService } from './membership.service.js';
import { MfaService } from './mfa.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authentication + membership + CSRF (ARCHITECTURE §9.2: TenantResolver → Auth → Membership).
 * Runs after the TenantGuard (registered first):
 * - the access token must be signed by us, unexpired, and have the host's audience;
 * - a TENANT token's `tid` must equal the resolved academy → else 401 TENANT_MISMATCH (audited);
 * - the session must not be revoked; a TENANT session needs an ACTIVE membership in this academy,
 *   a CONSOLE session ACTIVE platform staff;
 * - every mutation sent with session cookies needs the CSRF double-submit header; anonymous
 *   mutations need a same-origin `Origin`/`Referer` when the browser sends one.
 * Routes are private unless `@Public()`; host policy `none` (health, docs) skips all of this.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
    private readonly sessions: SessionService,
    private readonly memberships: MembershipService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    @Inject(AUTH_KEYS) private readonly keys: KeyRing,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const policy = this.reflector.getAllAndOverride<HostPolicy | undefined>(HOST_POLICY, targets);
    if (policy?.kind === 'none') return true;
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) ?? false;
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = readCookies(req);
    const names = cookieSpecs(this.config.COOKIE_MODE);
    const hasSessionCookie = Boolean(cookies[names.access.name] ?? cookies[names.refresh.name]);

    const failure = await this.authenticate(cookies[names.access.name]);
    if (failure && !isPublic) throw failure;

    if (!SAFE_METHODS.has(req.method)) {
      if (hasSessionCookie) {
        const header = req.headers[CSRF_HEADER];
        if (!csrfMatches(cookies[names.csrf.name], Array.isArray(header) ? header[0] : header))
          throw new DomainError('FORBIDDEN', 'csrf');
      } else if (!this.sameOrigin(req)) {
        throw new DomainError('FORBIDDEN', 'cross-origin anonymous mutation');
      }
    }
    return true;
  }

  /** Sets the user context when the access token is valid; returns the error to throw if not. */
  private async authenticate(token: string | undefined): Promise<DomainError | undefined> {
    const resolved = this.cls.get('resolvedHost');
    const audience = hostAudience(resolved);
    if (!token || !audience) return new DomainError('UNAUTHENTICATED', 'no session');
    let claims;
    try {
      claims = await verifyAccessToken(token, this.keys, audience);
    } catch (error) {
      return error instanceof AccessTokenError && error.reason === 'expired'
        ? new DomainError('SESSION_EXPIRED', 'access token expired')
        : new DomainError('UNAUTHENTICATED', 'invalid access token');
    }
    if (audience === 'TENANT' && resolved?.kind === 'tenant' && claims.tid !== resolved.tenant.id) {
      // A session from another academy: refuse and record it on the platform audit trail, so the
      // other academy's id never lands in this academy's audit log (ADR-005).
      // Platform rows may be written only outside an academy context (C-53, review L8).
      await this.tenantContext.run(undefined, () =>
        this.audit.record({
          action: 'auth.tenant_mismatch',
          tenantId: null,
          actor: { type: 'USER', id: claims.sub },
          metadata: { via: 'access_token' },
        }),
      );
      return new DomainError('TENANT_MISMATCH');
    }
    if (!(await this.sessions.isSessionActive(claims.sid, claims.sub)))
      return new DomainError('UNAUTHENTICATED', 'revoked session');

    if (audience === 'TENANT' && resolved?.kind === 'tenant') {
      const membership = await this.memberships.load(resolved.tenant.id, claims.sub);
      if (membership?.status !== 'ACTIVE')
        return new DomainError('UNAUTHENTICATED', 'membership inactive');
      this.cls.set('membership', membership);
    }
    if (audience === 'CONSOLE') {
      // Console access ends the moment platform staff are disabled (C-02).
      const staff = await this.mfa.platformStaff(claims.sub);
      if (staff?.status !== 'ACTIVE')
        return new DomainError('UNAUTHENTICATED', 'platform staff inactive');
    }
    this.cls.set('userId', claims.sub);
    this.cls.set('session', { id: claims.sid, audience });
    this.cls.set('actor', {
      type: audience === 'CONSOLE' ? 'PLATFORM_STAFF' : 'USER',
      id: claims.sub,
    });
    return undefined;
  }

  /** Browsers send `Origin` on cross-site POSTs; when present it must be this host. */
  private sameOrigin(req: Request): boolean {
    const host = this.cls.get('host');
    const source = req.headers.origin ?? req.headers.referer;
    if (!source || !host) return true;
    try {
      return new URL(source).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
}

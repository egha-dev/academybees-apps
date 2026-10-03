import { type TenantStatus } from '@academybee/contracts';
import { SetMetadata } from '@nestjs/common';

/**
 * Route host policy (ARCHITECTURE §5.3, §9.2). Default for every route: an academy host whose
 * academy is SETUP or ACTIVE. Anything else is opted into explicitly, so a new endpoint is
 * tenant-scoped unless someone decides otherwise.
 */
export const HOST_POLICY = 'academybee:host-policy';

export type HostPolicy =
  | { kind: 'tenant'; statuses: readonly TenantStatus[] }
  /** Any host; the tenant context is still resolved when the host is an academy. */
  | { kind: 'any' }
  /** The Family Hub host `app.` only (ADR-039); no academy context. */
  | { kind: 'hub' }
  /** The console host `console.` only (C-02); no academy context. */
  | { kind: 'console' }
  /** No host resolution at all (liveness/readiness, docs). */
  | { kind: 'none' };

export const DEFAULT_TENANT_STATUSES: readonly TenantStatus[] = ['SETUP', 'ACTIVE'];
export const ALL_TENANT_STATUSES: readonly TenantStatus[] = [
  'PENDING_APPROVAL',
  'SETUP',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
];

/** Academy host required; academies in other statuses get 403 TENANT_UNAVAILABLE. */
export const TenantHost = (...statuses: TenantStatus[]) =>
  SetMetadata(HOST_POLICY, {
    kind: 'tenant',
    statuses: statuses.length ? statuses : DEFAULT_TENANT_STATUSES,
  } satisfies HostPolicy);

/** Served on every host (marketing, console, hub, academies). */
export const AnyHost = () => SetMetadata(HOST_POLICY, { kind: 'any' } satisfies HostPolicy);

/** Family Hub host only (`app.`); other hosts get 404. */
export const HubHost = () => SetMetadata(HOST_POLICY, { kind: 'hub' } satisfies HostPolicy);

/** Console host only (`console.`); other hosts get 404. */
export const ConsoleHost = () => SetMetadata(HOST_POLICY, { kind: 'console' } satisfies HostPolicy);

/** Skips host resolution entirely (health checks must not depend on tenant lookups). */
export const NoHostResolution = () =>
  SetMetadata(HOST_POLICY, { kind: 'none' } satisfies HostPolicy);

import {
  type Capability,
  type RoleKey,
  type Scope,
  type TenantStatus,
} from '@academybee/contracts';
import { type ClsStore } from 'nestjs-cls';

/** Who performed a request or job (filled by auth in Phase 2). */
export type Actor =
  | { type: 'USER'; id: string }
  | { type: 'PLATFORM_STAFF'; id: string }
  | { type: 'SYSTEM'; id?: undefined };

/** How the request host was resolved (ARCHITECTURE §5.2); set by the TenantGuard. */
export type ResolvedHost =
  | { kind: 'marketing' | 'console' | 'hub' | 'invalid' | 'unknown' }
  | {
      kind: 'tenant';
      tenant: { id: string; slug: string; status: TenantStatus };
      domainRole: 'PRIMARY' | 'ALIAS';
    }
  | { kind: 'redirect'; tenantId: string; host: string };

/** Per-request context in CLS (AsyncLocalStorage). */
export interface RequestContext extends ClsStore {
  requestId: string;
  /** Effective host after the trusted-proxy check (C-46); the only input to tenant resolution. */
  host?: string;
  ip?: string;
  userAgent?: string;
  /** The browser's device-id cookie (new-device alerts, G-11); set by the AuthGuard. */
  deviceCookie?: string;
  resolvedHost?: ResolvedHost;
  /**
   * The resolved academy. Set only from the request host (never from client input), read by the
   * tenant-bound database client (RLS) and by audit/outbox/idempotency.
   */
  tenantId?: string;
  actor?: Actor;
  /** Signed-in user (or the user a flow has resolved); the DB client sets `app.user_id` (C-59). */
  userId?: string;
  /** Current session (set by the AuthGuard). */
  session?: { id: string; audience: 'TENANT' | 'CONSOLE' | 'HUB' };
  /** The user's membership in the request's academy (TENANT sessions). */
  membership?: MembershipInfo;
}

/** Roles and resolved capabilities of a membership (ADR-008); cached by `permissionsVersion`. */
export type MembershipInfo = {
  id: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  permissionsVersion: number;
  branchIds: string[];
  roles: RoleKey[];
  capabilities: Partial<Record<Capability, Scope>>;
};

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

/** Accept a caller-supplied request ID only if it is a safe token; otherwise generate one. */
export function resolveRequestId(header: unknown, generate: () => string): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : generate();
}

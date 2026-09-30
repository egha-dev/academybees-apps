import { type ClsStore } from 'nestjs-cls';

/** Who performed a request or job (filled by auth in Phase 2). */
export type Actor =
  | { type: 'USER'; id: string }
  | { type: 'PLATFORM_STAFF'; id: string }
  | { type: 'SYSTEM'; id?: undefined };

/** Per-request context in CLS (AsyncLocalStorage). Tenant context arrives in Phase 1. */
export interface RequestContext extends ClsStore {
  requestId: string;
  /** Effective host after the trusted-proxy check (used for tenant resolution in Phase 1). */
  host?: string;
  ip?: string;
  userAgent?: string;
  tenantId?: string;
  actor?: Actor;
}

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

/** Accept a caller-supplied request ID only if it is a safe token; otherwise generate one. */
export function resolveRequestId(header: unknown, generate: () => string): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : generate();
}

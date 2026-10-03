/**
 * Cross-tenant security suite scaffold (ADR-005, ADR-022, CLAUDE.md §5: "every new tenant-scoped
 * endpoint is added to the cross-tenant test suite in the same PR").
 *
 * Each app keeps a registry of its tenant-scoped routes; the suite (1) fails when a route that
 * resolves an academy is missing from the registry and (2) replays every registered route on
 * academy A's host with every known way of naming academy B, expecting exactly what A gets
 * without the attempt and nothing of B in the response. Phase 2 adds sessions (A's token on B's
 * host → 401 TENANT_MISMATCH) to the same registry.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type CrossTenantRoute = {
  method: HttpMethod;
  /** Full path as served, e.g. `/api/v1/tenant/context`. */
  path: string;
  /** JSON body for writes (the spoof attempts add a `tenantId` to it). */
  body?: Record<string, unknown>;
  /** The route needs a signed-in session of academy A (cookies + CSRF header are sent). */
  session?: boolean;
  /** The `@Can` capability: a member of A without it must get 403. */
  capability?: string;
  /** Path parameters as symbolic fixture names the suite resolves (default `:id` = A's owner membership). */
  params?: Record<string, string>;
  /** Send a fresh `Idempotency-Key` with every request (`@Idempotent` routes). */
  idempotent?: boolean;
  /**
   * How the spoof cases compare with the baseline: the whole response (default), the status only
   * (writes whose bodies differ per call), or skipped for single-use links — `reason` names the
   * dedicated test that covers them instead.
   */
  spoof?: 'body' | 'status' | { skip: string };
  /** Fields that change with every sign-in (e.g. `lastLoginAt`), left out of the body comparison. */
  volatile?: string[];
};

export type RouteRef = { method: string; path: string };

export type TenantRef = { id: string; slug: string; name: string; host: string };

export type SpoofAttempt = {
  name: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

/** Every client-side way of naming another academy. None of them may change the outcome. */
export function tenantSpoofAttempts(victim: TenantRef): SpoofAttempt[] {
  return [
    { name: 'tenantId in the query', query: { tenantId: victim.id, tenant: victim.slug } },
    { name: 'tenantId in the body', body: { tenantId: victim.id, tenant: victim.slug } },
    { name: 'x-tenant-id header', headers: { 'x-tenant-id': victim.id } },
    { name: 'x-ab-tenant header', headers: { 'x-ab-tenant': victim.slug } },
    {
      name: 'X-Forwarded-Host without the proxy secret',
      headers: { 'x-forwarded-host': victim.host },
    },
    {
      name: 'X-Forwarded-Host with a wrong proxy secret',
      headers: { 'x-forwarded-host': victim.host, 'x-ab-proxy-secret': 'not-the-secret-000' },
    },
    {
      name: 'RFC 7239 Forwarded header',
      headers: { forwarded: `host=${victim.host};for=203.0.113.9` },
    },
    {
      name: 'forged x-ab-context (web proxy header)',
      headers: {
        'x-ab-context': encodeURIComponent(
          JSON.stringify({ status: 'ACTIVE', slug: victim.slug, displayName: victim.name }),
        ),
      },
    },
    { name: 'X-Forwarded-For spoofing', headers: { 'x-forwarded-for': '203.0.113.9' } },
  ];
}

/** Routes that resolve an academy but are not in the registry (should be empty). */
export function missingFromRegistry(
  routes: readonly RouteRef[],
  registry: readonly CrossTenantRoute[],
): string[] {
  const key = (r: RouteRef) => `${r.method.toUpperCase()} ${r.path}`;
  const registered = new Set(registry.map(key));
  return routes.map(key).filter((k) => !registered.has(k));
}

/** Does a serialised response mention the victim academy in any way? */
export function leaksTenant(payload: unknown, victim: TenantRef): string[] {
  const text = JSON.stringify(payload ?? null);
  return [victim.id, victim.slug, victim.name].filter((marker) => text.includes(marker));
}

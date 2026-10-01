import { type TenantContextResponse, TenantContextResponseSchema } from '@academybee/contracts';

/**
 * Academy context for a host, from the API's public `GET /api/v1/tenant/context` (ARCHITECTURE
 * §10.2). Used by `proxy.ts`, so no server-only imports. Cached per host in memory: hits 60 s,
 * unknown hosts 30 s (same as the API). An unreachable API throws — the caller shows the
 * "temporarily unavailable" page, never "unknown academy".
 */
export type ContextLookup = { found: true; context: TenantContextResponse } | { found: false };

export class TenantContextUnavailableError extends Error {
  constructor(reason: string) {
    super(`Tenant context unavailable: ${reason}`);
    this.name = 'TenantContextUnavailableError';
  }
}

const HIT_MS = 60_000;
const MISS_MS = 30_000;
const MAX_ENTRIES = 2_000;
const cache = new Map<string, { at: number; value: ContextLookup }>();

export type ContextFetchConfig = {
  apiOrigin: string;
  proxySecret: string;
  /** Disable the in-memory cache (tests, E2E against freshly changed data). */
  cacheMs?: { hit: number; miss: number };
};

export async function lookupTenantContext(
  host: string,
  config: ContextFetchConfig,
): Promise<ContextLookup> {
  const ttl = config.cacheMs ?? { hit: HIT_MS, miss: MISS_MS };
  const cached = cache.get(host);
  if (cached && Date.now() - cached.at < (cached.value.found ? ttl.hit : ttl.miss))
    return cached.value;

  let res: Response;
  try {
    res = await fetch(new URL('/api/v1/tenant/context', config.apiOrigin), {
      headers: { 'x-forwarded-host': host, 'x-ab-proxy-secret': config.proxySecret },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
  } catch (error) {
    throw new TenantContextUnavailableError(String(error));
  }
  let value: ContextLookup;
  if (res.status === 404) value = { found: false };
  else if (res.ok) {
    const parsed = TenantContextResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new TenantContextUnavailableError('unexpected response');
    value = { found: true, context: parsed.data };
  } else throw new TenantContextUnavailableError(`status ${res.status}`);

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(host, { at: Date.now(), value });
  return value;
}

/** Test helper. */
export function clearTenantContextCache(): void {
  cache.clear();
}

/** Request header carrying the resolved context from `proxy.ts` to server components. */
export const CONTEXT_HEADER = 'x-ab-context';
/** Request header carrying the marketing origin (for "Go to AcademyBee" links). */
export const APEX_HEADER = 'x-ab-apex';

/** Header values must be ASCII; academy names may be in any script. */
export function encodeContextHeader(context: TenantContextResponse): string {
  return encodeURIComponent(JSON.stringify(context));
}

export function decodeContextHeader(value: string | null): TenantContextResponse | undefined {
  if (!value) return undefined;
  try {
    const parsed = TenantContextResponseSchema.safeParse(JSON.parse(decodeURIComponent(value)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

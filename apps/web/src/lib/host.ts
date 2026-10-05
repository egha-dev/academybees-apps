import { classifyHost, type HostClass } from '@academybee/tenant';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The platform root domain for this environment (C-52): `academybees.com`, `staging.academybees.com`
 * or `localhost`. Local and CI default to `localhost`; every other environment must set it.
 */
export function platformRootDomain(env: Env = process.env): string {
  const root = env.PLATFORM_ROOT_DOMAIN?.trim();
  if (root) return root;
  if (env.APP_ENV === 'local' || env.APP_ENV === 'ci') return 'localhost';
  throw new Error('PLATFORM_ROOT_DOMAIN must be set outside local/ci');
}

/** Classify the request host with the shared rules (`@academybee/tenant`, ARCHITECTURE §5.2). */
export function classifyRequestHost(host: string | null, env?: Env): HostClass {
  return classifyHost(host, platformRootDomain(env));
}

/**
 * The port the browser used, from the Host header (`demo-a.localhost:3000` → `3000`, a deployed
 * `app.staging.academybees.com` → ``). Never the server's own listening port: behind Railway's edge
 * that is the internal 3000, which must not leak into redirects.
 */
export function browserPort(host: string | null): string {
  return /:(\d{1,5})$/.exec(host ?? '')?.[1] ?? '';
}

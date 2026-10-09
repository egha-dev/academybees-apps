import 'server-only';

import type { TenantContextResponse } from '@academybee/contracts';
import { headers } from 'next/headers';

import { APEX_HEADER, CONTEXT_HEADER, decodeContextHeader, PATH_HEADER } from './tenant-context';

/** What `proxy.ts` resolved for this request (academy context and the marketing origin). */
export async function hostContext(): Promise<{
  context: TenantContextResponse | undefined;
  apexUrl: string;
}> {
  const h = await headers();
  return {
    context: decodeContextHeader(h.get(CONTEXT_HEADER)),
    apexUrl: h.get(APEX_HEADER) ?? '/',
  };
}

/** The academy's display name when the context carries one. */
export function academyName(context: TenantContextResponse | undefined): string | undefined {
  return context && 'displayName' in context ? context.displayName : undefined;
}

/** The academy's uploaded logo (C-97) when the context carries branding; null → monogram. */
export function academyLogo(context: TenantContextResponse | undefined): string | null {
  return context && 'branding' in context ? context.branding.logoUrl : null;
}

/** The academy's brand colour when the context carries branding (ACTIVE / SETUP). */
export function academyColor(context: TenantContextResponse | undefined): string | null {
  return context && 'branding' in context ? context.branding.primaryColor : null;
}

/** The path (and query) the browser requested, as set by proxy.ts. */
export async function requestPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? '/';
}

/** The academy's time zone when the context carries settings (for dates and times). */
export function academyTimeZone(context: TenantContextResponse | undefined): string | undefined {
  return context && 'timezone' in context ? context.timezone : undefined;
}

/** The Family Hub origin (`app.` on the platform root) for this deployment (G-31). */
export function hubOrigin(apexUrl: string): string | undefined {
  try {
    const url = new URL(apexUrl);
    return `${url.protocol}//app.${url.host}`;
  } catch {
    return undefined;
  }
}

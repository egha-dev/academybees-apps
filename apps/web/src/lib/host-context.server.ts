import 'server-only';

import { type TenantContextResponse } from '@academybee/contracts';
import { headers } from 'next/headers';

import { APEX_HEADER, CONTEXT_HEADER, decodeContextHeader } from './tenant-context';

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

/** The academy's brand colour when the context carries branding (ACTIVE / SETUP). */
export function academyColor(context: TenantContextResponse | undefined): string | null {
  return context && 'branding' in context ? context.branding.primaryColor : null;
}

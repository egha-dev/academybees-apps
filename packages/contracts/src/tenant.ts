import { z } from 'zod';

/** Academy lifecycle (C-11). */
export const TenantStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'SETUP',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * `GET /api/v1/tenant/context` — public academy identity for the request host (ARCHITECTURE §5.3).
 * Never contains internal IDs. Suspended academies expose their name only; archived ones only
 * their status. A REDIRECT host (old slug) answers with the primary host to 301 to.
 */
export const TenantContextResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['SETUP', 'ACTIVE']),
    slug: z.string(),
    displayName: z.string(),
    timezone: z.string(),
    locale: z.string(),
    branding: z.object({
      primaryColor: HexColor.nullable(),
      secondaryColor: HexColor.nullable(),
      hasLogo: z.boolean(),
      /** Public URLs of the uploaded logo and favicon (C-97); null → generated monogram. */
      logoUrl: z.url().nullable().default(null),
      faviconUrl: z.url().nullable().default(null),
    }),
  }),
  z.object({ status: z.literal('SUSPENDED'), displayName: z.string() }),
  z.object({ status: z.literal('ARCHIVED') }),
  z.object({ status: z.literal('REDIRECT'), host: z.string() }),
]);
export type TenantContextResponse = z.infer<typeof TenantContextResponseSchema>;

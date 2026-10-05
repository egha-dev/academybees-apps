import { z } from 'zod';

/**
 * Transactional email (C-04, C-62): the API writes an `email.requested` outbox event in the same
 * transaction as the change; the worker renders it from the i18n catalogue and sends it. A link's
 * secret travels only sealed (AES-256-GCM) and replaces `{token}` in `link.path` at send time.
 */
export const EMAIL_OUTBOX_TYPE = 'email.requested';

export const EmailTemplateSchema = z.enum([
  'invite',
  'password_reset',
  'password_changed',
  'platform_admin_invite',
  'account_setup',
]);
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const EmailRequestSchema = z.object({
  template: EmailTemplateSchema,
  to: z.email(),
  /** Recipient locale (ADR-040); en-IN until Phase L. */
  locale: z.string().default('en-IN'),
  /** Which host the links open on. */
  host: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('academy'), slug: z.string().min(3).max(42) }),
    z.object({ kind: z.literal('hub') }),
    z.object({ kind: z.literal('console') }),
  ]),
  /** Academy identity for the header (emails stay light-themed, C-49). */
  academy: z
    .object({
      displayName: z.string().max(120),
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullable(),
    })
    .optional(),
  /** ICU variables (names, never secrets). */
  vars: z.record(z.string(), z.string().max(200)).default({}),
  link: z
    .object({
      /** Path on the host, e.g. `/invite/{token}`. */
      path: z.string().startsWith('/').max(200),
      sealedToken: z.string().startsWith('ab1.'),
    })
    .optional(),
});
export type EmailRequest = z.input<typeof EmailRequestSchema>;

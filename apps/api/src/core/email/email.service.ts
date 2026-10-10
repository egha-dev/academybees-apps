import { encryptSecret, type MasterKeyRing } from '@academybee/auth';
import { EMAIL_OUTBOX_TYPE, type EmailRequest, EmailRequestSchema } from '@academybee/contracts';
import type { TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MASTER_KEYS } from '../auth/keys.js';
import type { RequestContext } from '../context/request-context.js';
import { OutboxService } from '../outbox/outbox.service.js';

export type EmailInput = Omit<EmailRequest, 'link' | 'code'> & {
  /** A one-time code for the body; sealed in the outbox like link tokens (C-62). */
  code?: string;
  /** `path` contains `{token}`; the token is sealed before it leaves this process (C-62). */
  link?: { path: string; token: string };
};

/**
 * Queue a transactional email (C-04) in the same transaction as the change that causes it, so it
 * is sent only if that change commits (ADR-019). The worker renders and sends it.
 */
@Injectable()
export class EmailService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly cls: ClsService<RequestContext>,
    @Inject(MASTER_KEYS) private readonly keys: MasterKeyRing,
  ) {}

  /**
   * The current academy as an email sender: links go to its subdomain (never a custom domain,
   * which may not be verified yet) and the header shows its name and colour.
   */
  async academySender(tx: TransactionClient): Promise<Pick<EmailRequest, 'host' | 'academy'>> {
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant') throw new Error('academy emails need an academy host');
    const branding = await tx.tenantBranding.findFirst({
      select: { displayName: true, primaryColor: true },
    });
    return {
      host: { kind: 'academy', slug: resolved.tenant.slug },
      ...(branding
        ? { academy: { displayName: branding.displayName, primaryColor: branding.primaryColor } }
        : {}),
    };
  }

  async request(tx: TransactionClient, input: EmailInput): Promise<void> {
    const { link, code, ...rest } = input;
    const payload = EmailRequestSchema.parse({
      ...rest,
      ...(link
        ? { link: { path: link.path, sealedToken: encryptSecret(link.token, this.keys) } }
        : {}),
      ...(code ? { code: { sealedToken: encryptSecret(code, this.keys) } } : {}),
    });
    await this.outbox.write(tx, { type: EMAIL_OUTBOX_TYPE, payload });
  }
}

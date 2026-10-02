import { encryptSecret, type MasterKeyRing } from '@academybee/auth';
import { EMAIL_OUTBOX_TYPE, type EmailRequest, EmailRequestSchema } from '@academybee/contracts';
import { type TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { MASTER_KEYS } from '../auth/keys.js';
import { OutboxService } from '../outbox/outbox.service.js';

export type EmailInput = Omit<EmailRequest, 'link'> & {
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
    @Inject(MASTER_KEYS) private readonly keys: MasterKeyRing,
  ) {}

  async request(tx: TransactionClient, input: EmailInput): Promise<void> {
    const { link, ...rest } = input;
    const payload = EmailRequestSchema.parse({
      ...rest,
      ...(link
        ? { link: { path: link.path, sealedToken: encryptSecret(link.token, this.keys) } }
        : {}),
    });
    await this.outbox.write(tx, { type: EMAIL_OUTBOX_TYPE, payload });
  }
}

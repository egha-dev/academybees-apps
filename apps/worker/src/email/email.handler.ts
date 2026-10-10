import { decryptSecret, loadMasterKeys, type MasterKeyRing } from '@academybee/auth';
import { EMAIL_OUTBOX_TYPE, EmailRequestSchema } from '@academybee/contracts';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { WORKER_CONFIG, type WorkerConfig } from '../config/config.js';
import { DomainEventsWorker } from '../events/domain-events.worker.js';
import { EMAIL_PORT, type EmailPort } from './email.port.js';
import { renderEmail } from './render.js';

/**
 * Sends `email.requested` outbox events (C-04, C-62). The sealed link token is opened only here,
 * placed into the link, and never logged. Malformed events are dropped (logged without content);
 * delivery failures throw so BullMQ retries with backoff (ADR-019).
 */
@Injectable()
export class EmailHandler implements OnModuleInit {
  private readonly logger = new Logger('Email');
  private readonly keys: MasterKeyRing;

  constructor(
    private readonly events: DomainEventsWorker,
    @Inject(EMAIL_PORT) private readonly port: EmailPort,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {
    this.keys = loadMasterKeys(config.SECRETS_MASTER_KEY);
  }

  onModuleInit(): void {
    this.events.on(EMAIL_OUTBOX_TYPE, async (event) => {
      await this.handle(event.payload, event.eventId);
    });
  }

  async handle(payload: unknown, eventId?: string): Promise<void> {
    const parsed = EmailRequestSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn('Dropped a malformed email request');
      return;
    }
    const url = parsed.data.link ? this.linkUrl(parsed.data) : undefined;
    // A sealed one-time code becomes the `{code}` variable only here, at send time (C-62).
    const request = parsed.data.code
      ? {
          ...parsed.data,
          vars: {
            ...parsed.data.vars,
            code: decryptSecret(parsed.data.code.sealedToken, this.keys),
          },
        }
      : parsed.data;
    await this.port.send({
      ...renderEmail(request, url),
      ...(eventId ? { idempotencyKey: `email-${eventId}` } : {}),
    });
    this.logger.log({ template: parsed.data.template }, 'Email sent');
  }

  private linkUrl(request: z.infer<typeof EmailRequestSchema>): string {
    const { link, host } = request;
    if (!link) throw new Error('no link');
    const token = decryptSecret(link.sealedToken, this.keys);
    const root = this.config.PLATFORM_ROOT_DOMAIN;
    const hostname =
      host.kind === 'academy'
        ? `${host.slug}.${root}`
        : host.kind === 'hub'
          ? `app.${root}`
          : `console.${root}`;
    const port = this.config.WEB_PUBLIC_PORT ? `:${this.config.WEB_PUBLIC_PORT}` : '';
    return `${this.config.WEB_PUBLIC_PROTOCOL}://${hostname}${port}${link.path.replace('{token}', encodeURIComponent(token))}`;
  }
}

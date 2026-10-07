import { cookieSpecs, generateToken, hashToken } from '@academybee/auth';
import { type EmailRequest, newId } from '@academybee/contracts';
import { type TenantBoundClient, type TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { deviceLabel } from './http.js';

const DEVICE_ID = /^[\w-]{43}$/;

/**
 * Known devices and new-device alerts (G-11, C-80). Each browser keeps a long-lived, host-only
 * device-id cookie (not a credential); the server stores only its hash per user. The first
 * sign-in from a device the user has never used sends an email, unless it is their very first
 * device (an invitation or a new account).
 */
@Injectable()
export class DeviceService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly emails: EmailService,
  ) {}

  async signedIn(res: Response, userId: string): Promise<void> {
    const spec = cookieSpecs(this.config.COOKIE_MODE).device;
    const presented = this.cls.get('deviceCookie');
    const deviceId = presented && DEVICE_ID.test(presented) ? presented : generateToken();
    if (deviceId !== presented) res.cookie(spec.name, deviceId, spec.options);
    const deviceIdHash = hashToken(deviceId);
    const label = deviceLabel(this.cls.get('userAgent'));

    await this.context.runAsUser(userId, () =>
      this.db.$transaction(async (tx) => {
        const seen = await tx.knownDevice.updateMany({
          where: { deviceIdHash },
          data: { lastSeenAt: new Date(), label },
        });
        if (seen.count > 0) return;
        const earlier = await tx.knownDevice.count();
        await tx.knownDevice.createMany({
          data: { id: newId(), userId, deviceIdHash, label },
          skipDuplicates: true,
        });
        if (earlier === 0) return;
        const user = await tx.user.findFirst({ where: { id: userId }, select: { email: true } });
        if (!user?.email) return;
        const [browser, os] = label.split('/');
        await this.emails.request(tx, {
          template: 'new_device',
          to: user.email,
          locale: 'en-IN',
          ...(await this.sender(tx)),
          vars: { browser: browser ?? 'other', os: os ?? 'other' },
        });
      }),
    );
  }

  /** Who the alert comes from: the academy on its host, AcademyBee on the hub and console. */
  async sender(tx: TransactionClient): Promise<Pick<EmailRequest, 'host' | 'academy'>> {
    const kind = this.cls.get('resolvedHost')?.kind;
    if (kind === 'tenant') return this.emails.academySender(tx);
    return { host: { kind: kind === 'console' ? 'console' : 'hub' } };
  }
}

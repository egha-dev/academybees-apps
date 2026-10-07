import { generateToken, hashToken } from '@academybee/auth';
import { INVITATION_LINK_PATH, INVITATION_TTL_MS, newId } from '@academybee/contracts';
import { type TransactionClient } from '@academybee/database';
import { Injectable } from '@nestjs/common';

import { EmailService } from '../../core/email/email.service.js';

export type OwnerInvite = {
  tenantId: string;
  slug: string;
  academy: string;
  primaryColor?: string | null;
  owner: { name: string; email: string };
};

/**
 * The academy owner's invitation (role `owner`, 7 days, C-67), sent by AcademyBee from the
 * console. It has no academy sender (`invitedById` null), so the C-84 sender re-check, which is
 * about member invitations, doesn't apply. The link opens the academy's own subdomain.
 */
@Injectable()
export class OwnerInviteService {
  constructor(private readonly emails: EmailService) {}

  async send(tx: TransactionClient, a: OwnerInvite): Promise<void> {
    const token = generateToken();
    await tx.invitation.create({
      data: {
        id: newId(),
        tenantId: a.tenantId,
        email: a.owner.email,
        inviteeName: a.owner.name,
        roleKeys: ['owner'],
        tokenHash: hashToken(token),
        invitedById: null,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await this.emails.request(tx, {
      template: 'owner_invite',
      to: a.owner.email,
      locale: 'en-IN',
      host: { kind: 'academy', slug: a.slug },
      academy: { displayName: a.academy, primaryColor: a.primaryColor ?? null },
      vars: { owner: a.owner.name },
      link: { path: INVITATION_LINK_PATH, token },
    });
  }
}

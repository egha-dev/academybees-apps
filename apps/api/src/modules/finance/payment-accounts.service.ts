import { encryptSecret, decryptSecret, generateToken, type MasterKeyRing } from '@academybee/auth';
import { type GatewayAccount, newId } from '@academybee/contracts';
import type { Prisma, TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import { MASTER_KEYS } from '../../core/auth/keys.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import type { ProviderCredentials } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/provider-registry.js';

const PUBLIC = {
  provider: true,
  accountRef: true,
  mode: true,
  status: true,
  connectedAt: true,
} satisfies Prisma.TenantPaymentAccountSelect;
type PublicRow = Prisma.TenantPaymentAccountGetPayload<{ select: typeof PUBLIC }>;

const toAccount = (r: PublicRow): GatewayAccount => ({
  provider: r.provider,
  mode: r.mode,
  status: r.status,
  webhookPath: `/api/v1/webhooks/payments/${r.provider}/${r.accountRef}`,
  connectedAt: r.connectedAt?.toISOString() ?? null,
});

/**
 * The academy's own gateway account (G-01, ADR-033): the money goes straight to the academy. Its
 * secrets are sealed at rest, opened only here at call time, and never selected for a response;
 * every read for an API answer goes through `PUBLIC`.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(MASTER_KEYS) private readonly keys: MasterKeyRing,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  /** The account that can take payments now, if any: connected, and its provider runs here. */
  async live(db: Pick<TransactionClient, 'tenantPaymentAccount'> = this.db) {
    const row = await db.tenantPaymentAccount.findFirst({
      where: { status: 'CONNECTED' },
      select: { id: true, tenantId: true, provider: true, accountRef: true },
    });
    const provider = row ? this.registry.get(row.provider) : undefined;
    return row && provider?.online ? { ...row, provider } : null;
  }

  async get(): Promise<{ account: GatewayAccount | null }> {
    const row = await this.db.tenantPaymentAccount.findFirst({
      where: { status: { not: 'DISABLED' } },
      select: PUBLIC,
    });
    return { account: row ? toAccount(row) : null };
  }

  /** Secrets for one call to the gateway; the caller passes them on and forgets them. */
  async credentials(accountId: string): Promise<ProviderCredentials> {
    const row = await this.db.tenantPaymentAccount.findFirst({
      where: { id: accountId },
      select: { accountRef: true, credentialsCipher: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'account');
    return { accountRef: row.accountRef, secret: decryptSecret(row.credentialsCipher, this.keys) };
  }

  /** The webhook secret for one verification, or null if it can't be opened. */
  webhookSecret(cipher: string): string | null {
    try {
      return decryptSecret(cipher, this.keys);
    } catch {
      return null;
    }
  }

  /** The simulator's account (ADR-038): real connections arrive with the gateway in Phase G. */
  async connectSimulator(): Promise<GatewayAccount> {
    if (!this.registry.simulator) throw new DomainError('NOT_FOUND', 'simulator not enabled');
    const alreadyConnected = () =>
      new DomainError('CONFLICT', 'already connected', [
        { path: 'gateway', issue: 'already_connected' },
      ]);
    const row = await this.db
      .$transaction(async (tx) => {
        const existing = await tx.tenantPaymentAccount.findFirst({
          where: { status: { not: 'DISABLED' } },
          select: { id: true },
        });
        if (existing) throw alreadyConnected();
        const created = await tx.tenantPaymentAccount.create({
          data: {
            id: newId(),
            tenantId: this.cls.get('tenantId'),
            provider: 'simulator',
            accountRef: `sim_${generateToken()
              .slice(0, 32)
              .replace(/[^A-Za-z0-9_-]/g, '')}`,
            mode: 'TEST',
            status: 'CONNECTED',
            credentialsCipher: encryptSecret(generateToken(), this.keys),
            webhookCipher: encryptSecret(generateToken(), this.keys),
            connectedAt: new Date(),
            verifiedAt: new Date(),
          },
          select: PUBLIC,
        });
        await this.audit.record(
          {
            action: 'finance.gateway_connected',
            entityType: 'TenantPaymentAccount',
            metadata: { provider: 'simulator', mode: 'TEST' },
          },
          tx,
        );
        return created;
      })
      .catch((error: unknown) => {
        // Two owners at once: the partial unique index lets one through.
        if ((error as { code?: string }).code === 'P2002') throw alreadyConnected();
        throw error;
      });
    return toAccount(row);
  }

  /** New payments stop; events for orders already made are still believed (money was received). */
  async disconnect(): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.tenantPaymentAccount.updateMany({
        where: { status: { not: 'DISABLED' } },
        data: { status: 'DISABLED' },
      });
      if (updated.count === 0) throw new DomainError('NOT_FOUND', 'no gateway account');
      await this.audit.record(
        { action: 'finance.gateway_disconnected', entityType: 'TenantPaymentAccount' },
        tx,
      );
    });
  }
}

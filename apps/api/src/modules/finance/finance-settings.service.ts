import {
  type FinanceSettings,
  type FinanceSettingsResponse,
  FinanceSettingsSchema,
  localDate,
  type UpdateFinanceSettings,
  upiLink,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { AuditService } from '../../core/audit/audit.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { fiscalYearOf } from './domain/numbering.js';

/**
 * Settings → Payments (ADR-038, C-139…C-143): how the academy is paid (UPI ID, bank details,
 * methods), tax, number prefixes and fee rules. One JSON section of `TenantSettings`, validated
 * by its contract and versioned with the row. Bank details are shown on invoices; nothing here
 * is a secret (gateway credentials live encrypted in `TenantPaymentAccount`, ADR-033).
 */
@Injectable()
export class FinanceSettingsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly audit: AuditService,
  ) {}

  /** The stored settings with defaults filled in; for other finance services too. */
  async current(db: Pick<TransactionClient, 'tenantSettings'> = this.db) {
    const row = await db.tenantSettings.findFirst({ select: { finance: true, version: true } });
    if (!row) throw new DomainError('NOT_FOUND', 'settings missing');
    const parsed = FinanceSettingsSchema.safeParse(row.finance ?? {});
    // A stored value that no longer parses (an older shape) falls back to the defaults.
    return {
      settings: parsed.success ? parsed.data : FinanceSettingsSchema.parse({}),
      version: row.version,
    };
  }

  async get(): Promise<FinanceSettingsResponse> {
    const { settings, version } = await this.current();
    return this.respond(settings, version);
  }

  async update(change: UpdateFinanceSettings): Promise<FinanceSettingsResponse> {
    return this.db.$transaction(async (tx) => {
      const { settings: before, version } = await this.current(tx);
      if (version !== change.version) throw new DomainError('VERSION_CONFLICT');
      const { version: _version, ...given } = change;
      // Only the sections sent replace the stored ones.
      const sections = Object.fromEntries(
        Object.entries(given).filter(([, v]) => v !== undefined),
      ) as Partial<FinanceSettings>;
      const next: FinanceSettings = { ...before, ...sections };
      // C-142: a prefix already used this fiscal year stays (numbers in a year read alike).
      const locked = await this.prefixesLocked(tx);
      for (const kind of ['INVOICE', 'RECEIPT'] as const)
        if (locked[kind] && next.prefixes[kind] !== before.prefixes[kind])
          throw new DomainError('CONFLICT', 'prefix in use this year', [
            { path: `prefixes.${kind}`, issue: 'prefix_in_use' },
          ]);
      const updated = await tx.tenantSettings.updateMany({
        where: { version },
        data: { finance: next, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await this.audit.record(
        {
          action: 'finance.settings_changed',
          entityType: 'TenantSettings',
          // Which sections changed; bank account numbers are left out of the log.
          metadata: { sections: Object.keys(sections) },
        },
        tx,
      );
      return this.respond(next, version + 1, tx);
    });
  }

  /** The onboarding Fee Setup step (C-08): just the UPI ID, inside its transaction. */
  async setUpiFromSetup(tx: TransactionClient, upi: FinanceSettings['upi']): Promise<void> {
    const { settings, version } = await this.current(tx);
    const updated = await tx.tenantSettings.updateMany({
      where: { version },
      data: { finance: { ...settings, upi }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    await this.audit.record(
      {
        action: 'finance.settings_changed',
        entityType: 'TenantSettings',
        metadata: { sections: ['upi'] },
      },
      tx,
    );
  }

  private async respond(
    settings: FinanceSettings,
    version: number,
    db: Pick<TransactionClient, 'tenant' | 'numberSequence' | 'tenantPaymentAccount'> = this.db,
  ): Promise<FinanceSettingsResponse> {
    const [locked, gateway] = await Promise.all([
      this.prefixesLocked(db),
      db.tenantPaymentAccount.findFirst({
        // A provider this deployment doesn't run is not connected, whatever the row says.
        where: { status: 'CONNECTED', provider: { in: [...this.config.PAYMENT_PROVIDERS] } },
        select: { provider: true },
      }),
    ]);
    return {
      settings,
      version,
      upiPreview: settings.upi ? upiLink(settings.upi) : null,
      gateway: { connected: Boolean(gateway), provider: gateway?.provider ?? null },
      prefixesLocked: locked,
    };
  }

  private async prefixesLocked(db: Pick<TransactionClient, 'tenant' | 'numberSequence'>) {
    const tenant = await db.tenant.findFirst({ select: { timezone: true } });
    const fy = fiscalYearOf(localDate(new Date(), tenant?.timezone ?? 'Asia/Kolkata'));
    const used = await db.numberSequence.findMany({
      where: { fiscalYear: fy, lastValue: { gt: 0 } },
      select: { kind: true },
    });
    return {
      INVOICE: used.some((u) => u.kind === 'INVOICE'),
      RECEIPT: used.some((u) => u.kind === 'RECEIPT'),
    };
  }
}

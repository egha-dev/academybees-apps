import {
  type LegalCurrentResponse,
  type LegalDocumentKind,
  LegalVariantSchema,
  newId,
  OWNER_LEGAL_KINDS,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';

/** Locale the documents are shown in: always en-IN until Phase L (ADR-040). */
const LOCALE = 'en-IN';

type CurrentDocument = { id: string; kind: LegalDocumentKind; version: string; variants: unknown };

/**
 * Terms, Privacy and DPA acceptance (G-06, ADR-034). The current version of each kind is the latest
 * one already published; a new version means everyone accepts again. Acceptances are append-only
 * and user-owned (RLS on `app.user_id`), recording the academy, locale and IP.
 */
@Injectable()
export class LegalService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async currentDocuments(): Promise<CurrentDocument[]> {
    const rows = await this.db.legalDocument.findMany({
      where: { kind: { in: [...OWNER_LEGAL_KINDS] }, publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, kind: true, version: true, variants: true },
    });
    const latest = new Map<LegalDocumentKind, CurrentDocument>();
    for (const row of rows) if (!latest.has(row.kind)) latest.set(row.kind, row);
    return OWNER_LEGAL_KINDS.map((k) => latest.get(k)).filter(
      (d): d is CurrentDocument => d !== undefined,
    );
  }

  private userId(): string {
    const id = this.cls.get('userId');
    if (!id) throw new DomainError('UNAUTHENTICATED');
    return id;
  }

  async current(): Promise<LegalCurrentResponse> {
    const userId = this.userId();
    const docs = await this.currentDocuments();
    const accepted = new Set(
      (
        await this.db.legalAcceptance.findMany({
          where: { userId, documentId: { in: docs.map((d) => d.id) } },
          select: { documentId: true },
        })
      ).map((a) => a.documentId),
    );
    const documents = docs.map((d) => {
      const variants = (d.variants ?? {}) as Record<string, unknown>;
      const v = LegalVariantSchema.parse(variants[LOCALE]);
      return {
        id: d.id,
        kind: d.kind,
        version: d.version,
        title: v.title,
        summary: v.summary,
        url: v.url,
        accepted: accepted.has(d.id),
      };
    });
    return { documents, complete: documents.every((d) => d.accepted) };
  }

  /** True when the signed-in user has accepted every current owner document. */
  async isComplete(): Promise<boolean> {
    return (await this.current()).complete;
  }

  /**
   * Accept the listed documents. Only current versions can be accepted; accepting one twice is a
   * no-op (the first acceptance stands).
   */
  async accept(documentIds: string[]): Promise<LegalCurrentResponse> {
    const userId = this.userId();
    const docs = await this.currentDocuments();
    const ids = [...new Set(documentIds)];
    const chosen = docs.filter((d) => ids.includes(d.id));
    if (chosen.length !== ids.length)
      throw new DomainError('VALIDATION_FAILED', 'not a current document', [
        { path: 'documentIds', issue: 'not_current' },
      ]);

    await this.db.$transaction(async (tx) => {
      const { count } = await tx.legalAcceptance.createMany({
        data: chosen.map((d) => ({
          id: newId(),
          userId,
          tenantId: this.cls.get('tenantId') ?? null,
          documentId: d.id,
          locale: LOCALE,
          ip: this.cls.get('ip') ?? null,
        })),
        skipDuplicates: true,
      });
      if (count === 0) return;
      await this.audit.record(
        {
          action: 'legal.accepted',
          entityType: 'LegalDocument',
          metadata: { documents: chosen.map((d) => ({ kind: d.kind, version: d.version })) },
        },
        tx,
      );
      await this.analytics.track(tx, 'legal.accepted', { kinds: chosen.map((d) => d.kind) });
    });
    return this.current();
  }
}

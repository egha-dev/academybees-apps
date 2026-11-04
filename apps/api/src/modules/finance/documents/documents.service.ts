import { generateToken, hashToken } from '@academybee/auth';
import {
  type CreatedShareLink,
  type DocumentLayout,
  type FinanceDocument,
  newId,
  type ShareLink,
} from '@academybee/contracts';
import type { Prisma, TenantBoundClient } from '@academybee/database';
import { createServerTranslator, formatDate } from '@academybee/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../../core/analytics/analytics.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { API_CONFIG } from '../../../core/config/config.module.js';
import { type ApiConfig, platformRootDomain } from '../../../core/config/config.schema.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { MediaStorage } from '../../../core/media/media-storage.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.service.js';
import { scopedWhere } from '../../../core/rbac/scope.js';
import { invoicePolicy, paymentPolicy } from '../finance.policy.js';
import { DocumentsQueue } from './documents.queue.js';

const SHARE_DAYS = 7;
const OPEN_RULE = { name: 'share-link-open', limit: 30, windowSeconds: 60 } as const;
/** A cancelled invoice asks for nothing, so a link to one stops working. */
const NOT_SHAREABLE = ['DRAFT', 'CANCELLED', 'WRITTEN_OFF'];

type Subject = { kind: 'INVOICE' | 'RECEIPT'; id: string };

const LINK_SELECT = {
  id: true,
  expiresAt: true,
  revokedAt: true,
  openCount: true,
  createdAt: true,
  document: { select: { layout: true } },
} satisfies Prisma.ShareLinkSelect;
type LinkRow = Prisma.ShareLinkGetPayload<{ select: typeof LINK_SELECT }>;

const toLink = (r: LinkRow): ShareLink => ({
  id: r.id,
  layout: r.document.layout as DocumentLayout,
  expiresAt: r.expiresAt.toISOString(),
  revokedAt: r.revokedAt?.toISOString() ?? null,
  openCount: r.openCount,
  createdAt: r.createdAt.toISOString(),
});
const subjectWhere = (s: Subject): Prisma.FinanceDocumentWhereInput =>
  s.kind === 'INVOICE' ? { invoiceId: s.id } : { paymentId: s.id };

/**
 * Receipts and invoices as files (G-18, C-137, C-160). A document is rendered once from its frozen
 * snapshot, on first request; reprinting is the same file. Anyone outside can only reach it through
 * a share link: 7 days, revocable, and only the token's hash is stored.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly storage: MediaStorage,
    private readonly queue: DocumentsQueue,
    private readonly rate: RateLimiter,
  ) {}

  /** The invoice or payment, if this person may see it; never a draft or unconfirmed payment. */
  private async subject(s: Subject) {
    if (s.kind === 'INVOICE') {
      const row = await this.db.invoice.findFirst({
        where: { AND: [{ id: s.id }, scopedWhere(this.cls, 'invoice.read', invoicePolicy)] },
        select: { tenantId: true, status: true, number: true },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'invoice');
      return { tenantId: row.tenantId, status: row.status as string, number: row.number };
    }
    const row = await this.db.payment.findFirst({
      where: { AND: [{ id: s.id }, scopedWhere(this.cls, 'receipt.read', paymentPolicy)] },
      select: { tenantId: true, status: true, receiptNumber: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'payment');
    return { tenantId: row.tenantId, status: row.status as string, number: row.receiptNumber };
  }

  private unavailable() {
    return new DomainError('CONFLICT', 'no document yet', [
      { path: 'document', issue: 'document_unavailable' },
    ]);
  }

  private async response(row: {
    layout: string;
    status: FinanceDocument['status'];
    storageKey: string | null;
  }): Promise<FinanceDocument> {
    return {
      layout: row.layout as DocumentLayout,
      status: row.status,
      url: row.storageKey ? await this.storage.signedGet(row.storageKey) : null,
    };
  }

  /** What exists now; `prepare` starts it. 404 until someone has asked for this layout. */
  async get(s: Subject, layout: DocumentLayout): Promise<FinanceDocument> {
    await this.subject(s);
    const row = await this.db.financeDocument.findFirst({
      where: { ...subjectWhere(s), layout },
      select: { layout: true, status: true, storageKey: true },
    });
    if (!row) throw new DomainError('NOT_FOUND', 'document');
    return this.response(row);
  }

  /** Render it if it isn't yet. Asking again is harmless, and retries a failed one. */
  async prepare(s: Subject, layout: DocumentLayout): Promise<FinanceDocument> {
    if (!this.storage.privateAvailable)
      throw new DomainError('SERVICE_UNAVAILABLE', 'private media storage not configured');
    const subject = await this.subject(s);
    if (!subject.number || subject.status === 'CANCELLED') throw this.unavailable();
    await this.db.financeDocument.createMany({
      data: [
        {
          id: newId(),
          tenantId: subject.tenantId,
          kind: s.kind,
          ...(s.kind === 'INVOICE' ? { invoiceId: s.id } : { paymentId: s.id }),
          layout,
        },
      ],
      skipDuplicates: true,
    });
    await this.db.financeDocument.updateMany({
      where: { ...subjectWhere(s), layout, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    const row = await this.db.financeDocument.findFirstOrThrow({
      where: { ...subjectWhere(s), layout },
      select: { id: true, layout: true, status: true, storageKey: true },
    });
    if (row.status === 'PENDING')
      await this.queue.add({ tenantId: subject.tenantId, documentId: row.id });
    return this.response(row);
  }

  async share(s: Subject, layout: DocumentLayout): Promise<CreatedShareLink> {
    const subject = await this.subject(s);
    if (NOT_SHAREABLE.includes(subject.status)) throw this.unavailable();
    const doc = await this.db.financeDocument.findFirst({
      where: { ...subjectWhere(s), layout, status: 'READY' },
      select: { id: true },
    });
    if (!doc)
      throw new DomainError('CONFLICT', 'not ready', [
        { path: 'document', issue: 'document_not_ready' },
      ]);
    const token = generateToken();
    const membershipId = this.cls.get('membership')!.id;
    const expiresAt = new Date(Date.now() + SHARE_DAYS * 86_400_000);
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.shareLink.create({
        data: {
          id: newId(),
          tenantId: subject.tenantId,
          documentId: doc.id,
          tokenHash: hashToken(token),
          expiresAt,
          createdById: membershipId,
        },
        select: LINK_SELECT,
      });
      await this.audit.record(
        {
          action: 'finance.document_shared',
          entityType: 'ShareLink',
          entityId: created.id,
          metadata: { kind: s.kind, layout, expiresAt: expiresAt.toISOString() },
        },
        tx,
      );
      await this.analytics.track(tx, 'document.shared', { kind: s.kind });
      return created;
    });
    const resolved = this.cls.get('resolvedHost');
    if (resolved?.kind !== 'tenant') throw new Error('share links need an academy host');
    const port = this.config.WEB_PUBLIC_PORT ? `:${this.config.WEB_PUBLIC_PORT}` : '';
    const url = `${this.config.WEB_PUBLIC_PROTOCOL}://${resolved.tenant.slug}.${platformRootDomain(this.config)}${port}/api/v1/share/${token}`;
    const [academy, tenant] = await Promise.all([
      this.db.tenantBranding.findFirst({ select: { displayName: true } }),
      this.db.tenant.findFirstOrThrow({ select: { name: true, timezone: true } }),
    ]);
    const t = createServerTranslator('finance');
    return {
      ...toLink(row),
      url,
      message: t('document.shareMessage', {
        kind: s.kind,
        number: subject.number ?? '',
        academy: academy?.displayName ?? tenant.name,
        url,
        expires: formatDate(expiresAt, { timeZone: tenant.timezone }),
      }),
    };
  }

  async links(s: Subject): Promise<{ items: ShareLink[] }> {
    await this.subject(s);
    const rows = await this.db.shareLink.findMany({
      where: { document: subjectWhere(s) },
      orderBy: { id: 'desc' },
      take: 100,
      select: LINK_SELECT,
    });
    return { items: rows.map(toLink) };
  }

  async revoke(s: Subject, linkId: string): Promise<ShareLink> {
    await this.subject(s);
    return this.db.$transaction(async (tx) => {
      const found = await tx.shareLink.findFirst({
        where: { id: linkId, document: subjectWhere(s) },
        select: { id: true },
      });
      if (!found) throw new DomainError('NOT_FOUND', 'share link');
      const moved = await tx.shareLink.updateMany({
        where: { id: linkId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (moved.count === 1)
        await this.audit.record(
          { action: 'finance.share_link_revoked', entityType: 'ShareLink', entityId: linkId },
          tx,
        );
      return toLink(
        await tx.shareLink.findFirstOrThrow({ where: { id: linkId }, select: LINK_SELECT }),
      );
    });
  }

  /**
   * `GET /share/:token` on the academy's own host: the token is the credential, and it finds
   * nothing under any other academy (RLS). Expired, revoked, tampered and cancelled all look alike.
   */
  async open(token: string): Promise<{ bytes: Uint8Array; filename: string }> {
    await this.rate.consume(OPEN_RULE, String(this.cls.get('ip') ?? 'unknown'));
    const gone = () => new DomainError('NOT_FOUND', 'share link');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw gone();
    const link = await this.db.shareLink.findFirst({
      where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        document: {
          select: {
            kind: true,
            storageKey: true,
            invoice: { select: { status: true, number: true } },
            payment: { select: { receiptNumber: true } },
          },
        },
      },
    });
    const doc = link?.document;
    if (!doc?.storageKey || (doc.invoice && NOT_SHAREABLE.includes(doc.invoice.status)))
      throw gone();
    const bytes = await this.storage.getPrivate(doc.storageKey);
    await this.db.shareLink.update({
      where: { id: link!.id },
      data: { openCount: { increment: 1 } },
    });
    const number = doc.invoice?.number ?? doc.payment?.receiptNumber ?? doc.kind;
    return { bytes, filename: `${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf` };
  }
}

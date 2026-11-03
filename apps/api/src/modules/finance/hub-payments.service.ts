import {
  localDate,
  MEDIA_PURPOSES,
  newId,
  type ReportedPayment,
  type ReportPayment,
  sniffImage,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import { MembershipService } from '../../core/auth/membership.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { FeatureFlagService } from '../../core/flags/feature-flag.service.js';
import { stripImageMetadata } from '../../core/media/image-metadata.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { RateLimiter } from '../../core/rate-limit/rate-limiter.service.js';
import { TenantContext } from '../../core/tenant/tenant-context.service.js';
import { NotificationsService } from '../notifications/index.js';
import { HubLinkService, ParentAccessService } from '../people/index.js';
import { PaymentsService } from './payments.service.js';

const RULE = { name: 'hub-report-payment', limit: 20, windowSeconds: 3600 } as const;
const PURPOSE = 'payment.evidence' as const;
const notFound = () => new DomainError('NOT_FOUND', 'invoice');

/**
 * "I've paid" from the Family Hub (G-30, ADR-038, ADR-039, C-144). The academy is named by its
 * address and the work runs in that academy's own context, as the signed-in user. Everything that
 * could tell a stranger anything answers the same 404: an unknown academy, no active membership,
 * a child who isn't theirs, withdrawn consent, a draft invoice, or the flag being off.
 *
 * A report is only a claim: PENDING, no allocation, no receipt, until `payment.verify` decides.
 */
@Injectable()
export class HubPaymentsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly link: HubLinkService,
    private readonly parents: ParentAccessService,
    private readonly memberships: MembershipService,
    private readonly flags: FeatureFlagService,
    private readonly rate: RateLimiter,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly storage: MediaStorage,
    private readonly audit: AuditService,
  ) {}

  private userId(): string {
    const id = this.cls.get('userId');
    if (!id) throw new DomainError('UNAUTHENTICATED');
    return id;
  }

  /** Run in the academy's context, for a parent with `payment.report` there, with the flag on. */
  private async inAcademy<T>(slug: string, work: (userId: string) => Promise<T>): Promise<T> {
    const userId = this.userId();
    await this.rate.consume(RULE, userId);
    const tenantId = await this.link.academy(slug);
    if (!tenantId) throw notFound();
    return this.context.run(tenantId, async () => {
      if (!(await this.flags.isEnabled('p7-hub-payments'))) throw notFound();
      const membership = await this.memberships.load(tenantId, userId);
      if (membership?.status !== 'ACTIVE' || !membership.capabilities['payment.report'])
        throw notFound();
      return work(userId);
    });
  }

  async report(slug: string, invoiceId: string, input: ReportPayment): Promise<ReportedPayment> {
    return this.inAcademy(slug, (userId) =>
      this.payments.withReferenceCheck('UPI', input.reference, () =>
        this.db.$transaction((tx) => this.reportIn(tx, userId, invoiceId, input)),
      ),
    );
  }

  private async reportIn(
    tx: TransactionClient,
    userId: string,
    invoiceId: string,
    input: ReportPayment,
  ): Promise<ReportedPayment> {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, status: { not: 'DRAFT' } },
      select: {
        tenantId: true,
        branchId: true,
        studentId: true,
        currency: true,
        student: { select: { fullName: true } },
      },
    });
    if (!invoice || !(await this.parents.mayActForChild(tx, userId, invoice.studentId)))
      throw notFound();
    const academy = await tx.tenant.findFirst({ select: { timezone: true } });
    const paidOn = input.paidOn ?? localDate(new Date(), academy?.timezone ?? 'Asia/Kolkata');
    const id = await this.payments.recordIn(tx, {
      tenantId: invoice.tenantId,
      branchId: invoice.branchId,
      studentId: invoice.studentId,
      method: 'UPI',
      source: 'PARENT_REPORTED',
      amountMinor: input.amountMinor,
      reference: input.reference,
      paidOn,
      invoiceIds: [invoiceId],
      recordedById: null,
      reportedByUserId: userId,
    });
    await this.notifications.notifyHolders(tx, {
      tenantId: invoice.tenantId,
      branchId: invoice.branchId,
      capability: 'payment.verify',
      kind: 'PAYMENT_REPORTED',
      params: { student: invoice.student.fullName },
      link: `/payments?status=PENDING`,
      dedupeKey: `payment-reported:${id}`,
    });
    return {
      id,
      invoiceId,
      status: 'PENDING',
      amountMinor: input.amountMinor,
      currency: invoice.currency,
      reference: input.reference,
      paidOn,
      createdAt: new Date().toISOString(),
    };
  }

  /** Optional screenshot on their own report, while it still waits (G-30). */
  async attachEvidence(slug: string, paymentId: string, body: unknown): Promise<void> {
    if (!this.storage.privateAvailable)
      throw new DomainError('SERVICE_UNAVAILABLE', 'private storage not configured', [
        { path: 'evidence', issue: 'evidence_unavailable' },
      ]);
    const bytes = body instanceof Uint8Array ? body : null;
    if (!bytes || bytes.byteLength === 0)
      throw new DomainError('VALIDATION_FAILED', 'no file', [
        { path: 'evidence', issue: 'required' },
      ]);
    if (bytes.byteLength > MEDIA_PURPOSES[PURPOSE].maxBytes)
      throw new DomainError('VALIDATION_FAILED', 'too large', [
        { path: 'evidence', issue: 'too_large' },
      ]);
    const image = sniffImage(bytes);
    if (!image)
      throw new DomainError('VALIDATION_FAILED', 'not an image', [
        { path: 'evidence', issue: 'unsupported_type' },
      ]);
    await this.inAcademy(slug, async (userId) => {
      const row = await this.db.payment.findFirst({
        where: { id: paymentId, reportedByUserId: userId, source: 'PARENT_REPORTED' },
        select: { tenantId: true, studentId: true, status: true, evidenceKey: true },
      });
      if (!row || !(await this.parents.mayActForChild(this.db, userId, row.studentId)))
        throw notFound();
      if (row.status !== 'PENDING')
        throw new DomainError('INVALID_STATE_TRANSITION', 'already decided', [
          { path: 'status', issue: row.status.toLowerCase() },
        ]);
      const ext =
        image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const key = `t/${row.tenantId}/payments/${newId()}.${ext}`;
      await this.storage.putPrivate(key, stripImageMetadata(bytes, image.mimeType), image.mimeType);
      await this.db.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: paymentId }, data: { evidenceKey: key } });
        await this.audit.record(
          {
            action: 'finance.payment_evidence_added',
            entityType: 'Payment',
            entityId: paymentId,
            actor: { type: 'USER', id: userId },
          },
          tx,
        );
      });
      if (row.evidenceKey) await this.storage.deletePrivate(row.evidenceKey);
    });
  }
}

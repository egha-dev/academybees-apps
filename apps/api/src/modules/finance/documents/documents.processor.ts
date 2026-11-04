import { newId } from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../../../core/config/config.module.js';
import type { ApiConfig } from '../../../core/config/config.schema.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { MediaStorage } from '../../../core/media/media-storage.js';
import { bullConnection } from '../../../core/redis/bull-connection.js';
import { TenantContext } from '../../../core/tenant/tenant-context.service.js';
import { fontsFor } from './document-fonts.js';
import { InvoiceSnapshotSchema, ReceiptSnapshotSchema } from './document-snapshot.js';
import { documentText, type DocumentView, renderDocumentHtml } from './document-template.js';
import { DOCUMENT_JOB_ATTEMPTS, type DocumentJob, DOCUMENTS_QUEUE } from './documents.queue.js';
import { PdfRenderer } from './pdf-renderer.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const MAX_LOGO_BYTES = 1_000_000;

/**
 * Snapshot → HTML → PDF → private bucket (C-137). Each render writes a new key and only the first
 * to finish is kept, so a READY document's file never changes, even if two jobs race.
 */
@Injectable()
export class DocumentsProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentsProcessor.name);
  private worker: Worker<DocumentJob> | undefined;
  private connection: Redis | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    private readonly storage: MediaStorage,
    private readonly pdf: PdfRenderer,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = bullConnection(this.config);
    this.worker = new Worker<DocumentJob>(DOCUMENTS_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        { documentId: job?.data.documentId, err: err.message },
        'Document render failed',
      ),
    );
  }

  async process(job: Pick<Job<DocumentJob>, 'data' | 'attemptsMade'>): Promise<void> {
    await this.context.run(job.data.tenantId, async () => {
      this.cls.set('actor', { type: 'SYSTEM' });
      const { documentId, tenantId } = job.data;
      try {
        await this.render(tenantId, documentId);
      } catch (error) {
        if (job.attemptsMade + 1 >= DOCUMENT_JOB_ATTEMPTS)
          await this.db.financeDocument.updateMany({
            where: { id: documentId, status: 'PENDING' },
            data: { status: 'FAILED', error: 'render_failed' },
          });
        throw error;
      }
    });
  }

  private async render(tenantId: string, documentId: string): Promise<void> {
    const doc = await this.db.financeDocument.findFirst({
      where: { id: documentId },
      select: { status: true, layout: true, invoiceId: true, paymentId: true },
    });
    if (doc?.status !== 'PENDING') return;
    const view = await this.view(doc);
    const layout = doc.layout as 'A4' | 'MOBILE';
    const { css, family } = await fontsFor(documentText(view));
    const html = renderDocumentHtml(view, layout, {
      fontCss: css,
      fontFamily: family,
      logoDataUri: await this.logo(view.snapshot.academy.logoKey),
    });
    const bytes = await this.pdf.render(html, layout);
    const key = `t/${tenantId}/finance/${newId()}.pdf`;
    await this.storage.putPrivate(key, bytes, 'application/pdf');
    const won = await this.db.financeDocument.updateMany({
      where: { id: documentId, status: 'PENDING' },
      data: { status: 'READY', storageKey: key, readyAt: new Date(), error: null },
    });
    if (won.count === 0) await this.storage.deletePrivate(key);
  }

  private async view(doc: {
    invoiceId: string | null;
    paymentId: string | null;
  }): Promise<DocumentView> {
    if (doc.invoiceId) {
      const row = await this.db.invoice.findFirstOrThrow({
        where: { id: doc.invoiceId },
        select: {
          number: true,
          issueDate: true,
          dueDate: true,
          currency: true,
          creditAppliedMinor: true,
          snapshot: true,
        },
      });
      return {
        kind: 'INVOICE',
        number: row.number ?? '',
        issueDate: day(row.issueDate),
        dueDate: day(row.dueDate),
        currency: row.currency,
        creditAppliedMinor: row.creditAppliedMinor,
        snapshot: InvoiceSnapshotSchema.parse(row.snapshot),
      };
    }
    const row = await this.db.payment.findFirstOrThrow({
      where: { id: doc.paymentId! },
      select: { receiptNumber: true, snapshot: true },
    });
    return {
      kind: 'RECEIPT',
      number: row.receiptNumber ?? '',
      snapshot: ReceiptSnapshotSchema.parse(row.snapshot),
    };
  }

  /** Only our own stored logo, read through storage: the page itself can't fetch anything. */
  private async logo(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    const bytes = await this.storage.getPublic(key);
    if (!bytes || bytes.byteLength > MAX_LOGO_BYTES) return null;
    const ext = key.split('.').pop();
    const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[
      ext ?? ''
    ];
    return type ? `data:${type};base64,${Buffer.from(bytes).toString('base64')}` : null;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}

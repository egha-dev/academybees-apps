import {
  type CreateOpeningBalance,
  IMPORT_CHUNK,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportIssue,
  type ImportJob,
  type ImportRowStatus,
  type Invoice,
  localDate,
  newId,
  OPENING_BALANCE_FIELDS,
  type OpeningBalanceField,
} from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { assertInScope } from '../../core/rbac/scope.js';
import {
  csvCell,
  detectType,
  ImportService,
  INVALID_DATE,
  normaliseHeader,
  parseDate,
  parseRows,
  StudentsService,
  UnreadableFileError,
} from '../people/index.js';
import { parseAmountMinor } from './domain/opening-balance.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { invoicePolicy } from './finance.policy.js';
import { InvoicesService } from './invoices.service.js';
import { OpeningBalancesQueue } from './opening-balances.queue.js';

const KIND = 'OPENING_BALANCES';
const RETENTION_MS = 7 * 86_400_000;

type Issue = { field: string; issue: ImportIssue };
type StoredRow = {
  n: number;
  cells: string[];
  status: ImportRowStatus;
  issues: Issue[];
  entry?: {
    studentId: string;
    branchId: string;
    amountMinor: number;
    asOf: string;
    note: string | null;
  };
  invoiceId?: string;
};
type Mapping = Partial<Record<OpeningBalanceField, number>>;

/**
 * Dues from before AcademyBee (G-02): typed one at a time or imported from a spreadsheet, each an
 * issued `OPENING_BALANCE` invoice dated the cut-over date, with no tax (they are old charges).
 * Imports follow ADR-036: upload → (job) validated preview → commit (job) in chunks that mark
 * their rows as they go, so a retry never bills twice. A student already holding an opening
 * balance is `exists` and skipped, so a corrected file can simply be uploaded again; the database
 * holds one per student as well.
 */
@Injectable()
export class OpeningBalancesService {
  private readonly logger = new Logger(OpeningBalancesService.name);

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly storage: MediaStorage,
    private readonly queue: OpeningBalancesQueue,
    private readonly audit: AuditService,
    private readonly invoices: InvoicesService,
    private readonly settings: FinanceSettingsService,
    private readonly students: StudentsService,
    private readonly imports: ImportService,
  ) {}

  private async today(db: Pick<TransactionClient, 'tenant'> = this.db) {
    const tenant = await db.tenant.findFirst({ select: { timezone: true } });
    return localDate(new Date(), tenant?.timezone ?? 'Asia/Kolkata');
  }

  private inScope(branchId: string): boolean {
    try {
      assertInScope(this.cls, 'invoice.create', invoicePolicy, { branchId });
      return true;
    } catch {
      return false;
    }
  }

  private async issueOne(
    tx: TransactionClient,
    entry: {
      tenantId: string;
      studentId: string;
      branchId: string;
      amountMinor: number;
      asOf: string;
      note: string | null;
    },
  ): Promise<string> {
    const { settings } = await this.settings.current(tx);
    const id = await this.invoices.insertDraft(tx, {
      tenantId: entry.tenantId,
      branchId: entry.branchId,
      studentId: entry.studentId,
      kind: 'OPENING_BALANCE',
      dueDate: entry.asOf,
      charges: [
        {
          label: createServerTranslator('finance')('openingBalance.line'),
          amountMinor: entry.amountMinor,
          quantity: 1,
          taxable: false,
        },
      ],
      discounts: [],
      note: entry.note,
      createdById: this.cls.get('membership')?.id ?? null,
      settings,
    });
    await this.invoices.issueIn(tx, id, 1, entry.asOf);
    return id;
  }

  /** Type in one student's dues. */
  async create(input: CreateOpeningBalance): Promise<Invoice> {
    const id = await this.db.$transaction(async (tx) => {
      const [student] = await this.students.forFees(tx, [input.studentId]);
      assertInScope(this.cls, 'invoice.create', invoicePolicy, { branchId: student!.branchId });
      const asOf = input.asOf ?? (await this.today(tx));
      if (asOf > (await this.today(tx)))
        throw new DomainError('VALIDATION_FAILED', 'cut-over in the future', [
          { path: 'asOf', issue: 'in_future' },
        ]);
      const tenantId = this.cls.get('tenantId')!;
      const existing = await tx.invoice.count({
        where: {
          studentId: student!.id,
          kind: 'OPENING_BALANCE',
          status: { not: 'CANCELLED' },
        },
      });
      if (existing)
        throw new DomainError('CONFLICT', 'already has an opening balance', [
          { path: 'studentId', issue: 'has_opening_balance' },
        ]);
      return this.issueOne(tx, {
        tenantId,
        studentId: student!.id,
        branchId: student!.branchId,
        amountMinor: input.amountMinor,
        asOf,
        note: input.note ?? null,
      });
    });
    return this.invoices.get(id);
  }

  template(): string {
    const headers = this.headers();
    return `\uFEFF${OPENING_BALANCE_FIELDS.map((f) => csvCell(headers[f])).join(',')}\r\n`;
  }

  async upload(bytes: Uint8Array, fileName: string): Promise<ImportJob> {
    if (!this.storage.privateAvailable)
      throw new DomainError('SERVICE_UNAVAILABLE', 'private storage not configured', [
        { path: 'file', issue: 'imports_unavailable' },
      ]);
    if (bytes.byteLength === 0)
      throw new DomainError('VALIDATION_FAILED', 'empty file', [{ path: 'file', issue: 'empty' }]);
    if (bytes.byteLength > IMPORT_MAX_BYTES)
      throw new DomainError('VALIDATION_FAILED', 'file too large', [
        { path: 'file', issue: 'too_large' },
      ]);
    let type: 'csv' | 'xlsx';
    try {
      type = detectType(bytes);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'not a spreadsheet', [
        { path: 'file', issue: 'unsupported_type' },
      ]);
    }
    const { tenantId, membershipId, userId } = this.caller();
    await this.imports.purgeExpired();
    const id = newId();
    const fileKey = `t/${tenantId}/imports/${id}.${type}`;
    await this.storage.putPrivate(
      fileKey,
      bytes,
      type === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    await this.db.$transaction(async (tx) => {
      await tx.importJob.create({
        data: {
          id,
          tenantId,
          kind: KIND,
          fileKey,
          fileName: fileName.normalize('NFC').slice(0, 200) || `opening-balances.${type}`,
          fileSize: bytes.byteLength,
          fileType: type,
          createdById: membershipId,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      });
      await this.audit.record(
        { action: 'finance.opening_balances_uploaded', entityType: 'ImportJob', entityId: id },
        tx,
      );
    });
    await this.queue.add({ tenantId, userId, jobId: id, action: 'parse' });
    return this.get(id);
  }

  async get(id: string): Promise<ImportJob> {
    const job = await this.db.importJob.findFirst({ where: { id, kind: KIND } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    const rows = (job.rows as StoredRow[]) ?? [];
    const mapping = job.mapping as Mapping;
    const attention = [
      ...rows.filter((r) => r.status === 'error'),
      ...rows.filter((r) => r.status === 'exists'),
    ].slice(0, 100);
    return {
      id: job.id,
      status: job.status,
      fileName: job.fileName,
      headers: job.headers as string[],
      mapping: job.mapping as Record<string, number>,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      duplicateRows: job.duplicateRows,
      createdRows: job.createdRows,
      failure: job.failure,
      version: job.version,
      preview: attention.map((r) => ({
        n: r.n,
        status: r.status,
        name: this.cell(r, mapping.admissionNo),
        issues: r.issues,
      })),
      seatsLeft: null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  async commit(id: string, version: number): Promise<ImportJob> {
    const job = await this.db.importJob.findFirst({ where: { id, kind: KIND } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    if (job.status !== 'PREVIEW_READY')
      throw new DomainError('INVALID_STATE_TRANSITION', `import ${job.status}`);
    if (job.validRows === 0)
      throw new DomainError('VALIDATION_FAILED', 'nothing to import', [
        { path: 'rows', issue: 'nothing_valid' },
      ]);
    const updated = await this.db.importJob.updateMany({
      where: { id, version, status: 'PREVIEW_READY' },
      data: { status: 'COMMITTING', version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    const { tenantId, userId } = this.caller();
    await this.queue.add({ tenantId, userId, jobId: id, action: 'commit' });
    return this.get(id);
  }

  /** CSV of the rows that weren't imported, with the problem in words (C-101: formula-safe). */
  async errorReport(id: string): Promise<{ fileName: string; csv: string }> {
    const job = await this.db.importJob.findFirst({ where: { id, kind: KIND } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    const t = createServerTranslator('finance');
    const people = createServerTranslator('people');
    const mapping = job.mapping as Mapping;
    const headers = job.headers as string[];
    const lines = [
      [
        t('openingBalance.report.row'),
        t('openingBalance.report.student'),
        t('openingBalance.report.column'),
        t('openingBalance.report.problem'),
      ],
    ];
    for (const r of (job.rows as StoredRow[]).filter(
      (x) => x.status === 'error' || x.status === 'exists',
    )) {
      const who = this.cell(r, mapping.admissionNo);
      if (r.status === 'exists')
        lines.push([String(r.n), who, '', t('openingBalance.report.exists')]);
      for (const issue of r.issues) {
        const column = mapping[issue.field as OpeningBalanceField];
        lines.push([
          String(r.n),
          who,
          column !== undefined ? (headers[column] ?? issue.field) : issue.field,
          people(`import.issue.${issue.issue}`),
        ]);
      }
    }
    return {
      fileName: `${job.fileName.replace(/\.[^.]+$/, '')}-problems.csv`,
      csv: `\uFEFF${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`,
    };
  }

  // ── Job steps (run by OpeningBalancesProcessor inside the academy's context) ─────────────

  async processParse(id: string): Promise<void> {
    const job = await this.db.importJob.findFirst({ where: { id, kind: KIND } });
    if (!job || job.status !== 'UPLOADED' || !job.fileKey) return;
    await this.db.importJob.update({ where: { id }, data: { status: 'VALIDATING' } });
    try {
      const bytes = await this.storage.getPrivate(job.fileKey);
      const all = await parseRows(bytes, job.fileType as 'csv' | 'xlsx');
      if (all.length < 2) return await this.fail(id, 'empty');
      const [headerRow, ...dataRows] = all;
      if (dataRows.length > IMPORT_MAX_ROWS) return await this.fail(id, 'too_many_rows');
      const headers = headerRow!.map((h, i) => h || `#${i + 1}`);
      const mapping = this.mappingFor(headers);
      if (mapping.admissionNo === undefined || mapping.amount === undefined)
        return await this.fail(id, 'missing_columns');
      const rows = await this.validate(
        dataRows.map((cells, i) => ({ n: i + 2, cells })),
        mapping,
      );
      await this.db.importJob.update({
        where: { id },
        data: {
          status: 'PREVIEW_READY',
          headers,
          mapping,
          rows,
          ...this.counts(rows),
          version: { increment: 1 },
        },
      });
    } catch (error) {
      if (error instanceof UnreadableFileError) return await this.fail(id, 'file_unreadable');
      this.logger.error({ err: error, jobId: id }, 'Opening balances parse failed');
      await this.fail(id, 'internal');
    }
  }

  async processCommit(id: string): Promise<void> {
    const job = await this.db.importJob.findFirst({ where: { id, kind: KIND } });
    if (!job || job.status !== 'COMMITTING') return;
    let created = 0;
    for (;;) {
      // Each chunk re-reads the job, so a retry continues where the last chunk committed.
      const done = await this.db.$transaction(
        async (tx) => {
          const current = await tx.importJob.findFirst({ where: { id }, select: { rows: true } });
          const rows = (current?.rows as StoredRow[]) ?? [];
          const chunk = rows.filter((r) => r.status === 'valid').slice(0, IMPORT_CHUNK);
          if (chunk.length === 0) return true;
          // Someone may have typed one in since the preview: never a second for a student.
          const taken = await this.withOpeningBalance(
            tx,
            chunk.map((r) => r.entry!.studentId),
          );
          for (const row of chunk) {
            const entry = row.entry!;
            if (taken.has(entry.studentId)) row.status = 'exists';
            else {
              row.invoiceId = await this.issueOne(tx, { tenantId: job.tenantId, ...entry });
              row.status = 'created';
              created += 1;
            }
            delete row.entry;
          }
          await tx.importJob.update({
            where: { id },
            data: {
              rows,
              ...this.counts(rows),
              createdRows: rows.filter((r) => r.status === 'created').length,
            },
          });
          return false;
        },
        { timeout: 120_000 },
      );
      if (done) break;
    }
    await this.db.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(
        {
          action: 'finance.opening_balances_imported',
          entityType: 'ImportJob',
          entityId: id,
          metadata: { created },
        },
        tx,
      );
    });
    if (job.fileKey) await this.storage.deletePrivate(job.fileKey);
    await this.db.importJob.update({ where: { id }, data: { fileKey: null } });
  }

  async markFailed(id: string, failure: 'not_allowed' | 'internal'): Promise<void> {
    await this.db.importJob.updateMany({
      where: { id, kind: KIND, status: { in: ['UPLOADED', 'VALIDATING', 'COMMITTING'] } },
      data: { status: 'FAILED', failure, version: { increment: 1 } },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  private async validate(
    input: { n: number; cells: string[] }[],
    mapping: Mapping,
  ): Promise<StoredRow[]> {
    const today = await this.today();
    const numbers = input.map((r) => r.cells[mapping.admissionNo!] ?? '').filter((v) => v !== '');
    const found = await this.students.byAdmissionNos(this.db, numbers);
    const byNumber = new Map(
      found.filter((s) => this.inScope(s.branchId)).map((s) => [s.admissionNo, s]),
    );
    const taken = await this.withOpeningBalance(
      this.db,
      [...byNumber.values()].map((s) => s.id),
    );
    const seen = new Set<string>();
    return input.map(({ n, cells }) => {
      const issues: Issue[] = [];
      const number = cells[mapping.admissionNo!] ?? '';
      const student = byNumber.get(number);
      if (!number) issues.push({ field: 'admissionNo', issue: 'required' });
      else if (!student) issues.push({ field: 'admissionNo', issue: 'unknown_student' });
      else if (seen.has(number)) issues.push({ field: 'admissionNo', issue: 'duplicate_in_file' });
      if (number) seen.add(number);
      const amountMinor = parseAmountMinor(cells[mapping.amount!] ?? '');
      if (amountMinor === null) issues.push({ field: 'amount', issue: 'invalid_amount' });
      const date = mapping.asOf === undefined ? null : parseDate(cells[mapping.asOf] ?? '');
      if (date === INVALID_DATE || (typeof date === 'string' && date > today))
        issues.push({ field: 'asOf', issue: 'invalid_date' });
      const note = mapping.note === undefined ? '' : (cells[mapping.note] ?? '');
      if (note.length > 500) issues.push({ field: 'note', issue: 'too_long' });
      if (issues.length) return { n, cells, status: 'error' as const, issues };
      if (taken.has(student!.id)) return { n, cells, status: 'exists' as const, issues };
      return {
        n,
        cells,
        status: 'valid' as const,
        issues,
        entry: {
          studentId: student!.id,
          branchId: student!.branchId,
          amountMinor: amountMinor!,
          asOf: typeof date === 'string' ? date : today,
          note: note || null,
        },
      };
    });
  }

  private async withOpeningBalance(
    db: Pick<TransactionClient, 'invoice'>,
    studentIds: string[],
  ): Promise<Set<string>> {
    const rows = await db.invoice.findMany({
      where: {
        studentId: { in: studentIds },
        kind: 'OPENING_BALANCE',
        status: { not: 'CANCELLED' },
      },
      select: { studentId: true },
    });
    return new Set(rows.map((r) => r.studentId));
  }

  private headers(): Record<OpeningBalanceField, string> {
    const t = createServerTranslator('finance');
    return {
      admissionNo: t('openingBalance.fields.admissionNo'),
      amount: t('openingBalance.fields.amount'),
      asOf: t('openingBalance.fields.asOf'),
      note: t('openingBalance.fields.note'),
    };
  }

  /** Columns are found by the template's headers; both are required, the rest optional. */
  private mappingFor(headers: string[]): Mapping {
    const names = this.headers();
    const mapping: Mapping = {};
    for (const field of OPENING_BALANCE_FIELDS) {
      const column = headers.findIndex((h) => normaliseHeader(h) === normaliseHeader(names[field]));
      if (column >= 0) mapping[field] = column;
    }
    return mapping;
  }

  private cell(row: StoredRow, column: number | undefined): string {
    return column === undefined ? '' : (row.cells[column] ?? '');
  }

  private counts(rows: StoredRow[]) {
    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === 'valid').length,
      errorRows: rows.filter((r) => r.status === 'error').length,
      duplicateRows: rows.filter((r) => r.status === 'exists').length,
    };
  }

  private async fail(id: string, failure: string): Promise<void> {
    await this.db.importJob.update({
      where: { id },
      data: { status: 'FAILED', failure, version: { increment: 1 } },
    });
  }

  private caller() {
    const tenantId = this.cls.get('tenantId');
    const membershipId = this.cls.get('membership')?.id;
    const userId = this.cls.get('userId');
    if (!tenantId || !membershipId || !userId) throw new DomainError('UNAUTHENTICATED');
    return { tenantId, membershipId, userId };
  }
}

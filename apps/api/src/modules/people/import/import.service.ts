import {
  IMPORT_CHUNK,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_FIELDS,
  type ImportJob,
  type ImportMapping,
  type ImportRow,
  type ImportRowStatus,
  localDate,
  newId,
} from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AnalyticsService } from '../../../core/analytics/analytics.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import type { RequestContext } from '../../../core/context/request-context.js';
import { TENANT_DB } from '../../../core/database/database.module.js';
import { EntitlementService } from '../../../core/entitlements/entitlement.service.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { MediaStorage } from '../../../core/media/media-storage.js';
import { SchedulingService } from '../../scheduling/index.js';
import { ActivityService } from '../activity.service.js';
import { CustomFieldsService } from '../custom-fields.service.js';
import { PeopleService } from '../people.service.js';
import { ImportQueue } from './import.queue.js';
import {
  csvCell,
  detectType,
  normaliseHeader,
  type ParsedStudent,
  parseRows,
  type RowIssue,
  studentKey,
  suggestMapping,
  UnreadableFileError,
  validateRow,
} from './parse.js';

/** One stored row of a job (`import_job.rows`). */
type StoredRow = {
  n: number;
  cells: string[];
  status: ImportRowStatus;
  issues: RowIssue[];
  student?: ParsedStudent;
  studentId?: string;
};

const RETENTION_MS = 7 * 86_400_000;

/**
 * Student import (G-02, ADR-036, C-100, C-101). Upload → (job) parse → suggested mapping and
 * validated preview → commit (job) in chunks of 200 rows, each chunk one transaction that also
 * marks its rows `created`, so a retried or re-run commit never creates a student twice. Rows
 * already at the academy are `exists` (skipped), so a corrected file can simply be uploaded again.
 * Files live in the private bucket (C-97) and, with the parsed rows, are removed after 7 days.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly storage: MediaStorage,
    private readonly queue: ImportQueue,
    private readonly people: PeopleService,
    private readonly fields: CustomFieldsService,
    private readonly scheduling: SchedulingService,
    private readonly activity: ActivityService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
  ) {}

  /** Column headers of the CSV template: every field plus the academy's custom fields. */
  async template(): Promise<string> {
    const headers = this.templateHeaders();
    const custom = (await this.fields.list()).filter((f) => !f.archived);
    return `${[...Object.values(headers), ...custom.map((f) => f.label)].map(csvCell).join(',')}\r\n`;
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
    await this.purgeExpired();
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
          kind: 'STUDENTS',
          fileKey,
          fileName: fileName.normalize('NFC').slice(0, 200) || `students.${type}`,
          fileSize: bytes.byteLength,
          fileType: type,
          createdById: membershipId,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      });
      await this.audit.record(
        { action: 'student.import_uploaded', entityType: 'ImportJob', entityId: id },
        tx,
      );
    });
    await this.queue.add({ tenantId, userId, jobId: id, action: 'parse' });
    return this.get(id);
  }

  async get(id: string): Promise<ImportJob> {
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    const rows = (job.rows as StoredRow[]) ?? [];
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
      preview: attention.map((r) => this.toRow(r, job.mapping as ImportMapping)),
      seatsLeft: await this.seatsLeft(),
      createdAt: job.createdAt.toISOString(),
    };
  }

  /** Match columns differently, then validate again (fast: at most 2,000 rows). */
  async setMapping(id: string, version: number, mapping: ImportMapping): Promise<ImportJob> {
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    if (job.status !== 'PREVIEW_READY')
      throw new DomainError('INVALID_STATE_TRANSITION', `import ${job.status}`);
    const headers = job.headers as string[];
    const known = new Set<string>([
      ...IMPORT_FIELDS,
      ...(await this.fields.list()).filter((f) => !f.archived).map((f) => `custom:${f.key}`),
    ]);
    const columns = Object.entries(mapping).filter(
      (e): e is [string, number] => e[1] !== undefined,
    );
    if (
      columns.some(([field, column]) => !known.has(field) || column >= headers.length) ||
      new Set(columns.map(([, c]) => c)).size !== columns.length
    )
      throw new DomainError('VALIDATION_FAILED', 'bad mapping', [
        { path: 'mapping', issue: 'invalid' },
      ]);
    const rows = await this.validate(
      (job.rows as StoredRow[]).map((r) => ({ n: r.n, cells: r.cells })),
      mapping,
    );
    const updated = await this.db.importJob.updateMany({
      where: { id, version, status: 'PREVIEW_READY' },
      data: {
        mapping,
        ...this.counts(rows),
        rows: rows,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
    return this.get(id);
  }

  async commit(id: string, version: number): Promise<ImportJob> {
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    if (job.status !== 'PREVIEW_READY')
      throw new DomainError('INVALID_STATE_TRANSITION', `import ${job.status}`);
    if (job.validRows === 0)
      throw new DomainError('VALIDATION_FAILED', 'nothing to import', [
        { path: 'rows', issue: 'nothing_valid' },
      ]);
    // The plan's limit is checked before anything is written (G-02).
    await this.entitlements.assertWithinLimit('students', job.validRows);
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
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job) throw new DomainError('NOT_FOUND', 'import');
    const t = createServerTranslator('people');
    const mapping = job.mapping as ImportMapping;
    const lines = [
      [
        t('import.report.row'),
        t('import.report.name'),
        t('import.report.column'),
        t('import.report.problem'),
      ],
    ];
    for (const r of (job.rows as StoredRow[]).filter(
      (x) => x.status === 'error' || x.status === 'exists',
    )) {
      const name = this.toRow(r, mapping).name;
      if (r.status === 'exists') lines.push([String(r.n), name, '', t('import.report.exists')]);
      for (const issue of r.issues)
        lines.push([
          String(r.n),
          name,
          this.fieldLabel(issue.field, job.headers as string[], mapping),
          t(`import.issue.${issue.issue}`),
        ]);
    }
    return {
      fileName: `${job.fileName.replace(/\.[^.]+$/, '')}-problems.csv`,
      csv: `\uFEFF${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`,
    };
  }

  // ── Job steps (run by ImportProcessor inside the academy's context) ──────────────────────

  async processParse(id: string): Promise<void> {
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job || job.status !== 'UPLOADED' || !job.fileKey) return;
    await this.db.importJob.update({ where: { id }, data: { status: 'VALIDATING' } });
    try {
      const bytes = await this.storage.getPrivate(job.fileKey);
      const all = await parseRows(bytes, job.fileType as 'csv' | 'xlsx');
      if (all.length < 2) return await this.fail(id, 'empty');
      const [headerRow, ...dataRows] = all;
      if (dataRows.length > IMPORT_MAX_ROWS) return await this.fail(id, 'too_many_rows');
      const headers = headerRow!.map((h, i) => h || `#${i + 1}`);
      const mapping = suggestMapping(headers, this.templateHeaders(), await this.fields.list());
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
          rows: rows,
          ...this.counts(rows),
          version: { increment: 1 },
        },
      });
    } catch (error) {
      if (error instanceof UnreadableFileError) return await this.fail(id, 'file_unreadable');
      this.logger.error({ err: error, jobId: id }, 'Import parse failed');
      await this.fail(id, 'internal');
    }
  }

  async processCommit(id: string): Promise<void> {
    const job = await this.db.importJob.findFirst({ where: { id } });
    if (!job || job.status !== 'COMMITTING') return;
    const tenant = await this.db.tenant.findFirst({ select: { timezone: true } });
    const branch = await this.db.branch.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    if (!tenant || !branch) return this.fail(id, 'internal');
    const today = localDate(new Date(), tenant.timezone);
    let created = 0;
    try {
      for (;;) {
        // Each chunk re-reads the job, so a retry continues where the last chunk committed.
        const done = await this.db.$transaction(
          async (tx) => {
            const current = await tx.importJob.findFirst({ where: { id }, select: { rows: true } });
            const rows = (current?.rows as StoredRow[]) ?? [];
            const chunk = rows.filter((r) => r.status === 'valid').slice(0, IMPORT_CHUNK);
            if (chunk.length === 0) return true;
            await this.entitlements.assertWithinLimit('students', chunk.length, tx);
            await this.createChunk(
              tx,
              { tenantId: job.tenantId, branchId: branch.id, today },
              chunk,
              rows,
            );
            await tx.importJob.update({
              where: { id },
              data: {
                rows: rows,
                ...this.counts(rows),
                createdRows: rows.filter((r) => r.status === 'created').length,
              },
            });
            created += chunk.length;
            return false;
          },
          { timeout: 60_000 },
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
            action: 'student.import_committed',
            entityType: 'ImportJob',
            entityId: id,
            metadata: { created },
          },
          tx,
        );
        if (created > 0)
          await this.analytics.track(tx, 'student.created', { source: 'import', count: created });
      });
      if (job.fileKey) await this.storage.deletePrivate(job.fileKey);
      await this.db.importJob.update({ where: { id }, data: { fileKey: null } });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'ENTITLEMENT_LIMIT_REACHED')
        return this.fail(id, 'limit_reached');
      this.logger.error({ err: error, jobId: id }, 'Import commit failed');
      throw error; // BullMQ retries; committed chunks are already marked `created`
    }
  }

  private async createChunk(
    tx: TransactionClient,
    ctx: { tenantId: string; branchId: string; today: string },
    chunk: StoredRow[],
    rows: StoredRow[],
  ): Promise<void> {
    const numbers = await this.people.allocateAdmissionNos(tx, ctx.tenantId, chunk.length);
    // Parents already at the academy (or created earlier in this import) are reused (C-106).
    const phones = chunk.map((r) => r.student?.parent?.phone).filter((v): v is string => !!v);
    const emails = chunk.map((r) => r.student?.parent?.email).filter((v): v is string => !!v);
    const existing =
      phones.length || emails.length
        ? await tx.parent.findMany({
            where: {
              status: 'ACTIVE',
              OR: [
                ...(phones.length ? [{ phone: { in: phones } }] : []),
                ...(emails.length ? [{ email: { in: emails } }] : []),
              ],
            },
            select: { id: true, phone: true, email: true },
          })
        : [];
    const parentBy = new Map<string, string>();
    for (const p of existing) {
      if (p.phone) parentBy.set(`p:${p.phone}`, p.id);
      if (p.email) parentBy.set(`e:${p.email}`, p.id);
    }
    const byBatch = new Map<string, string[]>();
    for (const [i, row] of chunk.entries()) {
      const s = row.student!;
      const studentId = newId();
      await tx.student.create({
        data: {
          id: studentId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          admissionNo: numbers[i]!,
          fullName: s.fullName,
          preferredName: s.preferredName,
          dateOfBirth: s.dateOfBirth ? new Date(`${s.dateOfBirth}T00:00:00Z`) : null,
          gender: s.gender,
          schoolName: s.schoolName,
          grade: s.grade,
          admissionDate: new Date(`${s.admissionDate ?? ctx.today}T00:00:00Z`),
          customFields: s.customFields,
          createdById: this.cls.get('membership')?.id ?? null,
        },
      });
      if (s.parent) {
        const key = s.parent.phone
          ? `p:${s.parent.phone}`
          : s.parent.email
            ? `e:${s.parent.email}`
            : null;
        let parentId = key ? parentBy.get(key) : undefined;
        if (!parentId) {
          parentId = newId();
          await tx.parent.create({
            data: {
              id: parentId,
              tenantId: ctx.tenantId,
              fullName: s.parent.fullName,
              phone: s.parent.phone,
              email: s.parent.email,
              whatsappCapable: false,
            },
          });
          if (s.parent.phone) parentBy.set(`p:${s.parent.phone}`, parentId);
          if (s.parent.email) parentBy.set(`e:${s.parent.email}`, parentId);
        }
        await tx.parentStudent.create({
          data: {
            id: newId(),
            tenantId: ctx.tenantId,
            parentId,
            studentId,
            relationship: s.parent.relationship,
            isPrimaryContact: true,
          },
        });
      }
      if (s.batchId) byBatch.set(s.batchId, [...(byBatch.get(s.batchId) ?? []), studentId]);
      await this.activity.record(tx, {
        tenantId: ctx.tenantId,
        entityType: 'STUDENT',
        entityId: studentId,
        type: 'student.created',
        data: { source: 'import' },
      });
      const stored = rows.find((r) => r.n === row.n)!;
      stored.status = 'created';
      stored.studentId = studentId;
      delete stored.student;
    }
    for (const [batchId, studentIds] of byBatch)
      await this.scheduling.enrol(tx, ctx.tenantId, batchId, studentIds, ctx.today);
  }

  /** Validate rows and mark duplicates inside the file and against the academy (G-02). */
  private async validate(
    input: Array<{ n: number; cells: string[] }>,
    mapping: ImportMapping,
  ): Promise<StoredRow[]> {
    const tenant = await this.db.tenant.findFirst({ select: { timezone: true } });
    const today = localDate(new Date(), tenant?.timezone ?? 'Asia/Kolkata');
    const [customFields, batches] = await Promise.all([
      this.fields.list(),
      this.db.batch.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
    ]);
    const batchByName = new Map(batches.map((b) => [normaliseHeader(b.name), b.id]));
    const rows: StoredRow[] = input.map(({ n, cells }) => {
      const { student, issues } = validateRow(cells, mapping, {
        customFields,
        batches: batchByName,
        today,
      });
      return {
        n,
        cells,
        status: student ? 'valid' : 'error',
        issues,
        ...(student ? { student } : {}),
      };
    });
    const keyOf = (s: ParsedStudent) =>
      studentKey({
        fullName: s.fullName,
        dateOfBirth: s.dateOfBirth,
        parentPhone: s.parent?.phone ?? null,
      });
    // Inside the file: the second and later copies are errors.
    const seen = new Set<string>();
    for (const r of rows.filter((x) => x.student)) {
      const key = keyOf(r.student!);
      if (seen.has(key)) {
        r.status = 'error';
        r.issues = [{ field: 'fullName', issue: 'duplicate_in_file' }];
        delete r.student;
      } else seen.add(key);
    }
    // Against the academy: same name and date of birth / parent phone → already here.
    const names = [...new Set(rows.filter((r) => r.student).map((r) => r.student!.fullName))];
    const existing: Array<{
      fullName: string;
      dateOfBirth: Date | null;
      parents: Array<{ parent: { phone: string | null } }>;
    }> = [];
    for (let i = 0; i < names.length; i += 500)
      existing.push(
        ...(await this.db.student.findMany({
          where: { fullName: { in: names.slice(i, i + 500), mode: 'insensitive' } },
          select: {
            fullName: true,
            dateOfBirth: true,
            parents: {
              orderBy: { isPrimaryContact: 'desc' },
              take: 1,
              select: { parent: { select: { phone: true } } },
            },
          },
        })),
      );
    const there = new Set(
      existing.map((e) =>
        studentKey({
          fullName: e.fullName,
          dateOfBirth: e.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          parentPhone: e.parents[0]?.parent.phone ?? null,
        }),
      ),
    );
    for (const r of rows.filter((x) => x.student))
      if (there.has(keyOf(r.student!))) {
        r.status = 'exists';
        delete r.student;
      }
    return rows;
  }

  private counts(rows: StoredRow[]) {
    return {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === 'valid').length,
      errorRows: rows.filter((r) => r.status === 'error').length,
      duplicateRows: rows.filter((r) => r.status === 'exists').length,
    };
  }

  private toRow(r: StoredRow, mapping: ImportMapping): ImportRow {
    const nameColumn = mapping.fullName;
    return {
      n: r.n,
      status: r.status,
      name: nameColumn !== undefined ? (r.cells[nameColumn] ?? '') : '',
      issues: r.issues,
    };
  }

  private fieldLabel(field: string, headers: string[], mapping: ImportMapping): string {
    const column = mapping[field as keyof ImportMapping];
    return column !== undefined
      ? (headers[column] ?? field)
      : (this.templateHeaders()[field] ?? field);
  }

  private templateHeaders(): Record<string, string> {
    const t = createServerTranslator('people');
    return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, t(`import.fields.${f}`)]));
  }

  private async seatsLeft(): Promise<number | null> {
    const max = (await this.entitlements.current()).limits.students;
    if (max === null || max === undefined) return null;
    const used = await this.entitlements.used('students');
    return used === null ? null : Math.max(0, max - used);
  }

  private async fail(id: string, failure: string): Promise<void> {
    await this.db.importJob.update({
      where: { id },
      data: { status: 'FAILED', failure, version: { increment: 1 } },
    });
  }

  /** Files and parsed rows of this academy's expired jobs are removed (C-101). */
  private async purgeExpired(): Promise<void> {
    const expired = await this.db.importJob.findMany({
      where: {
        expiresAt: { lt: new Date() },
        OR: [{ fileKey: { not: null } }, { NOT: { rows: { equals: [] } } }],
      },
      select: { id: true, fileKey: true },
      take: 50,
    });
    for (const job of expired) {
      if (job.fileKey) await this.storage.deletePrivate(job.fileKey);
      await this.db.importJob.update({
        where: { id: job.id },
        data: { fileKey: null, rows: [], headers: [] },
      });
    }
  }

  private caller() {
    const tenantId = this.cls.get('tenantId');
    const membershipId = this.cls.get('membership')?.id;
    const userId = this.cls.get('userId');
    if (!tenantId || !membershipId || !userId) throw new DomainError('UNAUTHENTICATED');
    return { tenantId, membershipId, userId };
  }
}

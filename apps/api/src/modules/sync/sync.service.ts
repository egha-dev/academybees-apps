import {
  addDays,
  MarkSessionOpSchema,
  type SyncOp,
  type SyncOpResult,
  type SyncPushResponse,
  type SyncSnapshot,
  UpdateAttendanceOpSchema,
} from '@academybee/contracts';
import { Prisma, type TenantBoundClient, type TransactionClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { AttendanceService, type MarkResult } from '../attendance/index.js';
import { EnrolmentsService } from '../people/index.js';
import { BatchesService, SessionsService } from '../scheduling/index.js';

/** What an op handler returns; the ledger stores it with the op id. */
type Outcome = Omit<SyncOpResult, 'opId'>;
type OpHandler<S extends z.ZodType> = {
  schema: S;
  entityKey(payload: z.infer<S>): string;
  run(tx: TransactionClient, payload: z.infer<S>, op: SyncOp): Promise<Outcome>;
};
const handler = <S extends z.ZodType>(h: OpHandler<S>) => h;

const fromMark = (result: MarkResult): Outcome =>
  result.status === 'APPLIED'
    ? { status: 'APPLIED', data: { marks: result.marks } }
    : { status: 'CONFLICT', conflict: { server: result.conflicts } };

/** Days a device keeps around today (ARCHITECTURE §11.3) and attendance history on bootstrap. */
const WINDOW_BEFORE = 7;
const WINDOW_AFTER = 14;
const ATTENDANCE_DAYS = 30;

/**
 * The sync engine's server side (ADR-016, ARCHITECTURE §11.3). Push applies each op in its own
 * transaction together with its ledger row, so a resent op returns its first result instead of
 * applying twice. Ops for the same entity are taken in order: after one is rejected or conflicts,
 * later ones for that entity in the batch get no answer and stay queued on the device. Pull and
 * bootstrap send the caller's small working set whole, plus attendance changes.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly handlers: Record<string, OpHandler<z.ZodType>>;

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly attendance: AttendanceService,
    private readonly sessions: SessionsService,
    private readonly batches: BatchesService,
    private readonly enrolments: EnrolmentsService,
    private readonly analytics: AnalyticsService,
  ) {
    this.handlers = {
      'attendance.markSession': handler({
        schema: MarkSessionOpSchema,
        entityKey: (p) => `session:${p.sessionId}`,
        run: async (tx, p, op) =>
          fromMark(
            await this.attendance.markSessionIn(tx, p.sessionId, p, {
              source: 'sync',
              opId: op.opId,
            }),
          ),
      }),
      'attendance.update': handler({
        schema: UpdateAttendanceOpSchema,
        entityKey: (p) => `session:${p.sessionId}`,
        run: async (tx, p, op) =>
          fromMark(
            await this.attendance.markSessionIn(
              tx,
              p.sessionId,
              { marks: [p.mark] },
              { source: 'sync', opId: op.opId },
            ),
          ),
      }),
    };
  }

  private who() {
    const tenantId = this.cls.get('tenantId');
    const membership = this.cls.get('membership');
    if (!tenantId || !membership) throw new DomainError('FORBIDDEN', 'no membership');
    return { tenantId, membershipId: membership.id };
  }

  async push(ops: SyncOp[]): Promise<SyncPushResponse> {
    const results: SyncOpResult[] = [];
    const held = new Set<string>();
    for (const op of ops) {
      if (held.has(op.entityKey)) continue; // unanswered: the device retries it later, in order
      const result = await this.one(op);
      if (!result) continue; // a transient failure: unanswered, retried
      results.push(result);
      if (result.status === 'REJECTED' || result.status === 'CONFLICT') held.add(op.entityKey);
    }
    const count = (s: SyncOpResult['status']) => results.filter((r) => r.status === s).length;
    const counts = {
      applied: count('APPLIED'),
      duplicate: count('DUPLICATE'),
      rejected: count('REJECTED'),
      conflict: count('CONFLICT'),
      unanswered: ops.length - results.length,
    };
    this.logger.log({ metric: 'sync.push', ...counts }, 'Sync push');
    await this.db.$transaction((tx) => this.analytics.track(tx, 'sync.pushed', counts));
    return { results };
  }

  private async stored(opId: string): Promise<SyncOpResult | null> {
    const { tenantId } = this.who();
    const row = await this.db.syncOperation.findUnique({
      where: { tenantId_opId: { tenantId, opId } },
      select: { status: true, result: true },
    });
    if (!row) return null;
    const result = row.result as unknown as SyncOpResult;
    // A resent applied op is DUPLICATE (already done); a rejection or conflict repeats as is.
    return { ...result, opId, status: row.status === 'APPLIED' ? 'DUPLICATE' : row.status };
  }

  private async record(tx: TransactionClient, op: SyncOp, outcome: Outcome) {
    const { tenantId, membershipId } = this.who();
    const result: SyncOpResult = { opId: op.opId, ...outcome };
    await tx.syncOperation.create({
      data: {
        tenantId,
        opId: op.opId,
        membershipId,
        type: op.type,
        entityKey: op.entityKey,
        status: outcome.status as 'APPLIED' | 'REJECTED' | 'CONFLICT',
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  private rejected(code: DomainError['code'], message: string): Outcome {
    return { status: 'REJECTED', error: { code, message } };
  }

  /** One op, exactly once: the ledger row commits with the op's effects, or not at all. */
  private async one(op: SyncOp): Promise<SyncOpResult | null> {
    const earlier = await this.stored(op.opId);
    if (earlier) return earlier;
    const h = this.handlers[op.type];
    const parsed = h?.schema.safeParse(op.payload);
    const refusal: Outcome | null = !h
      ? this.rejected('VALIDATION_FAILED', 'unsupported_op')
      : !parsed?.success
        ? this.rejected('VALIDATION_FAILED', 'invalid_payload')
        : h.entityKey(parsed.data) !== op.entityKey
          ? this.rejected('VALIDATION_FAILED', 'entity_key_mismatch')
          : null;
    try {
      if (refusal) return await this.db.$transaction((tx) => this.record(tx, op, refusal));
      return await this.db.$transaction(async (tx) =>
        this.record(tx, op, await h!.run(tx, parsed!.data, op)),
      );
    } catch (error) {
      if (this.isLedgerRace(error)) return this.stored(op.opId);
      if (error instanceof DomainError) {
        const issue = error.details?.[0]?.issue ?? error.code.toLowerCase();
        const outcome = this.rejected(error.code, issue);
        try {
          return await this.db.$transaction((tx) => this.record(tx, op, outcome));
        } catch (again) {
          if (this.isLedgerRace(again)) return this.stored(op.opId);
          throw again;
        }
      }
      this.logger.error({ err: error, opType: op.type }, 'Sync op failed; left for retry');
      return null;
    }
  }

  /** Another request recorded this op first (a concurrent resend): its result stands. */
  private isLedgerRace(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      /op_id|sync_operation/.test(JSON.stringify(error.meta ?? {}))
    );
  }

  /** The working set plus attendance (all of the last 30 days, or changes since `since`). */
  async snapshot(since?: Date): Promise<SyncSnapshot> {
    const watermark = new Date();
    const { today } = await this.sessions.zone();
    const from = addDays(today, -WINDOW_BEFORE);
    const to = addDays(today, WINDOW_AFTER);
    const historyFrom = addDays(today, -ATTENDANCE_DAYS);
    // A watermark older than the history kept on the device can't be trusted: send everything.
    const complete = !since || since.getTime() < Date.parse(`${historyFrom}T00:00:00Z`);
    const [batches, list, attendance] = await Promise.all([
      this.batches.workingSet(),
      this.sessions.list({ from, to }),
      this.attendance.forSync(
        complete ? { fromDate: historyFrom } : { since, fromDate: historyFrom },
      ),
    ]);
    const { enrolments, students } = await this.enrolments.workingSet(
      batches.map((b) => b.id),
      from,
    );
    const batchIds = new Set(batches.map((b) => b.id));
    return {
      watermark: watermark.toISOString(),
      window: { from, to },
      batches,
      enrolments,
      students,
      sessions: list.items
        .filter((s) => batchIds.has(s.batchId))
        .map((s) => ({
          id: s.id,
          batchId: s.batchId,
          date: s.date,
          start: s.start,
          end: s.end,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          status: s.status,
          teacherName: s.teacherName,
          holidayName: s.holidayName,
        })),
      attendance,
      attendanceComplete: complete,
    };
  }

  /** A device's queue health (metrics only). */
  async beacon(input: {
    pending: number;
    failed: number;
    conflicts: number;
    oldestPendingAgeSec: number | null;
    storagePersisted: boolean | null;
    resolved?: { mine: number; theirs: number } | undefined;
  }) {
    const { resolved, ...queue } = input;
    this.logger.log({ metric: 'sync.queue', ...queue }, 'Sync queue beacon');
    if (resolved && resolved.mine + resolved.theirs > 0)
      await this.db.$transaction((tx) =>
        this.analytics.track(tx, 'sync.conflict_resolved', resolved),
      );
  }
}

import {
  localDate,
  nextOnboardingStep,
  type OnboardingState,
  readTerminology,
  REQUIRED_STEPS,
  type SavedStep,
  SAVED_STEPS,
  type SaveStepRequest,
  STEP_SCHEMAS,
  type StepInput,
  type StepRecord,
  StepRecordSchema,
  TERMINOLOGY_TEMPLATES,
  toAcademyType,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { EntitlementService } from '../../core/entitlements/entitlement.service.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { TenantResolver } from '../../core/tenant/tenant-resolver.service.js';
import { PeopleService } from '../people/index.js';
import { SchedulingService } from '../scheduling/index.js';
import { InvitationsService } from '../team/index.js';

type Steps = Partial<Record<SavedStep, StepRecord>>;
type Refs = NonNullable<StepRecord['refIds']>;
type Ctx = {
  tenantId: string;
  branchId: string;
  userId: string;
  membershipId: string;
  timeZone: string;
  today: string;
  steps: Steps;
  /** Set before the transaction for a teacher step that needs a new invitation. */
  invitationId?: string;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/**
 * The guided setup (UX v1.1 §4–5, C-08, C-85, C-87, C-92). Each step is saved in one transaction
 * on the request's academy, with optimistic concurrency on `version` (two devices can't overwrite
 * each other). Saving a step again edits what it created before — the records it made are kept in
 * `TenantOnboarding.steps.<step>.refIds`. Finishing opens the academy.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly people: PeopleService,
    private readonly scheduling: SchedulingService,
    private readonly invitations: InvitationsService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    private readonly resolver: TenantResolver,
  ) {}

  async state(): Promise<OnboardingState> {
    const db = this.db;
    const [row, tenant, settings] = await Promise.all([
      db.tenantOnboarding.findFirst(),
      db.tenant.findFirst({
        select: { name: true, academyType: true, timezone: true, currency: true },
      }),
      db.tenantSettings.findFirst({ select: { contact: true, terminology: true } }),
    ]);
    if (!row || !tenant) throw new DomainError('NOT_FOUND', 'onboarding');
    const steps = parseSteps(row.steps);
    const refs = (s: SavedStep) => steps[s]?.refIds ?? {};
    const contact = (settings?.contact ?? {}) as Record<string, unknown>;

    const courseId = str(refs('course').courseId);
    const teacherId = str(refs('teacher').teacherId);
    const batchId = str(refs('batch').batchId);
    const studentIds = list(refs('students').studentIds);
    const parentIds = list(refs('students').parentIds);
    const [course, teacher, batch, students, parents, timetable] = await Promise.all([
      courseId
        ? db.course.findFirst({
            where: { id: courseId },
            select: { name: true, description: true },
          })
        : null,
      teacherId
        ? db.teacher.findFirst({
            where: { id: teacherId },
            select: {
              fullName: true,
              email: true,
              membershipId: true,
              invitation: { select: { acceptedAt: true, revokedAt: true } },
            },
          })
        : null,
      batchId
        ? db.batch.findFirst({ where: { id: batchId }, select: { name: true, capacity: true } })
        : null,
      studentIds.length
        ? db.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, fullName: true, admissionNo: true },
          })
        : [],
      parentIds.length
        ? db.parent.findMany({
            where: { id: { in: parentIds.filter(Boolean) } },
            select: { id: true, fullName: true, phone: true },
          })
        : [],
      batchId ? this.scheduling.timetable(db, batchId, tenant.timezone) : null,
    ]);
    const byId = new Map(students.map((s) => [s.id, s]));
    const parentById = new Map(parents.map((p) => [p.id, p]));

    return {
      currentStep: row.currentStep as OnboardingState['currentStep'],
      completed: row.completedAt !== null,
      canComplete: REQUIRED_STEPS.every((s) => steps[s]?.status === 'done'),
      version: row.version,
      steps: Object.fromEntries(
        SAVED_STEPS.map((s) => [s, { status: steps[s]?.status ?? 'pending' }]),
      ),
      terminology: readTerminology(settings?.terminology),
      values: {
        profile: {
          name: tenant.name,
          phone: str(contact.phone) ?? null,
          email: str(contact.email) ?? null,
          address: str(contact.address) ?? null,
          timezone: tenant.timezone,
          currency: tenant.currency,
        },
        type: { academyType: toAcademyType(tenant.academyType) },
        course: course ? { name: course.name, description: course.description } : null,
        teacher: teacher
          ? {
              mode:
                teacher.membershipId && str(refs('teacher').mode) !== 'invite' ? 'self' : 'invite',
              name: teacher.fullName,
              email: teacher.email,
              invitationPending: Boolean(
                teacher.invitation &&
                !teacher.invitation.acceptedAt &&
                !teacher.invitation.revokedAt,
              ),
            }
          : null,
        batch: batch ? { name: batch.name, capacity: batch.capacity } : null,
        students: studentIds.flatMap((id, i) => {
          const s = byId.get(id);
          if (!s) return [];
          const p = parentIds[i] ? parentById.get(parentIds[i]) : undefined;
          return [
            {
              fullName: s.fullName,
              admissionNo: s.admissionNo,
              parentName: p?.fullName ?? null,
              parentPhone: p?.phone ?? null,
            },
          ];
        }),
        timetable: timetable ?? { slots: [], upcoming: [], sessionCount: 0 },
      },
    };
  }

  async save(step: SavedStep, req: SaveStepRequest): Promise<OnboardingState> {
    const pre = await this.db.tenantOnboarding.findFirst({
      select: { completedAt: true, version: true, steps: true },
    });
    if (!pre) throw new DomainError('NOT_FOUND', 'onboarding');
    if (pre.completedAt)
      throw new DomainError('INVALID_STATE_TRANSITION', 'onboarding already finished');
    if (pre.version !== req.version) throw new DomainError('VERSION_CONFLICT');
    if (req.action === 'skip' && (REQUIRED_STEPS as readonly string[]).includes(step))
      throw new DomainError('VALIDATION_FAILED', 'step required', [
        { path: 'step', issue: 'required' },
      ]);

    let data: unknown;
    if (req.action === 'save') {
      const parsed = STEP_SCHEMAS[step].safeParse(req.data ?? {});
      if (!parsed.success)
        throw new DomainError(
          'VALIDATION_FAILED',
          'step data',
          parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'data', issue: issueOf(i) })),
        );
      data = parsed.data;
    }

    const ctx = await this.context(parseSteps(pre.steps));
    // A new teacher invitation is its own transaction (InvitationsService); the teacher row that
    // points to it is written with the step below.
    if (step === 'teacher' && req.action === 'save') {
      const input = data as StepInput<'teacher'>;
      const refs = ctx.steps.teacher?.refIds ?? {};
      const sameInvite =
        input.mode === 'invite' && str(refs.mode) === 'invite' && str(refs.email) === input.email;
      if (input.mode === 'invite' && !sameInvite) {
        const invitation = await this.invitations.create(
          { email: input.email, roles: ['teacher'] },
          { inviteeName: input.name },
        );
        ctx.invitationId = invitation.id;
      }
    }

    await this.db.$transaction(
      async (tx) => {
        const row = await tx.tenantOnboarding.findFirst({ select: { version: true, steps: true } });
        if (!row || row.version !== req.version) throw new DomainError('VERSION_CONFLICT');
        const steps = parseSteps(row.steps);
        const previous = steps[step]?.refIds ?? {};
        const refIds =
          req.action === 'save'
            ? await this.apply(tx, step, data, previous, { ...ctx, steps })
            : previous;
        steps[step] = {
          status: req.action === 'save' ? 'done' : 'skipped',
          completedAt: new Date().toISOString(),
          ...(Object.keys(refIds).length ? { refIds } : {}),
        };
        const updated = await tx.tenantOnboarding.updateMany({
          where: { version: req.version },
          data: { steps, currentStep: nextOnboardingStep(step), version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
        await this.analytics.track(tx, 'onboarding.step_completed', {
          step,
          skipped: req.action === 'skip',
        });
      },
      { timeout: 30_000 },
    );
    return this.state();
  }

  /** Open the academy (C-87): Profile and Type must be done; the rest may be skipped. */
  async complete(): Promise<OnboardingState> {
    const tenantId = this.tenantId();
    await this.db.$transaction(async (tx) => {
      const row = await tx.tenantOnboarding.findFirst({
        select: { completedAt: true, steps: true },
      });
      if (!row) throw new DomainError('NOT_FOUND', 'onboarding');
      if (row.completedAt) return;
      const steps = parseSteps(row.steps);
      if (!REQUIRED_STEPS.every((s) => steps[s]?.status === 'done'))
        throw new DomainError('VALIDATION_FAILED', 'profile and type first', [
          { path: 'steps', issue: 'profile_and_type_required' },
        ]);
      await tx.tenantOnboarding.updateMany({
        data: { completedAt: new Date(), currentStep: 'ready', version: { increment: 1 } },
      });
      // SETUP → ACTIVE through the one narrow database function (040-onboarding.sql). An academy
      // already activated from the console simply stays ACTIVE.
      await tx.$queryRaw`SELECT ab_activate_current_tenant()`;
      const skippedSteps = SAVED_STEPS.filter((s) => steps[s]?.status !== 'done').length;
      await this.audit.record(
        {
          action: 'academy.onboarding_completed',
          entityType: 'Tenant',
          entityId: tenantId,
          metadata: { skippedSteps },
        },
        tx,
      );
      await this.analytics.track(tx, 'onboarding.completed', { skippedSteps });
    });
    await this.resolver.invalidateTenant(tenantId);
    return this.state();
  }

  private async apply(
    tx: TransactionClient,
    step: SavedStep,
    data: unknown,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    switch (step) {
      case 'profile':
        return this.profile(tx, data as StepInput<'profile'>, ctx);
      case 'type':
        return this.type(tx, data as StepInput<'type'>);
      case 'course':
        return this.course(tx, data as StepInput<'course'>, refs, ctx);
      case 'teacher':
        return this.teacher(tx, data as StepInput<'teacher'>, refs, ctx);
      case 'batch':
        return this.batch(tx, data as StepInput<'batch'>, refs, ctx);
      case 'students':
        return this.students(tx, data as StepInput<'students'>, refs, ctx);
      case 'timetable':
        return this.timetable(tx, data as StepInput<'timetable'>, refs, ctx);
    }
  }

  private async profile(tx: TransactionClient, d: StepInput<'profile'>, ctx: Ctx): Promise<Refs> {
    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { name: d.name, timezone: d.timezone, currency: d.currency },
    });
    await tx.tenantBranding.updateMany({
      data: { displayName: d.name, version: { increment: 1 } },
    });
    await tx.tenantSettings.updateMany({
      data: {
        contact: { phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null },
        version: { increment: 1 },
      },
    });
    // Names and addresses appear on public pages and emails at once.
    await this.resolver.invalidateTenant(ctx.tenantId);
    return {};
  }

  private async type(tx: TransactionClient, d: StepInput<'type'>): Promise<Refs> {
    await tx.tenant.update({
      where: { id: this.tenantId() },
      data: { academyType: d.academyType },
    });
    await tx.tenantSettings.updateMany({
      data: { terminology: TERMINOLOGY_TEMPLATES[d.academyType], version: { increment: 1 } },
    });
    return {};
  }

  private async course(
    tx: TransactionClient,
    d: StepInput<'course'>,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    const existing = str(refs.courseId);
    if (existing) {
      await this.scheduling.updateCourse(tx, existing, d);
      return { courseId: existing };
    }
    return { courseId: await this.scheduling.createCourse(tx, ctx.tenantId, d) };
  }

  private async teacher(
    tx: TransactionClient,
    d: StepInput<'teacher'>,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    const previous = str(refs.teacherId);
    let teacherId: string;
    let next: Refs;
    if (d.mode === 'self') {
      const user = await tx.user.findFirst({
        where: { id: ctx.userId },
        select: { name: true, email: true },
      });
      teacherId = await this.people.teacherForMember(tx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        membershipId: ctx.membershipId,
        name: user?.name ?? '',
        email: user?.email ?? null,
      });
      next = { teacherId, mode: 'self' };
    } else if (!ctx.invitationId && previous) {
      // Same person invited again with the same email: keep the invitation, update the name.
      await tx.teacher.update({ where: { id: previous }, data: { fullName: d.name } });
      teacherId = previous;
      next = { ...refs };
    } else {
      teacherId = await this.people.invitedTeacher(tx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        invitationId: ctx.invitationId!,
        name: d.name,
        email: d.email,
      });
      next = { teacherId, mode: 'invite', email: d.email, invitationId: ctx.invitationId! };
    }
    if (previous && previous !== teacherId) {
      // The earlier choice no longer teaches this batch; a still-pending invite stops working.
      const prevInvite = str(refs.invitationId);
      if (prevInvite && prevInvite !== ctx.invitationId)
        await tx.invitation.updateMany({
          where: { id: prevInvite, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      if (str(refs.mode) === 'invite') await this.people.archiveTeacher(tx, previous);
    }
    const batchId = str(ctx.steps.batch?.refIds?.batchId);
    if (batchId) await this.scheduling.setPrimaryTeacher(tx, ctx.tenantId, batchId, teacherId);
    return next;
  }

  private async batch(
    tx: TransactionClient,
    d: StepInput<'batch'>,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    const courseId = str(ctx.steps.course?.refIds?.courseId);
    if (!courseId)
      throw new DomainError('VALIDATION_FAILED', 'needs a course', [
        { path: 'course', issue: 'required' },
      ]);
    const existing = str(refs.batchId);
    let batchId: string;
    if (existing) {
      await this.scheduling.updateBatch(tx, existing, { ...d, courseId });
      batchId = existing;
    } else {
      batchId = await this.scheduling.createBatch(tx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        courseId,
        name: d.name,
        capacity: d.capacity,
        startsOn: ctx.today,
      });
      await this.analytics.track(tx, 'batch.created', { source: 'onboarding' });
    }
    const teacherId = str(ctx.steps.teacher?.refIds?.teacherId);
    if (teacherId) await this.scheduling.setPrimaryTeacher(tx, ctx.tenantId, batchId, teacherId);
    const studentIds = list(ctx.steps.students?.refIds?.studentIds);
    await this.scheduling.enrol(tx, ctx.tenantId, batchId, studentIds, ctx.today);
    return { batchId };
  }

  private async students(
    tx: TransactionClient,
    d: StepInput<'students'>,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    const ids = list(refs.studentIds);
    const parents = list(refs.parentIds);
    const keep = d.students.slice(0, ids.length);
    const extra = d.students.slice(ids.length);
    // The plan's student limit applies to the new ones (C-89); the count sees this transaction.
    if (extra.length) await this.entitlements.assertWithinLimit('students', extra.length, tx);

    const nextIds: string[] = [];
    const nextParents: string[] = [];
    for (const [i, s] of keep.entries()) {
      const parentId = await this.people.updateQuickStudent(
        tx,
        {
          tenantId: ctx.tenantId,
          studentId: ids[i]!,
          parentId: parents[i] || null,
          createdById: ctx.userId,
        },
        s,
      );
      nextIds.push(ids[i]!);
      nextParents.push(parentId ?? '');
    }
    const removed = ids.slice(d.students.length);
    for (const [j, id] of removed.entries())
      await this.people.removeQuickStudent(tx, id, parents[d.students.length + j] || null);
    if (extra.length) {
      const created = await this.people.createStudents(tx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        admissionDate: ctx.today,
        createdById: ctx.userId,
        students: extra,
      });
      for (const c of created) {
        nextIds.push(c.studentId);
        nextParents.push(c.parentId ?? '');
      }
      await this.analytics.track(tx, 'student.created', {
        source: 'onboarding',
        count: created.length,
      });
    }
    const batchId = str(ctx.steps.batch?.refIds?.batchId);
    if (batchId) {
      await this.scheduling.unenrol(tx, batchId, removed, ctx.today);
      await this.scheduling.enrol(tx, ctx.tenantId, batchId, nextIds, ctx.today);
    }
    return { studentIds: nextIds, parentIds: nextParents };
  }

  private async timetable(
    tx: TransactionClient,
    d: StepInput<'timetable'>,
    refs: Refs,
    ctx: Ctx,
  ): Promise<Refs> {
    const batchId = str(ctx.steps.batch?.refIds?.batchId);
    if (!batchId)
      throw new DomainError('VALIDATION_FAILED', 'needs a batch', [
        { path: 'batch', issue: 'required' },
      ]);
    const { ruleIds, sessionCount } = await this.scheduling.replaceWeeklySlots(tx, {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      batchId,
      teacherId: str(ctx.steps.teacher?.refIds?.teacherId) ?? null,
      slots: d.slots,
      timeZone: ctx.timeZone,
      today: ctx.today,
      previousRuleIds: list(refs.ruleIds),
    });
    await this.analytics.track(tx, 'session.generated', {
      source: 'onboarding',
      count: sessionCount,
    });
    return { ruleIds };
  }

  private async context(steps: Steps): Promise<Ctx> {
    const tenantId = this.tenantId();
    const userId = this.cls.get('userId');
    const membershipId = this.cls.get('membership')?.id;
    if (!userId || !membershipId) throw new DomainError('UNAUTHENTICATED');
    const [branch, tenant] = await Promise.all([
      this.db.branch.findFirst({ where: { isDefault: true }, select: { id: true } }),
      this.db.tenant.findFirst({ select: { timezone: true } }),
    ]);
    if (!branch || !tenant) throw new DomainError('NOT_FOUND', 'academy setup');
    return {
      tenantId,
      branchId: branch.id,
      userId,
      membershipId,
      timeZone: tenant.timezone,
      today: localDate(new Date(), tenant.timezone),
      steps,
    };
  }

  private tenantId(): string {
    const id = this.cls.get('tenantId');
    if (!id) throw new DomainError('NOT_FOUND', 'no academy');
    return id;
  }
}

function parseSteps(raw: unknown): Steps {
  const out: Steps = {};
  const value = (raw ?? {}) as Record<string, unknown>;
  for (const step of SAVED_STEPS) {
    const parsed = StepRecordSchema.safeParse(value[step]);
    if (parsed.success) out[step] = parsed.data;
  }
  return out;
}

function issueOf(issue: z.core.$ZodIssue): string {
  if (issue.code === 'too_small')
    return issue.minimum === 1 && issue.origin === 'string' ? 'required' : 'too_small';
  if (issue.code === 'custom') return issue.message;
  return issue.code;
}

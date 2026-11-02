import type { FinanceSettings } from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';
import type { TenantBoundClient } from '@academybee/database';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AnalyticsService } from '../../core/analytics/analytics.service.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { StudentsService } from '../people/index.js';
import { SessionsService } from '../scheduling/index.js';
import {
  type Cycle,
  cycleInvoices,
  cycleShare,
  dueCycles,
  dueDateFor,
  instalmentDueDates,
  laterChildren,
} from './domain/cycles.js';
import type { Discount } from './domain/money.js';
import { FinanceSettingsService } from './finance-settings.service.js';
import { InvoicesService } from './invoices.service.js';

const PAGE = 500;
const at = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

const toDiscount = (kind: 'PERCENT' | 'FIXED' | null, value: number | null): Discount | null => {
  if (!kind || value === null) return null;
  return kind === 'PERCENT' ? { kind, bps: value } : { kind, minor: value };
};

const SELECT = {
  id: true,
  tenantId: true,
  branchId: true,
  studentId: true,
  batchId: true,
  startsOn: true,
  endsOn: true,
  discountKind: true,
  discountValue: true,
  discountReason: true,
  instalments: true,
  plan: {
    select: {
      cycle: true,
      cycleMonths: true,
      components: {
        orderBy: { sortOrder: 'asc' },
        select: { name: true, amountMinor: true, taxable: true },
      },
    },
  },
} as const;

/**
 * Bills fee assignments (G-04, C-139, C-140, C-147). Each night, each assignment's due cycles
 * that have no invoice yet get theirs, issued straight away. One cycle is billed once: the
 * database refuses a second live invoice, and a cancelled one is not made again (the academy
 * decided that). Each assignment is its own transaction, so one bad row can't stop the rest.
 */
@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly analytics: AnalyticsService,
    private readonly invoices: InvoicesService,
    private readonly settings: FinanceSettingsService,
    private readonly students: StudentsService,
    private readonly sessions: SessionsService,
  ) {}

  async run(today: string): Promise<{ generated: number; failed: number }> {
    const { settings } = await this.settings.current();
    const { sibling } = settings.policy;
    const later = sibling
      ? laterChildren(await this.students.primaryParentLinks(this.db))
      : new Set<string>();
    let generated = 0;
    let failed = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.db.feeAssignment.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ endsOn: null }, { endsOn: { gte: at(today) } }],
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: PAGE,
        select: SELECT,
      });
      if (!page.length) break;
      cursor = page.at(-1)!.id;
      const facts = await this.students.billingFacts(
        this.db,
        page.map((a) => a.studentId),
      );
      // Any status counts, cancelled included: an academy's cancel is not undone overnight.
      const billed = await this.db.invoice.findMany({
        where: { assignmentId: { in: page.map((a) => a.id) }, cycleEnd: { gte: at(today) } },
        select: { assignmentId: true, cycleStart: true },
      });
      const done = new Set(billed.map((b) => `${b.assignmentId}:${day(b.cycleStart!)}`));
      for (const assignment of page) {
        const student = facts.get(assignment.studentId);
        // ON_HOLD pauses from the next cycle; COMPLETED and LEFT have stopped (G-04, G-27).
        if (student?.status !== 'ACTIVE') continue;
        const cycles = dueCycles({
          rule: assignment.plan,
          startsOn: day(assignment.startsOn),
          endsOn: assignment.endsOn ? day(assignment.endsOn) : null,
          today,
          daysBefore: settings.policy.generateDaysBefore,
        }).filter((c) => !done.has(`${assignment.id}:${c.start}`));
        for (const cycle of cycles) {
          try {
            generated += await this.bill(assignment, cycle, {
              today,
              settings,
              resumedOn: student.statusChangedOn,
              isLaterChild: later.has(assignment.studentId),
            });
          } catch (error) {
            // Another run got there first: billed once, which is the point.
            if ((error as { code?: string }).code === 'P2002') continue;
            failed += 1;
            this.logger.error({ err: error, assignmentId: assignment.id }, 'Billing failed');
          }
        }
      }
      if (page.length < PAGE) break;
    }
    if (generated)
      await this.db.$transaction((tx) =>
        this.analytics.track(tx, 'invoice.generated', { count: generated }),
      );
    return { generated, failed };
  }

  private async bill(
    a: {
      id: string;
      tenantId: string;
      branchId: string;
      studentId: string;
      batchId: string | null;
      startsOn: Date;
      discountKind: 'PERCENT' | 'FIXED' | null;
      discountValue: number | null;
      discountReason: string | null;
      instalments: number | null;
      plan: { components: { name: string; amountMinor: number; taxable: boolean }[] };
    },
    cycle: Cycle,
    ctx: {
      today: string;
      settings: FinanceSettings;
      resumedOn: string | null;
      isLaterChild: boolean;
    },
  ): Promise<number> {
    const { policy } = ctx.settings;
    const t = createServerTranslator('finance');
    const startsOn = day(a.startsOn);
    // Someone back from a pause during this cycle joins it like anyone else mid-cycle (C-147).
    const joined = ctx.resumedOn && ctx.resumedOn > startsOn ? ctx.resumedOn : startsOn;
    const share = cycleShare({
      cycle,
      joined,
      rule: policy.midCycle,
      sessions:
        policy.midCycle === 'PRORATE_SESSIONS' && a.batchId
          ? await this.classCounts(a.batchId, cycle, joined)
          : null,
    });
    if (share === 'skip') return 0;
    const parts = cycleInvoices({
      components: a.plan.components,
      share,
      own: {
        discount: toDiscount(a.discountKind, a.discountValue),
        label: a.discountReason ?? t('lines.discount'),
      },
      sibling: {
        discount:
          ctx.isLaterChild && policy.sibling
            ? toDiscount(policy.sibling.kind, policy.sibling.value)
            : null,
        label: t('lines.siblingDiscount'),
      },
      instalments: a.instalments,
    });
    if (!parts.length) return 0;
    const first = dueDateFor(cycle, policy.dueDay, joined, ctx.today);
    const dues = parts.length > 1 ? instalmentDueDates(first, cycle, parts.length) : [first];
    const note = share ? t('notes.prorated', { used: share.used, of: share.of }) : null;
    await this.db.$transaction(async (tx) => {
      for (const [i, part] of parts.entries()) {
        const id = await this.invoices.insertDraft(tx, {
          tenantId: a.tenantId,
          branchId: a.branchId,
          studentId: a.studentId,
          kind: parts.length > 1 ? 'INSTALMENT' : 'REGULAR',
          dueDate: dues[i]!,
          charges: part.charges,
          discounts: part.discounts,
          note,
          createdById: null,
          settings: ctx.settings,
          assignmentId: a.id,
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          ...(parts.length > 1 ? { instalmentNo: i + 1, instalmentOf: parts.length } : {}),
        });
        await this.invoices.issueIn(tx, id, 1);
      }
    });
    return parts.length;
  }

  private async classCounts(batchId: string, cycle: Cycle, joined: string) {
    const dates = await this.sessions.plannedDates(this.db, batchId, cycle.start, cycle.end);
    return { used: dates.filter((d) => d >= joined).length, of: dates.length };
  }
}

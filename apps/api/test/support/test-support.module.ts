import { newId } from '@academybee/contracts';
import { PersonNameSchema } from '@academybee/i18n';
import { type TenantBoundClient } from '@academybee/database';
import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { Audited } from '../../src/core/audit/audited.js';
import { TENANT_DB } from '../../src/core/database/database.module.js';
import { type RequestContext } from '../../src/core/context/request-context.js';
import { DomainError } from '../../src/core/errors/domain-error.js';
import { Idempotent } from '../../src/core/idempotency/idempotent.js';
import { Public } from '../../src/core/auth/public.decorator.js';
import { Can } from '../../src/core/rbac/can.decorator.js';
import { membershipPolicy } from '../../src/modules/team/team.policy.js';
import { assertInScope, scopedWhere } from '../../src/core/rbac/scope.js';
import { AnyHost, TenantHost } from '../../src/core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../src/core/validation/zod-dto.js';

export const EchoSchema = z.object({
  name: PersonNameSchema,
  age: z.number().int().optional(),
});
class EchoDto extends createZodDto(EchoSchema) {}

const PaymentSchema = z.object({ amountMinor: z.number().int().positive() });
class PaymentDto extends createZodDto(PaymentSchema) {}

const LedgerSchema = z.object({
  ref: z.string().min(1).max(60),
  amountMinor: z.number().int().positive(),
  /** Wait this long before writing (lease and fencing tests). */
  delayMs: z.number().int().min(0).max(10_000).optional(),
  /** Write in an interactive transaction instead of a single statement. */
  inTransaction: z.boolean().optional(),
  /** Fail after the write committed (partial outcome). */
  failAfterCommit: z.boolean().optional(),
  /** Read from the database, then fail before writing anything (review M2). */
  readThenFail: z.boolean().optional(),
});
class LedgerDto extends createZodDto(LedgerSchema) {}
/** What a ledger response may contain; anything else the handler returns is dropped (M2). */
export const LedgerResponseSchema = z.object({
  id: z.uuid(),
  ref: z.string(),
  amountMinor: z.number(),
});

/** Executions of the idempotent test handler (the idempotency tests read it). */
export const executions = { count: 0 };

/** Test-only routes. Never imported by src/ — only by the test harness. */
@Controller({ path: 'test', version: '1' })
@AnyHost()
@Public()
class TestSupportController {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Post('echo')
  @HttpCode(200)
  @ZodResponse(EchoSchema)
  echo(@Body() body: EchoDto) {
    return { ...body, internalSecret: 'stripped by the response schema' };
  }

  /** What the request-context middleware stored (client IP and effective host). */
  @Get('request-context')
  requestContext() {
    return { ip: this.cls.get('ip') ?? null, host: this.cls.get('host') ?? null };
  }

  @Get('domain-error')
  domainError(): never {
    throw new DomainError('INVALID_STATE_TRANSITION', 'invoice already paid (developer detail)');
  }

  @Get('crash')
  crash(): never {
    throw new TypeError('Cannot read properties of undefined (password=hunter2 at /srv/app.ts:42)');
  }

  @Post('unique')
  async unique() {
    const data = () => ({
      id: newId(),
      scope: 'contract-test',
      key: 'duplicate-key',
      requestHash: 'a'.repeat(64),
      status: 'COMPLETED' as const,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await this.db.idempotencyRecord.create({ data: data() });
    await this.db.idempotencyRecord.create({ data: data() });
  }

  @Post('payments')
  @Idempotent()
  @Audited('test.payment_recorded', 'Payment')
  async recordPayment(@Body() body: PaymentDto) {
    executions.count++;
    await new Promise((r) => setTimeout(r, 150));
    return { id: newId(), amountMinor: body.amountMinor, execution: executions.count };
  }

  /**
   * An idempotent handler with a real, committed side effect: an outbox row (the convention for
   * every side effect). Lets the tests count how often the effect was committed (review M1–M3).
   */
  @Post('ledger')
  @Idempotent()
  @Audited('test.ledger_recorded', 'Ledger')
  @ZodResponse(LedgerResponseSchema)
  async ledger(@Body() body: LedgerDto) {
    executions.count++;
    if (body.delayMs) await new Promise((r) => setTimeout(r, body.delayMs));
    if (body.readThenFail) {
      await this.db.outboxEvent.findFirst({ where: { type: 'test.ledger' }, select: { id: true } });
      await this.db.$transaction((tx) => tx.outboxEvent.count({ where: { type: 'test.ledger' } }));
      throw new DomainError('INVALID_STATE_TRANSITION');
    }
    const id = newId();
    const data = {
      id,
      type: 'test.ledger',
      payload: { ref: body.ref, amountMinor: body.amountMinor },
    };
    if (body.inTransaction) await this.db.$transaction((tx) => tx.outboxEvent.create({ data }));
    else await this.db.outboxEvent.create({ data });
    if (body.failAfterCommit) throw new DomainError('INVALID_STATE_TRANSITION');
    return {
      id,
      ref: body.ref,
      amountMinor: body.amountMinor,
      internalNote: 'never stored or sent',
    };
  }

  @Post('failing-payments')
  @Idempotent()
  failingPayment(@Body() _body: PaymentDto): never {
    executions.count++;
    throw new DomainError('INVALID_STATE_TRANSITION');
  }
}

/**
 * An operational academy route with the default host policy (academy host, SETUP/ACTIVE): what
 * every domain endpoint looks like from Phase 2 on. Echoes what the server decided.
 */
@Controller({ path: 'test/academy', version: '1' })
@Public()
class TestAcademyController {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Get('probe')
  async probe() {
    const branches = await this.db.branch.findMany({ select: { tenantId: true, name: true } });
    return { tenantId: this.cls.get('tenantId'), branches };
  }

  @Post('probe')
  @HttpCode(200)
  async probeWrite(@Body() _body: unknown) {
    return this.probe();
  }

  @Get('any-status')
  @TenantHost('SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')
  anyStatus() {
    return { tenantId: this.cls.get('tenantId') };
  }
}

/**
 * Signed-in academy routes guarded by `@Can` and a scope policy — the shape of every domain
 * endpoint from Phase 4 (ADR-008).
 */
@Controller({ path: 'test/secure', version: '1' })
class TestSecureController {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  @Get('settings')
  @Can('academy.settings.manage')
  settings() {
    return { tenantId: this.cls.get('tenantId'), userId: this.cls.get('userId') };
  }

  @Post('settings')
  @HttpCode(200)
  @Can('academy.settings.manage')
  updateSettings(@Body() _body: unknown) {
    return this.settings();
  }

  @Get('members')
  @Can('team.read')
  async members() {
    const where = scopedWhere(this.cls, 'team.read', membershipPolicy);
    const rows = await this.db.membership.findMany({ where, select: { id: true, userId: true } });
    return { members: rows.map((r) => r.userId).sort() };
  }

  @Get('members/:id')
  @Can('team.read')
  async member(@Param('id') id: string) {
    const row = await this.db.membership.findFirst({
      where: { id },
      select: { id: true, userId: true, branchIds: true },
    });
    const member = assertInScope(this.cls, 'team.read', membershipPolicy, row);
    return { userId: member.userId };
  }
}

@Module({ controllers: [TestSupportController, TestAcademyController, TestSecureController] })
export class TestSupportModule {}

import { newId } from '@academybee/contracts';
import { PersonNameSchema } from '@academybee/i18n';
import { type TenantBoundClient } from '@academybee/database';
import { Body, Controller, Get, HttpCode, Inject, Module, Post } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { Audited } from '../../src/core/audit/audited.js';
import { TENANT_DB } from '../../src/core/database/database.module.js';
import { type RequestContext } from '../../src/core/context/request-context.js';
import { DomainError } from '../../src/core/errors/domain-error.js';
import { Idempotent } from '../../src/core/idempotency/idempotent.js';
import { AnyHost, TenantHost } from '../../src/core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../src/core/validation/zod-dto.js';

export const EchoSchema = z.object({
  name: PersonNameSchema,
  age: z.number().int().optional(),
});
class EchoDto extends createZodDto(EchoSchema) {}

const PaymentSchema = z.object({ amountMinor: z.number().int().positive() });
class PaymentDto extends createZodDto(PaymentSchema) {}

/** Executions of the idempotent test handler (the idempotency tests read it). */
export const executions = { count: 0 };

/** Test-only routes. Never imported by src/ — only by the test harness. */
@Controller({ path: 'test', version: '1' })
@AnyHost()
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

@Module({ controllers: [TestSupportController, TestAcademyController] })
export class TestSupportModule {}

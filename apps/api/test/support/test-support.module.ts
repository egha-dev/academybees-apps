import { newId } from '@academybee/contracts';
import { PersonNameSchema } from '@academybee/i18n';
import { type PrismaClient } from '@academybee/database';
import { Body, Controller, Get, HttpCode, Inject, Module, Post } from '@nestjs/common';
import { z } from 'zod';

import { Audited } from '../../src/core/audit/audited.js';
import { APP_DB } from '../../src/core/database/database.module.js';
import { DomainError } from '../../src/core/errors/domain-error.js';
import { Idempotent } from '../../src/core/idempotency/idempotent.js';
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
class TestSupportController {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  @Post('echo')
  @HttpCode(200)
  @ZodResponse(EchoSchema)
  echo(@Body() body: EchoDto) {
    return { ...body, internalSecret: 'stripped by the response schema' };
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

@Module({ controllers: [TestSupportController] })
export class TestSupportModule {}

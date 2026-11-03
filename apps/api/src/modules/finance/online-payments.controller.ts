import {
  GatewayAccountSchema,
  ReconciliationExceptionSchema,
  ReconciliationListQuerySchema,
  ReconciliationPageSchema,
  ResolveExceptionSchema,
} from '@academybee/contracts';
import { z } from 'zod';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../core/auth/public.decorator.js';
import { Idempotent } from '../../core/idempotency/idempotent.js';
import { Can } from '../../core/rbac/can.decorator.js';
import { NoHostResolution } from '../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../core/validation/zod-dto.js';
import { OnlinePaymentsService } from './online-payments.service.js';
import { PaymentAccountsService } from './payment-accounts.service.js';
import { ReconciliationService } from './reconciliation.service.js';

class ReconciliationListQueryDto extends createZodDto(ReconciliationListQuerySchema) {}
class ResolveExceptionDto extends createZodDto(ResolveExceptionSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });
const WebhookAnswerSchema = z.object({ received: z.literal(true), duplicate: z.boolean() });

/**
 * Gateway events (ADR-033). Public: the signature is the credential. No host is resolved, so no
 * Host header can choose an academy: the account in the path does, and its own secret proves it.
 */
@Controller({ path: 'webhooks/payments', version: '1' })
@NoHostResolution()
export class PaymentWebhooksController {
  constructor(private readonly online: OnlinePaymentsService) {}

  @Post(':provider/:accountRef')
  @Public()
  @HttpCode(200)
  @ZodResponse(WebhookAnswerSchema)
  receive(
    @Param('provider') provider: string,
    @Param('accountRef') accountRef: string,
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.online.receive(provider, accountRef, req.body, headers);
  }
}

/** Settings → Payments: the online gateway card (G-01, ADR-033). */
@Controller({ path: 'settings/finance/gateway', version: '1' })
export class GatewayAccountController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get()
  @Can('fee.read')
  @ZodResponse(z.object({ account: GatewayAccountSchema.nullable() }))
  get() {
    return this.accounts.get();
  }

  /** The simulator only (404 where it isn't enabled); real gateways connect in Phase G. */
  @Post('simulator')
  @Can('academy.settings.manage')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(GatewayAccountSchema)
  connectSimulator() {
    return this.accounts.connectSimulator();
  }

  @Delete()
  @Can('academy.settings.manage')
  @HttpCode(204)
  async disconnect() {
    await this.accounts.disconnect();
  }
}

/** Where the gateway and our books disagree (§12.3). */
@Controller({ path: 'reconciliation/exceptions', version: '1' })
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @Can('finance.reconcile')
  @ZodResponse(ReconciliationPageSchema)
  list(@Query() query: ReconciliationListQueryDto) {
    return this.reconciliation.list(query);
  }

  @Post(':id/resolve')
  @Can('finance.reconcile')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(ReconciliationExceptionSchema)
  resolve(@Param('id', Id) id: string, @Body() body: ResolveExceptionDto) {
    return this.reconciliation.resolve(id, body.resolution);
  }
}

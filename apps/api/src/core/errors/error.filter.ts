import { type ErrorEnvelope } from '@academybee/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import { type Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';
import { DomainError } from './domain-error.js';
import { mapError } from './map-error.js';
import { errorMessage } from './messages.js';

/**
 * The single place that writes error responses (ADR-013). Clients only ever see
 * `{ error: { code, message, details?, requestId } }` — never stacks, SQL or driver text.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  constructor(private readonly cls: ClsService<RequestContext>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const mapped = mapError(exception);
    const requestId = this.cls.getId() ?? 'unknown';

    if (mapped.unexpected) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    } else if (exception instanceof DomainError && exception.reason) {
      this.logger.debug({ code: mapped.code, reason: exception.reason, requestId }, 'Domain error');
    }

    const body: ErrorEnvelope = {
      error: {
        code: mapped.code,
        message: errorMessage(mapped.code),
        ...(mapped.details ? { details: mapped.details } : {}),
        requestId,
      },
    };
    if (res.headersSent) return;
    if (mapped.code === 'RATE_LIMITED') res.setHeader('Retry-After', '60');
    res.status(mapped.status).json(body);
  }
}

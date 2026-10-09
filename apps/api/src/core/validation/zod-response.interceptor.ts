import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { z } from 'zod';

import { DomainError } from '../errors/domain-error.js';
import { ZOD_RESPONSE } from './zod-dto.js';

/** Responses are serialized through their declared schema (never raw Prisma models). */
@Injectable()
export class ZodResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ResponseSchema');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schema = this.reflector.get<z.ZodType | undefined>(ZOD_RESPONSE, context.getHandler());
    if (!schema) return next.handle();
    return next.handle().pipe(
      map((body: unknown) => {
        const parsed = schema.safeParse(body);
        if (parsed.success) return parsed.data;
        // A response that breaks its own contract is a server bug; never send it.
        this.logger.error({ issues: parsed.error.issues }, 'Response failed its schema');
        throw new DomainError('INTERNAL', 'response schema mismatch');
      }),
    );
  }
}

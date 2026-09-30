import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, type Observable } from 'rxjs';

import { AuditService } from './audit.service.js';

export const AUDITED = 'academybee:audited';

export type AuditedOptions = { action: string; entityType?: string };

/**
 * Record an audit entry after the handler succeeds. The entity ID is taken from the response's
 * `id` (if any). For changes that need before/after, call AuditService inside the transaction.
 */
export const Audited = (action: string, entityType?: string) =>
  SetMetadata(AUDITED, { action, ...(entityType ? { entityType } : {}) } satisfies AuditedOptions);

@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(AUDITED, context.getHandler());
    if (!options) return next.handle();
    return next.handle().pipe(
      mergeMap((body: unknown) => {
        const id = (body as { id?: unknown } | null)?.id;
        return from(
          this.audit
            .record({
              action: options.action,
              ...(options.entityType ? { entityType: options.entityType } : {}),
              ...(typeof id === 'string' ? { entityId: id } : {}),
            })
            .then(() => body),
        );
      }),
    );
  }
}

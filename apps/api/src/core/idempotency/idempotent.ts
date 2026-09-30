import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { type RequestContext } from '../context/request-context.js';
import { DomainError } from '../errors/domain-error.js';
import { IdempotencyStore } from './idempotency.store.js';
import { isValidIdempotencyKey, requestHash } from './request-hash.js';

export const IDEMPOTENT = 'academybee:idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Require an `Idempotency-Key` header (financial writes, provisioning, bulk operations —
 * ARCHITECTURE §9.1). Same key + same request → the stored response is replayed; same key +
 * different request → 409 IDEMPOTENCY_KEY_REUSED; concurrent duplicates → only one executes.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: IdempotencyStore,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, context.getHandler())) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const key = req.headers[IDEMPOTENCY_HEADER];
    if (!isValidIdempotencyKey(key)) {
      throw new DomainError('VALIDATION_FAILED', 'missing or invalid Idempotency-Key', [
        { path: 'Idempotency-Key', issue: key === undefined ? 'required' : 'invalid_format' },
      ]);
    }

    const tenantId = this.cls.get('tenantId');
    const actor = this.cls.get('actor');
    const route = `${req.method} ${req.baseUrl}${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    const scope = `${tenantId ?? 'platform'}|${actor?.id ?? 'anonymous'}|${route}`;
    const hash = requestHash(req.method, req.originalUrl, req.body);

    return from(this.store.claim({ scope, key, hash, tenantId })).pipe(
      mergeMap((claim) => {
        switch (claim.kind) {
          case 'reused':
            throw new DomainError('IDEMPOTENCY_KEY_REUSED', `key reused on ${route}`);
          case 'in_progress':
            throw new DomainError('IDEMPOTENCY_KEY_IN_PROGRESS', `key in progress on ${route}`);
          case 'replay':
            res.status(claim.status);
            res.setHeader('Idempotent-Replayed', 'true');
            return of(claim.body);
          case 'claimed':
            return next.handle().pipe(
              mergeMap((body: unknown) =>
                from(
                  this.store
                    .complete(claim.id, this.statusFor(context, req, res), body)
                    .then(() => body),
                ),
              ),
              catchError((error: unknown) =>
                from(this.store.release(claim.id)).pipe(mergeMap(() => throwError(() => error))),
              ),
            );
        }
      }),
    );
  }

  /** Nest applies the route status after interceptors run, so derive it the same way. */
  private statusFor(context: ExecutionContext, req: Request, res: Response): number {
    if (res.statusCode !== 200) return res.statusCode; // set explicitly by the handler
    return (
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
      (req.method === 'POST' ? 201 : 200)
    );
  }
}

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
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
 *
 * While the handler runs, the claim is in the request context: every transaction it commits marks
 * the claim as committed in the same transaction (tenant-bound client). A crashed attempt's claim
 * can be taken over after its lease (`LEASE_MS`) only if it never committed; a slow attempt whose
 * claim was taken over can't commit (review M1). Side effects must be database writes (outbox).
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: IdempotencyStore,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  private readonly logger = new Logger('Idempotency');

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
          case 'claimed': {
            if (claim.takenOver)
              this.logger.warn({ route, attempt: claim.ref.attempt }, 'Stale claim taken over');
            this.cls.set('idempotencyClaim', claim.ref);
            const done = () => this.cls.set('idempotencyClaim', undefined);
            return next.handle().pipe(
              // Release only when the handler failed and nothing was committed. If storing the
              // response fails after the handler committed, the key stays IN_PROGRESS: releasing
              // it would let a retry execute the side effect (e.g. a payment) a second time.
              catchError((error: unknown) => {
                done();
                return from(this.store.release(claim.ref)).pipe(
                  mergeMap((released) => {
                    if (!released)
                      this.logger.warn(
                        { route },
                        'Failed after a commit: key kept (outcome unknown)',
                      );
                    return throwError(() => error);
                  }),
                );
              }),
              mergeMap((body: unknown) => {
                done();
                return from(
                  this.store
                    .complete(claim.ref, this.statusFor(context, req, res), body)
                    .then(() => body),
                );
              }),
            );
          }
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

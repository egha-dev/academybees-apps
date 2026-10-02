import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { type RequestContext } from '../context/request-context.js';

/**
 * Run work under an explicit academy context (or none) — for jobs, the Family Hub fan-out
 * (ADR-039) and resolution itself. The tenant-bound client reads the context when a query
 * executes, and Prisma queries execute when awaited, so `fn` is awaited *inside* the scope:
 * returning an un-awaited query from a plain `cls.run` would run it outside the context.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  run<T>(tenantId: string | undefined, fn: () => PromiseLike<T>): Promise<T> {
    return this.cls.run({ ifNested: 'inherit' }, async () => {
      this.cls.set('tenantId', tenantId);
      return await fn();
    });
  }

  /** Run work as a user (identity rows become visible, C-59); the academy context is kept. */
  runAsUser<T>(userId: string, fn: () => PromiseLike<T>): Promise<T> {
    return this.cls.run({ ifNested: 'inherit' }, async () => {
      this.cls.set('userId', userId);
      return await fn();
    });
  }

  /** The current academy, if any. */
  get tenantId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('tenantId') : undefined;
  }
}

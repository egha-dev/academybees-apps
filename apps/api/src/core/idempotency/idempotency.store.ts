import { newId } from '@academybee/contracts';
import { Prisma, type PrismaClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { APP_DB } from '../database/database.module.js';

export type Claim =
  | { kind: 'claimed'; id: string }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress' }
  | { kind: 'reused' };

const TTL_MS = 24 * 60 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** IdempotencyRecord persistence. The (scope, key) unique index makes the claim atomic. */
@Injectable()
export class IdempotencyStore {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  async claim(input: {
    scope: string;
    key: string;
    hash: string;
    tenantId?: string | undefined;
  }): Promise<Claim> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = newId();
      try {
        await this.db.idempotencyRecord.create({
          data: {
            id,
            scope: input.scope,
            key: input.key,
            requestHash: input.hash,
            status: 'IN_PROGRESS',
            tenantId: input.tenantId ?? null,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });
        return { kind: 'claimed', id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      const existing = await this.db.idempotencyRecord.findUnique({
        where: { scope_key: { scope: input.scope, key: input.key } },
      });
      if (!existing) continue; // released between our insert and read — try again
      if (existing.expiresAt.getTime() <= Date.now()) {
        await this.db.idempotencyRecord.deleteMany({
          where: { id: existing.id, expiresAt: { lte: new Date() } },
        });
        continue;
      }
      if (existing.requestHash !== input.hash) return { kind: 'reused' };
      if (existing.status === 'IN_PROGRESS') return { kind: 'in_progress' };
      return {
        kind: 'replay',
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
      };
    }
    return { kind: 'in_progress' };
  }

  async complete(id: string, status: number, body: unknown): Promise<void> {
    await this.db.idempotencyRecord.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        responseStatus: status,
        responseBody: body === undefined ? Prisma.JsonNull : (body as Prisma.InputJsonValue),
      },
    });
  }

  /** The handler failed: forget the key so the client can retry with it. */
  async release(id: string): Promise<void> {
    await this.db.idempotencyRecord.deleteMany({ where: { id, status: 'IN_PROGRESS' } });
  }
}

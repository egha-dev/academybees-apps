import { newId } from '@academybee/contracts';
import { type IdempotencyClaimRef, Prisma, type PrismaClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';

import { TENANT_DB } from '../database/database.module.js';

export type Claim =
  | { kind: 'claimed'; ref: IdempotencyClaimRef; takenOver: boolean }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress' }
  | { kind: 'reused' };

const TTL_MS = 24 * 60 * 60 * 1000;
/**
 * An IN_PROGRESS claim is leased for this long. After that a retry may take it over, but only if
 * the earlier attempt never committed anything; a slow attempt that loses its claim can no longer
 * commit (fencing in the tenant-bound client). Review M1.
 */
export const LEASE_MS = 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** IdempotencyRecord persistence. The (scope, key) unique index makes the claim atomic. */
@Injectable()
export class IdempotencyStore {
  constructor(@Inject(TENANT_DB) private readonly db: PrismaClient) {}

  async claim(input: {
    scope: string;
    key: string;
    hash: string;
    tenantId?: string | undefined;
  }): Promise<Claim> {
    const tenantId = input.tenantId ?? undefined;
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
            tenantId: tenantId ?? null,
            lockedUntil: new Date(Date.now() + LEASE_MS),
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });
        return { kind: 'claimed', ref: { id, attempt: 1, tenantId }, takenOver: false };
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
      if (existing.status === 'COMPLETED')
        return {
          kind: 'replay',
          status: existing.responseStatus ?? 200,
          body: existing.responseBody,
        };
      // IN_PROGRESS: still leased, or the earlier attempt committed but its response was lost
      // (outcome unknown — never run it again).
      if (existing.lockedUntil.getTime() > Date.now() || existing.committedAt)
        return { kind: 'in_progress' };
      // Stale and nothing committed: take it over (only one retry can win).
      const taken = await this.db.idempotencyRecord.updateMany({
        where: {
          id: existing.id,
          status: 'IN_PROGRESS',
          attempt: existing.attempt,
          committedAt: null,
          lockedUntil: { lte: new Date() },
        },
        data: { attempt: existing.attempt + 1, lockedUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (taken.count !== 1) return { kind: 'in_progress' };
      return {
        kind: 'claimed',
        ref: { id: existing.id, attempt: existing.attempt + 1, tenantId },
        takenOver: true,
      };
    }
    return { kind: 'in_progress' };
  }

  /** Store the response the client got. A claim that was taken over meanwhile is left alone. */
  async complete(ref: IdempotencyClaimRef, status: number, body: unknown): Promise<void> {
    await this.db.idempotencyRecord.updateMany({
      where: { id: ref.id, attempt: ref.attempt, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        responseStatus: status,
        responseBody: body === undefined ? Prisma.JsonNull : (body as Prisma.InputJsonValue),
      },
    });
  }

  /**
   * The handler failed: forget the key so the client can retry with it — unless something was
   * already committed (a partial outcome must never run twice). Returns whether it was released.
   */
  async release(ref: IdempotencyClaimRef): Promise<boolean> {
    const released = await this.db.idempotencyRecord.deleteMany({
      where: { id: ref.id, attempt: ref.attempt, status: 'IN_PROGRESS', committedAt: null },
    });
    return released.count === 1;
  }
}

import { type PrismaClient } from '@academybee/database';
import { Controller, Get, HttpCode, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { type Response } from 'express';
import { type Redis } from 'ioredis';

import { TENANT_DB } from '../database/database.module.js';
import { REDIS } from '../redis/redis.module.js';
import { NoHostResolution } from '../tenant/host-policy.js';

type Check = 'up' | 'down';

const TIMEOUT_MS = 2_000;

async function probe(fn: () => Promise<unknown>): Promise<Check> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness (process up) and readiness (dependencies reachable) for load balancers and deploys. */
// Served at /api/v1/health/* and /api/health/* (deploy smoke checks use the latter).
@Controller({ path: 'health', version: ['1', VERSION_NEUTRAL] })
@NoHostResolution()
export class HealthController {
  constructor(
    @Inject(TENANT_DB) private readonly db: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok'; release: string } {
    // The deployed commit (baked into the image); deploy smoke checks wait for it.
    return { status: 'ok', release: process.env.RELEASE_SHA ?? 'dev' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      probe(() => this.db.$queryRaw`SELECT 1`),
      probe(() => this.redis.ping()),
    ]);
    const ok = database === 'up' && redis === 'up';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'unavailable', checks: { database, redis } };
  }
}

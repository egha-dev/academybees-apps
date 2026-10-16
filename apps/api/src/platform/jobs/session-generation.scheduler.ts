import { localDate } from '@academybee/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { AuditService } from '../../core/audit/audit.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import type { ApiConfig } from '../../core/config/config.schema.js';
import { bullConnection } from '../../core/redis/bull-connection.js';
import { AttendanceNudgeQueue } from '../../modules/notifications/index.js';
import { SessionGenerationQueue } from '../../modules/scheduling/index.js';
import { PlatformDb } from '../platform-db.js';

/** Platform jobs queue (C-112): cross-academy work that only lists academies, never their data. */
export const PLATFORM_JOBS_QUEUE = 'platform-jobs';
export const DAILY_SESSIONS_JOB = 'daily-sessions';
/** Every 10 minutes: teachers reminded 30 minutes after a class without a roll call (G-16). */
export const ATTENDANCE_NUDGES_JOB = 'attendance-nudges';
const NUDGE_EVERY_MS = 10 * 60_000;
/** 02:00 in India, when no class is running. */
const DAILY_PATTERN = { pattern: '0 2 * * *', tz: 'Asia/Kolkata' } as const;

/**
 * Every night, queue one session-generation job per open academy (ACTIVE or SETUP). This is the
 * only cross-academy step: it reads academy ids with the platform client (ADR-005) and writes a
 * platform audit row; each academy's classes are then generated in its own tenant context.
 */
@Injectable()
export class SessionGenerationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionGenerationScheduler.name);
  private connection: Redis | undefined;
  private queue: Queue | undefined;
  private worker: Worker | undefined;

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly platform: PlatformDb,
    private readonly generation: SessionGenerationQueue,
    private readonly nudges: AttendanceNudgeQueue,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = bullConnection(this.config);
    this.queue = new Queue(PLATFORM_JOBS_QUEUE, { connection: this.connection });
    // Upserted by every API instance; BullMQ keeps one schedule.
    await this.queue.upsertJobScheduler(DAILY_SESSIONS_JOB, DAILY_PATTERN, {
      name: DAILY_SESSIONS_JOB,
      opts: { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
    });
    await this.queue.upsertJobScheduler(
      ATTENDANCE_NUDGES_JOB,
      { every: NUDGE_EVERY_MS },
      {
        name: ATTENDANCE_NUDGES_JOB,
        opts: { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
      },
    );
    this.worker = new Worker(
      PLATFORM_JOBS_QUEUE,
      async (job) => {
        if (job.name === DAILY_SESSIONS_JOB) return this.queueAll('daily');
        if (job.name === 'manual-sessions') return this.queueAll('manual', true);
        if (job.name === ATTENDANCE_NUDGES_JOB) return this.queueNudges();
        throw new Error(`Unknown platform job: ${job.name}`);
      },
      { connection: this.connection, concurrency: 1 },
    );
    // Catch up on start (fresh deploys, local seeds): classes appear without waiting for 02:00.
    await this.queue.add(
      'manual-sessions',
      {},
      { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
    );
  }

  /** Queue every open academy now. Returns how many were queued. */
  async queueAll(reason: 'daily' | 'manual', always = false): Promise<number> {
    let db;
    try {
      db = this.platform.db;
    } catch {
      this.logger.warn('PLATFORM_DATABASE_URL not set: session generation not queued');
      return 0;
    }
    const academies = await db.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'SETUP'] } },
      select: { id: true },
    });
    const day = localDate(new Date(), 'Asia/Kolkata');
    for (const a of academies)
      await this.generation.add({ tenantId: a.id, reason }, always ? null : day);
    await this.audit.record({
      tenantId: null,
      action: 'platform.sessions_generation_queued',
      entityType: 'Platform',
      entityId: 'session-generation',
      metadata: { academies: academies.length, reason },
    });
    this.logger.log({ academies: academies.length, reason }, 'Session generation queued');
    return academies.length;
  }

  /** Queue the attendance nudge check for every active academy (one job per 10-minute slot). */
  async queueNudges(now = new Date()): Promise<number> {
    let db;
    try {
      db = this.platform.db;
    } catch {
      return 0;
    }
    const academies = await db.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const slot = String(Math.floor(now.getTime() / NUDGE_EVERY_MS));
    for (const a of academies) await this.nudges.add({ tenantId: a.id }, slot);
    await this.audit.record({
      tenantId: null,
      action: 'platform.attendance_nudges_queued',
      entityType: 'Platform',
      entityId: 'attendance-nudges',
      metadata: { academies: academies.length },
    });
    return academies.length;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

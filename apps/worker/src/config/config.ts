import { AppEnvSchema } from '@academybee/contracts';
import { z } from 'zod';

/** Worker configuration, validated at boot; refuses to start when invalid. */
export const WorkerConfigSchema = z.object({
  APP_ENV: AppEnvSchema,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** ab_app — tenant-scoped job processing (tenant context re-established per job from Phase 1). */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** ab_platform — cross-tenant platform jobs only (outbox relay), under src/platform/**. */
  PLATFORM_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  HEARTBEAT_EVERY_MS: z.coerce.number().int().min(1000).default(60_000),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
  ANALYTICS_HASH_SALT: z.string().min(8),
  SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  /** Decrypts link tokens sealed by the API (C-62); must equal the API's value. */
  SECRETS_MASTER_KEY: z.string().min(10),
  /** SMTP server (Mailpit locally on :1025; the provider on staging, A6). */
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
  EMAIL_FROM: z.string().min(3).default('AcademyBee <no-reply@academybees.test>'),
  /** Links in emails (C-52): https://<slug>.<root>[:port]/… */
  PLATFORM_ROOT_DOMAIN: z.string().trim().min(1).default('localhost'),
  WEB_PUBLIC_PROTOCOL: z.enum(['http', 'https']).default('https'),
  WEB_PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).optional(),
});
export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export class InvalidWorkerConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid worker configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidWorkerConfigError';
  }
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = WorkerConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidWorkerConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return parsed.data;
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

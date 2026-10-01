import { AppEnvSchema } from '@academybee/contracts';
import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

export const PAYMENT_PROVIDERS = ['manual', 'simulator'] as const;

/**
 * API configuration, validated at boot (ARCHITECTURE §4.3): the process refuses to start on
 * invalid config. Secrets never appear in error messages — only variable names and issues.
 */
export const ApiConfigSchema = z
  .object({
    APP_ENV: AppEnvSchema,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    TRUSTED_PROXY_IPS: csv,
    TRUSTED_PROXY_SECRET: z.string().min(16, 'must be at least 16 characters'),
    /** Root domain academy subdomains live under (C-52); defaults to `localhost` in local/ci only. */
    PLATFORM_ROOT_DOMAIN: z
      .string()
      .trim()
      .regex(/^[a-z0-9.-]+$/i, 'must be a hostname')
      .optional(),
    /** Tenant resolution cache (ARCHITECTURE §5.2): hits and misses (unknown hosts). */
    TENANT_CACHE_MS: z.coerce.number().int().min(0).max(600_000).default(60_000),
    TENANT_NEGATIVE_CACHE_MS: z.coerce.number().int().min(0).max(600_000).default(30_000),
    /** Payment providers enabled in this deployment (ADR-038). */
    PAYMENT_PROVIDERS: csv.pipe(z.array(z.enum(PAYMENT_PROVIDERS)).min(1)).default(['manual']),
    /** Release-flag override cache; 0 in E2E so a flipped flag applies immediately. */
    FLAGS_CACHE_MS: z.coerce.number().int().min(0).max(300_000).default(30_000),
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
    ANALYTICS_HASH_SALT: z.string().min(8),
    SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.PLATFORM_ROOT_DOMAIN && cfg.APP_ENV !== 'local' && cfg.APP_ENV !== 'ci') {
      ctx.addIssue({
        code: 'custom',
        path: ['PLATFORM_ROOT_DOMAIN'],
        message: 'is required outside local/ci',
      });
    }
    // ADR-038 / CLAUDE.md §5: the simulator is never allowed in production.
    if (cfg.APP_ENV === 'production' && cfg.PAYMENT_PROVIDERS.includes('simulator')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDERS'],
        message: 'SimulatorProvider is not allowed when APP_ENV=production',
      });
    }
    if (cfg.APP_ENV === 'production' && cfg.TRUSTED_PROXY_SECRET.startsWith('local-')) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUSTED_PROXY_SECRET'],
        message: 'must be a real secret in production',
      });
    }
  });

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

/** The platform root domain for host classification (C-52). */
export function platformRootDomain(config: ApiConfig): string {
  return config.PLATFORM_ROOT_DOMAIN ?? 'localhost';
}

export class InvalidConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid API configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidConfigError';
  }
}

/** Parse env vars; throws InvalidConfigError listing variable names and problems (never values). */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = ApiConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return parsed.data;
}

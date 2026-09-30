import 'server-only';

import { AppEnvSchema } from '@academybee/contracts';
import { z } from 'zod';

/** Server-side web configuration (validated on first use; secrets never reach the browser). */
const ServerEnvSchema = z.object({
  APP_ENV: AppEnvSchema,
  API_ORIGIN: z.url(),
  TRUSTED_PROXY_SECRET: z.string().min(16),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= ServerEnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
    API_ORIGIN: process.env.API_ORIGIN,
    TRUSTED_PROXY_SECRET: process.env.TRUSTED_PROXY_SECRET,
  });
  return cached;
}

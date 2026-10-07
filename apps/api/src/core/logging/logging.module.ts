import { logSafeUrl, REDACT_PATHS, safeError, safeLogObject } from '@academybee/contracts';
import { Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';

/**
 * Structured JSON logs (pino) with request IDs, redaction and PII masking (ADR-023). Secrets are
 * removed at any depth, Errors are reduced to a masked summary (no Prisma `meta`), and URLs are
 * logged without query strings (review L1, L2).
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [API_CONFIG, ClsService],
      useFactory: (config: ApiConfig, cls: ClsService<RequestContext>) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          redact: { paths: REDACT_PATHS, censor: '[redacted]' },
          genReqId: () => cls.getId() ?? 'no-request-id',
          customProps: () => ({ requestId: cls.getId(), appEnv: config.APP_ENV }),
          formatters: { log: (obj: Record<string, unknown>) => safeLogObject(obj) },
          autoLogging: { ignore: (req) => /^\/api(\/v1)?\/health\//.test(req.url ?? '') },
          serializers: {
            req: (req: { method?: string; url?: string; headers?: Record<string, unknown> }) => ({
              method: req.method,
              url: logSafeUrl(req.url),
              host: req.headers?.host,
            }),
            err: (err: unknown) => (err instanceof Error ? safeError(err) : safeLogObject(err)),
          },
          ...(config.APP_ENV === 'local'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}

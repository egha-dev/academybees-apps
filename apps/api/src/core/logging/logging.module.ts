import { Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { maskPii, REDACT_PATHS } from './pii-mask.js';

/** Structured JSON logs (pino) with request IDs, redaction and PII masking (ADR-023). */
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
          formatters: { log: (obj: Record<string, unknown>) => maskPii(obj) },
          autoLogging: { ignore: (req) => /^\/api(\/v1)?\/health\//.test(req.url ?? '') },
          serializers: {
            req: (req: { method?: string; url?: string; headers?: Record<string, unknown> }) => ({
              method: req.method,
              url: req.url,
              host: req.headers?.host,
            }),
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

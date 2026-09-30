import { newId } from '@academybee/contracts';
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ClsMiddlewareOptions, ClsModule, ClsService } from 'nestjs-cls';

import { type ApiConfig } from '../config/config.schema.js';
import { effectiveHost, PROXY_SECRET_HEADER } from '../proxy/effective-host.js';
import { REQUEST_ID_HEADER, type RequestContext, resolveRequestId } from './request-context.js';

/**
 * Per-request context (ARCHITECTURE §9.2): request ID (accepted or generated, echoed in
 * `X-Request-Id`), client IP/UA, and the effective host after the trusted-proxy check.
 * The middleware is mounted by configureApp() *before* the body parser, so even malformed
 * requests get a request ID.
 */
export function clsMiddlewareOptions(config: ApiConfig): ClsMiddlewareOptions {
  return {
    generateId: true,
    idGenerator: (req: Request) => resolveRequestId(req.headers[REQUEST_ID_HEADER], newId),
    setup: (store: ClsService, req: Request, res: Response) => {
      const cls = store as unknown as ClsService<RequestContext>;
      const requestId = cls.getId();
      cls.set('requestId', requestId);
      res.setHeader('X-Request-Id', requestId);
      if (req.ip) cls.set('ip', req.ip);
      const ua = req.headers['user-agent'];
      if (ua) cls.set('userAgent', ua.slice(0, 300));
      const host = effectiveHost(
        {
          remoteAddress: req.socket.remoteAddress,
          hostHeader: req.headers.host,
          forwardedHost: req.headers['x-forwarded-host'],
          proxySecret: req.headers[PROXY_SECRET_HEADER],
        },
        { trustedIps: config.TRUSTED_PROXY_IPS, secret: config.TRUSTED_PROXY_SECRET },
      );
      if (host) cls.set('host', host);
    },
  };
}

@Global()
@Module({})
export class ContextModule {
  static forRoot(): DynamicModule {
    return {
      module: ContextModule,
      imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
    };
  }
}

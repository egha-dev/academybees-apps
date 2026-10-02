import { cookieSpecs } from '@academybee/auth';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutRequestSchema,
  type MeResponse,
  MeResponseSchema,
  primaryExperience,
  ROLE_TEMPLATES,
} from '@academybee/contracts';
import { type TenantBoundClient } from '@academybee/database';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { API_CONFIG } from '../config/config.module.js';
import { type ApiConfig } from '../config/config.schema.js';
import { type RequestContext } from '../context/request-context.js';
import { TENANT_DB } from '../database/database.module.js';
import { DomainError } from '../errors/domain-error.js';
import { AnyHost } from '../tenant/host-policy.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { createZodDto, ZodResponse } from '../validation/zod-dto.js';
import { readCookies } from './http.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';

class LoginDto extends createZodDto(LoginRequestSchema) {}
class LogoutDto extends createZodDto(LogoutRequestSchema) {}

/** Sign-in, session refresh, sign-out and the current user (ARCHITECTURE §9.3, ADR-007). */
@Controller({ path: 'auth', version: '1' })
@AnyHost()
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ZodResponse(LoginResponseSchema)
  login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.sessions.login(body, res);
  }

  @Post('refresh')
  @Public()
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const name = cookieSpecs(this.config.COOKIE_MODE).refresh.name;
    await this.sessions.refresh(readCookies(req)[name], res);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Body() body: LogoutDto, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.logout(this.cls.get('session')?.id, body.everywhere ?? false, res);
  }

  @Get('me')
  @ZodResponse(MeResponseSchema)
  async me(): Promise<MeResponse> {
    const userId = this.cls.get('userId');
    const session = this.cls.get('session');
    if (!userId || !session) throw new DomainError('UNAUTHENTICATED');
    const user = await this.context.runAsUser(userId, () =>
      this.db.user.findFirst({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true },
      }),
    );
    if (!user) throw new DomainError('UNAUTHENTICATED', 'user missing');
    const membership = this.cls.get('membership');
    const experiences = membership
      ? [...new Set(membership.roles.map((r) => ROLE_TEMPLATES[r].experience))]
      : [];
    const primary = membership ? primaryExperience(membership.roles) : undefined;
    return {
      user,
      audience: session.audience,
      ...(membership
        ? {
            academy: {
              roles: membership.roles,
              capabilities: membership.capabilities,
              experiences,
              ...(primary ? { primaryExperience: primary } : {}),
            },
          }
        : {}),
    };
  }
}

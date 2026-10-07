import { cookieSpecs } from '@academybee/auth';
import {
  ForgotPasswordSchema,
  HandoffRequestSchema,
  LoginOutcomeSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MfaEnrolConfirmRequestSchema,
  MfaEnrolConfirmResponseSchema,
  MfaEnrolStartRequestSchema,
  MfaEnrolStartResponseSchema,
  MfaVerifyRequestSchema,
  MfaVerifyResponseSchema,
  LogoutRequestSchema,
  type MeResponse,
  MeResponseSchema,
  primaryExperience,
  ResetPasswordSchema,
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
import { SignedIn } from '../rbac/can.decorator.js';
import { AnyHost, HubHost, TenantHost } from '../tenant/host-policy.js';
import { TenantContext } from '../tenant/tenant-context.service.js';
import { createZodDto, ZodResponse } from '../validation/zod-dto.js';
import { readCookies } from './http.js';
import { HubService } from './hub.service.js';
import { LoginService } from './login.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordService } from './password.service.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';

class LoginDto extends createZodDto(LoginRequestSchema) {}
class LogoutDto extends createZodDto(LogoutRequestSchema) {}
class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
class HandoffDto extends createZodDto(HandoffRequestSchema) {}
class MfaEnrolStartDto extends createZodDto(MfaEnrolStartRequestSchema) {}
class MfaEnrolConfirmDto extends createZodDto(MfaEnrolConfirmRequestSchema) {}
class MfaVerifyDto extends createZodDto(MfaVerifyRequestSchema) {}

/**
 * Sign-in, session refresh, sign-out, password recovery and the current user (ARCHITECTURE §9.3,
 * ADR-007).
 */
@Controller({ path: 'auth', version: '1' })
@AnyHost()
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly logins: LoginService,
    private readonly passwords: PasswordService,
    private readonly hub: HubService,
    private readonly mfa: MfaService,
    private readonly cls: ClsService<RequestContext>,
    private readonly context: TenantContext,
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ZodResponse(LoginOutcomeSchema)
  login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.logins.login(body, res);
  }

  /** Family Hub: exchange the one-time code from an academy sign-in for a HUB session (C-61). */
  @Post('handoff')
  @Public()
  @HubHost()
  @HttpCode(200)
  @ZodResponse(LoginResponseSchema)
  handoff(@Body() body: HandoffDto, @Res({ passthrough: true }) res: Response) {
    return this.hub.exchangeHandoff(body.code, this.cls.get('ip') ?? 'unknown', res);
  }

  /**
   * Mandatory first-time 2FA during sign-in (console, C-66; an academy that requires it, C-80):
   * a new TOTP secret to add to an authenticator app. The MFA token works only on its own host.
   */
  @Post('mfa/enrol/start')
  @Public()
  @HttpCode(200)
  @ZodResponse(MfaEnrolStartResponseSchema)
  mfaEnrolStart(@Body() body: MfaEnrolStartDto) {
    return this.mfa.enrolStart(body.token);
  }

  /** Mandatory first-time 2FA: confirm a code; returns the recovery codes once and signs in. */
  @Post('mfa/enrol/confirm')
  @Public()
  @HttpCode(200)
  @ZodResponse(MfaEnrolConfirmResponseSchema)
  mfaEnrolConfirm(@Body() body: MfaEnrolConfirmDto, @Res({ passthrough: true }) res: Response) {
    return this.logins.confirmMfaEnrolment(body.token, body.code, res);
  }

  /** Sign-in second step on any host: a TOTP code or a recovery code (C-66, C-80). */
  @Post('mfa/verify')
  @Public()
  @HttpCode(200)
  @ZodResponse(MfaVerifyResponseSchema)
  mfaVerify(@Body() body: MfaVerifyDto, @Res({ passthrough: true }) res: Response) {
    const input =
      body.code !== undefined ? { code: body.code } : { recoveryCode: body.recoveryCode ?? '' };
    return this.logins.verifyMfa(body.token, input, res);
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
  async logout(
    @Body() body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const name = cookieSpecs(this.config.COOKIE_MODE).refresh.name;
    await this.sessions.logout(readCookies(req)[name], body.everywhere ?? false, res);
  }

  /** Always 202, whether or not the email has an account here (C-67). */
  @Post('password/forgot')
  @Public()
  @TenantHost()
  @HttpCode(202)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.passwords.forgot(body.email);
  }

  /** On an academy host, or on the console for the set-password link of a new admin (C-66). */
  @Post('password/reset')
  @Public()
  @AnyHost()
  @HttpCode(204)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwords.reset(body.token, body.password);
  }

  @Get('me')
  @SignedIn()
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
    if (session.audience === 'HUB') {
      const academies = await this.hub.academies(userId);
      return {
        user,
        audience: 'HUB',
        hub: { academies: academies.map(({ slug, name, roles }) => ({ slug, name, roles })) },
      };
    }
    if (session.audience === 'CONSOLE') {
      const staff = await this.sessions.platformStaff(userId);
      if (!staff) throw new DomainError('UNAUTHENTICATED', 'not platform staff');
      return { user, audience: 'CONSOLE', platform: { role: staff.platformRole } };
    }
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

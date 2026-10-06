import {
  ChangePasswordRequestSchema,
  DeviceSessionListSchema,
  type DeviceSessionList,
  MfaEnrolStartResponseSchema,
  MfaSetupConfirmRequestSchema,
  ReauthRequestSchema,
  RecoveryCodesResponseSchema,
  RevokedCountSchema,
  SecurityOverviewSchema,
} from '@academybee/contracts';
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { SignedIn } from '../rbac/can.decorator.js';
import { TenantHost } from '../tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../validation/zod-dto.js';
import { SecurityService } from './security.service.js';
import { SessionService } from './session.service.js';

class ReauthDto extends createZodDto(ReauthRequestSchema) {}
class MfaSetupConfirmDto extends createZodDto(MfaSetupConfirmRequestSchema) {}
class ChangePasswordDto extends createZodDto(ChangePasswordRequestSchema) {}

/**
 * The signed-in user's account security on an academy host (G-11, C-80): `/settings/security`.
 * Every route acts on the caller's own account only; sessions are those of this academy.
 */
@Controller({ path: 'auth', version: '1' })
@TenantHost()
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly sessions: SessionService,
  ) {}

  @Get('security')
  @SignedIn()
  @ZodResponse(SecurityOverviewSchema)
  overview() {
    return this.security.overview();
  }

  @Post('mfa/setup/start')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(MfaEnrolStartResponseSchema)
  mfaSetupStart(@Body() body: ReauthDto) {
    return this.security.mfaSetupStart(body.password);
  }

  @Post('mfa/setup/confirm')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(RecoveryCodesResponseSchema)
  mfaSetupConfirm(@Body() body: MfaSetupConfirmDto) {
    return this.security.mfaSetupConfirm(body.code);
  }

  @Post('mfa/recovery-codes')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(RecoveryCodesResponseSchema)
  recoveryCodes(@Body() body: ReauthDto) {
    return this.security.regenerateRecoveryCodes(body.password);
  }

  @Post('mfa/disable')
  @SignedIn()
  @HttpCode(204)
  async mfaDisable(@Body() body: ReauthDto): Promise<void> {
    await this.security.disableMfa(body.password);
  }

  @Post('password/change')
  @SignedIn()
  @HttpCode(204)
  async changePassword(@Body() body: ChangePasswordDto): Promise<void> {
    await this.security.changePassword(body.currentPassword, body.newPassword);
  }

  @Get('sessions')
  @SignedIn()
  @ZodResponse(DeviceSessionListSchema)
  async listSessions(): Promise<DeviceSessionList> {
    const items = await this.sessions.listSessions();
    return {
      items: items.map((s) => ({
        ...s,
        signedInAt: s.signedInAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
      })),
    };
  }

  @Post('sessions/revoke-others')
  @SignedIn()
  @HttpCode(200)
  @ZodResponse(RevokedCountSchema)
  async revokeOthers() {
    return { revoked: await this.sessions.revokeOtherSessions() };
  }

  @Post('sessions/:id/revoke')
  @SignedIn()
  @HttpCode(204)
  async revoke(@Param('id') id: string): Promise<void> {
    await this.sessions.revokeSession(id);
  }
}

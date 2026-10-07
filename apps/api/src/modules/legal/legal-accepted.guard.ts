import { type CanActivate, Injectable } from '@nestjs/common';

import { DomainError } from '../../core/errors/domain-error.js';
import { LegalService } from './legal.service.js';

/**
 * Onboarding needs the current Terms, Privacy policy and DPA accepted first (ADR-034). Use with
 * `@UseGuards(LegalAcceptedGuard)` after authentication; refused with `403 FORBIDDEN` and
 * `{ path: 'legal', issue: 'acceptance_required' }` so the web can send the owner to accept.
 */
@Injectable()
export class LegalAcceptedGuard implements CanActivate {
  constructor(private readonly legal: LegalService) {}

  async canActivate(): Promise<boolean> {
    if (await this.legal.isComplete()) return true;
    throw new DomainError('FORBIDDEN', 'legal documents not accepted', [
      { path: 'legal', issue: 'acceptance_required' },
    ]);
  }
}

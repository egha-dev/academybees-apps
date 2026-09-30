import { type ErrorCode, type ErrorDetail } from '@academybee/contracts';

/**
 * Throw from services for expected failures. The filter turns it into the envelope with the
 * code's HTTP status and a catalogue message (never the developer `reason`).
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    /** For logs only — never sent to clients. */
    readonly reason?: string,
    readonly details?: ErrorDetail[],
  ) {
    super(reason ?? code);
    this.name = 'DomainError';
  }
}

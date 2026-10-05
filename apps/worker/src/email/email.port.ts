export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable per email request (the outbox event ID), so retries never send twice. */
  idempotencyKey?: string;
};

/**
 * Where rendered emails go (ADR-020): SMTP locally (Mailpit) and Resend's HTTPS API on deployed
 * environments, because Railway blocks outbound SMTP below Pro (C-79); tests capture them.
 */
export interface EmailPort {
  send(email: OutgoingEmail): Promise<void>;
}

export const EMAIL_PORT = Symbol('EMAIL_PORT');

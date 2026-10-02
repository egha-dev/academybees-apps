export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/** Where rendered emails go (ADR-020): SMTP in every environment; tests capture them. */
export interface EmailPort {
  send(email: OutgoingEmail): Promise<void>;
}

export const EMAIL_PORT = Symbol('EMAIL_PORT');

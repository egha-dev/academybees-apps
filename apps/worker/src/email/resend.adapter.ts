import { type EmailPort, type OutgoingEmail } from './email.port.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

/**
 * Resend's HTTPS API (C-79): Railway blocks outbound SMTP ports below Pro, so deployed workers send
 * over HTTPS. The outbox event ID is Resend's Idempotency-Key, so a retry after a timeout never
 * sends a second copy. Errors carry Resend's status and error name/message — never the API key or
 * the email content.
 */
export class ResendEmailAdapter implements EmailPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    const res = await this.fetchFn(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(email.idempotencyKey ? { 'idempotency-key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
      throw new Error(
        `Resend rejected the email: ${res.status} ${body.name ?? ''} ${body.message ?? ''}`.trim(),
      );
    }
  }
}

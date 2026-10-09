import { createTransport, type Transporter } from 'nodemailer';

import type { EmailPort, OutgoingEmail } from './email.port.js';

/** SMTP delivery (Mailpit locally; the provider's SMTP endpoint on staging, A6). */
export class SmtpEmailAdapter implements EmailPort {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(url);
  }

  async send({ idempotencyKey: _key, ...email }: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
  }

  close(): void {
    this.transport.close();
  }
}

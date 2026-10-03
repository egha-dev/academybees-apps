import { expect } from '@playwright/test';

const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

type Summary = { ID: string; Subject: string };

/**
 * The newest email to `to` from Mailpit (C-04), waiting for the worker to deliver it. Returns its
 * subject, text and the first link in the text.
 */
export async function waitForEmail(
  to: string,
  subject: RegExp,
): Promise<{ subject: string; text: string; link: string }> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as { messages: Summary[] };
        found = body.messages.find((m) => subject.test(m.Subject));
        return Boolean(found);
      },
      { timeout: 20_000, message: `an email to ${to} matching ${subject}` },
    )
    .toBe(true);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as {
    Subject: string;
    Text: string;
  };
  const link = /https?:\/\/\S+/.exec(message.Text)?.[0] ?? '';
  return { subject: message.Subject, text: message.Text, link };
}

import { describe, expect, it, vi } from 'vitest';

import { ResendEmailAdapter } from './resend.adapter.js';

const email = {
  to: 'hello+a-owner@academybees.com',
  subject: 'Your account is ready',
  html: '<p>hi</p>',
  text: 'hi',
  idempotencyKey: 'email-0199',
};

describe('ResendEmailAdapter (C-79)', () => {
  it('posts to the HTTPS API with the key, sender and idempotency key', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('{"id":"x"}', { status: 200 })));
    await new ResendEmailAdapter('re_test_key', 'AcademyBee <no-reply@mail.test>', fetchFn).send(
      email,
    );
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer re_test_key',
      'idempotency-key': 'email-0199',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'AcademyBee <no-reply@mail.test>',
      to: ['hello+a-owner@academybees.com'],
      subject: 'Your account is ready',
      html: '<p>hi</p>',
      text: 'hi',
    });
  });

  it('throws on a rejection with Resend’s reason but never the key or the content', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response('{"name":"validation_error","message":"domain not verified"}', {
          status: 403,
        }),
      ),
    );
    const error = await new ResendEmailAdapter('re_secret_key', 'x <a@b.c>', fetchFn)
      .send(email)
      .then(
        () => new Error('expected a rejection'),
        (e: unknown) => e as Error,
      );
    expect(error.message).toBe(
      'Resend rejected the email: 403 validation_error domain not verified',
    );
    expect(error.message).not.toContain('re_secret_key');
    expect(error.message).not.toContain('<p>hi</p>');
  });
});

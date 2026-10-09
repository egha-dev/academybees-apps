import { encryptSecret, generateMasterKey, loadMasterKeys } from '@academybee/auth';
import { describe, expect, it } from 'vitest';

import type { WorkerConfig } from '../config/config.js';
import type { DomainEventsWorker } from '../events/domain-events.worker.js';
import { EmailHandler } from './email.handler.js';
import type { EmailPort, OutgoingEmail } from './email.port.js';

const masterKey = generateMasterKey();
const config = {
  SECRETS_MASTER_KEY: masterKey,
  PLATFORM_ROOT_DOMAIN: 'localhost',
  WEB_PUBLIC_PROTOCOL: 'http',
  WEB_PUBLIC_PORT: 3000,
} as WorkerConfig;

const setup = () => {
  const sent: OutgoingEmail[] = [];
  const port: EmailPort = { send: (e) => Promise.resolve(void sent.push(e)) };
  const handler = new EmailHandler({} as DomainEventsWorker, port, config);
  return { sent, handler };
};

const request = (host: object, token = 'tok/en+1') => ({
  template: 'password_reset',
  to: 'owner@example.test',
  host,
  vars: {},
  link: { path: '/reset/{token}', sealedToken: encryptSecret(token, loadMasterKeys(masterKey)) },
});

describe('EmailHandler', () => {
  it('opens the sealed token only into the link, on the right host', async () => {
    const { sent, handler } = setup();
    await handler.handle(request({ kind: 'academy', slug: 'demo-a' }));
    await handler.handle(request({ kind: 'hub' }));
    await handler.handle(request({ kind: 'console' }));
    expect(sent.map((e) => e.text.match(/http:\/\/\S+/)?.[0])).toEqual([
      'http://demo-a.localhost:3000/reset/tok%2Fen%2B1',
      'http://app.localhost:3000/reset/tok%2Fen%2B1',
      'http://console.localhost:3000/reset/tok%2Fen%2B1',
    ]);
    expect(sent[0]!.to).toBe('owner@example.test');
  });

  it('drops malformed requests without sending', async () => {
    const { sent, handler } = setup();
    await handler.handle({ template: 'nope', to: 'x' });
    await handler.handle({ ...request({ kind: 'academy', slug: 'demo-a' }), to: 'not-an-email' });
    expect(sent).toHaveLength(0);
  });

  it('fails (so the job retries) when the token cannot be opened', async () => {
    const { handler } = setup();
    const other = encryptSecret('x', loadMasterKeys(generateMasterKey()));
    await expect(
      handler.handle({
        ...request({ kind: 'hub' }),
        link: { path: '/r/{token}', sealedToken: other },
      }),
    ).rejects.toThrow();
  });
});

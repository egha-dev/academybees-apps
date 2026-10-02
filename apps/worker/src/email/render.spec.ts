import { describe, expect, it } from 'vitest';

import { renderEmail } from './render.js';

describe('renderEmail', () => {
  const base = {
    to: 'parent@example.test',
    locale: 'en-IN',
    host: { kind: 'academy', slug: 'demo-a' },
    vars: { inviter: 'Asha', role: 'Teacher' },
  } as const;

  it('renders an invite with the link, escaped academy name and a text part', () => {
    const email = renderEmail(
      {
        ...base,
        template: 'invite',
        academy: { displayName: '<b>Bee</b> & Co', primaryColor: null },
      },
      'http://demo-a.localhost:3000/invite/abc',
    );
    expect(email.html).toContain('http://demo-a.localhost:3000/invite/abc');
    expect(email.html).toContain('&lt;b&gt;Bee&lt;/b&gt; &amp; Co');
    expect(email.html).not.toContain('<b>Bee</b>');
    expect(email.text).toContain('http://demo-a.localhost:3000/invite/abc');
    expect(email.subject.length).toBeGreaterThan(0);
  });

  it('renders password_changed without a call to action', () => {
    const email = renderEmail({ ...base, template: 'password_changed' }, undefined);
    expect(email.html).not.toContain('<a href');
  });
});

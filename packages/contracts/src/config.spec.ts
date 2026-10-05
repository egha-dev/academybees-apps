import { describe, expect, it } from 'vitest';

import { describeConnectionUrl } from './config.js';

describe('describeConnectionUrl', () => {
  it('shows the shape with the password as a length only', () => {
    const out = describeConnectionUrl(
      'postgresql://ab_app:s3cr3t-value@postgres.railway.internal:5432/railway',
    );
    expect(out).toBe(
      'postgresql://ab_app:<12-character password>@postgres.railway.internal:5432/railway',
    );
    expect(out).not.toContain('s3cr3t');
  });

  it('points at empty parts left by unresolved references', () => {
    expect(describeConnectionUrl('postgresql://ab_app:@:5432/')).toBe(
      'postgresql://ab_app:<empty password>@<EMPTY HOST>:5432/<empty database>',
    );
    expect(describeConnectionUrl('postgresql://ab_app:pw@${{postgres.X}}:5432/db')).toContain(
      'unresolved ${{…}} reference',
    );
  });

  it('never prints an unknown user part, which may be a token', () => {
    const out = describeConnectionUrl('http://pw-secret@x');
    expect(out).toBe('http://<9-character user>@x');
    expect(out).not.toContain('pw-secret');
    expect(describeConnectionUrl('redis://:pw@redis:6379')).toBe(
      'redis://<empty user>:<2-character password>@redis:6379',
    );
  });

  it('reports whitespace, query names only, missing and empty values', () => {
    expect(describeConnectionUrl('redis://default:pw@redis:6379?family=0 ')).toContain(
      'whitespace at character',
    );
    expect(describeConnectionUrl('redis://default:pw@redis:6379?family=0&password=x')).toBe(
      'redis://default:<2-character password>@redis:6379?family=…&password=…',
    );
    expect(describeConnectionUrl(undefined)).toBe('not set');
    expect(describeConnectionUrl('  ')).toBe('empty');
  });
});

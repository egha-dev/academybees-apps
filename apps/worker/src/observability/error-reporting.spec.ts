import { describe, expect, it } from 'vitest';

import { initErrorReporting, reportError } from './error-reporting.js';

describe('error reporting', () => {
  it('stays off (and never loads the SDK) without a DSN', async () => {
    expect(await initErrorReporting({ dsn: undefined, environment: 'ci', service: 'worker' })).toBe(
      false,
    );
    expect(await initErrorReporting({ dsn: '', environment: 'ci', service: 'worker' })).toBe(false);
    expect(() => reportError(new Error('x'), { requestId: 'r1' })).not.toThrow();
  });
});

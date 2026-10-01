import { describe, expect, it } from 'vitest';

import { decodeContextHeader, encodeContextHeader } from './tenant-context';

describe('context header', () => {
  it('round-trips names in any script as an ASCII header value', () => {
    const value = encodeContextHeader({ status: 'SUSPENDED', displayName: 'ஆரவ் நடனப் பள்ளி' });
    expect(value).toMatch(/^[\x20-\x7E]+$/);
    expect(decodeContextHeader(value)).toEqual({
      status: 'SUSPENDED',
      displayName: 'ஆரவ் நடனப் பள்ளி',
    });
  });

  it('ignores missing or tampered values', () => {
    expect(decodeContextHeader(null)).toBeUndefined();
    expect(decodeContextHeader('%E0%A4%A')).toBeUndefined();
    expect(decodeContextHeader(encodeURIComponent('{"status":"ADMIN"}'))).toBeUndefined();
  });
});

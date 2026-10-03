import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/today')).toBe('/today');
    expect(safeNext('/students?x=1#a')).toBe('/students?x=1#a');
  });

  it('refuses anything that could leave the site or loop', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/today\n',
      '',
      null,
      undefined,
      '/login',
      '/login?next=/x',
      `/${'a'.repeat(600)}`,
    ])
      expect(safeNext(bad), String(bad)).toBeUndefined();
  });
});

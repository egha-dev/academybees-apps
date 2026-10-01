import { describe, expect, it } from 'vitest';

import { monogram } from './monogram';

describe('monogram', () => {
  it.each([
    ['Demo A Academy', 'DA'],
    ['Gurushethra', 'G'],
    ['  sunrise   dance ', 'SD'],
    ['ஆரவ் நடனப் பள்ளி', 'ஆந'],
    ['आरव अकादमी', 'आअ'],
  ])('%s → %s', (name, expected) => {
    expect(monogram(name)).toBe(expected);
  });
});

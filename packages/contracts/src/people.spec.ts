import { describe, expect, it } from 'vitest';

import { formatAdmissionNo } from './people.js';

describe('admission numbers (C-91)', () => {
  it('pads to four digits and keeps growing past them', () => {
    expect(formatAdmissionNo('ADM-', 1)).toBe('ADM-0001');
    expect(formatAdmissionNo('GS/', 12345)).toBe('GS/12345');
  });
});

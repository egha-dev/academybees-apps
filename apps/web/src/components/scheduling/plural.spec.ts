import { describe, expect, it } from 'vitest';

import { plural, plurals } from './plural';

describe('plural', () => {
  it('picks the branch and fills #', () => {
    expect(plural('{count, plural, =0 {none} one {# class} other {# classes}}', 3)).toBe(
      '3 classes',
    );
  });
});

describe('plurals', () => {
  const totals =
    '{sessions, plural, =0 {No classes} one {# class} other {# classes}} in {batches, plural, one {# batch} other {# batches}}; {students, plural, one {# student} other {# students}} will be told';
  it('fills several plurals in one message', () => {
    expect(plurals(totals, { sessions: 12, batches: 1, students: 30 })).toBe(
      '12 classes in 1 batch; 30 students will be told',
    );
    expect(plurals(totals, { sessions: 0, batches: 0, students: 1 })).toBe(
      'No classes in 0 batches; 1 student will be told',
    );
  });
  it('fills plain placeholders next to plurals', () => {
    expect(
      plurals('{date}: {sessions, plural, one {# class} other {# classes}}', {
        date: '1 Nov',
        sessions: 1,
      }),
    ).toBe('1 Nov: 1 class');
  });
});

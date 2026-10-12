import { describe, expect, it } from 'vitest';

import { withWords } from './words';

describe('withWords', () => {
  const words = { term: 'class', course: 'program', teacher: 'coach' };

  it('resolves the academy’s words and leaves other placeholders for the client', () => {
    expect(
      withWords(
        {
          title: 'Add {term, select, class {a class} group {a group} other {a batch}}',
          edit: 'Edit {name}',
          nested: { course: 'New {course, select, program {program} other {course}}' },
          teacher: '{teacher, select, coach {Coaches} other {Teachers}} for {name}',
        },
        words,
      ),
    ).toEqual({
      title: 'Add a class',
      edit: 'Edit {name}',
      nested: { course: 'New program' },
      teacher: 'Coaches for {name}',
    });
  });

  it('falls back to "other"', () => {
    expect(
      withWords('{term, select, class {Class} other {Batch}}', { ...words, term: 'group' }),
    ).toBe('Batch');
  });
});

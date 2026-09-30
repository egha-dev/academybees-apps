import { describe, expect, it } from 'vitest';

import { collectProblems } from './check.js';

describe('i18n:check', () => {
  it('passes the committed catalogue', async () => {
    const { EN_IN_MESSAGES } = await import('../src/catalogue.js');
    expect(collectProblems(EN_IN_MESSAGES)).toEqual([]);
  });

  it('fails on a broken ICU fixture (exit gate)', () => {
    const problems = collectProblems({
      broken: {
        plural: '{count, plural, one {# item} other {# items}',
        select: '{role, select, other}',
      },
      'bad-key': 'ok',
      empty: ' ',
    });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/broken.plural: invalid ICU/);
    expect(problems.join('\n')).toMatch(/broken.select: invalid ICU/);
    expect(problems.join('\n')).toMatch(/bad-key: invalid key name/);
    expect(problems.join('\n')).toMatch(/empty: empty message/);
  });
});

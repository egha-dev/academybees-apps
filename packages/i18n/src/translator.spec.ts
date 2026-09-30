import { describe, expect, it } from 'vitest';

import { getMessages } from './messages.js';
import { pseudoLocalize } from './pseudo.js';
import { createServerTranslator } from './translator.js';

describe('server translator', () => {
  it('formats ICU plurals', () => {
    const t = createServerTranslator('common');
    expect(t('count.students', { count: 0 })).toBe('No students');
    expect(t('count.students', { count: 1 })).toBe('1 student');
    expect(t('count.students', { count: 1250 })).toBe('1,250 students');
  });

  it('resolves error messages by code', () => {
    expect(createServerTranslator('errors')('NOT_FOUND')).toBe(
      "We couldn't find what you were looking for.",
    );
  });
});

describe('pseudo-locales', () => {
  it('accents literal text but keeps placeholders and plural syntax working', () => {
    const msg = pseudoLocalize(
      '{count, plural, one {# record} other {# records}} for {name}',
      'accent',
    );
    expect(msg).toContain('{name}');
    expect(msg).not.toMatch(/records/);
    const t = createServerTranslator('offline', 'en-XA');
    expect(t('sync.pending', { count: 3 })).toMatch(/^⟦.*3.*⟧$/);
  });

  it('makes text at least 40 % longer in en-LONG', () => {
    const en = getMessages('en-IN').shell.home.body;
    const long = getMessages('en-LONG').shell.home.body;
    expect(long.length).toBeGreaterThanOrEqual(Math.ceil(en.length * 1.4));
  });
});

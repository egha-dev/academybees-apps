import { describe, expect, it } from 'vitest';

import { PersonNameSchema, validateName } from './name.js';

describe('validateName (G-08, G-32)', () => {
  it.each([
    'ஆரவ்',
    'आरव',
    'Aarav Sharma',
    "D'Souza",
    'Anne-Marie',
    'Dr. Priya',
    'ఆరవ్',
    'আরভ',
    'ಆರವ್',
    'ആരവ്',
    'ਆਰਵ',
    'آرو',
    'José Müller',
  ])('accepts %s', (name) => {
    expect(validateName(name)).toEqual({ ok: true, value: name });
  });

  it('normalises to NFC and collapses whitespace', () => {
    const decomposed = 'José'; // J o s e + combining acute
    expect(validateName(`  ${decomposed}   Müller `)).toEqual({ ok: true, value: 'José Müller' });
  });

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['<script>', 'invalid_characters'],
    ['Aarav123', 'invalid_characters'],
    ['a@b.com', 'invalid_characters'],
    ['-Aarav', 'invalid_characters'],
    ['x'.repeat(101), 'too_long'],
  ])('rejects %j (%s)', (name, issue) => {
    expect(validateName(name)).toEqual({ ok: false, issue });
  });

  it('Zod schema returns the normalised value', () => {
    expect(PersonNameSchema.parse('  आरव  ')).toBe('आरव');
    expect(PersonNameSchema.safeParse('123').success).toBe(false);
  });
});

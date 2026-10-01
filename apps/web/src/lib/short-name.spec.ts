import { describe, expect, it } from 'vitest';

import { shortName, slugInitials } from './short-name';

describe('shortName', () => {
  it.each([
    ['Demo A', 'Demo A'],
    ['Demo A Academy', 'Demo'],
    ['Gurushethraacademyofmusic', 'Gurushethraa'],
    ['ஆரவ் நடனப் பள்ளி', 'ஆரவ்'],
  ])('%s → %s', (name, expected) => {
    expect(shortName(name)).toBe(expected);
  });
});

describe('slugInitials', () => {
  it.each([
    ['demo-a', 'DA'],
    ['gurushethra', 'G'],
    ['sunrise-dance-studio', 'SD'],
  ])('%s → %s', (slug, expected) => {
    expect(slugInitials(slug)).toBe(expected);
  });
});

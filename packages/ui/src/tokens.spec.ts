import { describe, expect, it } from 'vitest';

import { palettes, type ThemePalette } from './tokens.js';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every text/background pair the components render (C-49: ≥ 4.5:1 in both themes). */
function textPairs(p: ThemePalette): [string, string, string][] {
  const pairs: [string, string, string][] = [];
  for (const bg of ['background', 'surface', 'surfaceRaised'] as const) {
    pairs.push(
      [`textPrimary on ${bg}`, p.textPrimary, p[bg]],
      [`textSecondary on ${bg}`, p.textSecondary, p[bg]],
    );
    for (const [tone, s] of Object.entries(p.status))
      pairs.push([`${tone}.fg on ${bg}`, s.fg, p[bg]]);
  }
  pairs.push(
    ['onAccentSoft on accentSoft', p.onAccentSoft, p.accentSoft],
    ['onPrimary on primary', p.onPrimary, p.primary],
    ['onInverse on inverse', p.onInverse, p.inverse],
  );
  for (const [tone, s] of Object.entries(p.status)) {
    pairs.push(
      [`${tone}.fg on its surface`, s.fg, s.surface],
      [`${tone}.onSolid on solid`, s.onSolid, s.solid],
    );
  }
  return pairs;
}

describe.each(['light', 'dark'] as const)('%s palette (C-49)', (name) => {
  const p = palettes[name];

  it.each(textPairs(p))('%s ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('control boundaries and focus rings are ≥ 3:1 against surfaces (WCAG 1.4.11)', () => {
    for (const bg of [p.background, p.surface]) {
      expect(contrast(p.borderStrong, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.focus, bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('dark palette brand rules', () => {
  it('uses warm charcoal, never pure black, and keeps Bee Gold as the accent', () => {
    expect(palettes.dark.background).not.toBe('#000000');
    const [r, , b] = [1, 3, 5].map((i) =>
      parseInt(palettes.dark.background.slice(i, i + 2), 16),
    ) as [number, number, number];
    expect(r).toBeGreaterThan(b); // warm: more red than blue
    expect(palettes.dark.accent).toBe(palettes.light.accent);
  });
});

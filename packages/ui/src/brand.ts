import { palettes } from './tokens.js';

/** WCAG relative luminance of `#RRGGBB`. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/i;

export type BrandIdentityColors = { background: string; foreground: string };

/**
 * Colours for an academy's identity tile (monogram, app icon) from its brand colour (C-49,
 * ADR-014): the brand colour as background with whichever of ink/ivory text reads at ≥ 4.5:1.
 * The tile is identity only — never status — and looks the same in light and dark themes, so the
 * text contrast is theme-independent. Returns null (use the neutral inverse tile) when there is
 * no valid colour or neither text colour reaches 4.5:1.
 */
export function brandIdentityColors(
  primaryColor: string | null | undefined,
): BrandIdentityColors | null {
  if (!primaryColor || !HEX.test(primaryColor)) return null;
  const ink = palettes.light.textPrimary;
  const ivory = palettes.light.background;
  const [onInk, onIvory] = [contrast(primaryColor, ink), contrast(primaryColor, ivory)];
  const foreground = onIvory >= onInk ? ivory : ink;
  return Math.max(onInk, onIvory) >= 4.5 ? { background: primaryColor, foreground } : null;
}

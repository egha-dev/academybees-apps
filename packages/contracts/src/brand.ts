/**
 * Brand colour rule (C-49, UX V1.2 §5), shared by the API (checked on save) and the web. The brand
 * colour tints identity surfaces only — the tile behind the academy's initials, icons — with ink
 * or ivory text on it, so it must let one of them read at WCAG AA (≥ 4.5:1). Same rule as
 * `brandIdentityColors` in @academybee/ui, which draws the tile.
 */
const INK = '#171817';
const IVORY = '#FAFAF7';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Can the academy's identity tile carry readable text in this colour? */
export function isReadableBrandColor(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  return Math.max(contrastRatio(hex, INK), contrastRatio(hex, IVORY)) >= 4.5;
}

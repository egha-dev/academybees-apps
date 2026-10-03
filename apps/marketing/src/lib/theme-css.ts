import { palettes, type ThemePalette, typography } from '@academybee/ui/tokens';

/**
 * Design tokens as CSS custom properties (C-49, C-74): the same palettes as the app, so the site
 * and the product share one light and one dark theme. Dark applies when the theme script sets
 * `data-ab-theme="dark"`, or from the device setting when scripts are off.
 */
function vars(p: ThemePalette): string {
  return [
    `--bg:${p.background}`,
    `--surface:${p.surface}`,
    `--surface-raised:${p.surfaceRaised}`,
    `--border:${p.border}`,
    `--border-strong:${p.borderStrong}`,
    `--text:${p.textPrimary}`,
    `--text-2:${p.textSecondary}`,
    `--accent:${p.accent}`,
    `--accent-soft:${p.accentSoft}`,
    `--on-accent-soft:${p.onAccentSoft}`,
    `--primary:${p.primary}`,
    `--on-primary:${p.onPrimary}`,
    `--focus:${p.focus}`,
    `--logo-outline:${p.logoOutline}`,
    `color-scheme:${p === palettes.dark ? 'dark' : 'light'}`,
  ].join(';');
}

export const THEME_CSS = [
  // @fontsource-variable/inter registers the family as "Inter Variable".
  `:root{${vars(palettes.light)};--font-inter:"Inter Variable";--font:${typography.fontFamily}}`,
  `@media (prefers-color-scheme: dark){:root:not([data-ab-theme="light"]){${vars(palettes.dark)}}}`,
  `:root[data-ab-theme="dark"]{${vars(palettes.dark)}}`,
].join('\n');

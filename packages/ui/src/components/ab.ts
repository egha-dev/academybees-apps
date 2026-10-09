import type { Theme } from '@mui/material/styles';

import type { ThemePalette } from '../tokens.js';

/**
 * Semantic palette as CSS variables (`var(--ab-palette-ab-…)`), so values switch with the
 * light/dark scheme without re-rendering. Use in sx callbacks where a palette path string
 * can't be used, e.g. `borderInlineEnd: (t) => \`1px solid ${ab(t).border}\``.
 */
export function ab(theme: Theme): ThemePalette {
  return theme.vars?.palette.ab ?? theme.palette.ab;
}

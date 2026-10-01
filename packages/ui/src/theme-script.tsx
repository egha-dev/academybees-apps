import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';

import { THEME_ATTRIBUTE, THEME_MODE_STORAGE_KEY, THEME_SCHEME_STORAGE_KEY } from './tokens.js';

/**
 * Inline script that applies the stored or device theme to <html> before first paint, so the
 * page never flashes the wrong theme (C-49). Render it as the first child of <body>, and put
 * `suppressHydrationWarning` on <html> (the attribute is set before React hydrates).
 */
export function ThemeScript() {
  return (
    <InitColorSchemeScript
      attribute={`[${THEME_ATTRIBUTE}="%s"]`}
      defaultMode="system"
      modeStorageKey={THEME_MODE_STORAGE_KEY}
      colorSchemeStorageKey={THEME_SCHEME_STORAGE_KEY}
    />
  );
}

import { createTheme, type PaletteOptions, type Theme } from '@mui/material/styles';

import {
  breakpoints,
  motion,
  palettes,
  radius,
  SPACING_UNIT,
  THEME_ATTRIBUTE,
  type ThemePalette,
  TOUCH_TARGET,
  typography,
} from './tokens.js';

declare module '@mui/material/styles' {
  interface Palette {
    /** AcademyBee semantic roles (tokens.ts); use in sx as e.g. `bgcolor: 'ab.surfaceRaised'`. */
    ab: ThemePalette;
  }
  interface PaletteOptions {
    ab?: ThemePalette;
  }
}

function schemePalette(p: ThemePalette, mode: 'light' | 'dark'): PaletteOptions {
  return {
    mode,
    ab: p,
    primary: { main: p.primary, contrastText: p.onPrimary },
    secondary: { main: p.accent, light: p.accentSoft, contrastText: '#171817' },
    // Text-bearing uses (buttons, field errors) take the AA-safe solids (C-47, C-49).
    success: {
      main: p.status.success.solid,
      light: p.status.success.fg,
      contrastText: p.status.success.onSolid,
    },
    warning: {
      main: p.status.warning.solid,
      dark: p.status.warning.fg,
      contrastText: p.status.warning.onSolid,
    },
    error: {
      main: p.status.danger.solid,
      light: p.status.danger.fg,
      contrastText: p.status.danger.onSolid,
    },
    info: {
      main: p.status.info.solid,
      light: p.status.info.fg,
      contrastText: p.status.info.onSolid,
    },
    background: { default: p.background, paper: p.surface },
    text: { primary: p.textPrimary, secondary: p.textSecondary },
    divider: p.border,
  };
}

/**
 * The MUI theme is an implementation detail of @academybee/ui (ADR-014). Light and dark colour
 * schemes (C-49) are emitted as CSS variables and selected by `data-ab-theme` on <html>, which
 * the inline ThemeScript sets before first paint.
 */
export function createAcademyBeeTheme(): Theme {
  return createTheme({
    cssVariables: { cssVarPrefix: 'ab', colorSchemeSelector: `[${THEME_ATTRIBUTE}="%s"]` },
    colorSchemes: {
      light: { palette: schemePalette(palettes.light, 'light') },
      dark: { palette: schemePalette(palettes.dark, 'dark') },
    },
    breakpoints: { values: breakpoints },
    spacing: SPACING_UNIT,
    shape: { borderRadius: radius.md },
    typography: {
      fontFamily: typography.fontFamily,
      fontSize: typography.bodySmall.size,
      h1: {
        '@media (max-width: 599.95px)': { fontSize: 30 },
        fontSize: typography.display.size,
        lineHeight: typography.display.lineHeight,
        fontWeight: typography.display.weight,
        letterSpacing: '-0.02em',
      },
      h2: {
        fontSize: typography.title.size,
        lineHeight: typography.title.lineHeight,
        fontWeight: typography.title.weight,
        letterSpacing: '-0.01em',
      },
      h3: {
        fontSize: typography.section.size,
        lineHeight: typography.section.lineHeight,
        fontWeight: typography.section.weight,
      },
      body1: { fontSize: typography.body.size, lineHeight: typography.body.lineHeight },
      body2: { fontSize: typography.bodySmall.size, lineHeight: typography.bodySmall.lineHeight },
      caption: {
        fontSize: typography.meta.size,
        lineHeight: typography.meta.lineHeight,
        fontWeight: typography.meta.weight,
      },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    transitions: {
      duration: {
        shortest: motion.fast,
        shorter: motion.fast,
        short: motion.base,
        standard: motion.base,
        complex: motion.slow,
        enteringScreen: motion.slow,
        leavingScreen: motion.base,
      },
      easing: {
        easeOut: motion.easing,
        easeInOut: motion.easing,
        easeIn: motion.easing,
        sharp: motion.easing,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          body: { WebkitFontSmoothing: 'antialiased' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          ':focus-visible': {
            outline: `2px solid ${theme.vars.palette.ab.focus}`,
            outlineOffset: 2,
          },
        }),
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: TOUCH_TARGET, borderRadius: radius.md, paddingInline: 20 },
          sizeSmall: { minHeight: 40, paddingInline: 14 },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: radius.md,
            backgroundColor: theme.vars.palette.ab.surface,
            minHeight: TOUCH_TARGET,
          }),
          notchedOutline: ({ theme }) => ({ borderColor: theme.vars.palette.ab.borderStrong }),
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: radius.lg,
            border: `1px solid ${theme.vars.palette.ab.border}`,
          }),
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: radius.lg } } },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { borderRadius: radius.sm } },
      },
    },
  });
}

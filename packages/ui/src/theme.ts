import { createTheme, type Theme } from '@mui/material/styles';

import {
  breakpoints,
  color,
  motion,
  radius,
  SPACING_UNIT,
  TOUCH_TARGET,
  typography,
} from './tokens.js';

/**
 * The MUI theme is an implementation detail of @academybee/ui (ADR-014): every value comes
 * from tokens.ts; CSS variables are emitted so non-MUI CSS can use the same tokens.
 */
export function createAcademyBeeTheme(): Theme {
  return createTheme({
    cssVariables: { cssVarPrefix: 'ab' },
    breakpoints: { values: breakpoints },
    spacing: SPACING_UNIT,
    shape: { borderRadius: radius.md },
    palette: {
      mode: 'light',
      primary: { main: color.ink, contrastText: color.ivory },
      secondary: { main: color.gold, light: color.goldSoft, contrastText: color.text.onGold },
      success: { main: color.success, contrastText: color.white },
      warning: { main: color.warning, contrastText: color.ink },
      error: { main: color.danger, contrastText: color.white },
      info: { main: color.info, contrastText: color.white },
      background: { default: color.ivory, paper: color.white },
      text: { primary: color.text.primary, secondary: color.text.secondary },
      divider: color.neutral[200],
      grey: color.neutral,
    },
    typography: {
      fontFamily: typography.fontFamily,
      fontSize: typography.bodySmall.size,
      h1: {
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
        styleOverrides: {
          body: {
            backgroundColor: color.ivory,
            color: color.ink,
            WebkitFontSmoothing: 'antialiased',
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
          ':focus-visible': { outline: `2px solid ${color.info}`, outlineOffset: 2 },
        },
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
          root: { borderRadius: radius.md, backgroundColor: color.white, minHeight: TOUCH_TARGET },
          notchedOutline: { borderColor: color.neutral[300] },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: radius.lg, border: `1px solid ${color.neutral[200]}` },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: radius.lg } } },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { borderRadius: radius.sm } },
      },
    },
  });
}

/**
 * AcademyBee design tokens (UX §4–6, ARCHITECTURE §10.5). The only source of colour, type,
 * radius, spacing and motion values. Bee Gold is an accent — never a dominant background.
 * Status colours are never overridden by academy branding.
 */
export const color = {
  ivory: '#FAFAF7',
  ink: '#171817',
  gold: '#E6B94A',
  goldSoft: '#F5E7B8',
  success: '#238B63',
  warning: '#D99124',
  danger: '#D95555',
  info: '#4778C7',
  white: '#FFFFFF',
  /** Derived warm-neutral scale (from ivory to ink). */
  neutral: {
    50: '#F4F3EE',
    100: '#ECEAE3',
    200: '#DEDBD2',
    300: '#C7C3B8',
    400: '#A19D93',
    500: '#7A776F',
    600: '#5C5A54',
    700: '#44433F',
    800: '#2C2C2A',
    900: '#1F201E',
  },
  /** Text-safe (WCAG AA on ivory) variants of the status colours for small text. */
  text: {
    primary: '#171817',
    secondary: '#5C5A54',
    success: '#1D7453',
    warning: '#8A5A12',
    danger: '#B23B3B',
    info: '#3A63A6',
    onGold: '#171817',
  },
  /** Tinted status surfaces (badges, banners). */
  surface: {
    success: '#E6F3EC',
    warning: '#FBF0DC',
    danger: '#FBE7E7',
    info: '#E6EDF8',
    gold: '#F5E7B8',
  },
} as const;

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** One status colour set: text/icon, tinted surface (badges, banners), solid fill + its text. */
export type StatusRole = { fg: string; surface: string; solid: string; onSolid: string };

/**
 * Semantic colour roles (C-49). Components use roles, never raw hex, so both themes work.
 * Every text-on-background pair is ≥ 4.5:1 (WCAG AA) in both palettes — see tokens.spec.ts.
 */
export type ThemePalette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  /** Dividers and card outlines (decorative). */
  border: string;
  /** Input outlines and other control boundaries. */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  /** Bee Gold — accent only, never a dominant background. */
  accent: string;
  /** Selected / highlighted surface and the text on it. */
  accentSoft: string;
  onAccentSoft: string;
  /** Primary button fill and its text. */
  primary: string;
  onPrimary: string;
  /** High-emphasis inverse surface (offline banner, snackbars). */
  inverse: string;
  onInverse: string;
  focus: string;
  /** Hairline around the logo's ink square where it would vanish into the background (dark only). */
  logoOutline: string;
  status: Record<StatusTone, StatusRole>;
};

export const palettes: Record<'light' | 'dark', ThemePalette> = {
  light: {
    background: '#FAFAF7',
    surface: '#FFFFFF',
    surfaceRaised: '#ECEAE3',
    border: '#DEDBD2',
    borderStrong: '#8A867C',
    textPrimary: '#171817',
    textSecondary: '#5C5A54',
    accent: '#E6B94A',
    accentSoft: '#F5E7B8',
    onAccentSoft: '#171817',
    primary: '#171817',
    onPrimary: '#FAFAF7',
    inverse: '#171817',
    onInverse: '#FAFAF7',
    focus: '#3A63A6',
    logoOutline: 'transparent',
    status: {
      success: { fg: '#1D7453', surface: '#E6F3EC', solid: '#1D7453', onSolid: '#FFFFFF' },
      warning: { fg: '#8A5A12', surface: '#FBF0DC', solid: '#D99124', onSolid: '#171817' },
      danger: { fg: '#B23B3B', surface: '#FBE7E7', solid: '#B23B3B', onSolid: '#FFFFFF' },
      info: { fg: '#3A63A6', surface: '#E6EDF8', solid: '#3A63A6', onSolid: '#FFFFFF' },
      neutral: { fg: '#5C5A54', surface: '#ECEAE3', solid: '#5C5A54', onSolid: '#FFFFFF' },
    },
  },
  // Deep warm charcoal, never pure black; ivory text; Bee Gold stays the accent (C-49).
  dark: {
    background: '#191816',
    surface: '#22211E',
    surfaceRaised: '#2B2A26',
    border: '#3A3833',
    borderStrong: '#8C877C',
    textPrimary: '#F3F1EA',
    textSecondary: '#B8B3A7',
    accent: '#E6B94A',
    accentSoft: '#3A3222',
    onAccentSoft: '#EBC664',
    primary: '#F3F1EA',
    onPrimary: '#171817',
    inverse: '#F3F1EA',
    onInverse: '#171817',
    focus: '#86AEEE',
    logoOutline: '#4A4741',
    status: {
      success: { fg: '#5BC796', surface: '#163126', solid: '#4DB585', onSolid: '#171817' },
      warning: { fg: '#E9AE55', surface: '#33281A', solid: '#E9AE55', onSolid: '#171817' },
      danger: { fg: '#F08A84', surface: '#3A1F1E', solid: '#E0625C', onSolid: '#171817' },
      info: { fg: '#86AEEE', surface: '#1C2840', solid: '#7AA3E8', onSolid: '#171817' },
      neutral: { fg: '#B8B3A7', surface: '#302E2A', solid: '#B8B3A7', onSolid: '#171817' },
    },
  },
};

/** Theme preference storage and the <html> attribute the inline script sets (no flash, C-49). */
export const THEME_ATTRIBUTE = 'data-ab-theme';
export const THEME_MODE_STORAGE_KEY = 'ab-theme-mode';
export const THEME_SCHEME_STORAGE_KEY = 'ab-theme-scheme';

/** Type scale (UX §6). Sizes in px; weights favour hierarchy over bold. */
export const typography = {
  fontFamily:
    'var(--font-inter, "Inter"), "Noto Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: { size: 36, lineHeight: 1.15, weight: 650 },
  title: { size: 26, lineHeight: 1.2, weight: 650 },
  section: { size: 19, lineHeight: 1.3, weight: 600 },
  body: { size: 15, lineHeight: 1.5, weight: 400 },
  bodySmall: { size: 14, lineHeight: 1.5, weight: 400 },
  meta: { size: 12.5, lineHeight: 1.4, weight: 500 },
  /** Indic and other complex scripts need taller lines (ADR-040). */
  scriptLineHeight: { latin: 1.5, complex: 1.7 },
} as const;

/** Radii 6 / 10 / 14 ("soft but not overly rounded"). */
export const radius = { sm: 6, md: 10, lg: 14 } as const;

/** 4-pt spacing grid: space(n) = n × 4 px. */
export const SPACING_UNIT = 4;
export const space = (n: number): number => n * SPACING_UNIT;

/** Motion 120–200 ms ease-out; disabled under prefers-reduced-motion (see theme). */
export const motion = {
  fast: 120,
  base: 160,
  slow: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** Minimum touch target (CLAUDE.md §10, UX §31). */
export const TOUCH_TARGET = 48;

export const breakpoints = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } as const;

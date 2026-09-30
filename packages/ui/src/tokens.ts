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

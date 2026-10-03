import { color } from '@academybee/ui/tokens';

/**
 * AcademyBee mark: a gold honeycomb cell on Deep Ink (same drawing as the app). In dark mode a
 * hairline keeps the ink square visible on the charcoal background (C-49).
 */
export function BeeMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" overflow="visible" aria-hidden>
      <rect
        width="64"
        height="64"
        rx="14"
        fill={color.ink}
        stroke="var(--logo-outline)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path d="M32 12 49.3 22v20L32 52 14.7 42V22Z" fill={color.gold} />
      <path d="M32 24.5 40.7 29.5v10L32 44.5 23.3 39.5v-10Z" fill={color.ink} />
    </svg>
  );
}

/** A small gold hexagon used as a bullet (decorative). */
export function Hex({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="hex">
      <path
        d="M14 2 24.4 8v12L14 26 3.6 20V8Z"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeWidth="2"
      />
    </svg>
  );
}

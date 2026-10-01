import { color } from '@academybee/ui/tokens';

/**
 * AcademyBee mark: a gold honeycomb cell on Deep Ink. Decorative unless given a label.
 * In dark mode a 1 px warm-grey hairline (theme role `logoOutline`) keeps the ink square from
 * vanishing into the charcoal background; in light mode the outline is transparent (C-49).
 */
export function BeeMark({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect
        width="64"
        height="64"
        rx="14"
        fill={color.ink}
        stroke="var(--ab-palette-ab-logoOutline)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path d="M32 12 49.3 22v20L32 52 14.7 42V22Z" fill={color.gold} />
      <path d="M32 24.5 40.7 29.5v10L32 44.5 23.3 39.5v-10Z" fill={color.ink} />
    </svg>
  );
}

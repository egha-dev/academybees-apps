import { color } from '@academybee/ui/tokens';

/** AcademyBee mark: a gold honeycomb cell on Deep Ink. Decorative unless given a label. */
export function BeeMark({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width="64" height="64" rx="14" fill={color.ink} />
      <path d="M32 12 49.3 22v20L32 52 14.7 42V22Z" fill={color.gold} />
      <path d="M32 24.5 40.7 29.5v10L32 44.5 23.3 39.5v-10Z" fill={color.ink} />
    </svg>
  );
}

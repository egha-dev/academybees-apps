/** PWA short_name (≤ 12 characters shows untruncated on home screens). */
export function shortName(name: string): string {
  const trimmed = name.trim();
  if (Array.from(trimmed).length <= 12) return trimmed;
  const first = trimmed.split(/\s+/u)[0] ?? trimmed;
  return Array.from(first).slice(0, 12).join('');
}

/** Initials from a slug (ASCII, so they render in generated icons without extra fonts). */
export function slugInitials(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

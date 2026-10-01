/** Up to two initials from an academy name in any script (no logo until Phase 3 uploads). */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0] ?? ''])
    .map((w) => Array.from(w ?? '')[0] ?? '')
    .join('');
  return letters.toLocaleUpperCase();
}

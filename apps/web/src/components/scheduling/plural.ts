import { fill } from '@/lib/fill';

/**
 * A catalogue plural (`{count, plural, =0 {…} one {…} other {…}}`) without an ICU runtime in the
 * browser (G-24): pick the branch with `Intl.PluralRules` and fill `#`. Other placeholders are
 * filled from `values`. Safe during server rendering (no `document`).
 */
export function plural(
  template: string,
  n: number,
  values: Record<string, string> = {},
  name = 'count',
) {
  const m = new RegExp(`\\{${name}, plural, (.*)\\}`, 's').exec(template);
  if (!m) return fill(template, { ...values, [name]: String(n) });
  const branches = new Map<string, string>();
  for (const b of m[1]!.matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g))
    branches.set(b[1]!, b[2]!);
  const lang = typeof document === 'undefined' ? 'en-IN' : document.documentElement.lang || 'en-IN';
  const pick =
    branches.get(`=${n}`) ??
    branches.get(new Intl.PluralRules(lang).select(n)) ??
    branches.get('other') ??
    '';
  return fill(template.replace(m[0], pick.replace(/#/g, String(n))), values);
}

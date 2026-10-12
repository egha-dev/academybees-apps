import { fill } from '../../lib/fill';

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

/**
 * Several catalogue plurals in one message (`{sessions, plural, …} in {batches, plural, …}`),
 * nested braces allowed; each takes its count from `values`. Other placeholders are filled too.
 */
export function plurals(template: string, values: Record<string, number | string>) {
  const lang = typeof document === 'undefined' ? 'en-IN' : document.documentElement.lang || 'en-IN';
  const rules = new Intl.PluralRules(lang);
  const close = (text: string, from: number) => {
    let depth = 1;
    let i = from;
    for (; i < text.length && depth > 0; i++)
      depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    return i; // just past the matching `}`
  };
  let out = template;
  for (let m = /\{(\w+), plural, /.exec(out); m; m = /\{(\w+), plural, /.exec(out)) {
    const start = m.index + m[0].length;
    const end = close(out, start);
    const body = out.slice(start, end - 1);
    const n = Number(values[m[1]!] ?? 0);
    const branches = new Map<string, string>();
    const head = /\s*(=\d+|zero|one|two|few|many|other)\s*\{/y;
    for (let j = 0; j < body.length;) {
      head.lastIndex = j;
      const b = head.exec(body);
      if (!b) break;
      const k = close(body, head.lastIndex);
      branches.set(b[1]!, body.slice(head.lastIndex, k - 1));
      j = k;
    }
    const pick =
      branches.get(`=${n}`) ?? branches.get(rules.select(n)) ?? branches.get('other') ?? '';
    out = out.slice(0, m.index) + pick.replace(/#/g, String(n)) + out.slice(end);
  }
  return fill(out, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
}

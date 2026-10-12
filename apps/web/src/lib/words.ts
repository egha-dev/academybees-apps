import type { Terminology } from '@academybee/contracts';

type Words = { term: string; course: string; teacher: string };
const SELECT = /\{(term|course|teacher), select, ((?:[a-z]+ \{[^{}]*\}\s*)+)\}/g;

/**
 * Apply the academy's words to catalogue messages before they reach client components (which
 * can't run ICU): only the `term`/`course`/`teacher` selects are resolved; every other
 * placeholder (`{name}`, plurals) is left for the component to fill. Works on nested objects.
 */
export function withWords<T>(messages: T, words: Words): T {
  const one = (text: string) =>
    text.replace(SELECT, (_, key: keyof Words, branches: string) => {
      const options = new Map(
        [...branches.matchAll(/([a-z]+) \{([^{}]*)\}/g)].map((m) => [m[1]!, m[2]!]),
      );
      return options.get(words[key]) ?? options.get('other') ?? '';
    });
  const walk = (value: unknown): unknown =>
    typeof value === 'string'
      ? one(value)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
        : value;
  return walk(messages) as T;
}

/** The academy's words as ICU select arguments: `{ term, course, teacher }`. */
export function wordsOf(terms: Terminology): Words {
  return { term: terms.batch, course: terms.course, teacher: terms.teacher };
}

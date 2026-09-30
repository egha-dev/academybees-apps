import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

const ACCENTS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ó',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ú',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

export type PseudoMode = 'accent' | 'long';

function transformText(text: string, mode: PseudoMode): string {
  if (mode === 'accent') return [...text].map((c) => ACCENTS[c] ?? c).join('');
  // +40 % length: pad each literal with a visible filler so layouts must cope with growth.
  const extra = Math.ceil(text.trim().length * 0.4);
  return extra > 0 ? `${text}${' ·'.repeat(Math.ceil(extra / 2))}` : text;
}

function walk(elements: MessageFormatElement[], mode: PseudoMode): MessageFormatElement[] {
  return elements.map((el) => {
    if (el.type === TYPE.literal) return { ...el, value: transformText(el.value, mode) };
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      const options = Object.fromEntries(
        Object.entries(el.options).map(([k, opt]) => [k, { ...opt, value: walk(opt.value, mode) }]),
      );
      return { ...el, options };
    }
    if (el.type === TYPE.tag) return { ...el, children: walk(el.children, mode) };
    return el;
  });
}

/**
 * Pseudo-localise one ICU message: only literal text changes; placeholders, plural/select
 * syntax and tags are preserved, so the message still formats. Accent mode wraps in ⟦ ⟧ so
 * untranslated (hard-coded) text stands out on screen.
 */
export function pseudoLocalize(message: string, mode: PseudoMode): string {
  const printed = printAST(walk(parse(message, { ignoreTag: false }), mode));
  return mode === 'accent' ? `⟦${printed}⟧` : printed;
}

/** Pseudo-localise every string in a catalogue object. */
export function pseudoCatalogue<T>(messages: T, mode: PseudoMode): T {
  if (typeof messages === 'string') return pseudoLocalize(messages, mode) as T;
  if (messages && typeof messages === 'object') {
    return Object.fromEntries(
      Object.entries(messages as Record<string, unknown>).map(([k, v]) => [
        k,
        pseudoCatalogue(v, mode),
      ]),
    ) as T;
  }
  return messages;
}

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Noto, embedded (ARCHITECTURE §12.1, C-160), so a Tamil or Devanagari name shapes correctly and
 * prints the same wherever the job runs. A file is loaded only if the document's text needs it.
 */
const SCRIPTS: { pkg: string; subset: string; range: RegExp }[] = [
  { pkg: 'noto-sans-devanagari', subset: 'devanagari', range: /[\u0900-\u097F]/ },
  { pkg: 'noto-sans-bengali', subset: 'bengali', range: /[\u0980-\u09FF]/ },
  { pkg: 'noto-sans-gurmukhi', subset: 'gurmukhi', range: /[\u0A00-\u0A7F]/ },
  { pkg: 'noto-sans-gujarati', subset: 'gujarati', range: /[\u0A80-\u0AFF]/ },
  { pkg: 'noto-sans-oriya', subset: 'oriya', range: /[\u0B00-\u0B7F]/ },
  { pkg: 'noto-sans-tamil', subset: 'tamil', range: /[\u0B80-\u0BFF]/ },
  { pkg: 'noto-sans-telugu', subset: 'telugu', range: /[\u0C00-\u0C7F]/ },
  { pkg: 'noto-sans-kannada', subset: 'kannada', range: /[\u0C80-\u0CFF]/ },
  { pkg: 'noto-sans-malayalam', subset: 'malayalam', range: /[\u0D00-\u0D7F]/ },
];
const LATIN = [
  { pkg: 'noto-sans', subset: 'latin' },
  // Holds ₹.
  { pkg: 'noto-sans', subset: 'latin-ext' },
];

const loaded = new Map<string, Promise<string>>();

function face(pkg: string, subset: string, weight: 400 | 700): Promise<string> {
  const file = `@fontsource/${pkg}/files/${pkg}-${subset}-${weight}-normal.woff2`;
  let css = loaded.get(file);
  if (!css) {
    css = readFile(require.resolve(file)).then(
      (bytes) =>
        `@font-face{font-family:'Document ${subset}';font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`,
    );
    loaded.set(file, css);
  }
  return css;
}

/** The `@font-face` rules and `font-family` list this text needs. */
export async function fontsFor(text: string): Promise<{ css: string; family: string }> {
  const needed = [...LATIN, ...SCRIPTS.filter((s) => s.range.test(text))];
  const faces = await Promise.all(
    needed.flatMap(({ pkg, subset }) => [face(pkg, subset, 400), face(pkg, subset, 700)]),
  );
  return {
    css: faces.join(''),
    family: `${needed.map((n) => `'Document ${n.subset}'`).join(',')},sans-serif`,
  };
}

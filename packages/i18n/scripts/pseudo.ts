// pnpm i18n:pseudo — write messages/en-XA and messages/en-LONG (git-ignored) for inspection
// and external tools. The web and API derive the same catalogues in memory at runtime.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { EN_IN_MESSAGES, NAMESPACE_FILES, type Namespace } from '../src/catalogue.js';
import { pseudoCatalogue } from '../src/pseudo.js';

for (const [locale, mode] of [
  ['en-XA', 'accent'],
  ['en-LONG', 'long'],
] as const) {
  const dir = path.resolve(import.meta.dirname, '../messages', locale);
  mkdirSync(dir, { recursive: true });
  for (const ns of Object.keys(NAMESPACE_FILES) as Namespace[]) {
    const out = pseudoCatalogue(EN_IN_MESSAGES[ns], mode);
    writeFileSync(path.join(dir, NAMESPACE_FILES[ns]), `${JSON.stringify(out, null, 2)}\n`);
  }
  console.warn(`wrote ${dir}`);
}

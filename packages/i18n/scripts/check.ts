// pnpm i18n:check — every catalogue message is valid ICU, keys are well-formed, and the
// pseudo-locales still parse. Also reports keys not referenced anywhere in app code (warning).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { parse } from '@formatjs/icu-messageformat-parser';

import { EN_IN_MESSAGES } from '../src/catalogue.js';
import { pseudoCatalogue } from '../src/pseudo.js';

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

export function collectProblems(messages: unknown, prefix = ''): string[] {
  const problems: string[] = [];
  if (typeof messages === 'string') {
    if (messages.trim() === '') problems.push(`${prefix}: empty message`);
    try {
      parse(messages);
    } catch (error) {
      problems.push(`${prefix}: invalid ICU — ${(error as Error).message}`);
    }
    return problems;
  }
  if (!messages || typeof messages !== 'object') return [`${prefix}: not a string or object`];
  for (const [key, value] of Object.entries(messages)) {
    if (!KEY.test(key)) problems.push(`${prefix}${key}: invalid key name`);
    problems.push(...collectProblems(value, prefix ? `${prefix}.${key}` : key));
  }
  return problems;
}

function leafKeys(messages: unknown, prefix = ''): string[] {
  if (typeof messages === 'string') return [prefix];
  return Object.entries(messages as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.next', 'coverage', 'generated', 'messages'].includes(name))
      continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function main(): void {
  const problems = [
    ...collectProblems(EN_IN_MESSAGES),
    ...collectProblems(pseudoCatalogue(EN_IN_MESSAGES, 'accent')).map((p) => `en-XA ${p}`),
    ...collectProblems(pseudoCatalogue(EN_IN_MESSAGES, 'long')).map((p) => `en-LONG ${p}`),
  ];

  const root = path.resolve(import.meta.dirname, '../../..');
  const code = ['apps', 'packages']
    .flatMap((d) => sourceFiles(path.join(root, d)))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  // Error messages are looked up dynamically by ErrorCode; every code is used.
  const unused = leafKeys(EN_IN_MESSAGES)
    .filter((k) => !k.startsWith('errors.'))
    .filter((k) => {
      const tail = k.split('.').slice(1).join('.');
      return !code.includes(`'${tail}'`) && !code.includes(`"${tail}"`) && !code.includes(`'${k}'`);
    });

  for (const u of unused) console.warn(`warning: unused key ${u}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`error: ${p}`);
    process.exit(1);
  }
  console.warn(
    `i18n:check OK — ${leafKeys(EN_IN_MESSAGES).length} messages, ${unused.length} unused`,
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();

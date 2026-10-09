import type { ErrorCode } from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';

// User-facing error text comes from the `errors` catalogue namespace (G-32), keyed by code.
// Phase L resolves the request locale; until then everything is en-IN.
const t = createServerTranslator('errors');

export function errorMessage(code: ErrorCode): string {
  return t(code);
}

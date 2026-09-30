import { createTranslator } from 'use-intl/core';

import { type Namespace } from './catalogue.js';
import { type AppLocale, DEFAULT_LOCALE, DEFAULT_TIME_ZONE, intlLocale } from './locale.js';
import { getMessages } from './messages.js';

/**
 * Server-side translator for the API and worker (errors, emails, notifications, PDFs), with
 * the same ICU semantics as the web (next-intl uses use-intl).
 */
export function createServerTranslator<N extends Namespace>(
  namespace: N,
  locale: AppLocale = DEFAULT_LOCALE,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  return createTranslator({
    locale: intlLocale(locale),
    messages: getMessages(locale),
    namespace,
    timeZone,
  });
}

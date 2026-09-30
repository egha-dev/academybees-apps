import { EN_IN_MESSAGES, type Messages } from './catalogue.js';
import { type AppLocale, DEFAULT_LOCALE } from './locale.js';
import { pseudoCatalogue } from './pseudo.js';

const cache = new Map<AppLocale, Messages>();

/** Catalogue for a locale; pseudo-locales are derived from en-IN on first use. */
export function getMessages(locale: AppLocale = DEFAULT_LOCALE): Messages {
  if (locale === 'en-IN') return EN_IN_MESSAGES;
  let messages = cache.get(locale);
  if (!messages) {
    messages = pseudoCatalogue(EN_IN_MESSAGES, locale === 'en-XA' ? 'accent' : 'long');
    cache.set(locale, messages);
  }
  return messages;
}

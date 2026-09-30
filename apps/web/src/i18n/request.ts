import { DEFAULT_TIME_ZONE, getMessages, intlLocale, isPseudoLocale } from '@academybee/i18n';
import { getRequestConfig } from 'next-intl/server';

/**
 * English-only launch (G-32, ADR-040): every request uses en-IN. CI builds set
 * NEXT_PUBLIC_LOCALE_OVERRIDE=en-XA (accented) or en-LONG (+40 %) to catch hard-coded strings
 * and layouts that break when text grows.
 */
export default getRequestConfig(() => {
  const override = process.env.NEXT_PUBLIC_LOCALE_OVERRIDE;
  const appLocale = isPseudoLocale(override) ? override : 'en-IN';
  return Promise.resolve({
    locale: intlLocale(appLocale),
    messages: getMessages(appLocale),
    timeZone: DEFAULT_TIME_ZONE,
  });
});

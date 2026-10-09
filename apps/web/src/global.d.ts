import type { Messages } from '@academybee/i18n';

// Typed message keys: a missing key is a type error (next-intl AppConfig).
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en-IN';
    Messages: Messages;
  }
}

import 'server-only';

import { getTranslations } from 'next-intl/server';

import { loginLabels } from '@/components/auth/labels.server';

import { type ConsoleSignInLabels } from './console-sign-in';

export async function consoleSignInLabels(): Promise<ConsoleSignInLabels> {
  const [t, login] = await Promise.all([getTranslations('auth.console'), loginLabels()]);
  return {
    login,
    enrol: {
      title: t('enrol.title'),
      body: t('enrol.body'),
      loading: t('enrol.loading'),
      qrAlt: t('enrol.qrAlt'),
      manualKey: t('enrol.manualKey'),
      submit: t('enrol.submit'),
    },
    codes: {
      title: t('codes.title'),
      body: t('codes.body'),
      listLabel: t('codes.listLabel'),
      copy: t('codes.copy'),
      copied: t('codes.copied'),
      done: t('codes.done'),
    },
    verify: {
      title: t('verify.title'),
      body: t('verify.body'),
      submit: t('verify.submit'),
      useRecovery: t('verify.useRecovery'),
      useCode: t('verify.useCode'),
      recoveryBody: t('verify.recoveryBody'),
    },
    fields: { code: t('fields.code'), recoveryCode: t('fields.recoveryCode') },
    errors: { wrongCode: t('errors.wrongCode'), expired: t('errors.expired') },
  };
}

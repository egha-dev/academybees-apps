import 'server-only';

import { getTranslations } from 'next-intl/server';

import { type ErrorLabels, type FieldLabels } from './labels';

export async function authLabels(): Promise<{
  t: Awaited<ReturnType<typeof getTranslations<'auth'>>>;
  fields: FieldLabels & {
    identifier: string;
    email: string;
    passwordLabel: string;
    newPassword: string;
    confirmPassword: string;
    name: string;
  };
  errors: ErrorLabels;
}> {
  const t = await getTranslations('auth');
  return {
    t,
    fields: {
      identifier: t('fields.identifier'),
      email: t('fields.email'),
      passwordLabel: t('fields.password'),
      newPassword: t('fields.newPassword'),
      confirmPassword: t('fields.confirmPassword'),
      name: t('fields.name'),
      required: t('fields.required'),
      emailInvalid: t('fields.emailInvalid'),
      passwordHint: t('fields.passwordHint'),
      mismatch: t('fields.mismatch'),
      password: {
        show: t('fields.showPassword'),
        hide: t('fields.hidePassword'),
        capsLock: t('fields.capsLock'),
      },
      problems: {
        too_short: t('passwordProblems.too_short'),
        too_long: t('passwordProblems.too_long'),
        too_common: t('passwordProblems.too_common'),
        contains_identifier: t('passwordProblems.contains_identifier'),
      },
    },
    errors: {
      invalidCredentials: t('errors.invalidCredentials'),
      rateLimited: t('errors.rateLimited'),
      familyHub: t('errors.familyHub'),
      offline: t('errors.offline'),
      network: t('errors.network'),
      generic: t('errors.generic'),
    },
  };
}

export async function loginLabels() {
  const { t, fields, errors } = await authLabels();
  return { fields, errors, submit: t('login.submit'), forgot: t('login.forgot') };
}

export async function forgotLabels(academy: string) {
  const { t, fields, errors } = await authLabels();
  return {
    fields,
    errors,
    submit: t('forgot.submit'),
    sentTitle: t('forgot.sentTitle'),
    sentBody: t('forgot.sentBody', { academy }),
    backToLogin: t('forgot.backToLogin'),
  };
}

export async function resetLabels() {
  const { t, fields, errors } = await authLabels();
  return {
    fields,
    errors,
    submit: t('reset.submit'),
    doneTitle: t('reset.doneTitle'),
    doneBody: t('reset.doneBody'),
    signIn: t('reset.signIn'),
    invalidTitle: t('reset.invalidTitle'),
    invalidBody: t('reset.invalidBody'),
    requestNew: t('reset.requestNew'),
  };
}

export async function inviteLabels(academy: string) {
  const { t, fields, errors } = await authLabels();
  return {
    fields,
    errors,
    newAccountBody: t('invite.newAccountBody'),
    createPassword: t('invite.createPassword'),
    submitNew: t('invite.submitNew'),
    existingBody: t('invite.existingBody', { academy }),
    existingPassword: t('invite.existingPassword'),
    submitExisting: t('invite.submitExisting', { academy }),
    forgot: t('login.forgot'),
    invalid: t('invite.invalidBody', { academy }),
    alreadyMember: t('invite.alreadyMember', { academy }),
  };
}

/** `unsynced` pluralises the logout-guard text (0 until the Teacher PWA queue, Phase 6). */
export async function signOutLabels(unsynced = 0) {
  const [t, offline] = await Promise.all([getTranslations('auth'), getTranslations('offline')]);
  return {
    signOut: t('home.signOut'),
    guard: {
      title: offline('logoutGuard.title'),
      body: offline('logoutGuard.body', { count: unsynced }),
      stay: offline('logoutGuard.stay'),
      signOut: offline('logoutGuard.signOut'),
    },
  };
}

export async function sessionGuardLabels() {
  const [{ t }, login, signOut] = await Promise.all([authLabels(), loginLabels(), signOutLabels()]);
  return {
    login: { ...login, submit: t('session.submit') },
    signOut,
    title: t('session.expiredTitle'),
    body: t('session.expiredBody'),
    signOutInstead: t('session.signOutInstead'),
    restoring: t('session.restoring'),
  };
}

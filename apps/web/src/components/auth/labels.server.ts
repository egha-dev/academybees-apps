import 'server-only';

import { getTranslations } from 'next-intl/server';

import { type ErrorLabels, type FieldLabels } from './labels';
import type { MfaLabels } from './mfa-steps';

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
      offline: t('errors.offline'),
      network: t('errors.network'),
      generic: t('errors.generic'),
    },
  };
}

/** The 2FA sign-in steps (C-66, C-80); `academy` adds why enrolment is needed there. */
export async function mfaLabels(academy?: string): Promise<MfaLabels> {
  const [{ fields, errors }, m] = await Promise.all([authLabels(), getTranslations('auth.mfa')]);
  return {
    loading: m('loading'),
    enrol: {
      title: m('enrol.title'),
      body: m('enrol.body'),
      loading: m('enrol.loading'),
      qrAlt: m('enrol.qrAlt'),
      manualKey: m('enrol.manualKey'),
      submit: m('enrol.submit'),
      ...(academy ? { requiredNotice: m('enrol.requiredNotice', { academy }) } : {}),
    },
    codes: {
      title: m('codes.title'),
      body: m('codes.body'),
      listLabel: m('codes.listLabel'),
      copy: m('codes.copy'),
      copied: m('codes.copied'),
      done: m('codes.done'),
    },
    verify: {
      title: m('verify.title'),
      body: m('verify.body'),
      submit: m('verify.submit'),
      useRecovery: m('verify.useRecovery'),
      useCode: m('verify.useCode'),
      recoveryBody: m('verify.recoveryBody'),
    },
    fields: {
      code: m('fields.code'),
      recoveryCode: m('fields.recoveryCode'),
      required: fields.required,
    },
    errors: {
      ...errors,
      wrongCode: m('errors.wrongCode'),
      expired: m('errors.expired'),
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
  const [{ t, fields, errors }, mfa] = await Promise.all([authLabels(), mfaLabels(academy)]);
  return {
    mfa,
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

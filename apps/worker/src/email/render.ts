import type { EmailRequestSchema } from '@academybee/contracts';
import { createServerTranslator } from '@academybee/i18n';
import type { z } from 'zod';

import type { OutgoingEmail } from './email.port.js';

type Request = z.infer<typeof EmailRequestSchema>;

const KEYS = {
  invite: { ns: 'invite', lines: ['body', 'expiry'], cta: true },
  owner_invite: { ns: 'ownerInvite', lines: ['body', 'next', 'expiry'], cta: true },
  password_reset: { ns: 'passwordReset', lines: ['body', 'expiry'], cta: true },
  password_changed: { ns: 'passwordChanged', lines: ['body', 'notYou'], cta: false },
  platform_admin_invite: { ns: 'platformAdminInvite', lines: ['body', 'expiry'], cta: true },
  account_setup: { ns: 'accountSetup', lines: ['body', 'expiry'], cta: true },
  new_device: { ns: 'newDevice', lines: ['body', 'notYou'], cta: false },
  mfa_disabled: { ns: 'mfaDisabled', lines: ['body', 'notYou'], cta: false },
  parent_invite: { ns: 'parentInvite', lines: ['body', 'next', 'expiry'], cta: true },
  link_code: { ns: 'linkCode', lines: ['body', 'code', 'expiry', 'notYou'], cta: false },
} as const;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Render an email from the i18n catalogue (G-32: no hard-coded text). Simple, inline-styled HTML
 * that every client shows; always light (C-49); the academy's colour only on the header rule, and
 * only when it is a valid `#RRGGBB`. Every variable is HTML-escaped.
 */
export function renderEmail(request: Request, url: string | undefined): OutgoingEmail {
  const t = createServerTranslator('email');
  const keys = KEYS[request.template];
  const academy = request.academy?.displayName ?? t('brand');
  const vars = { ...request.vars, academy };
  const line = (key: string) => t(`${keys.ns}.${key}` as never, vars as never);
  const accent = request.academy?.primaryColor ?? '#E6B94A';
  const subject = line('subject');
  const body = keys.lines.map(line);
  const cta = keys.cta && url ? line('cta') : undefined;

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#FAFAF7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#171817">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DEDBD2;border-radius:12px">
<tr><td style="border-top:4px solid ${accent};border-radius:12px 12px 0 0;padding:24px 28px 0;font-size:14px;color:#5C5A54">${escapeHtml(academy)}</td></tr>
<tr><td style="padding:12px 28px 0"><h1 style="margin:0;font-size:22px;line-height:1.3">${escapeHtml(line('heading'))}</h1></td></tr>
${body.map((p) => `<tr><td style="padding:12px 28px 0;font-size:16px;line-height:1.5">${escapeHtml(p)}</td></tr>`).join('\n')}
${
  cta && url
    ? `<tr><td style="padding:24px 28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#171817;color:#FAFAF7;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:10px">${escapeHtml(cta)}</a></td></tr>
<tr><td style="padding:16px 28px 0;font-size:13px;color:#5C5A54">${escapeHtml(t('linkFallback'))}<br><span style="word-break:break-all">${escapeHtml(url)}</span></td></tr>`
    : ''
}
<tr><td style="padding:24px 28px 28px;font-size:12px;color:#5C5A54">${escapeHtml(t('sentFor', { academy }))} ${escapeHtml(t('ignore'))}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    line('heading'),
    '',
    ...body,
    ...(cta && url ? ['', `${cta}: ${url}`] : []),
    '',
    `${t('sentFor', { academy })} ${t('ignore')}`,
  ].join('\n');

  return { to: request.to, subject, html, text };
}

import { InvitationPreviewSchema } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { InviteForm } from '@/components/auth/invite-form';
import { inviteLabels } from '@/components/auth/labels.server';
import { apiServerGet } from '@/lib/api.server';
import { academyColor, academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [{ context }, t] = await Promise.all([hostContext(), getTranslations('auth.invite')]);
  return {
    title: t('metaTitle', { academy: academyName(context) ?? '' }),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

const ROLE_KEYS = ['owner', 'admin', 'teacher', 'accountant', 'receptionist'] as const;

/** Accept a staff invitation (C-67): the link opens on the academy's own subdomain. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ context }, { token }, t, locale] = await Promise.all([
    hostContext(),
    params,
    getTranslations('auth'),
    getLocale(),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const frame = { academy, primaryColor: academyColor(context) };

  const res = /^[A-Za-z0-9_-]{16,128}$/.test(token)
    ? await apiServerGet(`/invitations/${encodeURIComponent(token)}`)
    : undefined;
  if (!res?.ok) {
    if (res && res.status !== 404 && res.status !== 429) throw new Error(`invite ${res.status}`);
    return (
      <AuthFrame
        {...frame}
        title={t('invite.invalidTitle')}
        body={res?.status === 429 ? t('errors.rateLimited') : t('invite.invalidBody', { academy })}
      >
        <Button href="/login" variant="secondary" fullWidth>
          {t('reset.signIn')}
        </Button>
      </AuthFrame>
    );
  }
  const invitation = InvitationPreviewSchema.parse(await res.json());
  const roles = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    invitation.roles
      .filter((r): r is (typeof ROLE_KEYS)[number] => (ROLE_KEYS as readonly string[]).includes(r))
      .map((r) => t(`roles.${r}`)),
  );
  return (
    <AuthFrame
      {...frame}
      title={t('invite.title', { academy })}
      body={t('invite.body', { academy, roles })}
    >
      {invitation.email && <Text>{t('invite.for', { email: invitation.email })}</Text>}
      <InviteForm
        token={token}
        accountExists={invitation.accountExists}
        labels={await inviteLabels(academy)}
      />
    </AuthFrame>
  );
}

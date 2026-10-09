import { Button } from '@academybee/ui/components/actions';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { AuthFrame } from '@/components/auth/auth-frame';
import { FragmentTokenGate } from '@/components/auth/fragment-token';
import { InviteFlow } from '@/components/auth/invite-flow';
import { inviteLabels } from '@/components/auth/labels.server';
import { academyColor, academyLogo, academyName, hostContext } from '@/lib/host-context.server';

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

/**
 * Accept a staff invitation (C-67): the link opens on the academy's own subdomain, with the token
 * in the fragment (`/invite#token=…`) so no server ever sees it (C-83).
 */
export default async function InvitePage() {
  const [{ context }, t, locale] = await Promise.all([
    hostContext(),
    getTranslations('auth'),
    getLocale(),
  ]);
  const academy = academyName(context);
  if (!academy) notFound();
  const frame = { academy, primaryColor: academyColor(context), logoUrl: academyLogo(context) };
  return (
    <FragmentTokenGate
      pending={
        <AuthFrame {...frame} title={t('invite.title', { academy })}>
          <Stack role="status">
            <Text tone="secondary">{t('invite.loading')}</Text>
          </Stack>
        </AuthFrame>
      }
      valid={
        <AuthFrame {...frame} title={t('invite.title', { academy })}>
          <InviteFlow
            labels={{
              locale,
              loading: t('invite.loading'),
              summary: t.raw('invite.body') as string,
              for: t.raw('invite.for') as string,
              roleNames: Object.fromEntries(ROLE_KEYS.map((r) => [r, t(`roles.${r}`)])),
              rateLimited: t('errors.rateLimited'),
              generic: t('errors.generic'),
              form: await inviteLabels(academy),
            }}
          />
        </AuthFrame>
      }
      invalid={
        <AuthFrame
          {...frame}
          title={t('invite.invalidTitle')}
          body={t('invite.invalidBody', { academy })}
        >
          <Button href="/login" variant="secondary" fullWidth>
            {t('reset.signIn')}
          </Button>
        </AuthFrame>
      }
    />
  );
}

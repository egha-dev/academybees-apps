// Part of the Teacher PWA's lazy chunk.
import { Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { fill } from '@/lib/fill';

import { useTeach } from '../teach-app';

/**
 * More (UX §14, §25): who is signed in, Sync, Security, a switch to Manage for owners who
 * teach, and sign-out — which asks first while records haven't synced (ARCHITECTURE §11.6).
 */
export function MoreView() {
  const { labels, name, userId } = useTeach();
  const t = labels.teach.more;
  return (
    <Stack spacing={4}>
      <Text variant="title" as="h1">
        {t.title}
      </Text>
      <Text tone="secondary">{fill(t.signedInAs, { name })}</Text>
      <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
        <PlainButton variant="secondary" href="/teach/sync">
          {t.sync}
        </PlainButton>
        <PlainButton variant="ghost" href="/settings/security">
          {t.security}
        </PlainButton>
        {labels.switchHref && (
          <PlainButton variant="ghost" href={labels.switchHref}>
            {t.switch}
          </PlainButton>
        )}
      </Stack>
      <SignOutButton labels={labels.signOut} userId={userId} />
    </Stack>
  );
}

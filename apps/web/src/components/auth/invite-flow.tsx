'use client';

import type { InvitationPreview } from '@academybee/contracts';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

import { useFragmentToken } from './fragment-token';
import { InviteForm, type InviteFormLabels } from './invite-form';

export type InviteFlowLabels = {
  locale: string;
  loading: string;
  /** `You've been invited to join {academy} as {roles}.` — placeholders filled here. */
  summary: string;
  /** `Invitation for {email}`. */
  for: string;
  roleNames: Record<string, string>;
  rateLimited: string;
  generic: string;
  form: InviteFormLabels;
};

/**
 * The invitation behind the link (C-67): read in the browser with the token from the fragment
 * (C-83), then the accept form. An unknown, used or expired link shows the invalid screen.
 */
export function InviteFlow({ labels }: { labels: InviteFlowLabels }) {
  const { token, invalidate } = useFragmentToken();
  const [preview, setPreview] = useState<InvitationPreview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api<InvitationPreview>('/invitations/preview', {
      method: 'POST',
      body: { token },
      anonymous: true,
    }).then((res) => {
      if (res.ok) setPreview(res.data);
      else if (res.error.code === 'NOT_FOUND') invalidate();
      else setError(res.error.code === 'RATE_LIMITED' ? labels.rateLimited : labels.generic);
    });
    // Once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!preview)
    return (
      <Stack role="status">
        <Text tone="secondary">{labels.loading}</Text>
      </Stack>
    );
  const roles = new Intl.ListFormat(labels.locale, { type: 'conjunction' }).format(
    preview.roles.flatMap((r) => (labels.roleNames[r] ? [labels.roleNames[r]] : [])),
  );
  return (
    <Stack spacing={4}>
      <Text tone="secondary">
        {labels.summary.replace('{academy}', preview.academy.name).replace('{roles}', roles)}
      </Text>
      {preview.email && <Text>{labels.for.replace('{email}', preview.email)}</Text>}
      <InviteForm accountExists={preview.accountExists} labels={labels.form} />
    </Stack>
  );
}

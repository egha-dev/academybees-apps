'use client';

import type { LoginResponse } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

export type HandoffLabels = {
  working: string;
  failedTitle: string;
  failedBody: string;
  signIn: string;
};

/**
 * Exchange the one-time code from an academy sign-in for a Family Hub session (C-61). The code
 * comes in the URL fragment and is removed from the address bar before anything else happens.
 */
export function HandoffExchange({ labels }: { labels: HandoffLabels }) {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) {
      void Promise.resolve().then(() => setFailed(true));
      return;
    }
    void api<LoginResponse>('/auth/handoff', {
      method: 'POST',
      body: { code },
      anonymous: true,
    }).then((res) => {
      if (res.ok) window.location.replace(res.data.redirectTo);
      else setFailed(true);
    });
  }, []);

  if (!failed)
    return (
      <Stack role="status">
        <Text tone="secondary">{labels.working}</Text>
      </Stack>
    );
  return (
    <Stack spacing={4}>
      <InlineAlert tone="warning">
        <strong>{labels.failedTitle}</strong>
      </InlineAlert>
      <Text tone="secondary">{labels.failedBody}</Text>
      <Button href="/login" fullWidth>
        {labels.signIn}
      </Button>
    </Stack>
  );
}

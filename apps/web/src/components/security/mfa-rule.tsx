// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { securityErrorMessage, type SecurityErrorLabels } from './errors';

export type MfaRuleLabels = {
  roles: string;
  save: string;
  saved: string;
  ownMfaFirst: string;
  versionConflict: string;
  errors: SecurityErrorLabels;
};

/**
 * The academy's 2FA rule (G-11): which staff roles must use two-step sign-in. Sent with the
 * settings `version`, so two owners editing at once never overwrite each other.
 */
export function MfaRule({
  roles,
  value,
  version,
  labels,
}: {
  roles: Array<{ value: string; label: string }>;
  value: string[];
  version: number;
  labels: MfaRuleLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [chosen, setChosen] = useState<string[]>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    const res = await api('/settings/security', {
      method: 'PATCH',
      body: { version, requireMfaForRoles: chosen },
    });
    setBusy(false);
    if (res.ok) {
      toast(labels.saved);
      router.refresh();
      return;
    }
    if (res.error.details?.some((d) => d.issue === 'mfa_not_enabled'))
      return setError(labels.ownMfaFirst);
    if (res.error.code === 'VERSION_CONFLICT') return setError(labels.versionConflict);
    setError(securityErrorMessage(res.error, labels.errors));
  }

  return (
    <Stack spacing={4}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <CheckboxGroup
        legend={labels.roles}
        name="requireMfaForRoles"
        options={roles}
        value={chosen}
        onChange={setChosen}
      />
      <Stack direction="row">
        <Button onClick={() => void save()} loading={busy} disabled={!online}>
          {labels.save}
        </Button>
      </Stack>
    </Stack>
  );
}

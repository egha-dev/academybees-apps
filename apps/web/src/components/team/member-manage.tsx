'use client';

import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { Divider, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { REFRESH_AFTER, teamErrorMessage, type TeamErrorLabels } from './errors';
import type { RoleOption } from './role-options';

export type MemberManageLabels = {
  open: string;
  title: string;
  roles: string;
  rolesHint: string;
  save: string;
  saved: string;
  accessHeading: string;
  disable: string;
  enable: string;
  disableTitle: string;
  disableBody: string;
  disabled: string;
  enabled: string;
  cancel: string;
  close: string;
  required: string;
  errors: TeamErrorLabels;
};

/**
 * Change a member's roles or access (plan 2.18, C-67). Roles the viewer can't grant stay visible
 * but locked; disabling asks first and signs the member out of this academy at once. Every save
 * sends the member's `version`, so two people editing at once never overwrite each other.
 */
export function MemberManage({
  member,
  roles,
  labels,
}: {
  member: {
    id: string;
    status: 'ACTIVE' | 'DISABLED' | 'INVITED';
    version: number;
    roles: Array<{ value: string; label: string }>;
  };
  roles: RoleOption[];
  labels: MemberManageLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const roleKeys = member.roles.map((r) => r.value);
  const [chosen, setChosen] = useState<string[]>(roleKeys);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [rolesError, setRolesError] = useState<string>();
  const [busy, setBusy] = useState<'roles' | 'status'>();

  // Roles the member already has but that aren't offered (e.g. custom roles) stay visible, locked.
  const options = [
    ...roles.map((r) => ({ value: r.value, label: r.label, disabled: !r.grantable })),
    ...member.roles
      .filter((m) => !roles.some((r) => r.value === m.value))
      .map((m) => ({ ...m, disabled: true })),
  ];

  async function change(body: { roles?: string[]; status?: 'ACTIVE' | 'DISABLED' }, done: string) {
    setBusy(body.roles ? 'roles' : 'status');
    setError(undefined);
    const res = await api(`/team/members/${member.id}`, {
      method: 'PATCH',
      body: { version: member.version, ...body },
    });
    setBusy(undefined);
    setConfirming(false);
    if (!res.ok) {
      setError(teamErrorMessage(res.error, labels.errors));
      if (REFRESH_AFTER.has(res.error.code)) router.refresh();
      return;
    }
    setOpen(false);
    toast(done);
    router.refresh();
  }

  const saveRoles = () => {
    if (!chosen.length) return setRolesError(labels.required);
    setRolesError(undefined);
    void change({ roles: chosen }, labels.saved);
  };

  return (
    <>
      <Button
        variant="secondary"
        size="small"
        onClick={() => {
          setChosen(roleKeys);
          setError(undefined);
          setOpen(true);
        }}
      >
        {labels.open}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        closeLabel={labels.close}
      >
        <Stack spacing={4}>
          {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <CheckboxGroup
            legend={labels.roles}
            name="roles"
            options={options}
            value={chosen}
            onChange={setChosen}
            error={rolesError}
            helperText={labels.rolesHint}
          />
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <Button
              onClick={saveRoles}
              loading={busy === 'roles'}
              disabled={!online || Boolean(busy)}
            >
              {labels.save}
            </Button>
          </Stack>
          <Divider />
          <Stack spacing={2}>
            <Text variant="section" as="h3">
              {labels.accessHeading}
            </Text>
            {member.status === 'DISABLED' ? (
              <Button
                variant="secondary"
                onClick={() => void change({ status: 'ACTIVE' }, labels.enabled)}
                loading={busy === 'status'}
                disabled={!online || Boolean(busy)}
              >
                {labels.enable}
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => setConfirming(true)}
                disabled={!online || Boolean(busy)}
              >
                {labels.disable}
              </Button>
            )}
          </Stack>
        </Stack>
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title={labels.disableTitle}
        body={labels.disableBody}
        cancelLabel={labels.cancel}
        confirmLabel={labels.disable}
        tone="danger"
        busy={busy === 'status'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void change({ status: 'DISABLED' }, labels.disabled)}
      />
    </>
  );
}

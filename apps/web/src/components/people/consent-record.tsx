// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type PeopleErrorLabels, peopleErrorMessage } from './errors';

/**
 * Record a paper or in-person consent (G-06, C-103). It goes into the history; it never activates
 * a parent account — parents confirm in the Family Hub themselves (C-102).
 */
export function ConsentRecord({
  studentId,
  parents,
  labels,
}: {
  studentId: string;
  parents: Array<{ id: string; name: string }>;
  labels: {
    consent: Messages['people']['consent'];
    form: Messages['people']['form'];
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const c = labels.consent;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [parentId, setParentId] = useState(parents[0]?.id ?? '');
  const [action, setAction] = useState<'GRANT' | 'WITHDRAW'>('GRANT');
  const [purposes, setPurposes] = useState<string[]>(['service']);
  const [channel, setChannel] = useState<'PAPER' | 'ACADEMY_STAFF'>('PAPER');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function start() {
    setKey(crypto.randomUUID());
    setError(undefined);
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (action === 'GRANT' && !purposes.includes('service')) return setError(c.serviceRequired);
    setBusy(true);
    const res = await api(`/students/${studentId}/consents`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: { parentId, action, purposes: action === 'GRANT' ? purposes : [], channel },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    setOpen(false);
    toast(c.recorded);
    router.refresh();
  }

  return (
    <>
      <Box>
        <PlainButton onClick={start} disabled={!online}>
          {c.record}
        </PlainButton>
      </Box>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={c.title}
        closeLabel={labels.form.close}
      >
        <Stack component="form" spacing={4} onSubmit={(e: FormEvent) => void submit(e)}>
          <Text tone="secondary">{c.body}</Text>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <SelectInput
            name="parent"
            label={c.parent}
            value={parentId}
            onChange={setParentId}
            options={parents.map((p) => ({ value: p.id, label: p.name }))}
          />
          <SelectInput
            name="action"
            label={c.action}
            value={action}
            onChange={(v) => setAction(v as 'GRANT' | 'WITHDRAW')}
            options={[
              { value: 'GRANT', label: c.grant },
              { value: 'WITHDRAW', label: c.withdraw },
            ]}
          />
          {action === 'GRANT' && (
            <CheckboxGroup
              name="purposes"
              legend={c.purposes}
              value={purposes}
              onChange={setPurposes}
              options={(['service', 'photos', 'marketing'] as const).map((purpose) => ({
                value: purpose,
                label: c.purpose[purpose],
              }))}
            />
          )}
          <SelectInput
            name="channel"
            label={c.channel}
            value={channel}
            onChange={(v) => setChannel(v as 'PAPER' | 'ACADEMY_STAFF')}
            options={[
              { value: 'PAPER', label: c.channels.PAPER },
              { value: 'ACADEMY_STAFF', label: c.channels.ACADEMY_STAFF },
            ]}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {c.submit}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {labels.form.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
    </>
  );
}

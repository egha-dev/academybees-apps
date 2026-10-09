'use client';

import { type TenantStatus, type TenantTransition } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { TextField } from '@academybee/ui/components/inputs';
import { Stack } from '@academybee/ui/components/layout';
import { FormDialog } from '@academybee/ui/components/overlays';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { consoleErrorMessage } from './errors';

/** Which console actions an academy's status allows (C-87, mirrors `nextTenantStatus`). */
const ACTIONS: Record<TenantStatus, TenantTransition[]> = {
  PENDING_APPROVAL: ['archive'],
  SETUP: ['activate', 'suspend', 'archive'],
  ACTIVE: ['suspend', 'archive'],
  SUSPENDED: ['reactivate', 'archive'],
  ARCHIVED: [],
};

/**
 * Suspend, reactivate, activate, archive (C-87): each says what will happen and needs a reason
 * for the audit log. Online only. Each opened dialog has its own Idempotency-Key.
 */
export function StatusActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: TenantStatus;
}) {
  const t = useTranslations('console');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [action, setAction] = useState<TenantTransition>();
  const [key, setKey] = useState('');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const open = (a: TenantTransition) => {
    setAction(a);
    setKey(crypto.randomUUID());
    setReason('');
    setFieldError(undefined);
    setError(undefined);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action) return;
    if (reason.trim().length < 3) {
      setFieldError(t('create.errors.required'));
      return;
    }
    setBusy(true);
    const res = await api(`/platform/tenants/${id}/${action}`, {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: { reason: reason.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(consoleErrorMessage(res.error, t));
      return;
    }
    toast(t(`detail.dialog.${action}.done`, { academy: name }));
    setAction(undefined);
    router.refresh();
  }

  const actions = ACTIONS[status];
  if (!actions.length) return null;
  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        {actions.map((a) => (
          <Button
            key={a}
            variant={a === 'archive' || a === 'suspend' ? 'secondary' : 'primary'}
            onClick={() => open(a)}
            disabled={!online}
          >
            {t(`detail.actions.${a}`)}
          </Button>
        ))}
      </Stack>
      {action && (
        <FormDialog
          open
          title={t(`detail.dialog.${action}.title`, { academy: name })}
          body={t(`detail.dialog.${action}.body`)}
        >
          <form noValidate onSubmit={(e) => void submit(e)}>
            <Stack spacing={4}>
              {error && <InlineAlert tone="danger">{error}</InlineAlert>}
              <TextField
                label={t('detail.dialog.reason')}
                name="reason"
                value={reason}
                onChange={setReason}
                required
                error={fieldError}
                helperText={t('detail.dialog.reasonHint')}
              />
              <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setAction(undefined)}>
                  {t('detail.dialog.cancel')}
                </Button>
                <Button
                  type="submit"
                  variant={action === 'archive' || action === 'suspend' ? 'danger' : 'primary'}
                  loading={busy}
                >
                  {t(`detail.dialog.${action}.confirm`)}
                </Button>
              </Stack>
            </Stack>
          </form>
        </FormDialog>
      )}
    </>
  );
}

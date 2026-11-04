// Loaded lazily by finance-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type FinanceErrorLabels, financeErrorMessage } from './errors';
import { minorFromText } from './money-input';
import { StudentSearch } from './student-search';

/** A one-time charge for one student: an invoice, issued straight away (G-04). */
export function OneTimeSheet({
  today,
  labels,
}: {
  today: string;
  labels: Messages['finance']['ui']['oneTime'] &
    Pick<
      Messages['finance']['ui']['assign'],
      'search' | 'searchHint' | 'noMatch' | 'student' | 'selectNone'
    > & { close: string; cancel: string; errors: FinanceErrorLabels };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [studentId, setStudentId] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const e = labels.errors.finance;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found: Record<string, string> = {};
    if (!studentId) found.student = e.required;
    if (!label.trim()) found.label = e.required;
    const amountMinor = minorFromText(amount);
    if (!amountMinor) found.amount = e.invalidAmount;
    if (!dueDate) found.dueDate = e.required;
    setErrors(found);
    if (Object.keys(found).length) return setError(e.fixFields);
    setBusy(true);
    setError(undefined);
    const res = await api<{ id: string }>('/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        studentId,
        dueDate,
        charges: [{ label: label.trim(), amountMinor }],
        issue: true,
      },
    });
    setBusy(false);
    setKey(crypto.randomUUID());
    if (!res.ok) return setError(financeErrorMessage(res.error, labels.errors));
    toast(labels.saved);
    setOpen(false);
    setStudentId('');
    setLabel('');
    setAmount('');
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!online}>
        {labels.open}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        closeLabel={labels.close}
      >
        <Box component="form" noValidate onSubmit={(ev: FormEvent) => void submit(ev)}>
          <Stack spacing={4}>
            <Text tone="secondary">{labels.body}</Text>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <StudentSearch
              value={studentId}
              onChange={setStudentId}
              error={errors.student}
              labels={labels}
            />
            <TextInput
              name="oneTimeLabel"
              label={labels.label}
              required
              value={label}
              onChange={setLabel}
              error={errors.label}
            />
            <TextInput
              name="oneTimeAmount"
              label={labels.amount}
              inputMode="numeric"
              required
              value={amount}
              onChange={setAmount}
              error={errors.amount}
            />
            <DateInput
              name="dueDate"
              label={labels.dueDate}
              required
              value={dueDate}
              onChange={setDueDate}
              error={errors.dueDate}
            />
            <Stack direction="row" spacing={2}>
              <Button type="submit" loading={busy} disabled={!online}>
                {labels.save}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {labels.cancel}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Sheet>
    </>
  );
}

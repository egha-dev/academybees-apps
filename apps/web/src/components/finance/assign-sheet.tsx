// Loaded lazily by finance-lazy.tsx (no 'use client', C-80).
import type { BatchListItem, CursorPage, FeeAssignment } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput, SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type FinanceErrorLabels, financeErrorMessage, issueMessage } from './errors';
import { minorFromText } from './money-input';
import { StudentSearch } from './student-search';

type Labels = Messages['finance']['ui']['assign'] & {
  close: string;
  cancel: string;
  errors: FinanceErrorLabels;
};

const fill = (t: string, vars: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

/** Put a batch or one student on this plan, with their own discount and instalments (G-04). */
export function AssignSheet({
  planId,
  planName,
  today,
  labels,
}: {
  planId: string;
  planName: string;
  today: string;
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [who, setWho] = useState<'batch' | 'student'>('batch');
  const [batches, setBatches] = useState<BatchListItem[]>();
  const [batchId, setBatchId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');
  const [kind, setKind] = useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [instalments, setInstalments] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const e = labels.errors.finance;

  useEffect(() => {
    if (!open || batches) return;
    void api<CursorPage<BatchListItem>>('/batches?limit=100').then((res) => {
      if (res.ok) setBatches(res.data.items);
    });
  }, [open, batches]);

  function discount(found: Record<string, string>) {
    if (kind === 'NONE') return null;
    if (kind === 'PERCENT') {
      const value = Math.round(Number(amount) * 100);
      if (!(value >= 1 && value <= 10_000)) found.discount = e.invalidNumber;
      return { kind, value };
    }
    const value = minorFromText(amount);
    if (!value) found.discount = e.invalidAmount;
    return { kind, value: value ?? 0 };
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found: Record<string, string> = {};
    if (who === 'batch' && !batchId) found.batch = e.required;
    if (who === 'student' && !studentId) found.student = e.required;
    if (!startsOn) found.startsOn = e.required;
    const d = discount(found);
    setErrors(found);
    if (Object.keys(found).length) return setError(e.fixFields);
    setBusy(true);
    setError(undefined);
    const res = await api<{ items: FeeAssignment[] }>('/fee-assignments', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: {
        planId,
        ...(who === 'batch' ? { batchId } : { studentIds: [studentId] }),
        startsOn,
        endsOn: endsOn || null,
        discount: d,
        discountReason: d && reason.trim() ? reason.trim() : null,
        instalments: instalments ? Number(instalments) : null,
      },
    });
    setBusy(false);
    setKey(crypto.randomUUID());
    if (!res.ok) {
      setErrors(
        Object.fromEntries(
          (res.error.details ?? []).flatMap((x) => {
            const message = issueMessage(x.issue, e);
            return message ? [[x.path, message]] : [];
          }),
        ),
      );
      return setError(financeErrorMessage(res.error, labels.errors));
    }
    toast(labels.saved);
    setOpen(false);
    setBatchId('');
    setStudentId('');
    setKind('NONE');
    setAmount('');
    setReason('');
    setInstalments('');
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!online}>
        {labels.open}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={fill(labels.title, { plan: planName })}
        closeLabel={labels.close}
      >
        <Box component="form" noValidate onSubmit={(ev: FormEvent) => void submit(ev)}>
          <Stack spacing={4}>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <SelectInput
              name="who"
              label={labels.who}
              value={who}
              onChange={(x) => setWho(x as typeof who)}
              options={[
                { value: 'batch', label: labels.wholeBatch },
                { value: 'student', label: labels.oneStudent },
              ]}
            />
            {who === 'batch' ? (
              <SelectInput
                name="batch"
                label={labels.batch}
                required
                value={batchId}
                onChange={setBatchId}
                error={errors.batch}
                options={[
                  { value: '', label: labels.selectNone },
                  ...(batches ?? []).map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            ) : (
              <StudentSearch
                value={studentId}
                onChange={setStudentId}
                error={errors.student}
                labels={labels}
              />
            )}
            <DateInput
              name="startsOn"
              label={labels.startsOn}
              required
              value={startsOn}
              onChange={setStartsOn}
              error={errors.startsOn}
            />
            <DateInput
              name="endsOn"
              label={labels.endsOn}
              value={endsOn}
              onChange={setEndsOn}
              error={errors.endsOn}
            />
            <SelectInput
              name="discountKind"
              label={labels.discountKind}
              value={kind}
              onChange={(x) => setKind(x as typeof kind)}
              options={[
                { value: 'NONE', label: labels.discountNone },
                { value: 'PERCENT', label: labels.discountPercent },
                { value: 'FIXED', label: labels.discountFixed },
              ]}
            />
            {kind !== 'NONE' && (
              <>
                <TextInput
                  name="discountValue"
                  label={labels.discountValue}
                  inputMode="numeric"
                  required
                  value={amount}
                  onChange={setAmount}
                  error={errors.discount}
                />
                <TextInput
                  name="discountReason"
                  label={labels.discountReason}
                  value={reason}
                  onChange={setReason}
                />
              </>
            )}
            <SelectInput
              name="instalments"
              label={labels.instalments}
              value={instalments}
              onChange={setInstalments}
              options={[
                { value: '', label: labels.instalmentsNone },
                ...[2, 3, 4, 6, 12].map((n) => ({
                  value: String(n),
                  label: fill(labels.instalmentsCount, { count: n }),
                })),
              ]}
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

/** End someone's time on a plan; invoices already made keep what they say. */
export function EndAssignment({
  assignment,
  today,
  labels,
}: {
  assignment: { id: string; version: number; studentName: string };
  today: string;
  labels: Messages['finance']['ui']['assignments'] & {
    close: string;
    cancel: string;
    errors: FinanceErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [endsOn, setEndsOn] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api<FeeAssignment>(`/fee-assignments/${assignment.id}`, {
      method: 'PATCH',
      body: { version: assignment.version, endsOn },
    });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue;
      return setError(
        (issue && issueMessage(issue, labels.errors.finance)) ??
          financeErrorMessage(res.error, labels.errors),
      );
    }
    toast(labels.ended);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <PlainButton onClick={() => setOpen(true)} disabled={!online}>
        {labels.end}
      </PlainButton>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${labels.end}: ${assignment.studentName}`}
        closeLabel={labels.close}
      >
        <Box component="form" noValidate onSubmit={(ev: FormEvent) => void submit(ev)}>
          <Stack spacing={4}>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <DateInput name="endsOn" label={labels.endOn} value={endsOn} onChange={setEndsOn} />
            <Stack direction="row" spacing={2}>
              <Button type="submit" loading={busy} disabled={!online}>
                {labels.endSave}
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

// Loaded lazily by finance-lazy.tsx (no 'use client', C-80).
import { type FeePlan, FEE_CYCLES } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { formatMoney } from '@academybee/i18n/format';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog, Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type FinanceErrorLabels, financeErrorMessage } from './errors';
import { majorText, minorFromText } from './money-input';

type Labels = Messages['finance']['ui']['plans'] & { errors: FinanceErrorLabels };
type Row = { key: string; name: string; amount: string; taxable: boolean };

const fill = (t: string, vars: Record<string, string>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const newRow = (): Row => ({ key: crypto.randomUUID(), name: '', amount: '', taxable: true });

/** Add or edit a fee plan in a sheet (UX §10: contextual, not a separate CRUD page). */
export function PlanSheet({
  plan,
  labels,
  variant = 'primary',
}: {
  /** Absent: a new plan. */
  plan?: FeePlan;
  labels: Labels;
  variant?: 'primary' | 'link';
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(plan?.name ?? '');
  const [cycle, setCycle] = useState<string>(plan?.cycle ?? 'MONTHLY');
  const [months, setMonths] = useState(plan?.cycleMonths ? String(plan.cycleMonths) : '');
  const [rows, setRows] = useState<Row[]>(
    plan?.components.map((c) => ({
      key: c.id,
      name: c.name,
      amount: majorText(c.amountMinor),
      taxable: c.taxable,
    })) ?? [newRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const e = labels.errors.finance;
  const change = (k: string, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const total = rows.reduce((sum, r) => sum + (minorFromText(r.amount) ?? 0), 0);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = e.required;
    if (cycle === 'CUSTOM' && !(Number(months) >= 1 && Number(months) <= 36))
      found.months = e.invalidNumber;
    for (const r of rows) {
      if (!r.name.trim()) found[`${r.key}.name`] = e.required;
      if (minorFromText(r.amount) === null) found[`${r.key}.amount`] = e.invalidAmount;
    }
    setErrors(found);
    if (Object.keys(found).length) return setError(e.fixFields);
    setBusy(true);
    setError(undefined);
    const body = {
      name: name.trim(),
      cycle,
      cycleMonths: cycle === 'CUSTOM' ? Number(months) : null,
      components: rows.map((r) => ({
        name: r.name.trim(),
        amountMinor: minorFromText(r.amount)!,
        taxable: r.taxable,
      })),
    };
    const res = plan
      ? await api<FeePlan>(`/fee-plans/${plan.id}`, {
          method: 'PATCH',
          body: { ...body, version: plan.version },
        })
      : await api<FeePlan>('/fee-plans', {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body,
        });
    setBusy(false);
    if (!res.ok) return setError(financeErrorMessage(res.error, labels.errors));
    toast(labels.saved);
    setKey(crypto.randomUUID());
    setOpen(false);
    if (!plan) {
      setName('');
      setRows([newRow()]);
    }
    router.refresh();
  }

  const title = plan ? `${labels.edit}: ${plan.name}` : labels.add;
  return (
    <>
      {variant === 'primary' ? (
        <Button onClick={() => setOpen(true)} disabled={!online}>
          {plan ? labels.edit : labels.add}
        </Button>
      ) : (
        <PlainButton onClick={() => setOpen(true)} disabled={!online}>
          {plan ? labels.edit : labels.add}
        </PlainButton>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={title} closeLabel={labels.close}>
        <Box component="form" noValidate onSubmit={(ev: FormEvent) => void submit(ev)}>
          <Stack spacing={4}>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            {plan && <Text tone="secondary">{labels.changeNote}</Text>}
            <TextInput
              name="planName"
              label={labels.name}
              required
              value={name}
              onChange={setName}
              error={errors.name}
            />
            <SelectInput
              name="cycle"
              label={labels.cycle}
              value={cycle}
              onChange={setCycle}
              options={FEE_CYCLES.map((c) => ({ value: c, label: labels.cycles[c] }))}
            />
            {cycle === 'CUSTOM' && (
              <TextInput
                name="cycleMonths"
                label={labels.cycleMonths}
                inputMode="numeric"
                required
                value={months}
                onChange={(x) => setMonths(x.replace(/\D/g, ''))}
                error={errors.months}
              />
            )}
            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
              <Box component="legend" sx={{ fontWeight: 600, marginBlockEnd: 2, padding: 0 }}>
                {labels.componentsLegend}
              </Box>
              <Stack spacing={3}>
                {rows.map((r, i) => (
                  <Stack
                    key={r.key}
                    spacing={2}
                    sx={{
                      padding: 3,
                      border: '1px solid',
                      borderColor: 'ab.border',
                      borderRadius: 2,
                    }}
                  >
                    <TextInput
                      name={`component-${i}-name`}
                      label={labels.componentName}
                      required
                      value={r.name}
                      onChange={(x) => change(r.key, { name: x })}
                      error={errors[`${r.key}.name`]}
                    />
                    <TextInput
                      name={`component-${i}-amount`}
                      label={labels.componentAmount}
                      inputMode="numeric"
                      required
                      value={r.amount}
                      onChange={(x) => change(r.key, { amount: x })}
                      error={errors[`${r.key}.amount`]}
                    />
                    <CheckboxGroup
                      legend={labels.taxable}
                      name={`component-${i}-taxable`}
                      options={[{ value: 'taxable', label: labels.taxable }]}
                      value={r.taxable ? ['taxable'] : []}
                      onChange={(next) => change(r.key, { taxable: next.length > 0 })}
                    />
                    {rows.length > 1 && (
                      <Box>
                        <PlainButton
                          onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                        >
                          {fill(labels.removeComponent, { name: r.name || String(i + 1) })}
                        </PlainButton>
                      </Box>
                    )}
                  </Stack>
                ))}
                <Box>
                  <PlainButton onClick={() => setRows((all) => [...all, newRow()])}>
                    {labels.addComponent}
                  </PlainButton>
                </Box>
              </Stack>
            </Box>
            <Box data-testid="plan-total">
              <Text>
                {fill(labels.total, { amount: formatMoney(total, plan?.currency ?? 'INR') })}
              </Text>
            </Box>
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

/**
 * Archive or restore a plan. Archiving only closes it to new students: assignments already on it
 * keep generating invoices until they end (C-162), so the dialog says so.
 */
export function PlanStatusButton({
  plan,
  body,
  labels,
}: {
  plan: Pick<FeePlan, 'id' | 'name' | 'status' | 'version'>;
  /** The archive dialog's text, with the student count already filled in on the server. */
  body: string;
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function change(status: 'ACTIVE' | 'ARCHIVED') {
    setBusy(true);
    setError(undefined);
    const res = await api<FeePlan>(`/fee-plans/${plan.id}`, {
      method: 'PATCH',
      body: { version: plan.version, status },
    });
    setBusy(false);
    setOpen(false);
    if (!res.ok) return setError(financeErrorMessage(res.error, labels.errors));
    toast(status === 'ACTIVE' ? labels.restored : labels.archived);
    router.refresh();
  }

  return (
    <Stack spacing={1}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {plan.status === 'ARCHIVED' ? (
        <Button
          variant="secondary"
          loading={busy}
          disabled={!online}
          onClick={() => void change('ACTIVE')}
        >
          {labels.restore}
        </Button>
      ) : (
        <>
          <PlainButton onClick={() => setOpen(true)} disabled={!online}>
            {labels.archive}
          </PlainButton>
          <ConfirmDialog
            open={open}
            title={fill(labels.archiveTitle, { plan: plan.name })}
            body={body}
            confirmLabel={labels.archive}
            cancelLabel={labels.cancel}
            busy={busy}
            onConfirm={() => void change('ARCHIVED')}
            onCancel={() => setOpen(false)}
          />
        </>
      )}
    </Stack>
  );
}

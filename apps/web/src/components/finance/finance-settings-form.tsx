// Loaded lazily by finance-lazy.tsx (no 'use client', C-80).
import {
  type FinanceSettingsResponse,
  MID_CYCLE_RULES,
  STAFF_METHODS,
  UpdateFinanceSettingsSchema,
  upiLink,
  VpaSchema,
} from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { Card, StatusBadge } from '@academybee/ui/components/display';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type FinanceErrorLabels, financeErrorMessage, issueMessage } from './errors';
import { majorText, minorFromText } from './money-input';

type Labels = Messages['finance']['ui']['settings'] & { errors: FinanceErrorLabels };

const fill = (t: string, vars: Record<string, string>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const digits = (x: string) => x.replace(/\D/g, '');

/** A live preview of what parents will scan; the same string the server builds (ADR-038). */
function UpiQr({ vpa, payee, labels }: { vpa: string; payee: string; labels: Labels['upi'] }) {
  const link =
    VpaSchema.safeParse(vpa).success && payee.trim()
      ? upiLink({ vpa: vpa.trim().toLowerCase(), payeeName: payee.trim() })
      : null;
  const [qr, setQr] = useState<{ link: string; src: string }>();
  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    void import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 2, width: 180 }).then((src) => {
        if (!cancelled) setQr({ link, src });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [link]);
  // A code made for an earlier value is never shown.
  const src = qr && qr.link === link ? qr.src : undefined;
  if (!src) return null;
  return (
    <Stack spacing={1}>
      {/* Black on white in both themes: a QR code needs that contrast to scan. */}
      <Box
        component="img"
        src={src}
        alt={fill(labels.qrAlt, { payee })}
        sx={{ inlineSize: 180, blockSize: 180, bgcolor: '#FFFFFF', borderRadius: 1 }}
      />
      <Text variant="meta" tone="secondary">
        {labels.qrHint}
      </Text>
    </Stack>
  );
}

/**
 * Settings → Payments (G-30, ADR-038): UPI with a live QR, bank details, methods, tax, numbering
 * and fee rules, saved together with the settings `version`. Online only. Read-only for roles that
 * only read.
 */
export function FinanceSettingsForm({
  value,
  canManage,
  labels,
}: {
  value: FinanceSettingsResponse;
  canManage: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const s = value.settings;
  const [form, setForm] = useState({
    vpa: s.upi?.vpa ?? '',
    payeeName: s.upi?.payeeName ?? '',
    accountName: s.bank?.accountName ?? '',
    accountNumber: s.bank?.accountNumber ?? '',
    ifsc: s.bank?.ifsc ?? '',
    bankName: s.bank?.bankName ?? '',
    gstin: s.tax?.gstin ?? '',
    rate: s.tax ? String(s.tax.rateBps / 100) : '',
    taxMode: s.tax?.mode ?? 'EXCLUSIVE',
    taxLabel: s.tax?.label ?? 'GST',
    INVOICE: s.prefixes.INVOICE,
    RECEIPT: s.prefixes.RECEIPT,
    midCycle: s.policy.midCycle,
    generateDaysBefore: String(s.policy.generateDaysBefore),
    dueDay: String(s.policy.dueDay),
    siblingKind: s.policy.sibling?.kind ?? 'NONE',
    siblingValue: s.policy.sibling
      ? s.policy.sibling.kind === 'PERCENT'
        ? String(s.policy.sibling.value / 100)
        : majorText(s.policy.sibling.value)
      : '',
    lateAfter: s.policy.lateFee ? String(s.policy.lateFee.afterDays) : '7',
    lateAmount: s.policy.lateFee ? majorText(s.policy.lateFee.amountMinor) : '',
  });
  const [methods, setMethods] = useState<string[]>(STAFF_METHODS.filter((m) => s.methods[m]));
  const [switches, setSwitches] = useState<string[]>(
    [
      s.tax ? 'tax' : '',
      s.policy.lateFee ? 'lateFee' : '',
      s.policy.autoApplyCredit ? 'autoCredit' : '',
    ].filter(Boolean),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const on = (key: string) => switches.includes(key);
  const flip = (key: string) => (next: string[]) =>
    setSwitches((all) => [...all.filter((k) => k !== key), ...(next.includes(key) ? [key] : [])]);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const disabled = !canManage;
  const l = labels;
  const e = labels.errors.finance;

  function build() {
    const percent = (text: string) => Math.round(Number(text) * 100);
    const bankGiven = [form.accountName, form.accountNumber, form.ifsc, form.bankName].some((x) =>
      x.trim(),
    );
    return {
      version: value.version,
      upi:
        form.vpa.trim() || form.payeeName.trim()
          ? { vpa: form.vpa, payeeName: form.payeeName }
          : null,
      bank: bankGiven
        ? {
            accountName: form.accountName,
            accountNumber: form.accountNumber,
            ifsc: form.ifsc,
            bankName: form.bankName,
          }
        : null,
      methods: Object.fromEntries(STAFF_METHODS.map((m) => [m, methods.includes(m)])),
      tax: on('tax')
        ? {
            gstin: form.gstin,
            rateBps: percent(form.rate),
            mode: form.taxMode,
            label: form.taxLabel,
          }
        : null,
      prefixes: { INVOICE: form.INVOICE, RECEIPT: form.RECEIPT },
      policy: {
        midCycle: form.midCycle,
        autoApplyCredit: on('autoCredit'),
        generateDaysBefore: Number(form.generateDaysBefore),
        dueDay: Number(form.dueDay),
        sibling:
          form.siblingKind === 'NONE'
            ? null
            : form.siblingKind === 'PERCENT'
              ? { kind: 'PERCENT', value: percent(form.siblingValue) }
              : { kind: 'FIXED', value: minorFromText(form.siblingValue) ?? 0 },
        lateFee: on('lateFee')
          ? {
              afterDays: Number(form.lateAfter),
              amountMinor: minorFromText(form.lateAmount) ?? 0,
            }
          : null,
      },
    };
  }

  function issuesToErrors(issues: { path: string; issue: string }[]) {
    return Object.fromEntries(
      issues.map((i) => [i.path, issueMessage(i.issue, e) ?? e.invalidNumber]),
    );
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const parsed = UpdateFinanceSettingsSchema.safeParse(build());
    if (!parsed.success) {
      setErrors(
        issuesToErrors(
          parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            issue: i.message.startsWith('invalid_') ? i.message : i.code,
          })),
        ),
      );
      setError(e.fixFields);
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    const res = await api<FinanceSettingsResponse>('/settings/finance', {
      method: 'PATCH',
      body: parsed.data,
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(issuesToErrors(res.error.details ?? []));
      return setError(financeErrorMessage(res.error, labels.errors));
    }
    toast(l.saved);
    router.refresh();
  }

  const bool = (key: string, label: string, name: string) => (
    <CheckboxGroup
      legend={label}
      name={name}
      options={[{ value: key, label, disabled }]}
      value={on(key) ? [key] : []}
      onChange={flip(key)}
    />
  );

  return (
    <Box component="form" noValidate onSubmit={(ev: FormEvent) => void submit(ev)}>
      <Stack spacing={5} sx={{ maxInlineSize: 640 }}>
        {canManage && !online && (
          <InlineAlert tone="warning">{labels.errors.people.offline}</InlineAlert>
        )}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}

        <Card title={l.upi.title} subtitle={l.upi.body}>
          <Stack spacing={3}>
            <TextInput
              name="vpa"
              label={l.upi.vpa}
              value={form.vpa}
              onChange={set('vpa')}
              disabled={disabled}
              error={errors['upi.vpa']}
            />
            <TextInput
              name="payeeName"
              label={l.upi.payeeName}
              value={form.payeeName}
              onChange={set('payeeName')}
              disabled={disabled}
              error={errors['upi.payeeName']}
            />
            <UpiQr vpa={form.vpa} payee={form.payeeName} labels={l.upi} />
          </Stack>
        </Card>

        <Card title={l.bank.title} subtitle={l.bank.body}>
          <Stack spacing={3}>
            <TextInput
              name="accountName"
              label={l.bank.accountName}
              value={form.accountName}
              onChange={set('accountName')}
              disabled={disabled}
              error={errors['bank.accountName']}
            />
            <TextInput
              name="accountNumber"
              label={l.bank.accountNumber}
              inputMode="numeric"
              value={form.accountNumber}
              onChange={(x) => set('accountNumber')(digits(x))}
              disabled={disabled}
              error={errors['bank.accountNumber']}
            />
            <TextInput
              name="ifsc"
              label={l.bank.ifsc}
              value={form.ifsc}
              onChange={set('ifsc')}
              disabled={disabled}
              error={errors['bank.ifsc']}
            />
            <TextInput
              name="bankName"
              label={l.bank.bankName}
              value={form.bankName}
              onChange={set('bankName')}
              disabled={disabled}
              error={errors['bank.bankName']}
            />
          </Stack>
        </Card>

        <Card title={l.methods.title} subtitle={l.methods.body}>
          <CheckboxGroup
            legend={l.methods.title}
            name="methods"
            options={STAFF_METHODS.map((m) => ({ value: m, label: l.methods[m], disabled }))}
            value={methods}
            onChange={setMethods}
          />
        </Card>

        <Card title={l.tax.title} subtitle={l.tax.body}>
          <Stack spacing={3}>
            {bool('tax', l.tax.enabled, 'taxEnabled')}
            {on('tax') && (
              <>
                <TextInput
                  name="gstin"
                  label={l.tax.gstin}
                  value={form.gstin}
                  onChange={set('gstin')}
                  disabled={disabled}
                  required
                  error={errors['tax.gstin']}
                />
                <TextInput
                  name="rate"
                  label={l.tax.rate}
                  inputMode="numeric"
                  value={form.rate}
                  onChange={set('rate')}
                  disabled={disabled}
                  required
                  error={errors['tax.rateBps']}
                />
                <SelectInput
                  name="taxMode"
                  label={l.tax.mode}
                  value={form.taxMode}
                  onChange={(x) => set('taxMode')(x)}
                  disabled={disabled}
                  options={[
                    { value: 'EXCLUSIVE', label: l.tax.exclusive },
                    { value: 'INCLUSIVE', label: l.tax.inclusive },
                  ]}
                />
                <TextInput
                  name="taxLabel"
                  label={l.tax.label}
                  value={form.taxLabel}
                  onChange={set('taxLabel')}
                  disabled={disabled}
                  error={errors['tax.label']}
                />
              </>
            )}
          </Stack>
        </Card>

        <Card title={l.prefixes.title} subtitle={l.prefixes.body}>
          <Stack spacing={3}>
            {(['INVOICE', 'RECEIPT'] as const).map((kind) => (
              <TextInput
                key={kind}
                name={`prefix${kind}`}
                label={l.prefixes[kind]}
                value={form[kind]}
                onChange={set(kind)}
                disabled={disabled || value.prefixesLocked[kind]}
                helperText={value.prefixesLocked[kind] ? l.prefixes.locked : undefined}
                error={errors[`prefixes.${kind}`]}
              />
            ))}
          </Stack>
        </Card>

        <Card title={l.rules.title}>
          <Stack spacing={3}>
            <SelectInput
              name="midCycle"
              label={l.rules.midCycle}
              value={form.midCycle}
              onChange={(x) => set('midCycle')(x)}
              disabled={disabled}
              options={MID_CYCLE_RULES.map((r) => ({ value: r, label: l.rules[r] }))}
            />
            {bool('autoCredit', l.rules.autoCredit, 'autoCredit')}
            <TextInput
              name="generateDaysBefore"
              label={l.rules.generateDaysBefore}
              inputMode="numeric"
              value={form.generateDaysBefore}
              onChange={(x) => set('generateDaysBefore')(digits(x))}
              disabled={disabled}
              error={errors['policy.generateDaysBefore']}
            />
            <TextInput
              name="dueDay"
              label={l.rules.dueDay}
              inputMode="numeric"
              value={form.dueDay}
              onChange={(x) => set('dueDay')(digits(x))}
              disabled={disabled}
              error={errors['policy.dueDay']}
            />
            <SelectInput
              name="siblingKind"
              label={l.rules.sibling}
              value={form.siblingKind}
              onChange={(x) => set('siblingKind')(x)}
              disabled={disabled}
              options={[
                { value: 'NONE', label: l.rules.siblingNone },
                { value: 'PERCENT', label: l.rules.siblingPercent },
                { value: 'FIXED', label: l.rules.siblingFixed },
              ]}
            />
            {form.siblingKind !== 'NONE' && (
              <TextInput
                name="siblingValue"
                label={l.rules.siblingValue}
                inputMode="numeric"
                value={form.siblingValue}
                onChange={set('siblingValue')}
                disabled={disabled}
                required
                error={errors['policy.sibling.value']}
              />
            )}
            {bool('lateFee', l.rules.lateFee, 'lateFeeEnabled')}
            {on('lateFee') && (
              <>
                <Text variant="meta" tone="secondary">
                  {l.rules.lateFeeHint}
                </Text>
                <TextInput
                  name="lateAfter"
                  label={l.rules.lateFeeAfter}
                  inputMode="numeric"
                  value={form.lateAfter}
                  onChange={(x) => set('lateAfter')(digits(x))}
                  disabled={disabled}
                  error={errors['policy.lateFee.afterDays']}
                />
                <TextInput
                  name="lateAmount"
                  label={l.rules.lateFeeAmount}
                  inputMode="numeric"
                  value={form.lateAmount}
                  onChange={set('lateAmount')}
                  disabled={disabled}
                  required
                  error={errors['policy.lateFee.amountMinor']}
                />
              </>
            )}
          </Stack>
        </Card>

        <Card title={l.gateway.title} subtitle={l.gateway.body}>
          <StatusBadge
            tone={value.gateway.connected ? 'success' : 'neutral'}
            label={
              value.gateway.connected
                ? fill(l.gateway.connected, { provider: value.gateway.provider ?? '' })
                : l.gateway.notConnected
            }
          />
        </Card>

        {canManage && (
          <Box>
            <Button type="submit" loading={busy} disabled={!online}>
              {l.save}
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

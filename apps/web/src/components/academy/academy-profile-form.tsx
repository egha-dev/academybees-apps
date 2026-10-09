// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { type AcademySettings, ProfileStepSchema } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { Select, TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { academyErrorMessage, type AcademyErrorLabels } from './labels';

export type AcademyProfileLabels = {
  fields: Record<
    'name' | 'phone' | 'phoneHint' | 'email' | 'address' | 'timezone' | 'timezoneHint' | 'currency',
    string
  >;
  save: string;
  saved: string;
  errors: AcademyErrorLabels;
};

const CURRENCIES = ['INR', 'AED', 'SGD', 'GBP', 'USD', 'EUR', 'AUD', 'CAD'];

/**
 * Settings → Academy (UX v1.1 §6): name, contact, timezone, currency. Sent with the settings
 * `version`, so two owners never overwrite each other. Read-only for roles that only read.
 */
export function AcademyProfileForm({
  value,
  canManage,
  labels,
}: {
  value: AcademySettings;
  canManage: boolean;
  labels: AcademyProfileLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [form, setForm] = useState({
    name: value.name,
    phone: value.phone ?? '',
    email: value.email ?? '',
    address: value.address ?? '',
    timezone: value.timezone,
    currency: value.currency,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([value.timezone, 'Asia/Kolkata', ...all])].map((z) => ({
      value: z,
      label: z.replace(/_/g, ' '),
    }));
  }, [value.timezone]);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = ProfileStepSchema.safeParse({
      name: form.name,
      ...(form.phone.trim() ? { phone: form.phone } : {}),
      ...(form.email.trim() ? { email: form.email } : {}),
      address: form.address,
      timezone: form.timezone,
      currency: form.currency,
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof typeof form;
        next[k] =
          k === 'phone'
            ? labels.errors.invalidPhone
            : k === 'email'
              ? labels.errors.invalidEmail
              : labels.errors.required;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    setError(undefined);
    const res = await api<AcademySettings>('/academy/settings', {
      method: 'PATCH',
      body: { ...parsed.data, version: value.version },
    });
    setBusy(false);
    if (!res.ok) return setError(academyErrorMessage(res.error, labels.errors));
    // Show what was saved (e.g. a typed mobile number in its stored +91 form).
    setForm({
      name: res.data.name,
      phone: res.data.phone ?? '',
      email: res.data.email ?? '',
      address: res.data.address ?? '',
      timezone: res.data.timezone,
      currency: res.data.currency,
    });
    toast(labels.saved);
    router.refresh();
  }

  const disabled = !canManage;
  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e: FormEvent) => void submit(e)}
      sx={{ maxInlineSize: 560 }}
    >
      <Stack spacing={4}>
        {canManage && !online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <TextField
          label={labels.fields.name}
          name="name"
          value={form.name}
          onChange={set('name')}
          required
          disabled={disabled}
          error={errors.name}
        />
        <TextField
          label={labels.fields.phone}
          name="phone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={set('phone')}
          disabled={disabled}
          error={errors.phone}
          helperText={labels.fields.phoneHint}
        />
        <TextField
          label={labels.fields.email}
          name="email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={set('email')}
          disabled={disabled}
          error={errors.email}
        />
        <TextField
          label={labels.fields.address}
          name="address"
          value={form.address}
          onChange={set('address')}
          disabled={disabled}
        />
        <Select
          label={labels.fields.timezone}
          value={form.timezone}
          onChange={set('timezone')}
          options={zones}
          helperText={labels.fields.timezoneHint}
          disabled={disabled}
        />
        <Select
          label={labels.fields.currency}
          value={form.currency}
          onChange={set('currency')}
          options={[...new Set([value.currency, ...CURRENCIES])].map((c) => ({
            value: c,
            label: c,
          }))}
          disabled={disabled}
        />
        {canManage && (
          <Stack direction="row">
            <Button type="submit" loading={busy} disabled={!online}>
              {labels.save}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

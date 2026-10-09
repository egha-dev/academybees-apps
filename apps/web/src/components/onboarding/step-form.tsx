// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { ACADEMY_TYPES, type OnboardingState, type SavedStep } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Select, TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { palettes } from '@academybee/ui/tokens';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

/** Every string the forms show, formatted on the server (terms filled in, G-32). */
export type StepFormLabels = {
  actions: Record<'back' | 'skip' | 'save', string>;
  errors: Record<
    | 'required'
    | 'invalid'
    | 'invalidPhone'
    | 'invalidEmail'
    | 'fixFields'
    | 'needsCourse'
    | 'needsBatch'
    | 'versionConflict'
    | 'alreadyMember'
    | 'offline'
    | 'generic'
    | 'limit',
    string
  >;
  profile: Record<
    | 'name'
    | 'phone'
    | 'phoneHint'
    | 'email'
    | 'address'
    | 'timezone'
    | 'timezoneHint'
    | 'currency'
    | 'logo'
    | 'logoHint'
    | 'logoUpload'
    | 'logoReplace'
    | 'logoUploaded'
    | 'logoAlt',
    string
  >;
  type: { legend: string; options: Record<string, { label: string; preview: string }> };
  course: Record<'name' | 'description', string>;
  teacher: Record<
    'legend' | 'self' | 'invite' | 'name' | 'email' | 'inviteHint' | 'pendingTemplate',
    string
  >;
  batch: Record<'name' | 'capacity' | 'capacityHint', string>;
  students: Record<
    | 'rowTemplate'
    | 'name'
    | 'parentName'
    | 'parentPhone'
    | 'add'
    | 'removeTemplate'
    | 'max'
    | 'admissionTemplate',
    string
  >;
  timetable: Record<
    | 'slotTemplate'
    | 'day'
    | 'start'
    | 'end'
    | 'add'
    | 'removeTemplate'
    | 'endAfterStart'
    | 'upcoming',
    string
  >;
  days: string[];
};

const fill = (t: string, vars: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

type Props = {
  step: SavedStep;
  state: OnboardingState;
  previous: string | null;
  skippable: boolean;
  logo: { url: string | null; uploadsAvailable: boolean };
  labels: StepFormLabels;
};

function Field({ children }: { children: ReactNode }) {
  return <Box sx={{ maxInlineSize: 520 }}>{children}</Box>;
}

/**
 * One guided-setup step (UX v1.1 §5): its fields, Back, Skip (not on Profile or Type, C-08) and
 * Save and continue. Every save is one request with the state's `version` and an Idempotency-Key,
 * so a double tap or another device never duplicates anything; the server answers with the next
 * step. Online only.
 */
export function StepForm({ step, state, previous, skippable, logo, labels }: Props) {
  const router = useRouter();
  const online = useOnline();
  const key = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState<'save' | 'skip'>();
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const v = state.values;

  // ---- per-step form state ----
  const [profile, setProfile] = useState({
    name: v.profile.name,
    phone: v.profile.phone ?? '',
    email: v.profile.email ?? '',
    address: v.profile.address ?? '',
    timezone: v.profile.timezone,
    currency: v.profile.currency,
  });
  const [logoUrl, setLogoUrl] = useState(logo.url);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const [academyType, setAcademyType] = useState(v.type.academyType);
  const [course, setCourse] = useState({
    name: v.course?.name ?? '',
    description: v.course?.description ?? '',
  });
  const [teacher, setTeacher] = useState({
    mode: v.teacher?.mode ?? 'self',
    name: v.teacher?.mode === 'invite' ? v.teacher.name : '',
    email: v.teacher?.mode === 'invite' ? (v.teacher.email ?? '') : '',
  });
  const [batch, setBatch] = useState({
    name: v.batch?.name ?? '',
    capacity: v.batch?.capacity ? String(v.batch.capacity) : '',
  });
  const [students, setStudents] = useState(
    v.students.length
      ? v.students.map((s) => ({
          fullName: s.fullName,
          parentName: s.parentName ?? '',
          parentPhone: s.parentPhone ?? '',
        }))
      : [{ fullName: '', parentName: '', parentPhone: '' }],
  );
  const [slots, setSlots] = useState(
    v.timetable.slots.length ? v.timetable.slots : [{ weekday: 1, start: '17:00', end: '18:00' }],
  );

  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([v.profile.timezone, 'Asia/Kolkata', ...all])].map((z) => ({
      value: z,
      label: z.replace(/_/g, ' '),
    }));
  }, [v.profile.timezone]);

  function data(): unknown {
    const opt = (s: string) => (s.trim() ? s.trim() : undefined);
    switch (step) {
      case 'profile':
        return {
          name: profile.name,
          phone: opt(profile.phone),
          email: opt(profile.email),
          address: opt(profile.address),
          timezone: profile.timezone,
          currency: profile.currency,
        };
      case 'type':
        return { academyType };
      case 'course':
        return { name: course.name, description: opt(course.description) };
      case 'teacher':
        return teacher.mode === 'self'
          ? { mode: 'self' }
          : { mode: 'invite', name: teacher.name, email: teacher.email };
      case 'batch':
        return {
          name: batch.name,
          capacity: batch.capacity.trim() ? Number(batch.capacity) : null,
        };
      case 'students':
        return {
          students: students
            .filter((s) => s.fullName.trim() || s.parentName.trim() || s.parentPhone.trim())
            .map((s) => ({
              fullName: s.fullName,
              parentName: opt(s.parentName),
              parentPhone: opt(s.parentPhone),
            })),
        };
      case 'timetable':
        return { slots };
    }
  }

  /** Field-level messages from the server's `{ path, issue }` details. */
  function fieldErrors(details: { path: string; issue: string }[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of details) {
      const last = d.path.split('.').pop() ?? '';
      out[d.path] =
        d.issue === 'required' || d.issue === 'too_small'
          ? labels.errors.required
          : /phone/i.test(last)
            ? labels.errors.invalidPhone
            : /email/i.test(last)
              ? labels.errors.invalidEmail
              : d.issue === 'end_before_start'
                ? labels.timetable.endAfterStart
                : labels.errors.invalid;
    }
    return out;
  }

  async function send(action: 'save' | 'skip') {
    setBusy(action);
    setError(undefined);
    setFields({});
    const res = await api<OnboardingState>(`/onboarding/steps/${step}`, {
      method: 'PUT',
      headers: { 'idempotency-key': key.current },
      body: { action, version: state.version, ...(action === 'save' ? { data: data() } : {}) },
    });
    if (res.ok) {
      router.push(`/onboarding/${res.data.currentStep}`);
      return;
    }
    setBusy(undefined);
    // A new attempt after a failure is a new request.
    key.current = crypto.randomUUID();
    const details = res.error.details ?? [];
    if (res.error.code === 'VERSION_CONFLICT') {
      setError(labels.errors.versionConflict);
      router.refresh();
      return;
    }
    if (details.some((d) => d.path === 'course')) return setError(labels.errors.needsCourse);
    if (details.some((d) => d.path === 'batch')) return setError(labels.errors.needsBatch);
    if (details.some((d) => d.issue === 'already_member'))
      return setError(labels.errors.alreadyMember);
    if (res.error.code === 'ENTITLEMENT_LIMIT_REACHED') return setError(labels.errors.limit);
    if (res.error.code === 'VALIDATION_FAILED' && details.length) {
      setFields(fieldErrors(details.map((d) => ({ ...d, path: d.path.replace(/^data\./, '') }))));
      return setError(labels.errors.fixFields);
    }
    setError(
      res.error.code === 'OFFLINE' || res.error.code === 'NETWORK'
        ? labels.errors.offline
        : labels.errors.generic,
    );
  }

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    const res = await api<{ logoUrl: string | null }>('/academy/branding/logo', {
      method: 'PUT',
      raw: file,
    });
    setLogoBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue;
      return setError(
        issue === 'too_large' || issue === 'unsupported_type' || issue === 'too_large_dimensions'
          ? labels.profile.logoHint
          : labels.errors.generic,
      );
    }
    setLogoUrl(res.data.logoUrl);
  }

  const f = (path: string) => fields[path];

  const body = (() => {
    switch (step) {
      case 'profile':
        return (
          <Stack spacing={4}>
            <Field>
              <TextField
                label={labels.profile.name}
                name="name"
                value={profile.name}
                onChange={(x) => setProfile({ ...profile, name: x })}
                required
                error={f('name')}
              />
            </Field>
            <Field>
              <TextField
                label={labels.profile.phone}
                name="phone"
                type="tel"
                inputMode="tel"
                value={profile.phone}
                onChange={(x) => setProfile({ ...profile, phone: x })}
                error={f('phone')}
                helperText={labels.profile.phoneHint}
              />
            </Field>
            <Field>
              <TextField
                label={labels.profile.email}
                name="email"
                type="email"
                inputMode="email"
                value={profile.email}
                onChange={(x) => setProfile({ ...profile, email: x })}
                error={f('email')}
              />
            </Field>
            <Field>
              <TextField
                label={labels.profile.address}
                name="address"
                value={profile.address}
                onChange={(x) => setProfile({ ...profile, address: x })}
              />
            </Field>
            <Field>
              <Select
                label={labels.profile.timezone}
                value={profile.timezone}
                onChange={(x) => setProfile({ ...profile, timezone: x })}
                options={zones}
                helperText={labels.profile.timezoneHint}
              />
            </Field>
            <Field>
              <Select
                label={labels.profile.currency}
                value={profile.currency}
                onChange={(x) => setProfile({ ...profile, currency: x })}
                options={[
                  ...new Set([profile.currency, 'INR', 'AED', 'SGD', 'GBP', 'USD', 'EUR']),
                ].map((c) => ({ value: c, label: c }))}
              />
            </Field>
            {logo.uploadsAvailable && (
              <Stack spacing={2}>
                <Text variant="meta" tone="secondary">
                  {labels.profile.logo}
                </Text>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                  {logoUrl && (
                    <Box
                      component="img"
                      src={logoUrl}
                      alt={labels.profile.logoAlt}
                      sx={{
                        inlineSize: 64,
                        blockSize: 64,
                        objectFit: 'contain',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'ab.border',
                        bgcolor: palettes.light.surface,
                      }}
                    />
                  )}
                  <Button
                    variant="secondary"
                    loading={logoBusy}
                    disabled={!online}
                    onClick={() => logoInput.current?.click()}
                  >
                    {logoUrl ? labels.profile.logoReplace : labels.profile.logoUpload}
                  </Button>
                </Stack>
                <Text variant="bodySmall" tone="secondary">
                  {labels.profile.logoHint}
                </Text>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  data-testid="logo-file"
                  aria-label={labels.profile.logoUpload}
                  onChange={(e) => void uploadLogo(e)}
                />
              </Stack>
            )}
          </Stack>
        );
      case 'type':
        return (
          <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0 }}>
            <Box component="legend" sx={{ padding: 0, marginBlockEnd: 3 }}>
              <Text variant="meta" tone="secondary" as="span">
                {labels.type.legend}
              </Text>
            </Box>
            <Box
              sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
            >
              {ACADEMY_TYPES.map((t) => {
                const o = labels.type.options[t]!;
                const chosen = academyType === t;
                return (
                  <Box
                    key={t}
                    component="label"
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-start',
                      padding: 3,
                      minBlockSize: 48,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '2px solid',
                      borderColor: chosen ? 'ab.accent' : 'ab.border',
                      bgcolor: chosen ? 'ab.accentSoft' : 'ab.surface',
                      '&:focus-within': { outline: '2px solid', outlineColor: 'ab.focus' },
                    }}
                  >
                    <input
                      type="radio"
                      name="academyType"
                      value={t}
                      checked={chosen}
                      onChange={() => setAcademyType(t)}
                      style={{ marginBlockStart: 4 }}
                    />
                    <Stack spacing={0.5}>
                      <Text as="span">
                        <strong>{o.label}</strong>
                      </Text>
                      <Text variant="bodySmall" tone="secondary" as="span">
                        {o.preview}
                      </Text>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      case 'course':
        return (
          <Stack spacing={4}>
            <Field>
              <TextField
                label={labels.course.name}
                name="name"
                value={course.name}
                onChange={(x) => setCourse({ ...course, name: x })}
                required
                error={f('name')}
              />
            </Field>
            <Field>
              <TextField
                label={labels.course.description}
                name="description"
                value={course.description}
                onChange={(x) => setCourse({ ...course, description: x })}
              />
            </Field>
          </Stack>
        );
      case 'teacher':
        return (
          <Stack spacing={4}>
            <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0 }}>
              <Box component="legend" sx={{ padding: 0, marginBlockEnd: 2 }}>
                <Text variant="meta" tone="secondary" as="span">
                  {labels.teacher.legend}
                </Text>
              </Box>
              <Stack spacing={1}>
                {(['self', 'invite'] as const).map((m) => (
                  <Box
                    key={m}
                    component="label"
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'center',
                      minBlockSize: 48,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      checked={teacher.mode === m}
                      onChange={() => setTeacher({ ...teacher, mode: m })}
                    />
                    <Text as="span">
                      {m === 'self' ? labels.teacher.self : labels.teacher.invite}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Box>
            {teacher.mode === 'invite' && (
              <Stack spacing={4}>
                <Field>
                  <TextField
                    label={labels.teacher.name}
                    name="teacherName"
                    value={teacher.name}
                    onChange={(x) => setTeacher({ ...teacher, name: x })}
                    required
                    error={f('name')}
                  />
                </Field>
                <Field>
                  <TextField
                    label={labels.teacher.email}
                    name="teacherEmail"
                    type="email"
                    inputMode="email"
                    value={teacher.email}
                    onChange={(x) => setTeacher({ ...teacher, email: x })}
                    required
                    error={f('email')}
                    helperText={labels.teacher.inviteHint}
                  />
                </Field>
              </Stack>
            )}
            {v.teacher?.invitationPending && v.teacher.email && (
              <InlineAlert tone="info">
                {fill(labels.teacher.pendingTemplate, { email: v.teacher.email })}
              </InlineAlert>
            )}
          </Stack>
        );
      case 'batch':
        return (
          <Stack spacing={4}>
            <Field>
              <TextField
                label={labels.batch.name}
                name="name"
                value={batch.name}
                onChange={(x) => setBatch({ ...batch, name: x })}
                required
                error={f('name')}
              />
            </Field>
            <Field>
              <TextField
                label={labels.batch.capacity}
                name="capacity"
                inputMode="numeric"
                value={batch.capacity}
                onChange={(x) => setBatch({ ...batch, capacity: x.replace(/\D/g, '') })}
                error={f('capacity')}
                helperText={labels.batch.capacityHint}
              />
            </Field>
          </Stack>
        );
      case 'students':
        return (
          <Stack spacing={4}>
            {students.map((s, i) => (
              <Stack
                key={i}
                component="fieldset"
                spacing={3}
                sx={{
                  border: '1px solid',
                  borderColor: 'ab.border',
                  borderRadius: 3,
                  padding: 4,
                  margin: 0,
                }}
              >
                <Box component="legend" sx={{ paddingInline: 1 }}>
                  <Text variant="meta" tone="secondary" as="span">
                    {fill(labels.students.rowTemplate, { n: i + 1 })}
                    {v.students[i]
                      ? ` · ${fill(labels.students.admissionTemplate, { number: v.students[i].admissionNo })}`
                      : ''}
                  </Text>
                </Box>
                <TextField
                  label={labels.students.name}
                  name={`student-${i}`}
                  value={s.fullName}
                  onChange={(x) =>
                    setStudents(students.map((r, j) => (j === i ? { ...r, fullName: x } : r)))
                  }
                  required
                  error={f(`students.${i}.fullName`)}
                />
                <TextField
                  label={labels.students.parentName}
                  name={`parent-${i}`}
                  value={s.parentName}
                  onChange={(x) =>
                    setStudents(students.map((r, j) => (j === i ? { ...r, parentName: x } : r)))
                  }
                  error={f(`students.${i}.parentName`)}
                />
                <TextField
                  label={labels.students.parentPhone}
                  name={`phone-${i}`}
                  type="tel"
                  inputMode="tel"
                  value={s.parentPhone}
                  onChange={(x) =>
                    setStudents(students.map((r, j) => (j === i ? { ...r, parentPhone: x } : r)))
                  }
                  error={f(`students.${i}.parentPhone`)}
                />
                {students.length > 1 && (
                  <Box>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setStudents(students.filter((_, j) => j !== i))}
                    >
                      {fill(labels.students.removeTemplate, { n: i + 1 })}
                    </Button>
                  </Box>
                )}
              </Stack>
            ))}
            {students.length < 20 ? (
              <Box>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setStudents([...students, { fullName: '', parentName: '', parentPhone: '' }])
                  }
                >
                  {labels.students.add}
                </Button>
              </Box>
            ) : (
              <Text variant="bodySmall" tone="secondary">
                {labels.students.max}
              </Text>
            )}
          </Stack>
        );
      case 'timetable':
        return (
          <Stack spacing={4}>
            {slots.map((s, i) => (
              <Stack
                key={i}
                component="fieldset"
                spacing={3}
                sx={{
                  border: '1px solid',
                  borderColor: 'ab.border',
                  borderRadius: 3,
                  padding: 4,
                  margin: 0,
                }}
              >
                <Box component="legend" sx={{ paddingInline: 1 }}>
                  <Text variant="meta" tone="secondary" as="span">
                    {fill(labels.timetable.slotTemplate, { n: i + 1 })}
                  </Text>
                </Box>
                <Select
                  label={labels.timetable.day}
                  value={String(s.weekday)}
                  onChange={(x) =>
                    setSlots(slots.map((r, j) => (j === i ? { ...r, weekday: Number(x) } : r)))
                  }
                  options={labels.days.map((d, k) => ({ value: String(k + 1), label: d }))}
                />
                <Stack direction="row" spacing={2}>
                  <TimeField
                    id={`start-${i}`}
                    label={labels.timetable.start}
                    value={s.start}
                    onChange={(x) =>
                      setSlots(slots.map((r, j) => (j === i ? { ...r, start: x } : r)))
                    }
                  />
                  <TimeField
                    id={`end-${i}`}
                    label={labels.timetable.end}
                    value={s.end}
                    onChange={(x) =>
                      setSlots(slots.map((r, j) => (j === i ? { ...r, end: x } : r)))
                    }
                    error={
                      f(`slots.${i}.end`) ??
                      (s.end <= s.start ? labels.timetable.endAfterStart : undefined)
                    }
                  />
                </Stack>
                {slots.length > 1 && (
                  <Box>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                    >
                      {fill(labels.timetable.removeTemplate, { n: i + 1 })}
                    </Button>
                  </Box>
                )}
              </Stack>
            ))}
            {slots.length < 14 && (
              <Box>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setSlots([
                      ...slots,
                      {
                        weekday: 3,
                        start: slots[0]?.start ?? '17:00',
                        end: slots[0]?.end ?? '18:00',
                      },
                    ])
                  }
                >
                  {labels.timetable.add}
                </Button>
              </Box>
            )}
          </Stack>
        );
    }
  })();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send('save');
  };

  return (
    <Box component="form" noValidate onSubmit={submit}>
      <Stack spacing={5}>
        {!online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {body}
        <Stack
          direction="row"
          sx={{ gap: 2, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}
        >
          {previous ? (
            <Button variant="ghost" href={previous}>
              {labels.actions.back}
            </Button>
          ) : (
            <span />
          )}
          <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
            {skippable && (
              <Button
                variant="secondary"
                loading={busy === 'skip'}
                disabled={!online || busy !== undefined}
                onClick={() => void send('skip')}
              >
                {labels.actions.skip}
              </Button>
            )}
            <Button
              type="submit"
              loading={busy === 'save'}
              disabled={!online || busy !== undefined}
            >
              {labels.actions.save}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}

/** A native time input styled like the other fields (24-hour value `HH:MM`). */
function TimeField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  return (
    <Stack spacing={1} sx={{ flex: 1 }}>
      <Text variant="meta" tone="secondary" as="span">
        <label htmlFor={id}>{label}</label>
      </Text>
      <Box
        component="input"
        id={id}
        type="time"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        sx={{
          minBlockSize: 48,
          paddingInline: '12px',
          font: 'inherit',
          fontSize: 16,
          color: 'ab.textPrimary',
          bgcolor: 'ab.surface',
          border: '1px solid',
          borderColor: error ? 'ab.status.danger.fg' : 'ab.borderStrong',
          borderRadius: 2,
        }}
      />
      {error && (
        <Text variant="bodySmall" as="span">
          <span id={`${id}-error`}>{error}</span>
        </Text>
      )}
    </Stack>
  );
}

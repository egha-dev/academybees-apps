// Shared by the Add Student and Edit sheets (lazy chunks, no 'use client', C-80).
import type { CustomField, CustomFieldValues, Student } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { DateInput, SelectInput, TextInput } from '@academybee/ui/components/fields';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

export type FormLabels = Messages['people']['form'];
export type StudentDraft = {
  fullName: string;
  preferredName: string;
  dateOfBirth: string;
  gender: string;
  schoolName: string;
  grade: string;
  admissionDate: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  tags: string;
  custom: Record<string, string>;
};

export const PHONE_PATTERN = /^(\+[1-9]\d{6,14}|[6-9]\d{9})$/;
export const cleanPhone = (v: string) => v.replace(/[\s()-]/g, '');

export function emptyDraft(today: string): StudentDraft {
  return {
    fullName: '',
    preferredName: '',
    dateOfBirth: '',
    gender: '',
    schoolName: '',
    grade: '',
    admissionDate: today,
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    tags: '',
    custom: {},
  };
}

export function draftFrom(s: Student): StudentDraft {
  return {
    fullName: s.fullName,
    preferredName: s.preferredName ?? '',
    dateOfBirth: s.dateOfBirth ?? '',
    gender: s.gender ?? '',
    schoolName: s.schoolName ?? '',
    grade: s.grade ?? '',
    admissionDate: s.admissionDate,
    line1: s.address?.line1 ?? '',
    line2: s.address?.line2 ?? '',
    city: s.address?.city ?? '',
    state: s.address?.state ?? '',
    postalCode: s.address?.postalCode ?? '',
    emergencyName: s.emergencyContact?.name ?? '',
    emergencyRelationship: s.emergencyContact?.relationship ?? '',
    emergencyPhone: s.emergencyContact?.phone ?? '',
    tags: s.tags.join(', '),
    custom: Object.fromEntries(
      Object.entries(s.customFields).map(([k, v]) => [k, v === null ? '' : String(v)]),
    ),
  };
}

/** Request body fields from a draft (profile only; the caller adds version/parent). */
export function profileBody(d: StudentDraft, fields: CustomField[], full: boolean) {
  const customFields: CustomFieldValues = {};
  for (const f of fields.filter((x) => !x.archived)) {
    const raw = d.custom[f.key] ?? '';
    if (!raw && !full) continue;
    customFields[f.key] = raw === '' ? null : f.type === 'NUMBER' ? Number(raw) : raw;
  }
  const address = [d.line1, d.line2, d.city, d.state, d.postalCode].some(Boolean)
    ? { line1: d.line1, line2: d.line2, city: d.city, state: d.state, postalCode: d.postalCode }
    : null;
  return {
    fullName: d.fullName,
    preferredName: d.preferredName,
    dateOfBirth: d.dateOfBirth || null,
    gender: d.gender || null,
    schoolName: d.schoolName,
    grade: d.grade,
    ...(d.admissionDate ? { admissionDate: d.admissionDate } : {}),
    ...(full
      ? {
          address,
          emergencyContact: d.emergencyName
            ? {
                name: d.emergencyName,
                relationship: d.emergencyRelationship,
                phone: cleanPhone(d.emergencyPhone),
              }
            : null,
          tags: d.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }
      : {}),
    customFields,
  };
}

/** Client-side checks before sending (the API checks again). Keys match API error paths. */
export function checkDraft(
  d: StudentDraft,
  fields: CustomField[],
  labels: FormLabels,
  full: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.fullName.trim()) errors.fullName = labels.required;
  else if (!/\p{L}/u.test(d.fullName)) errors.fullName = labels.nameLetters;
  if (full && d.emergencyName && !PHONE_PATTERN.test(cleanPhone(d.emergencyPhone)))
    errors['emergencyContact.phone'] = labels.phoneInvalid;
  for (const f of fields.filter((x) => !x.archived && x.required))
    if (!d.custom[f.key]) errors[`customFields.${f.key}`] = labels.required;
  return errors;
}

/** API issue → message for one field. */
export function issueMessage(issue: string | undefined, labels: FormLabels): string | undefined {
  if (!issue) return undefined;
  if (issue === 'required' || issue === 'too_small') return labels.required;
  if (issue === 'letters') return labels.nameLetters;
  return labels.invalid;
}

export function StudentFields({
  draft,
  onChange,
  errors,
  fields,
  labels,
  genderLabels,
  full,
  today,
}: {
  draft: StudentDraft;
  onChange: (patch: Partial<StudentDraft>) => void;
  errors: Record<string, string>;
  fields: CustomField[];
  labels: FormLabels;
  genderLabels: Messages['people']['gender'];
  /** Edit: every field; Add: the profile basics. */
  full: boolean;
  today: string;
}) {
  const active = fields.filter((f) => !f.archived);
  const text = (key: keyof StudentDraft, label: string, error?: string) => (
    <TextInput
      name={key}
      label={label}
      value={draft[key] as string}
      onChange={(v) => onChange({ [key]: v })}
      error={error}
    />
  );
  return (
    <Stack spacing={3}>
      {text('preferredName', labels.preferredName)}
      <DateInput
        name="dateOfBirth"
        label={labels.dateOfBirth}
        value={draft.dateOfBirth}
        max={today}
        onChange={(v) => onChange({ dateOfBirth: v })}
        error={errors.dateOfBirth}
      />
      <SelectInput
        name="gender"
        label={labels.gender}
        value={draft.gender}
        onChange={(v) => onChange({ gender: v })}
        options={[
          { value: '', label: labels.genderNone },
          ...(Object.keys(genderLabels) as Array<keyof typeof genderLabels>).map((g) => ({
            value: g,
            label: genderLabels[g],
          })),
        ]}
      />
      {text('schoolName', labels.schoolName)}
      {text('grade', labels.grade)}
      {full && (
        <>
          <DateInput
            name="admissionDate"
            label={labels.admissionDate}
            value={draft.admissionDate}
            required
            onChange={(v) => onChange({ admissionDate: v })}
            error={errors.admissionDate}
          />
          {text('line1', labels.addressLine1)}
          {text('line2', labels.addressLine2)}
          {text('city', labels.city)}
          {text('state', labels.state)}
          {text('postalCode', labels.postalCode)}
          <Text variant="section" as="h3">
            {labels.emergencyHeading}
          </Text>
          {text('emergencyName', labels.emergencyName, errors['emergencyContact.name'])}
          {text('emergencyRelationship', labels.emergencyRelationship)}
          <TextInput
            name="emergencyPhone"
            label={labels.emergencyPhone}
            type="tel"
            inputMode="tel"
            value={draft.emergencyPhone}
            onChange={(v) => onChange({ emergencyPhone: v })}
            error={errors['emergencyContact.phone']}
          />
          <TextInput
            name="tags"
            label={labels.tags}
            helperText={labels.tagsHint}
            value={draft.tags}
            onChange={(v) => onChange({ tags: v })}
          />
        </>
      )}
      {active.length > 0 && (
        <Text variant="section" as="h3">
          {labels.customHeading}
        </Text>
      )}
      {active.map((f) => {
        const value = draft.custom[f.key] ?? '';
        const set = (v: string) => onChange({ custom: { ...draft.custom, [f.key]: v } });
        const error = errors[`customFields.${f.key}`];
        if (f.type === 'SELECT')
          return (
            <SelectInput
              key={f.key}
              name={f.key}
              label={f.label}
              required={f.required}
              value={value}
              onChange={set}
              error={error}
              options={[{ value: '', label: labels.selectNone }, ...f.options]}
            />
          );
        if (f.type === 'DATE')
          return (
            <DateInput
              key={f.key}
              name={f.key}
              label={f.label}
              required={f.required}
              value={value}
              onChange={set}
              error={error}
            />
          );
        return (
          <TextInput
            key={f.key}
            name={f.key}
            label={f.label}
            required={f.required}
            value={value}
            inputMode={f.type === 'NUMBER' ? 'numeric' : 'text'}
            onChange={set}
            error={error}
          />
        );
      })}
    </Stack>
  );
}

// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { CustomField } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { CheckboxGroup } from '@academybee/ui/components/checkboxes';
import { useToast } from '@academybee/ui/components/feedback';
import { SelectInput, TextAreaInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type PeopleErrorLabels, peopleErrorMessage } from './errors';

type Draft = { label: string; type: CustomField['type']; options: string; required: boolean };

/**
 * Settings → Custom fields (G-05): up to 10 typed fields. Hiding a field keeps the answers
 * already stored; order sets how they appear on Student 360 and the forms.
 */
export function CustomFieldsEditor({
  fields,
  max,
  canManage,
  labels,
}: {
  fields: CustomField[];
  max: number;
  canManage: boolean;
  labels: {
    fields: Messages['people']['fields'];
    form: Messages['people']['form'];
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const t = labels.fields;
  const [editing, setEditing] = useState<CustomField | 'new'>();
  const [key, setKey] = useState('');
  const [draft, setDraft] = useState<Draft>({
    label: '',
    type: 'TEXT',
    options: '',
    required: false,
  });
  const [error, setError] = useState<string>();
  const [labelError, setLabelError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const active = fields.filter((f) => !f.archived).length;

  function open(field: CustomField | 'new') {
    setKey(crypto.randomUUID());
    setError(undefined);
    setLabelError(undefined);
    setDraft(
      field === 'new'
        ? { label: '', type: 'TEXT', options: '', required: false }
        : {
            label: field.label,
            type: field.type,
            options: field.options.map((o) => o.label).join('\n'),
            required: field.required,
          },
    );
    setEditing(field);
  }

  async function call(path: string, method: 'POST' | 'PATCH', body: unknown, message: string) {
    setBusy(true);
    const res = await api(path, {
      method,
      body,
      ...(method === 'POST' ? { headers: { 'Idempotency-Key': key } } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      const tooMany = res.error.details?.some((d) => d.issue === 'too_many');
      const text = tooMany
        ? fill(t.tooMany, { max: String(max) })
        : peopleErrorMessage(res.error, labels.errors);
      if (editing) setError(text);
      else toast(text, 'error');
      return false;
    }
    toast(message);
    router.refresh();
    return true;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.label.trim()) return setLabelError(labels.form.required);
    const options = draft.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);
    const ok =
      editing === 'new'
        ? await call(
            '/custom-fields',
            'POST',
            {
              label: draft.label,
              type: draft.type,
              required: draft.required,
              ...(draft.type === 'SELECT' ? { options } : {}),
            },
            t.saved,
          )
        : await call(
            `/custom-fields/${editing!.id}`,
            'PATCH',
            {
              label: draft.label,
              required: draft.required,
              ...(editing!.type === 'SELECT' ? { options } : {}),
            },
            t.saved,
          );
    if (ok) setEditing(undefined);
  }

  const move = (index: number, by: -1 | 1) => {
    const a = fields[index]!;
    const b = fields[index + by]!;
    void call(`/custom-fields/${a.id}`, 'PATCH', { sortOrder: b.sortOrder }, t.saved).then(
      (ok) => ok && call(`/custom-fields/${b.id}`, 'PATCH', { sortOrder: a.sortOrder }, t.saved),
    );
  };

  return (
    <Stack spacing={4}>
      <Text tone="secondary">{fill(t.count, { count: String(active), max: String(max) })}</Text>
      {!canManage && <Text tone="secondary">{t.readOnly}</Text>}
      {fields.length === 0 ? (
        <Text tone="secondary">{t.empty}</Text>
      ) : (
        <Stack component="ul" sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {fields.map((field, index) => (
            <Box
              component="li"
              key={field.id}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 2,
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBlock: 3,
                borderBlockEnd: '1px solid',
                borderColor: 'ab.border',
              }}
            >
              <Stack spacing={0.5}>
                <Text>
                  <strong>{field.label}</strong>
                </Text>
                <Text variant="meta" tone="secondary">
                  {[
                    t.types[field.type],
                    field.required ? t.required : null,
                    field.archived ? t.archived : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Stack>
              {canManage && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <PlainButton variant="ghost" onClick={() => open(field)} disabled={!online}>
                    {t.edit}
                  </PlainButton>
                  <PlainButton
                    variant="ghost"
                    disabled={!online || busy}
                    onClick={() =>
                      void call(
                        `/custom-fields/${field.id}`,
                        'PATCH',
                        { archived: !field.archived },
                        t.saved,
                      )
                    }
                  >
                    {field.archived ? t.unarchive : t.archive}
                  </PlainButton>
                  {index > 0 && (
                    <PlainButton
                      variant="ghost"
                      disabled={!online || busy}
                      onClick={() => move(index, -1)}
                    >
                      <span aria-hidden>{t.up}</span>
                      <Box component="span" sx={visuallyHidden}>
                        {fill(t.moveUp, { label: field.label })}
                      </Box>
                    </PlainButton>
                  )}
                  {index < fields.length - 1 && (
                    <PlainButton
                      variant="ghost"
                      disabled={!online || busy}
                      onClick={() => move(index, 1)}
                    >
                      <span aria-hidden>{t.down}</span>
                      <Box component="span" sx={visuallyHidden}>
                        {fill(t.moveDown, { label: field.label })}
                      </Box>
                    </PlainButton>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      )}
      {canManage && (
        <Box>
          <PlainButton
            variant="primary"
            onClick={() => open('new')}
            disabled={!online || active >= max}
          >
            {t.add}
          </PlainButton>
          {active >= max && (
            <Text variant="meta" tone="secondary">
              {fill(t.tooMany, { max: String(max) })}
            </Text>
          )}
        </Box>
      )}

      <Sheet
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={
          editing === 'new' || !editing
            ? t.createTitle
            : fill(t.editTitle, { label: editing.label })
        }
        closeLabel={labels.form.close}
      >
        <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void save(e)}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <TextInput
            name="label"
            label={t.label}
            required
            value={draft.label}
            onChange={(label) => setDraft((d) => ({ ...d, label }))}
            error={labelError}
          />
          {editing === 'new' && (
            <SelectInput
              name="type"
              label={t.type}
              value={draft.type}
              onChange={(type) => setDraft((d) => ({ ...d, type: type as Draft['type'] }))}
              options={(['TEXT', 'NUMBER', 'DATE', 'SELECT'] as const).map((type) => ({
                value: type,
                label: t.types[type],
              }))}
            />
          )}
          {draft.type === 'SELECT' && (
            <TextAreaInput
              name="options"
              label={t.options}
              helperText={t.optionsHint}
              rows={4}
              value={draft.options}
              onChange={(options) => setDraft((d) => ({ ...d, options }))}
            />
          )}
          <CheckboxGroup
            name="required"
            legend={t.required}
            value={draft.required ? ['yes'] : []}
            onChange={(v) => setDraft((d) => ({ ...d, required: v.includes('yes') }))}
            options={[{ value: 'yes', label: t.requiredField }]}
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online}>
              {t.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(undefined)}>
              {labels.form.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
    </Stack>
  );
}

const visuallyHidden = {
  position: 'absolute',
  inlineSize: 1,
  blockSize: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

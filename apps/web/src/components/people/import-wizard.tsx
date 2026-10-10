// Loaded lazily by import-lazy.tsx (no 'use client', C-80).
import type { ImportJob } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { type PeopleErrorLabels, peopleErrorMessage } from './errors';

export type ImportLabels = Messages['people']['import'] & {
  common: Messages['people']['form'];
  errors: PeopleErrorLabels;
};
export type ImportFieldOption = { key: string; label: string; required?: boolean };

const WORKING = new Set(['UPLOADED', 'VALIDATING', 'COMMITTING']);

/**
 * Import students and parents (G-02, ADR-036): template → upload → match columns and check the
 * preview (problems in words) → import → result and a downloadable problem list. The job id is
 * kept in the URL, so a reload resumes it. Online only.
 */
export function ImportWizard({
  initial,
  fields,
  doneHref,
  labels,
}: {
  initial: ImportJob | null;
  fields: ImportFieldOption[];
  /** Where "Go to students" leads (Students, or back to the setup step). */
  doneHref: string;
  labels: ImportLabels;
}) {
  const online = useOnline();
  const [job, setJob] = useState<ImportJob | null>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>(() => toDraft(initial));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const p = labels.preview;

  const refresh = useCallback(async (id: string) => {
    const res = await api<ImportJob>(`/students/import/${id}`);
    if (res.ok) {
      setJob(res.data);
      if (res.data.status === 'PREVIEW_READY') setMapping(toDraft(res.data));
    }
  }, []);

  // While the server works on the file, check every second.
  useEffect(() => {
    if (!job || !WORKING.has(job.status)) return;
    const timer = setTimeout(() => void refresh(job.id), 1000);
    return () => clearTimeout(timer);
  }, [job, refresh]);

  function remember(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('job', id);
    else url.searchParams.delete('job');
    window.history.replaceState(null, '', url);
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError(labels.common.required);
    setBusy(true);
    setError(undefined);
    const res = await api<ImportJob>('/students/import', {
      method: 'POST',
      raw: file,
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
        'x-file-name': encodeURIComponent(file.name),
      },
    });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue as keyof ImportLabels['uploadError'] | undefined;
      return setError(
        issue && issue in labels.uploadError
          ? labels.uploadError[issue]
          : peopleErrorMessage(res.error, labels.errors),
      );
    }
    setJob(res.data);
    remember(res.data.id);
  }

  async function recheck() {
    if (!job) return;
    if (!mapping.fullName) return setError(labels.mapping.required);
    setBusy(true);
    setError(undefined);
    const body = Object.fromEntries(
      Object.entries(mapping)
        .filter(([, column]) => column !== '')
        .map(([field, column]) => [field, Number(column)]),
    );
    const res = await api<ImportJob>(`/students/import/${job.id}/mapping`, {
      method: 'PUT',
      body: { version: job.version, mapping: body },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    setJob(res.data);
  }

  async function commit() {
    if (!job) return;
    setBusy(true);
    setError(undefined);
    const res = await api<ImportJob>(`/students/import/${job.id}/commit`, {
      method: 'POST',
      body: { version: job.version },
      headers: { 'Idempotency-Key': `${job.id}-commit` },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    setJob(res.data);
  }

  function startOver() {
    setJob(null);
    setFile(null);
    setError(undefined);
    remember(null);
  }

  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const issueText = (issue: string) =>
    (labels.issue as Record<string, string>)[issue] ?? labels.errors.generic;

  // ── Upload ────────────────────────────────────────────────────────────────────────────────
  if (!job)
    return (
      <Stack spacing={5}>
        <Stack spacing={2} component="section" aria-labelledby="imp-template">
          <Text variant="section" as="h2" id="imp-template">
            {labels.template.title}
          </Text>
          <Text tone="secondary">{labels.template.body}</Text>
          <Box>
            <PlainButton href="/api/v1/students/import/template">
              {labels.template.download}
            </PlainButton>
          </Box>
        </Stack>
        <Stack
          component="form"
          spacing={3}
          aria-labelledby="imp-upload"
          onSubmit={(e: FormEvent) => void upload(e)}
        >
          <Text variant="section" as="h2" id="imp-upload">
            {labels.upload.title}
          </Text>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Box component="label" htmlFor="import-file" sx={{ fontSize: 14, fontWeight: 600 }}>
            {labels.upload.field}
          </Box>
          <Box
            component="input"
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby="import-file-hint"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
            sx={{ font: 'inherit', minBlockSize: 48 }}
          />
          <Text variant="bodySmall" tone="secondary">
            <span id="import-file-hint">{labels.upload.hint}</span>
          </Text>
          {!online && <Text tone="secondary">{labels.common.offline}</Text>}
          <Box>
            <Button type="submit" loading={busy} disabled={!online || !file}>
              {busy ? labels.upload.uploading : labels.upload.submit}
            </Button>
          </Box>
        </Stack>
      </Stack>
    );

  // ── Working ───────────────────────────────────────────────────────────────────────────────
  if (WORKING.has(job.status))
    return (
      <Stack spacing={2} role="status" aria-live="polite">
        <Text>{job.status === 'COMMITTING' ? p.committing : labels.upload.reading}</Text>
        <Text variant="meta" tone="secondary">
          {job.fileName}
        </Text>
      </Stack>
    );

  // ── Failed ────────────────────────────────────────────────────────────────────────────────
  if (job.status === 'FAILED')
    return (
      <Stack spacing={3}>
        <InlineAlert tone="danger">
          {(labels.failure as Record<string, string>)[job.failure ?? 'internal'] ??
            labels.failure.internal}
        </InlineAlert>
        {job.createdRows > 0 && (
          <Text>{fillCount(labels.done.body, job.createdRows, 'created')}</Text>
        )}
        <Box>
          <PlainButton onClick={startOver}>{p.startOver}</PlainButton>
        </Box>
      </Stack>
    );

  // ── Done ──────────────────────────────────────────────────────────────────────────────────
  if (job.status === 'COMPLETED') {
    const skipped = job.errorRows + job.duplicateRows;
    return (
      <Stack spacing={3} role="status">
        <Text variant="section" as="h2">
          {labels.done.title}
        </Text>
        <Text>{fillCount(labels.done.body, job.createdRows, 'created')}</Text>
        <Text tone="secondary">{fillCount(labels.done.skipped, skipped)}</Text>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <PlainButton variant="primary" href={doneHref}>
            {labels.done.view}
          </PlainButton>
          {skipped > 0 && (
            <PlainButton href={`/api/v1/students/import/${job.id}/errors.csv`}>
              {p.report}
            </PlainButton>
          )}
          <PlainButton variant="ghost" onClick={startOver}>
            {labels.done.again}
          </PlainButton>
        </Box>
      </Stack>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────────────────────
  const overLimit = job.seatsLeft !== null && job.validRows > job.seatsLeft;
  const columnOptions = [
    { value: '', label: labels.mapping.none },
    ...job.headers.map((h, i) => ({ value: String(i), label: h })),
  ];
  return (
    <Stack spacing={5}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Stack component="section" spacing={2} aria-labelledby="imp-summary">
        <Text variant="section" as="h2" id="imp-summary">
          {p.title}
        </Text>
        <Text tone="secondary">
          {job.fileName} · {fillCount(p.summary, job.totalRows, 'total')}
        </Text>
        <Stack component="ul" spacing={1} sx={{ margin: 0, paddingInlineStart: 3 }}>
          <li>
            <Text as="span">
              <strong>{fillCount(p.ready, job.validRows)}</strong>
            </Text>
          </li>
          <li>
            <Text as="span">{fillCount(p.errors, job.errorRows)}</Text>
          </li>
          <li>
            <Text as="span">{fillCount(p.exists, job.duplicateRows)}</Text>
          </li>
        </Stack>
        {overLimit && (
          <InlineAlert tone="warning">
            {fill(fillCount(p.limit, job.seatsLeft ?? 0, 'seats'), {
              count: String(job.validRows),
            })}
          </InlineAlert>
        )}
      </Stack>

      <Stack component="section" spacing={3} aria-labelledby="imp-mapping">
        <Text variant="section" as="h2" id="imp-mapping">
          {labels.mapping.title}
        </Text>
        <Text tone="secondary">{labels.mapping.body}</Text>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {fields.map((f) => (
            <SelectInput
              key={f.key}
              name={`map-${f.key}`}
              label={f.label}
              required={f.required ?? false}
              value={mapping[f.key] ?? ''}
              onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
              options={columnOptions}
            />
          ))}
        </Box>
        <Box>
          <PlainButton onClick={() => void recheck()} busy={busy} disabled={!online}>
            {labels.mapping.apply}
          </PlainButton>
        </Box>
      </Stack>

      {job.preview.length > 0 && (
        <Stack component="section" spacing={2} aria-labelledby="imp-problems">
          <Text variant="section" as="h2" id="imp-problems">
            {p.problemsTitle}
          </Text>
          <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {job.preview.map((row) => (
              <Box
                component="li"
                key={row.n}
                sx={{
                  borderInlineStart: '3px solid',
                  borderColor: row.status === 'error' ? 'ab.status.danger.solid' : 'ab.border',
                  paddingInlineStart: 2,
                }}
              >
                <Text>
                  <strong>{fill(p.row, { n: String(row.n) })}</strong> · {row.name || p.noName}
                </Text>
                {row.status === 'exists' ? (
                  <Text variant="bodySmall" tone="secondary">
                    {p.existsLine}
                  </Text>
                ) : (
                  row.issues.map((issue) => (
                    <Text
                      key={`${issue.field}-${issue.issue}`}
                      variant="bodySmall"
                      tone="secondary"
                    >
                      {fieldLabel(issue.field)}: {issueText(issue.issue)}
                    </Text>
                  ))
                )}
              </Box>
            ))}
          </Stack>
          {job.errorRows + job.duplicateRows > job.preview.length && (
            <Text variant="meta">{p.more}</Text>
          )}
        </Stack>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          onClick={() => void commit()}
          loading={busy}
          disabled={!online || job.validRows === 0 || overLimit}
        >
          {fillCount(p.commit, job.validRows)}
        </Button>
        {job.errorRows + job.duplicateRows > 0 && (
          <PlainButton href={`/api/v1/students/import/${job.id}/errors.csv`}>
            {p.report}
          </PlainButton>
        )}
        <PlainButton variant="ghost" onClick={startOver}>
          {p.startOver}
        </PlainButton>
      </Box>
    </Stack>
  );
}

function toDraft(job: ImportJob | null): Record<string, string> {
  return Object.fromEntries(Object.entries(job?.mapping ?? {}).map(([k, v]) => [k, String(v)]));
}

/**
 * The catalogue's plural messages (`{count, plural, =0 {…} one {…} other {…}}`) without an ICU
 * runtime in the browser (G-24): pick the branch and fill `#`.
 */
function fillCount(template: string, n: number, name = 'count'): string {
  const m = new RegExp(`\\{${name}, plural, (.*)\\}`, 's').exec(template);
  if (!m) return fill(template, { [name]: String(n) });
  const branches = new Map<string, string>();
  for (const b of m[1]!.matchAll(/(=\d+|one|other)\s*\{([^{}]*)\}/g)) branches.set(b[1]!, b[2]!);
  const category = new Intl.PluralRules(document.documentElement.lang || undefined).select(n);
  const pick = branches.get(`=${n}`) ?? branches.get(category) ?? branches.get('other') ?? '';
  return template.replace(m[0], pick.replace(/#/g, String(n)));
}

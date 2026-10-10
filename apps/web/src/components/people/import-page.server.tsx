import 'server-only';

import {
  CustomFieldListSchema,
  IMPORT_FIELDS,
  type ImportJob,
  ImportJobSchema,
} from '@academybee/contracts';
import { getMessages } from 'next-intl/server';

import { apiServerGet } from '@/lib/api.server';

import { ImportWizardLazy } from './import-lazy';

/**
 * What both import pages render (Students → Import and the setup step): the fields a column can
 * fill (with the academy's custom fields) and, after a reload, the job in progress (`?job=`).
 */
export async function ImportWorkspace({
  jobId,
  doneHref,
}: {
  jobId: string | undefined;
  doneHref: string;
}) {
  const [messages, fieldsRes, jobRes] = await Promise.all([
    getMessages(),
    apiServerGet('/custom-fields'),
    jobId && /^[0-9a-f-]{36}$/i.test(jobId)
      ? apiServerGet(`/students/import/${jobId}`)
      : Promise.resolve(undefined),
  ]);
  const p = messages.people;
  const custom = fieldsRes.ok ? CustomFieldListSchema.parse(await fieldsRes.json()).items : [];
  const job: ImportJob | null = jobRes?.ok ? ImportJobSchema.parse(await jobRes.json()) : null;
  const fields = [
    ...IMPORT_FIELDS.map((key) => ({
      key,
      label: p.import.fields[key],
      required: key === 'fullName',
    })),
    ...custom
      .filter((f) => !f.archived)
      .map((f) => ({ key: `custom:${f.key}`, label: f.label, required: f.required })),
  ];
  return (
    <ImportWizardLazy
      initial={job}
      fields={fields}
      doneHref={doneHref}
      labels={{ ...p.import, common: p.form, errors: { ...p.errors, offline: p.form.offline } }}
    />
  );
}

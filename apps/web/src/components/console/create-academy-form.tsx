'use client';

import {
  ACADEMY_TYPES,
  AcademyDetailSchema,
  type AcademyType,
  PLAN_KEYS,
  type PlanKey,
} from '@academybee/contracts';
import { slugFromName } from '@academybee/tenant';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Select, TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { consoleErrorMessage } from './errors';
import { SlugField } from './slug-field';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HAS_LETTER = /\p{L}/u;

type Errors = Partial<Record<'name' | 'slug' | 'ownerName' | 'ownerEmail', string>>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack
      component="fieldset"
      spacing={4}
      sx={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}
    >
      <Box component="legend" sx={{ padding: 0, marginBlockEnd: 3 }}>
        <Text variant="section" as="span">
          {title}
        </Text>
      </Box>
      {children}
    </Stack>
  );
}

/**
 * Create Academy (UX v1.1 §2): a short guided form, not an enterprise one. The address follows
 * the name until edited, with live availability. One Idempotency-Key per form, so a double click
 * or a retry never creates two academies; success goes to the activation screen (UX v1.1 §3).
 */
export function CreateAcademyForm({ rootDomain }: { rootDomain: string }) {
  const t = useTranslations('console');
  const router = useRouter();
  const online = useOnline();
  const [key] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [type, setType] = useState<AcademyType | ''>('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [plan, setPlan] = useState<PlanKey>('trial');
  const [branch, setBranch] = useState('');
  const [errors, setErrors] = useState<Errors & { type?: string }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onName = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(slugFromName(v));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const required = t('create.errors.required');
    const next: Errors & { type?: string } = {
      ...(!name.trim()
        ? { name: required }
        : HAS_LETTER.test(name)
          ? {}
          : { name: t('create.errors.nameInvalid') }),
      ...(type ? {} : { type: required }),
      ...(slug.trim() ? {} : { slug: required }),
      ...(!ownerName.trim()
        ? { ownerName: required }
        : HAS_LETTER.test(ownerName)
          ? {}
          : { ownerName: t('create.errors.nameInvalid') }),
      ...(!ownerEmail.trim()
        ? { ownerEmail: required }
        : EMAIL.test(ownerEmail.trim())
          ? {}
          : { ownerEmail: t('create.errors.emailInvalid') }),
    };
    setErrors(next);
    if (Object.keys(next).length) {
      setError(t('create.errors.fixFields'));
      return;
    }
    setBusy(true);
    setError(undefined);
    const res = await api<unknown>('/platform/tenants', {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: {
        name: name.trim(),
        academyType: type,
        slug: slug.trim(),
        owner: { name: ownerName.trim(), email: ownerEmail.trim() },
        planKey: plan,
        ...(branch.trim() ? { branchName: branch.trim() } : {}),
      },
    });
    if (res.ok) {
      const created = AcademyDetailSchema.parse(res.data);
      router.push(`/academies/${created.id}/created`);
      return;
    }
    setBusy(false);
    const details = res.error.details ?? [];
    const slugIssue = details.find((d) => d.path === 'slug')?.issue;
    if (slugIssue) {
      setErrors({
        slug: slugIssue === 'taken' ? t('create.errors.slugTaken') : t('create.errors.slugInvalid'),
      });
      setError(t('create.errors.fixFields'));
      return;
    }
    const field = details.find((d) => ['name', 'owner.name', 'branchName'].includes(d.path));
    if (field) {
      setErrors(
        field.path === 'owner.name'
          ? { ownerName: t('create.errors.nameInvalid') }
          : { name: t('create.errors.nameInvalid') },
      );
      setError(t('create.errors.fixFields'));
      return;
    }
    setError(consoleErrorMessage(res.error, t));
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e: FormEvent) => void submit(e)}
      sx={{ maxInlineSize: 640 }}
    >
      <Stack spacing={8}>
        {!online && <InlineAlert tone="warning">{t('errors.offline')}</InlineAlert>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Section title={t('create.sections.academy')}>
          <TextField
            label={t('create.fields.name')}
            name="name"
            value={name}
            onChange={onName}
            required
            error={errors.name}
            autoComplete="off"
          />
          <Select
            label={t('create.fields.type')}
            value={type}
            onChange={(v) => setType(v as AcademyType)}
            required
            {...(errors.type ? { error: errors.type } : {})}
            helperText={t('create.fields.typeHint')}
            options={[
              { value: '', label: '—' },
              ...ACADEMY_TYPES.map((k) => ({ value: k, label: t(`types.${k}`) })),
            ]}
          />
        </Section>
        <Section title={t('create.sections.address')}>
          <SlugField
            value={slug}
            onChange={(v) => {
              setSlugEdited(true);
              setSlug(v);
            }}
            rootDomain={rootDomain}
            error={errors.slug}
          />
        </Section>
        <Section title={t('create.sections.owner')}>
          <TextField
            label={t('create.fields.ownerName')}
            name="ownerName"
            value={ownerName}
            onChange={setOwnerName}
            required
            error={errors.ownerName}
            autoComplete="off"
          />
          <TextField
            label={t('create.fields.ownerEmail')}
            name="ownerEmail"
            type="email"
            inputMode="email"
            value={ownerEmail}
            onChange={setOwnerEmail}
            required
            error={errors.ownerEmail}
            helperText={t('create.fields.ownerHint')}
            autoComplete="off"
          />
        </Section>
        <Section title={t('create.sections.plan')}>
          <Select
            label={t('create.fields.plan')}
            value={plan}
            onChange={(v) => setPlan(v as PlanKey)}
            helperText={t('create.fields.planHint')}
            options={PLAN_KEYS.map((k) => ({ value: k, label: t(`plans.${k}`) }))}
          />
          <TextField
            label={t('create.fields.branch')}
            name="branchName"
            value={branch}
            onChange={setBranch}
            helperText={t('create.fields.branchHint')}
            autoComplete="off"
          />
        </Section>
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" href="/academies">
            {t('create.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!online}>
            {t('create.submit')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

'use client';

import { AcademyDetailSchema } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { Text } from '@academybee/ui/components/text';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { consoleErrorMessage } from './errors';
import { SlugField } from './slug-field';

/** Change the AcademyBee address (PRD v3.1 §F): the old one keeps redirecting (C-96). */
export function ChangeSubdomain({
  id,
  name,
  current,
  rootDomain,
}: {
  id: string;
  name: string;
  current: string;
  rootDomain: string;
}) {
  const t = useTranslations('console');
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = slug.trim();
    if (!value) return setFieldError(t('create.errors.required'));
    if (value === current) return setFieldError(t('domain.unchanged'));
    setBusy(true);
    setError(undefined);
    const res = await api<unknown>(`/platform/tenants/${id}/domains`, {
      method: 'POST',
      headers: { 'idempotency-key': key },
      body: { slug: value },
    });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.find((d) => d.path === 'slug')?.issue;
      if (issue)
        return setFieldError(
          issue === 'taken'
            ? t('create.errors.slugTaken')
            : issue === 'unchanged'
              ? t('domain.unchanged')
              : t('create.errors.slugInvalid'),
        );
      return setError(consoleErrorMessage(res.error, t));
    }
    const academy = AcademyDetailSchema.parse(res.data);
    setOpen(false);
    toast(t('domain.changed', { host: academy.host }));
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={!online}
        onClick={() => {
          setKey(crypto.randomUUID());
          setSlug('');
          setFieldError(undefined);
          setError(undefined);
          setOpen(true);
        }}
      >
        {t('domain.change')}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('domain.changeTitle', { academy: name })}
        closeLabel={t('detail.dialog.cancel')}
      >
        <form noValidate onSubmit={(e) => void submit(e)}>
          <Stack spacing={4}>
            <Text tone="secondary">{t('domain.changeBody')}</Text>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <SlugField
              value={slug}
              onChange={(v) => {
                setFieldError(undefined);
                setSlug(v);
              }}
              rootDomain={rootDomain}
              error={fieldError}
              label={t('domain.newSlug')}
            />
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('detail.dialog.cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('domain.save')}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Sheet>
    </>
  );
}

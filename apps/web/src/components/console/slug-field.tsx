'use client';

import { type SlugAvailability, SlugAvailabilitySchema } from '@academybee/contracts';
import { Button } from '@academybee/ui/components/actions';
import { TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/**
 * The AcademyBee address with live availability (UX v1.1 §2, C-88): checked 400 ms after the last
 * keystroke; taken addresses offer free alternatives. The server checks again on submit, so this
 * is guidance, never the decision.
 */
export function SlugField({
  value,
  onChange,
  rootDomain,
  error,
  label,
}: {
  value: string;
  onChange: (slug: string) => void;
  rootDomain: string;
  error?: string | undefined;
  label?: string;
}) {
  const t = useTranslations('console.create');
  // The latest answer, and which address it was for: anything else is still being checked.
  const [answer, setAnswer] = useState<{ slug: string; result?: SlugAvailability }>();
  const slug = value.trim().toLowerCase();
  const current = answer?.slug === slug ? answer : undefined;
  const result = current?.result;
  const checking = slug !== '' && !current;
  const unavailable = Boolean(current && !current.result);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    const timer = setTimeout(() => {
      void api<unknown>(`/platform/slug-availability?slug=${encodeURIComponent(slug)}`).then(
        (res) => {
          if (!live) return;
          const parsed = res.ok ? SlugAvailabilitySchema.safeParse(res.data) : undefined;
          setAnswer(parsed?.success ? { slug, result: parsed.data } : { slug });
        },
      );
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug]);

  const host = `${value.trim().toLowerCase()}.${rootDomain}`;
  const message = checking
    ? t('slug.checking')
    : unavailable
      ? t('slug.unavailable')
      : result?.status === 'available'
        ? t('slug.available', { host })
        : result?.status === 'taken'
          ? t('slug.taken', { host })
          : result?.status === 'reserved'
            ? t('slug.reserved')
            : result?.status === 'invalid'
              ? t(`slug.invalid.${(result.problem ?? 'format') as 'format'}`)
              : t('fields.slugHint');
  const bad = result && result.status !== 'available';

  return (
    <Stack spacing={2}>
      <TextField
        label={label ?? t('fields.slug')}
        name="slug"
        value={value}
        onChange={(v) => onChange(v.toLowerCase())}
        autoComplete="off"
        required
        error={error ?? (bad ? message : undefined)}
        {...(bad ? {} : { helperText: message })}
      />
      {/* Announced to screen readers; `data-status` lets tests wait for the answer. */}
      <Box
        component="span"
        aria-live="polite"
        data-testid="slug-status"
        data-status={result?.status ?? (checking ? 'checking' : '')}
        sx={{
          position: 'absolute',
          inlineSize: 1,
          blockSize: 1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {checking ? '' : message}
      </Box>
      {result && result.suggestions.length > 0 && (
        <Stack spacing={1}>
          <Text variant="meta" tone="secondary">
            {t('slug.suggestions')}
          </Text>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
            {result.suggestions.map((s) => (
              <Button key={s} variant="secondary" size="small" onClick={() => onChange(s)}>
                {t('slug.use', { slug: s })}
              </Button>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

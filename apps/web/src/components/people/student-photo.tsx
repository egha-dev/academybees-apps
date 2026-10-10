// Loaded lazily by students-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { useToast } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

const SIZE = 72;

/**
 * The student's photo (G-05, C-97): initials until there is one; the photo itself comes through a
 * 5-minute link the API audits, never from a public address. Adding one needs a parent's consent
 * for photos (G-06).
 */
export function StudentPhoto({
  studentId,
  name,
  hasPhoto,
  photoConsent,
  canManage,
  labels,
}: {
  studentId: string;
  name: string;
  hasPhoto: boolean;
  photoConsent: boolean;
  canManage: boolean;
  labels: Messages['people']['photo'];
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [url, setUrl] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasPhoto) return;
    let cancelled = false;
    void api<{ url: string }>(`/students/${studentId}/photo`).then((res) => {
      if (!cancelled && res.ok) setUrl(res.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [hasPhoto, studentId]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast(labels.tooLarge, 'error');
    setBusy(true);
    const res = await api(`/students/${studentId}/photo`, { method: 'PUT', raw: file });
    setBusy(false);
    if (!res.ok) {
      const issue = res.error.details?.[0]?.issue;
      return toast(
        issue === 'unsupported_type'
          ? labels.notImage
          : issue === 'consent_required'
            ? labels.needsConsent
            : issue === 'photos_unavailable'
              ? labels.unavailable
              : labels.error,
        'error',
      );
    }
    toast(labels.saved);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await api(`/students/${studentId}/photo`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return toast(labels.error, 'error');
    setUrl(undefined);
    toast(labels.removed);
    router.refresh();
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join('');

  return (
    <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
      <Box
        sx={{
          inlineSize: SIZE,
          blockSize: SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'ab.accentSoft',
          color: 'ab.onAccentSoft',
          fontWeight: 700,
          fontSize: 24,
        }}
      >
        {url ? (
          <Box
            component="img"
            src={url}
            alt={fill(labels.alt, { name })}
            sx={{ inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </Box>
      {canManage && (
        <Stack spacing={0.5}>
          {photoConsent ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <PlainButton
                variant="ghost"
                busy={busy}
                disabled={!online}
                onClick={() => input.current?.click()}
              >
                {busy ? labels.uploading : hasPhoto ? labels.change : labels.add}
              </PlainButton>
              <Box
                component="input"
                ref={input}
                id={inputId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={hasPhoto ? labels.change : labels.add}
                onChange={(e: ChangeEvent<HTMLInputElement>) => void upload(e)}
                sx={{ display: 'none' }}
              />
              {hasPhoto && (
                <PlainButton
                  variant="ghost"
                  disabled={!online || busy}
                  onClick={() => void remove()}
                >
                  {labels.remove}
                </PlainButton>
              )}
            </Box>
          ) : (
            <Text variant="meta" tone="secondary">
              {labels.needsConsent}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

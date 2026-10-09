// Client code reached only through lazy() from client components: no 'use client' boundary,
// so the route manifest doesn't count it as eager JS (G-24).

import { type AcademyBranding, isReadableBrandColor } from '@academybee/contracts';
import { brandIdentityColors } from '@academybee/ui/brand';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { TextField } from '@academybee/ui/components/inputs';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { palettes, THEME_ATTRIBUTE } from '@academybee/ui/tokens';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react';

import { monogram } from '@/lib/monogram';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { academyErrorMessage, type AcademyErrorLabels } from './labels';

type ImageLabels = Record<
  'title' | 'hint' | 'none' | 'upload' | 'replace' | 'remove' | 'uploaded' | 'removed' | 'preview',
  string
>;

export type BrandingLabels = {
  unavailable: string;
  logo: ImageLabels;
  favicon: ImageLabels;
  colour: Record<
    | 'title'
    | 'hint'
    | 'picker'
    | 'hex'
    | 'save'
    | 'saved'
    | 'reset'
    | 'readable'
    | 'unreadable'
    | 'invalid',
    string
  >;
  preview: Record<'title' | 'light' | 'dark' | 'note', string>;
  address: Record<'title' | 'hint' | 'copy' | 'copied', string>;
  errors: AcademyErrorLabels;
};

const HEX = /^#[0-9a-f]{6}$/i;
const ACCEPT = 'image/png,image/jpeg,image/webp';

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Stack
      component="section"
      spacing={3}
      sx={{ paddingBlockEnd: 6, borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
    >
      <Stack spacing={1}>
        <Text variant="section" as="h2">
          {title}
        </Text>
        <Text tone="secondary">{hint}</Text>
      </Stack>
      {children}
    </Stack>
  );
}

/**
 * Branding & address (UX v1.1 §6, V1.2 §5; C-49, C-95, C-97): the AcademyBee address (read-only;
 * the console changes it), logo and browser icon uploads (checked by the server from the bytes),
 * and the brand colour with a live preview in both themes. A colour that can't carry readable text
 * can't be saved (the server checks too).
 */
export function BrandingEditor({
  value,
  name,
  url,
  canManage,
  labels,
}: {
  value: AcademyBranding;
  name: string;
  url: string;
  canManage: boolean;
  labels: BrandingLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [colour, setColour] = useState(value.primaryColor ?? '');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const enabled = canManage && online && busy === undefined;

  const valid = colour === '' || HEX.test(colour);
  const readable = colour === '' || (valid && isReadableBrandColor(colour));
  const tile = brandIdentityColors(valid && colour ? colour : null);

  async function upload(kind: 'logo' | 'favicon', e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(kind);
    setError(undefined);
    const res = await api(`/academy/branding/${kind}`, { method: 'PUT', raw: file });
    setBusy(undefined);
    if (!res.ok) return setError(academyErrorMessage(res.error, labels.errors));
    toast(labels[kind].uploaded);
    router.refresh();
  }

  async function remove(kind: 'logo' | 'favicon') {
    setBusy(`${kind}-remove`);
    setError(undefined);
    const res = await api(`/academy/branding/${kind}`, { method: 'DELETE' });
    setBusy(undefined);
    if (!res.ok) return setError(academyErrorMessage(res.error, labels.errors));
    toast(labels[kind].removed);
    router.refresh();
  }

  async function saveColour(next: string | null) {
    setBusy('colour');
    setError(undefined);
    const res = await api('/academy/branding', {
      method: 'PATCH',
      body: { version: value.version, primaryColor: next },
    });
    setBusy(undefined);
    if (!res.ok) return setError(academyErrorMessage(res.error, labels.errors));
    toast(labels.colour.saved);
    router.refresh();
  }

  const image = (kind: 'logo' | 'favicon') => {
    const l = labels[kind];
    const current = kind === 'logo' ? value.logoUrl : value.faviconUrl;
    return (
      <Section title={l.title} hint={l.hint}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          {current ? (
            <Box
              component="img"
              src={current}
              alt={l.preview}
              sx={{
                inlineSize: kind === 'logo' ? 96 : 48,
                blockSize: kind === 'logo' ? 96 : 48,
                objectFit: 'contain',
                borderRadius: 2,
                backgroundColor: palettes.light.surface,
                border: '1px solid',
                borderColor: 'ab.border',
              }}
            />
          ) : (
            <Text variant="bodySmall" tone="secondary">
              {l.none}
            </Text>
          )}
          {canManage && value.uploadsAvailable && (
            <Stack direction="row" spacing={2}>
              <Button
                variant="secondary"
                loading={busy === kind}
                disabled={!enabled}
                onClick={() => (kind === 'logo' ? logoInput : faviconInput).current?.click()}
              >
                {current ? l.replace : l.upload}
              </Button>
              {current && (
                <Button
                  variant="ghost"
                  loading={busy === `${kind}-remove`}
                  disabled={!enabled}
                  onClick={() => void remove(kind)}
                >
                  {l.remove}
                </Button>
              )}
            </Stack>
          )}
        </Stack>
        <input
          ref={kind === 'logo' ? logoInput : faviconInput}
          type="file"
          accept={ACCEPT}
          hidden
          aria-label={current ? l.replace : l.upload}
          data-testid={`${kind}-file`}
          onChange={(e) => void upload(kind, e)}
        />
      </Section>
    );
  };
  const previewTile = (scheme: 'light' | 'dark') => (
    <Stack
      {...{ [THEME_ATTRIBUTE]: scheme }}
      spacing={2}
      sx={{
        flex: '1 1 14rem',
        padding: 4,
        borderRadius: 3,
        bgcolor: 'ab.background',
        border: '1px solid',
        borderColor: 'ab.border',
      }}
    >
      <Text variant="meta" tone="secondary">
        {scheme === 'light' ? labels.preview.light : labels.preview.dark}
      </Text>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{
            inlineSize: 40,
            blockSize: 40,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            backgroundColor: tile?.background ?? 'ab.inverse',
            color: tile?.foreground ?? 'ab.onInverse',
          }}
        >
          {monogram(name)}
        </Box>
        <Text variant="section" as="span">
          <span data-i18n-exempt>{name}</span>
        </Text>
      </Stack>
    </Stack>
  );

  return (
    <Stack spacing={6}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {canManage && !online && <InlineAlert tone="warning">{labels.errors.offline}</InlineAlert>}

      <Section title={labels.address.title} hint={labels.address.hint}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          <Text>
            <strong data-i18n-exempt data-testid="academy-address">
              {url}
            </strong>
          </Text>
          <Button
            variant="secondary"
            size="small"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(() => toast(labels.address.copied))
            }
          >
            {labels.address.copy}
          </Button>
        </Stack>
      </Section>

      {canManage && !value.uploadsAvailable && (
        <InlineAlert tone="info">{labels.unavailable}</InlineAlert>
      )}
      {image('logo')}
      {image('favicon')}

      <Section title={labels.colour.title} hint={labels.colour.hint}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 3, alignItems: { sm: 'flex-end' } }}
        >
          <Stack spacing={1}>
            <Text variant="meta" tone="secondary" as="span">
              <label htmlFor="brand-colour-picker">{labels.colour.picker}</label>
            </Text>
            <Box
              component="input"
              id="brand-colour-picker"
              type="color"
              value={valid && colour ? colour : '#1F6F5C'}
              disabled={!canManage}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setColour(e.target.value.toUpperCase())
              }
              sx={{
                inlineSize: 64,
                blockSize: 48,
                padding: 0.5,
                border: '1px solid',
                borderColor: 'ab.borderStrong',
                borderRadius: 2,
                bgcolor: 'ab.surface',
                cursor: 'pointer',
              }}
            />
          </Stack>
          <Box sx={{ flex: 1, maxInlineSize: 240 }}>
            <TextField
              label={labels.colour.hex}
              name="primaryColor"
              value={colour}
              onChange={(v) => setColour(v.trim().toUpperCase())}
              disabled={!canManage}
              error={!valid ? labels.colour.invalid : undefined}
            />
          </Box>
        </Stack>
        {colour && valid && (
          <InlineAlert tone={readable ? 'success' : 'warning'}>
            {readable ? labels.colour.readable : labels.colour.unreadable}
          </InlineAlert>
        )}
        <Stack spacing={2}>
          <Text variant="meta" tone="secondary">
            {labels.preview.title}
          </Text>
          <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap' }}>
            {previewTile('light')}
            {previewTile('dark')}
          </Stack>
          <Text variant="bodySmall" tone="secondary">
            {labels.preview.note}
          </Text>
        </Stack>
        {canManage && (
          <Stack direction="row" spacing={2}>
            <Button
              loading={busy === 'colour'}
              disabled={!enabled || !valid || !readable || colour === (value.primaryColor ?? '')}
              onClick={() => void saveColour(colour || null)}
            >
              {labels.colour.save}
            </Button>
            {value.primaryColor && (
              <Button variant="ghost" disabled={!enabled} onClick={() => void saveColour(null)}>
                {labels.colour.reset}
              </Button>
            )}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

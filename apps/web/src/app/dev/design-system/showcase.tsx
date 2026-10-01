'use client';

import { formatDate, formatMoney, formatTime } from '@academybee/i18n';
import {
  AddIcon,
  AppShell,
  Box,
  Button,
  Card,
  ClassIcon,
  color,
  ConfirmDialog,
  Container,
  EmptyState,
  ErrorState,
  FeesIcon,
  HomeIcon,
  IconButton,
  MoreIcon,
  OfflineBanner,
  PeopleIcon,
  PermissionState,
  radius,
  Select,
  Sheet,
  Skeleton,
  Stack,
  StatusBadge,
  SyncIndicator,
  type SyncState,
  Text,
  TextField,
  TodayIcon,
  useToast,
} from '@academybee/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

const SWATCHES = [
  'ivory',
  'ink',
  'gold',
  'goldSoft',
  'success',
  'warning',
  'danger',
  'info',
] as const;
const SYNC_STATES: SyncState[] = ['synced', 'offline', 'pending', 'syncing', 'attention'];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Stack
      component="section"
      aria-labelledby={id}
      spacing={4}
      sx={{ paddingBlock: 6, borderBlockStart: `1px solid ${color.neutral[200]}` }}
    >
      <Text variant="section" as="h2" id={id}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

export function DesignSystemShowcase() {
  const t = useTranslations();
  const ds = (key: Parameters<typeof t>[0]) => t(key);
  const toast = useToast();
  const [name, setName] = useState('');
  const [batch, setBatch] = useState('morning');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const now = new Date();

  const navItems = [
    {
      key: 'today',
      label: t('shell.nav.today'),
      icon: <TodayIcon />,
      href: '#shell',
      active: true,
    },
    { key: 'students', label: t('shell.nav.students'), icon: <PeopleIcon />, href: '#shell' },
    { key: 'classes', label: t('shell.nav.classes'), icon: <ClassIcon />, href: '#shell' },
    { key: 'fees', label: t('shell.nav.fees'), icon: <FeesIcon />, href: '#shell' },
    { key: 'more', label: t('shell.nav.more'), icon: <MoreIcon />, href: '#shell' },
  ];

  return (
    <Container maxWidth="lg" sx={{ paddingBlock: 8 }}>
      <Stack spacing={2} sx={{ paddingBlockEnd: 4 }}>
        <Text variant="title" as="h1">
          {ds('designSystem.title')}
        </Text>
        <Text tone="secondary">{ds('designSystem.intro')}</Text>
      </Stack>

      <Section id="ds-colors" title={ds('designSystem.sections.colors')}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3 }}>
          {SWATCHES.map((name) => (
            <Stack key={name} spacing={1} sx={{ inlineSize: 120 }} data-i18n-exempt>
              <Box
                sx={{
                  blockSize: 64,
                  borderRadius: `${radius.md}px`,
                  backgroundColor: color[name],
                  border: `1px solid ${color.neutral[200]}`,
                }}
              />
              <Text variant="meta">{name}</Text>
              <Text variant="meta" tone="secondary">
                {color[name]}
              </Text>
            </Stack>
          ))}
        </Stack>
      </Section>

      <Section id="ds-type" title={ds('designSystem.sections.typography')}>
        <Text variant="display" as="p">
          {t('common.appName')}
        </Text>
        <Text variant="title" as="p">
          {t('shell.home.title')}
        </Text>
        <Text variant="section" as="p">
          {ds('designSystem.samples.cardTitle')}
        </Text>
        <Text>{t('shell.home.body')}</Text>
        <Text variant="meta" tone="secondary">
          {t('common.tagline')}
        </Text>
      </Section>

      <Section id="ds-buttons" title={ds('designSystem.sections.buttons')}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          <Button startIcon={<AddIcon />}>{ds('designSystem.samples.primary')}</Button>
          <Button variant="secondary">{ds('designSystem.samples.secondary')}</Button>
          <Button variant="ghost">{ds('designSystem.samples.textLink')}</Button>
          <Button variant="danger">{ds('designSystem.samples.danger')}</Button>
          <Button loading>{t('common.actions.save')}</Button>
          <Button disabled>{ds('designSystem.samples.disabled')}</Button>
          <IconButton label={t('shell.nav.menu')}>
            <HomeIcon />
          </IconButton>
        </Stack>
      </Section>

      <Section id="ds-inputs" title={ds('designSystem.sections.inputs')}>
        <Stack spacing={4} sx={{ maxInlineSize: 420 }}>
          <TextField
            label={ds('designSystem.samples.studentName')}
            placeholder={ds('designSystem.samples.studentNamePlaceholder')}
            value={name}
            onChange={setName}
            required
          />
          <TextField
            label={ds('designSystem.samples.studentName')}
            value=""
            onChange={() => undefined}
            error={t('errors.VALIDATION_FAILED')}
          />
          <Select
            label={ds('designSystem.samples.batch')}
            value={batch}
            onChange={setBatch}
            options={[
              { value: 'morning', label: ds('designSystem.samples.batchOptions.morning') },
              { value: 'evening', label: ds('designSystem.samples.batchOptions.evening') },
            ]}
          />
        </Stack>
      </Section>

      <Section id="ds-status" title={ds('designSystem.sections.status')}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
          <StatusBadge tone="success" label={ds('designSystem.samples.paid')} />
          <StatusBadge tone="danger" label={ds('designSystem.samples.overdue')} />
          <StatusBadge tone="warning" label={ds('designSystem.samples.pending')} />
          <StatusBadge tone="info" label={ds('designSystem.samples.present')} />
          <StatusBadge tone="neutral" label={ds('designSystem.samples.absent')} />
        </Stack>
      </Section>

      <Section id="ds-cards" title={ds('designSystem.sections.cards')}>
        <Box sx={{ maxInlineSize: 420 }}>
          <Card
            title={ds('designSystem.samples.cardTitle')}
            subtitle={ds('designSystem.samples.cardBody')}
            actions={
              <Button size="small" variant="secondary">
                {ds('designSystem.samples.textLink')}
              </Button>
            }
          />
        </Box>
      </Section>

      <Section id="ds-states" title={ds('designSystem.sections.states')}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ '& > *': { flex: 1 } }}>
          <Card>
            <Skeleton label={t('common.states.loading')} />
          </Card>
          <Card>
            <EmptyState
              title={ds('designSystem.samples.emptyTitle')}
              body={ds('designSystem.samples.emptyBody')}
              action={{
                label: ds('designSystem.samples.emptyAction'),
                onClick: () => toast(ds('designSystem.samples.toast')),
              }}
            />
          </Card>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ '& > *': { flex: 1 } }}>
          <Card>
            <ErrorState
              title={t('shell.error.title')}
              body={t('shell.error.body')}
              retry={{ label: t('common.actions.retry'), onClick: () => undefined }}
              reference={t('shell.error.reference', { requestId: '01999999-7000-8000' })}
            />
          </Card>
          <Card>
            <PermissionState title={t('common.states.noPermission')} body={t('errors.FORBIDDEN')} />
          </Card>
        </Stack>
      </Section>

      <Section id="ds-feedback" title={ds('designSystem.sections.feedback')}>
        <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => toast(ds('designSystem.samples.toast'))}>
            {ds('designSystem.samples.toast')}
          </Button>
        </Stack>
      </Section>

      <Section id="ds-overlays" title={ds('designSystem.sections.overlays')}>
        <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap' }}>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            {ds('designSystem.samples.confirmAction')}
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            {ds('designSystem.samples.sheetTitle')}
          </Button>
        </Stack>
        <ConfirmDialog
          open={confirmOpen}
          title={ds('designSystem.samples.confirmTitle')}
          body={ds('designSystem.samples.confirmBody')}
          confirmLabel={ds('designSystem.samples.confirmAction')}
          cancelLabel={t('common.actions.cancel')}
          tone="danger"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={ds('designSystem.samples.sheetTitle')}
          closeLabel={t('common.actions.close')}
        >
          <Text tone="secondary">{ds('designSystem.samples.sheetBody')}</Text>
        </Sheet>
      </Section>

      <Section id="ds-offline" title={ds('designSystem.sections.offline')}>
        <OfflineBanner message={t('offline.banner')} />
        <Stack spacing={2}>
          {SYNC_STATES.map((state) => (
            <SyncIndicator
              key={state}
              state={state}
              label={
                state === 'synced'
                  ? t('offline.sync.synced')
                  : state === 'offline'
                    ? t('offline.sync.offline')
                    : state === 'pending'
                      ? t('offline.sync.pending', { count: 24 })
                      : state === 'syncing'
                        ? t('offline.sync.syncing')
                        : t('offline.sync.attention', { count: 2 })
              }
              {...(state === 'synced'
                ? { detail: t('offline.sync.syncedAt', { time: t('offline.sync.justNow') }) }
                : {})}
            />
          ))}
        </Stack>
      </Section>

      <Section id="ds-money" title={ds('designSystem.sections.money')}>
        {/* Intl output (month names, digits) is locale data, not catalogue text. */}
        <Stack spacing={1} data-i18n-exempt>
          <Text>{formatMoney(10_000_000, 'INR')}</Text>
          <Text>{formatMoney(10_000_000, 'INR', { compact: true })}</Text>
          <Text>{formatDate(now)}</Text>
          <Text>{formatTime(now)}</Text>
          <Text>{t('common.count.students', { count: 1250 })}</Text>
        </Stack>
      </Section>

      <Section id="ds-shell" title={ds('designSystem.sections.shell')}>
        <Stack spacing={6}>
          <Box
            sx={{
              border: `1px solid ${color.neutral[200]}`,
              borderRadius: `${radius.lg}px`,
              overflow: 'hidden',
              blockSize: 360,
            }}
          >
            <AppShell
              brand={
                <Text variant="section" as="span">
                  {t('common.appName')}
                </Text>
              }
              navLabel={t('shell.nav.menu')}
              navGroups={[{ key: 'run', items: navItems.slice(0, 4) }]}
              variant="sidebar"
              topbarActions={<SyncIndicator state="synced" label={t('offline.sync.synced')} />}
            >
              <Text variant="title" as="p">
                {t('shell.nav.today')}
              </Text>
            </AppShell>
          </Box>
          <Box
            sx={{
              border: `1px solid ${color.neutral[200]}`,
              borderRadius: `${radius.lg}px`,
              overflow: 'hidden',
              inlineSize: 390,
              maxInlineSize: '100%',
              blockSize: 420,
              position: 'relative',
              transform: 'translateZ(0)',
            }}
          >
            <AppShell
              brand={
                <Text variant="section" as="span">
                  {t('common.appName')}
                </Text>
              }
              navLabel={t('shell.nav.menu')}
              navGroups={[]}
              bottomNav={navItems}
              variant="bottom-nav"
            >
              <Text variant="title" as="p">
                {t('shell.nav.today')}
              </Text>
            </AppShell>
          </Box>
        </Stack>
      </Section>
    </Container>
  );
}

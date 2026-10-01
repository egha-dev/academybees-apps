import { Button } from '@academybee/ui/components/actions';
import { Box, Container, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { CloudOffIcon, InfoIcon, LockIcon, WarningIcon } from '@academybee/ui/icons';
import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { AcademyIdentity } from './academy-identity';
import { BeeMark } from './bee-mark';
import { Brand } from './brand';
import { ReloadButton } from './reload-button';

export type StatusTone = 'info' | 'warning' | 'lock' | 'offline';

const ICONS: Record<StatusTone, { icon: ReactNode; fg: string; bg: string }> = {
  info: { icon: <InfoIcon />, fg: 'ab.status.info.fg', bg: 'ab.status.info.surface' },
  warning: { icon: <WarningIcon />, fg: 'ab.status.warning.fg', bg: 'ab.status.warning.surface' },
  lock: { icon: <LockIcon />, fg: 'ab.status.neutral.fg', bg: 'ab.status.neutral.surface' },
  offline: { icon: <CloudOffIcon />, fg: 'ab.status.neutral.fg', bg: 'ab.status.neutral.surface' },
};

/**
 * Designed academy status page (UX v1.1 §7, UX §24): who this is, what happened, what to do
 * next. Never shows IDs or technical errors. Status is carried by the heading and icon, never
 * colour alone; phone-first, 48 px action.
 */
export async function StatusPage({
  academyName,
  academyColor,
  tone,
  title,
  body,
  action,
}: {
  academyName?: string | undefined;
  academyColor?: string | null | undefined;
  tone: StatusTone;
  title: string;
  body: string;
  /** A link, or `reload` for "try again". */
  action: { label: string; href: string } | { label: string; reload: true };
}) {
  const t = await getTranslations('tenant');
  const { icon, fg, bg } = ICONS[tone];
  return (
    <Container maxWidth="sm" sx={{ paddingBlock: { xs: 6, md: 12 }, minBlockSize: '100dvh' }}>
      <Stack spacing={{ xs: 8, md: 10 }} sx={{ minBlockSize: '100%' }}>
        <header>
          {academyName ? (
            <AcademyIdentity name={academyName} primaryColor={academyColor} />
          ) : (
            <Brand />
          )}
        </header>
        <Stack component="main" spacing={3} sx={{ alignItems: 'flex-start' }}>
          <Box
            aria-hidden
            sx={{
              inlineSize: 56,
              blockSize: 56,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: fg,
              backgroundColor: bg,
              '& svg': { fontSize: 28 },
            }}
          >
            {icon}
          </Box>
          <Text variant="title" as="h1">
            {title}
          </Text>
          <Text tone="secondary">{body}</Text>
          <Box sx={{ paddingBlockStart: 2 }}>
            {'reload' in action ? (
              <ReloadButton label={action.label} />
            ) : (
              <Button href={action.href}>{action.label}</Button>
            )}
          </Box>
        </Stack>
        {academyName && (
          <Stack
            component="footer"
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', marginBlockStart: 'auto' }}
          >
            <BeeMark size={20} />
            <Text variant="meta" tone="secondary">
              {t('poweredBy')}
            </Text>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

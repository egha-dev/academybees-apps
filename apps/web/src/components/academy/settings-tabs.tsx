import { Box } from '@academybee/ui/components/layout';
import { getTranslations } from 'next-intl/server';

import { peopleEnabled } from '@/lib/flags.server';

/**
 * Academy · Branding & address — the academy's settings sections (UX v1.1 §6). Server-rendered
 * links (no client JS: these pages sit at the route budget, G-24); the current one is marked.
 */
export async function SettingsTabs({ current }: { current: 'academy' | 'branding' | 'fields' }) {
  const [t, people] = await Promise.all([getTranslations('academy.tabs'), peopleEnabled()]);
  const tabs = [
    { key: 'academy', href: '/settings/academy', label: t('academy') },
    { key: 'branding', href: '/settings/branding', label: t('branding') },
    // Phase 4 (release flag `p4-people`): student custom fields (G-05).
    ...(people ? [{ key: 'fields', href: '/settings/custom-fields', label: t('fields') }] : []),
  ] as const;
  return (
    <Box
      component="nav"
      aria-label={t('label')}
      sx={{ borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
    >
      <Box component="ul" sx={{ display: 'flex', gap: 2, margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <Box component="li" key={tab.key} sx={{ listStyle: 'none' }}>
            <Box
              component="a"
              href={tab.href}
              aria-current={tab.key === current ? 'page' : undefined}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minBlockSize: 48,
                paddingInline: 3,
                textDecoration: 'none',
                color: tab.key === current ? 'ab.textPrimary' : 'ab.textSecondary',
                fontWeight: tab.key === current ? 600 : 500,
                borderBlockEnd: '3px solid',
                borderColor: tab.key === current ? 'ab.accent' : 'transparent',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'ab.focus' },
              }}
            >
              {tab.label}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

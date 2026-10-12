import { Box } from '@academybee/ui/components/layout';
import { getTranslations } from 'next-intl/server';

import { academyTerms } from '@/lib/terms.server';

/**
 * Academy · Branding & address — the academy's settings sections (UX v1.1 §6). Server-rendered
 * links (no client JS: these pages sit at the route budget, G-24); the current one is marked.
 */
export async function SettingsTabs({
  current,
}: {
  current: 'academy' | 'branding' | 'fields' | 'courses' | 'parentApp' | 'privacy';
}) {
  const [t, terms] = await Promise.all([getTranslations('academy.tabs'), academyTerms()]);
  const tabs = [
    { key: 'academy', href: '/settings/academy', label: t('academy') },
    { key: 'branding', href: '/settings/branding', label: t('branding') },
    // Phase 4: student custom fields (G-05), the Family Hub poster and the privacy notice (G-06).
    { key: 'fields', href: '/settings/custom-fields', label: t('fields') },
    // Phase 5: courses and their levels.
    { key: 'courses', href: '/settings/courses', label: t('courses', { course: terms.course }) },
    { key: 'parentApp', href: '/settings/parent-app', label: t('parentApp') },
    { key: 'privacy', href: '/settings/privacy', label: t('privacy') },
  ];
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

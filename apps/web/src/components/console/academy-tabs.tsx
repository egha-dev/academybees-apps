'use client';

import { Box } from '@academybee/ui/components/layout';
import { usePathname } from 'next/navigation';

/** Overview · Address (C-02: the console's academy detail; more tabs arrive in Phase 14). */
export function AcademyTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <Box
      component="nav"
      aria-label={label}
      sx={{ borderBlockEnd: '1px solid', borderColor: 'ab.border' }}
    >
      <Box component="ul" sx={{ display: 'flex', gap: 2, margin: 0, padding: 0 }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Box component="li" key={tab.href} sx={{ listStyle: 'none' }}>
              <Box
                component="a"
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minBlockSize: 48,
                  paddingInline: 3,
                  color: active ? 'ab.textPrimary' : 'ab.textSecondary',
                  fontWeight: active ? 600 : 500,
                  textDecoration: 'none',
                  borderBlockEnd: '3px solid',
                  borderColor: active ? 'ab.accent' : 'transparent',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'ab.focus' },
                }}
              >
                {tab.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

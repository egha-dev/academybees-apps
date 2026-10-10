import { AddIcon } from '@academybee/ui/icons';
import { Box } from '@academybee/ui/components/layout';
import { getTranslations } from 'next-intl/server';

/**
 * Global Add (UX §9.2): "+ Add" in the shell's top bar. A native `<details>` menu of links — no
 * client JS on any page (G-24, C-99). Student, Parent (pick the child
 * first, C-106) and Teacher, and only for roles that may create them.
 */
export async function GlobalAdd({ items }: { items: Array<{ key: string; href: string }> }) {
  if (items.length === 0) return null;
  const t = await getTranslations('people.globalAdd');
  return (
    <Box
      component="details"
      sx={{
        position: 'relative',
        '& > summary': { listStyle: 'none' },
        '& > summary::-webkit-details-marker': { display: 'none' },
      }}
    >
      <Box
        component="summary"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          minBlockSize: 40,
          paddingInline: 2.5,
          borderRadius: 2,
          cursor: 'pointer',
          fontWeight: 600,
          color: 'ab.onPrimary',
          bgcolor: 'ab.primary',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'ab.focus',
            outlineOffset: '2px',
          },
        }}
      >
        <AddIcon sx={{ fontSize: 20 }} aria-hidden />
        {t('label')}
      </Box>
      <Box
        component="ul"
        sx={{
          position: 'absolute',
          insetInlineEnd: 0,
          insetBlockStart: 'calc(100% + 4px)',
          zIndex: 1200,
          minInlineSize: 180,
          margin: 0,
          padding: 1,
          listStyle: 'none',
          bgcolor: 'ab.surface',
          border: '1px solid',
          borderColor: 'ab.border',
          borderRadius: 2,
          boxShadow: '0 8px 24px rgba(23,24,23,0.12)',
        }}
      >
        {items.map((item) => (
          <Box component="li" key={item.key}>
            <Box
              component="a"
              href={item.href}
              sx={{
                display: 'flex',
                alignItems: 'center',
                minBlockSize: 48,
                paddingInline: 2,
                borderRadius: 1,
                color: 'ab.textPrimary',
                textDecoration: 'none',
                '&:hover': { bgcolor: 'ab.surfaceRaised' },
              }}
            >
              {t(item.key as 'student' | 'parent' | 'teacher')}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

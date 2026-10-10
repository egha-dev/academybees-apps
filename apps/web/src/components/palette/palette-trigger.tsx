'use client';

import type { Messages } from '@academybee/i18n';
import { Box } from '@academybee/ui/components/layout';
import { plainControl } from '@academybee/ui/components/plain-button';
import { SearchIcon } from '@academybee/ui/icons';
import { lazy, Suspense, useEffect, useState } from 'react';

// The dialog, its search and keyboard handling load on first use (G-24, C-99).
const Palette = lazy(() => import('./palette').then((m) => ({ default: m.Palette })));

export type PaletteLabels = Messages['people']['palette'];
export type QuickAction = {
  key: 'addStudent' | 'addTeacher' | 'students' | 'teachers';
  href: string;
};

/**
 * Command palette trigger (UX §9.1): a Search button in the top bar and Ctrl/⌘ + K anywhere on
 * the academy's Manage pages.
 */
export function PaletteTrigger({
  labels,
  actions,
}: {
  labels: PaletteLabels;
  actions: QuickAction[];
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-label={labels.title}
        sx={{
          ...plainControl,
          gap: 1,
          minBlockSize: 40,
          minInlineSize: 40,
          paddingInline: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'ab.border',
          color: 'ab.textSecondary',
          bgcolor: 'ab.surface',
          fontSize: 14,
        }}
      >
        <SearchIcon sx={{ fontSize: 20 }} aria-hidden />
        <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
          {labels.open}
        </Box>
        <Box
          component="kbd"
          aria-hidden
          sx={{
            display: { xs: 'none', lg: 'inline' },
            fontFamily: 'inherit',
            fontSize: 12,
            color: 'ab.textSecondary',
          }}
        >
          {labels.shortcut}
        </Box>
        <Box
          component="span"
          sx={{
            display: { xs: 'inline', md: 'none' },
            position: 'absolute',
            inlineSize: 1,
            blockSize: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          {labels.open}
        </Box>
      </Box>
      {open && (
        <Suspense fallback={null}>
          <Palette labels={labels} actions={actions} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

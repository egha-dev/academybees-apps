'use client';

import { Box } from '@academybee/ui/components/layout';
import { NotificationsIcon } from '@academybee/ui/icons';

/**
 * The notification bell in the top bar (C-04): a link to the list, with the unread count as a
 * number (never colour alone) and in its accessible name.
 */
export function NotificationsBell({ count, label }: { count: number; label: string }) {
  return (
    <Box
      component="a"
      href="/notifications"
      aria-label={label}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minInlineSize: 48,
        minBlockSize: 48,
        borderRadius: 2,
        color: 'ab.textPrimary',
        '&:hover': { bgcolor: 'ab.surfaceRaised' },
      }}
    >
      <NotificationsIcon aria-hidden />
      {count > 0 && (
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            insetBlockStart: 6,
            insetInlineEnd: 4,
            minInlineSize: 18,
            blockSize: 18,
            paddingInline: '4px',
            borderRadius: 9,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '18px',
            textAlign: 'center',
            bgcolor: 'ab.status.danger.solid',
            color: 'ab.status.danger.onSolid',
          }}
        >
          {count > 99 ? '99+' : count}
        </Box>
      )}
    </Box>
  );
}

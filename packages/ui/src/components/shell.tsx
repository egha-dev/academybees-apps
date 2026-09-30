'use client';

import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type ElementType, type ReactNode } from 'react';

import { color, radius, TOUCH_TARGET } from '../tokens.js';
import { Text } from './text.js';

export type NavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
  active?: boolean;
};

export type NavGroup = { key: string; label?: string; items: NavItem[] };

export type AppShellProps = {
  /** Academy or product identity (logo + name). */
  brand: ReactNode;
  /** Sidebar groups (UX §8: HOME / RUN / MONEY …). */
  navGroups: NavGroup[];
  /** Phone bottom navigation (UX §25), max 5 items. */
  bottomNav?: NavItem[];
  /** Accessible name of the navigation landmark (translated). */
  navLabel: string;
  /** Top bar content on the inline end: sync indicator, notifications, account. */
  topbarActions?: ReactNode;
  /** Shown above the page (e.g. OfflineBanner). */
  banner?: ReactNode;
  /** `auto` = sidebar on ≥ md, bottom nav on phones. Forced variants are for the design system page. */
  variant?: 'auto' | 'sidebar' | 'bottom-nav';
  /** Router link component (e.g. next/link); defaults to <a>. */
  linkComponent?: ElementType;
  children: ReactNode;
};

const SIDEBAR_WIDTH = 248;
const BOTTOM_NAV_HEIGHT = 64;

function SidebarLink({ item, linkComponent }: { item: NavItem; linkComponent: ElementType }) {
  return (
    <ButtonBase
      component={linkComponent}
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      sx={{
        justifyContent: 'flex-start',
        gap: 3,
        minHeight: 44,
        paddingInline: 3,
        borderRadius: `${radius.md}px`,
        color: color.ink,
        fontSize: 14,
        fontWeight: item.active ? 600 : 500,
        backgroundColor: item.active ? color.goldSoft : 'transparent',
        '&:hover': { backgroundColor: item.active ? color.goldSoft : color.neutral[100] },
        '& svg': { fontSize: 20, color: item.active ? color.ink : color.neutral[600] },
      }}
    >
      {item.icon}
      <span>{item.label}</span>
    </ButtonBase>
  );
}

export function AppShell({
  brand,
  navGroups,
  bottomNav,
  navLabel,
  topbarActions,
  banner,
  variant = 'auto',
  linkComponent = 'a',
  children,
}: AppShellProps) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: false });
  const showSidebar = variant === 'sidebar' || (variant === 'auto' && desktop);
  const showBottomNav = !showSidebar && (bottomNav?.length ?? 0) > 0;
  const activeBottom = bottomNav?.find((i) => i.active)?.key ?? false;

  return (
    <Box sx={{ display: 'flex', minHeight: '100%', backgroundColor: color.ivory }}>
      {showSidebar && (
        <Box
          component="nav"
          aria-label={navLabel}
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderInlineEnd: `1px solid ${color.neutral[200]}`,
            backgroundColor: color.white,
            paddingBlock: 4,
            paddingInline: 3,
            position: 'sticky',
            insetBlockStart: 0,
            height: '100vh',
            overflowY: 'auto',
          }}
        >
          <Box sx={{ paddingInline: 3, paddingBlockEnd: 5 }}>{brand}</Box>
          <Stack spacing={5}>
            {navGroups.map((group) => (
              <Stack key={group.key} spacing={0.5}>
                {group.label && (
                  <Box sx={{ paddingInline: 3, paddingBlockEnd: 1 }}>
                    <Text variant="meta" tone="secondary">
                      {group.label}
                    </Text>
                  </Box>
                )}
                {group.items.map((item) => (
                  <SidebarLink key={item.key} item={item} linkComponent={linkComponent} />
                ))}
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          component="header"
          direction="row"

          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 3,
            minHeight: 60,
            paddingInline: { xs: 4, md: 6 },
            borderBlockEnd: `1px solid ${color.neutral[200]}`,
            backgroundColor: color.white,
            position: 'sticky',
            insetBlockStart: 0,
            zIndex: theme.zIndex.appBar,
          }}
        >
          <Box sx={{ minWidth: 0 }}>{!showSidebar && brand}</Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
            {topbarActions}
          </Stack>
        </Stack>
        {banner}
        <Box
          component="main"
          sx={{
            flex: 1,
            paddingInline: { xs: 4, md: 8 },
            paddingBlock: { xs: 5, md: 8 },
            paddingBlockEnd: showBottomNav
              ? `calc(${BOTTOM_NAV_HEIGHT + 24}px + env(safe-area-inset-bottom))`
              : undefined,
          }}
        >
          {children}
        </Box>
      </Stack>

      {showBottomNav && (
        <Box
          component="nav"
          aria-label={navLabel}
          sx={{
            position: 'fixed',
            insetInline: 0,
            insetBlockEnd: 0,
            borderBlockStart: `1px solid ${color.neutral[200]}`,
            backgroundColor: color.white,
            paddingBlockEnd: 'env(safe-area-inset-bottom)',
            zIndex: theme.zIndex.appBar,
          }}
        >
          <BottomNavigation
            value={activeBottom}
            showLabels
            sx={{ height: BOTTOM_NAV_HEIGHT, backgroundColor: 'transparent' }}
          >
            {bottomNav?.map((item) => (
              <BottomNavigationAction
                key={item.key}
                value={item.key}
                label={item.label}
                icon={item.icon}
                component={linkComponent}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                sx={{
                  minWidth: TOUCH_TARGET,
                  color: color.neutral[600],
                  '&.Mui-selected': { color: color.ink, fontWeight: 600 },
                }}
              />
            ))}
          </BottomNavigation>
        </Box>
      )}
    </Box>
  );
}

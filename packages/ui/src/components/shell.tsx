'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import { type ElementType, type ReactNode } from 'react';

import { radius, TOUCH_TARGET } from '../tokens.js';
import { ab } from './ab.js';
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
  /** Bottom of the sidebar on wide screens (account: who is signed in, switch, sign out). */
  sidebarFooter?: ReactNode;
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
        color: 'ab.textPrimary',
        fontSize: 14,
        fontWeight: item.active ? 600 : 500,
        bgcolor: item.active ? 'ab.accentSoft' : 'transparent',
        '&:hover': { bgcolor: item.active ? 'ab.accentSoft' : 'ab.surfaceRaised' },
        '& svg': { fontSize: 20, color: item.active ? 'ab.onAccentSoft' : 'ab.textSecondary' },
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
  sidebarFooter,
  variant = 'auto',
  linkComponent = 'a',
  children,
}: AppShellProps) {
  // Sidebar on ≥ md, bottom bar on phones — chosen by CSS breakpoints, so the server render is
  // already right on every device (no media-query hook, no layout flash).
  const hasBottom = (bottomNav?.length ?? 0) > 0;
  const sidebarDisplay =
    variant === 'sidebar' ? 'flex' : variant === 'bottom-nav' ? 'none' : { xs: 'none', md: 'flex' };
  const bottomDisplay = !hasBottom
    ? 'none'
    : variant === 'bottom-nav'
      ? 'block'
      : variant === 'sidebar'
        ? 'none'
        : { xs: 'block', md: 'none' };
  const brandInTopbar =
    variant === 'sidebar'
      ? 'none'
      : variant === 'bottom-nav'
        ? 'block'
        : { xs: 'block', md: 'none' };
  const bottomPadding = `calc(${BOTTOM_NAV_HEIGHT + 24}px + env(safe-area-inset-bottom))`;

  return (
    <Box sx={{ display: 'flex', minHeight: '100%', bgcolor: 'ab.background' }}>
      <Box
        component="nav"
        aria-label={navLabel}
        sx={{
          display: sidebarDisplay,
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderInlineEnd: (t) => `1px solid ${ab(t).border}`,
          bgcolor: 'ab.surface',
          paddingBlock: 4,
          paddingInline: 3,
          position: 'sticky',
          insetBlockStart: 0,
          height: '100vh',
          overflowY: 'auto',
          flexDirection: 'column',
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
        {sidebarFooter && (
          <Box
            sx={{
              marginBlockStart: 'auto',
              paddingBlockStart: 5,
              paddingInline: 3,
              borderBlockStart: (t) => `1px solid ${ab(t).border}`,
            }}
          >
            {sidebarFooter}
          </Box>
        )}
      </Box>

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
            borderBlockEnd: (t) => `1px solid ${ab(t).border}`,
            bgcolor: 'ab.surface',
            position: 'sticky',
            insetBlockStart: 0,
            zIndex: 'appBar',
          }}
        >
          <Box sx={{ minWidth: 0, display: brandInTopbar }}>{brand}</Box>
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
            paddingBlockEnd:
              bottomDisplay === 'none'
                ? undefined
                : typeof bottomDisplay === 'string'
                  ? bottomPadding
                  : { xs: bottomPadding, md: 8 },
          }}
        >
          {children}
        </Box>
      </Stack>

      {hasBottom && (
        <Box
          component="nav"
          aria-label={navLabel}
          sx={{
            display: bottomDisplay,
            position: 'fixed',
            insetInline: 0,
            insetBlockEnd: 0,
            borderBlockStart: (t) => `1px solid ${ab(t).border}`,
            bgcolor: 'ab.surface',
            paddingBlockEnd: 'env(safe-area-inset-bottom)',
            zIndex: 'appBar',
          }}
        >
          <Box
            component="ul"
            sx={{ display: 'flex', margin: 0, padding: 0, height: BOTTOM_NAV_HEIGHT }}
          >
            {bottomNav?.map((item) => (
              <Box
                component="li"
                key={item.key}
                sx={{ flex: 1, listStyle: 'none', display: 'flex' }}
              >
                <ButtonBase
                  component={linkComponent}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  sx={{
                    flex: 1,
                    flexDirection: 'column',
                    gap: 0.5,
                    minWidth: TOUCH_TARGET,
                    fontSize: 12,
                    fontWeight: item.active ? 600 : 500,
                    color: item.active ? 'ab.textPrimary' : 'ab.textSecondary',
                    '& svg': { fontSize: 24 },
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </ButtonBase>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

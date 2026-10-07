'use client';

import { HomeIcon, LockIcon, MoreIcon, PeopleIcon, TodayIcon } from '@academybee/ui/icons';
import { AppShell, type NavGroup, type NavItem } from '@academybee/ui/components/shell';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

/** Navigation entries are plain data from the server; icons are picked here (client side). */
export type ShellIcon = 'today' | 'home' | 'team' | 'security' | 'more';
export type ShellNavItem = { key: string; label: string; href: string; icon: ShellIcon };
export type ShellNavGroup = { key: string; label: string; items: ShellNavItem[] };

const ICONS: Record<ShellIcon, ReactNode> = {
  today: <TodayIcon />,
  home: <HomeIcon />,
  team: <PeopleIcon />,
  security: <LockIcon />,
  more: <MoreIcon />,
};

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * The signed-in academy shell (plan 2.17, UX §7–8, §25): academy identity, navigation for the
 * current experience showing only built modules the user may open, account area in the sidebar
 * on wide screens and a bottom bar with "More" on phones.
 *
 * Links are plain anchors (full, server-rendered page loads; JS stays cached): `next/link` costs
 * 3.6 KB gz, which teacher screens can't afford within the 200 KB route budget (G-24, C-72).
 */
export function AcademyShell({
  brand,
  navLabel,
  groups,
  bottom,
  topbarActions,
  sidebarFooter,
  children,
}: {
  brand: ReactNode;
  navLabel: string;
  groups: ShellNavGroup[];
  bottom: ShellNavItem[];
  topbarActions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const toItem = (item: ShellNavItem): NavItem => ({
    key: item.key,
    label: item.label,
    href: item.href,
    icon: ICONS[item.icon],
    active: isActive(pathname, item.href),
  });
  const navGroups: NavGroup[] = groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({ key: g.key, label: g.label, items: g.items.map(toItem) }));
  return (
    <AppShell
      brand={brand}
      navGroups={navGroups}
      bottomNav={bottom.length > 1 ? bottom.map(toItem) : []}
      navLabel={navLabel}
      topbarActions={topbarActions}
      sidebarFooter={sidebarFooter}
    >
      {children}
    </AppShell>
  );
}

'use client';

import { AppShell } from '@academybee/ui/components/shell';
import { SchoolIcon } from '@academybee/ui/icons';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

export type ConsoleNavItem = { key: string; label: string; href: string };

/**
 * The console's signed-in frame (C-02, UX §21): Deep Ink sidebar so platform operations never
 * look like an academy workspace, desktop-first (phones get the same pages, read-mostly).
 * Phase 3 has one section, Academies; the rest of the console arrives in Phase 14.
 */
export function ConsoleShell({
  brand,
  navLabel,
  items,
  topbarActions,
  sidebarFooter,
  children,
}: {
  brand: ReactNode;
  navLabel: string;
  items: ConsoleNavItem[];
  topbarActions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AppShell
      chrome="ink"
      brand={brand}
      navLabel={navLabel}
      navGroups={[
        {
          key: 'platform',
          items: items.map((item) => ({
            key: item.key,
            label: item.label,
            href: item.href,
            icon: <SchoolIcon />,
            active: pathname === item.href || pathname.startsWith(`${item.href}/`),
          })),
        },
      ]}
      topbarActions={topbarActions}
      sidebarFooter={sidebarFooter}
    >
      {children}
    </AppShell>
  );
}

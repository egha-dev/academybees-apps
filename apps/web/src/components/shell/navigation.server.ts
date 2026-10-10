import 'server-only';

import type { MeResponse } from '@academybee/contracts';
import { getTranslations } from 'next-intl/server';

import type { ShellNavGroup, ShellNavItem } from './academy-shell';

export type Experience = 'manage' | 'teach';

/**
 * Which experience a page belongs to: `/teach…` is the Teacher experience, everything else on
 * the academy host is Manage. Users without that experience get their own one's shell.
 */
export function experienceFor(path: string, me: MeResponse): Experience {
  const experiences = me.academy?.experiences ?? [];
  const wanted: Experience =
    path === '/teach' || path.startsWith('/teach/') || path.startsWith('/teach?')
      ? 'teach'
      : 'manage';
  if (experiences.includes(wanted)) return wanted;
  return experiences.includes('manage') ? 'manage' : 'teach';
}

/**
 * Navigation for one experience (UX §8, §25): **only built modules**, and only those the user's
 * capabilities open (ADR-008). Phase 2: Today and Team (Manage), Home (Teacher), and Security;
 * Phase 3 adds the academy's settings (Academy, Branding & address); Phase 4 adds Students (RUN)
 * (everyone's own account, G-11); "More" holds the rest on phones. Grows phase by phase — never
 * "coming soon" entries.
 */
export async function navigationFor(
  me: MeResponse,
  experience: Experience,
  roleHomes: boolean,
  /** Phase 4 people workspaces (release flag `p4-people`). */
  people = false,
): Promise<{ groups: ShellNavGroup[]; bottom: ShellNavItem[] }> {
  const t = await getTranslations('shell.nav');
  const can = (capability: string) =>
    (me.academy?.capabilities as Record<string, string | undefined> | undefined)?.[capability] !==
    undefined;
  const more: ShellNavItem = { key: 'more', label: t('more'), href: '/more', icon: 'more' };
  const account = {
    key: 'account',
    label: t('groups.account'),
    items: [
      { key: 'security', label: t('security'), href: '/settings/security', icon: 'security' },
    ] satisfies ShellNavItem[],
  };

  if (experience === 'teach') {
    const home: ShellNavItem[] = roleHomes
      ? [{ key: 'teach', label: t('home'), href: '/teach', icon: 'home' }]
      : [];
    return {
      groups: [{ key: 'home', label: t('groups.home'), items: home }, account],
      bottom: [...home, more],
    };
  }
  const today: ShellNavItem[] = roleHomes
    ? [{ key: 'today', label: t('today'), href: '/today', icon: 'today' }]
    : [];
  // RUN (UX §8): the people workspaces, phase by phase.
  const run: ShellNavItem[] =
    people && can('student.read')
      ? [{ key: 'students', label: t('students'), href: '/students', icon: 'students' }]
      : [];
  const academy: ShellNavItem[] = [
    ...(can('team.read')
      ? [{ key: 'team', label: t('team'), href: '/settings/team', icon: 'team' } as const]
      : []),
    // One entry for the academy's settings; its pages switch with tabs (route budget, G-24).
    ...(can('academy.settings.read')
      ? [
          {
            key: 'academy',
            label: t('academySettings'),
            href: '/settings/academy',
            icon: 'settings',
          } as const,
        ]
      : []),
  ];
  return {
    groups: [
      { key: 'home', label: t('groups.home'), items: today },
      { key: 'run', label: t('groups.run'), items: run },
      { key: 'academy', label: t('groups.academy'), items: academy },
      account,
    ],
    // UX §25 Owner/Admin: Today • Students • Finance • More.
    bottom: [...today, ...run.slice(0, 1), more],
  };
}

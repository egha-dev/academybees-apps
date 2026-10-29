import 'server-only';

import { type MeResponse, DEFAULT_TERMINOLOGY, type Terminology } from '@academybee/contracts';
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
  /** The academy's words (C-118). */
  options: { terms?: Terminology } = {},
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
    const home: ShellNavItem[] = [{ key: 'teach', label: t('home'), href: '/teach', icon: 'home' }];
    // Teacher PWA (UX §14, C-06, C-124): Home • Classes • Students • More; Learning comes in
    // Phase 9. Every link is a plain page load, so the cached screens open offline.
    const work: ShellNavItem[] = [
      { key: 'teach-classes', label: t('classes'), href: '/teach/classes', icon: 'timetable' },
      { key: 'teach-students', label: t('students'), href: '/teach/students', icon: 'students' },
    ];
    const teachMore: ShellNavItem = { ...more, href: '/teach/more' };
    return {
      groups: [{ key: 'home', label: t('groups.home'), items: [...home, ...work] }, account],
      bottom: [...home, ...work, teachMore],
    };
  }
  const today: ShellNavItem[] = [
    { key: 'today', label: t('today'), href: '/today', icon: 'today' },
  ];
  // RUN (UX §8): the people workspaces, phase by phase.
  const run: ShellNavItem[] = [
    ...(can('student.read')
      ? [
          {
            key: 'students',
            label: t('students'),
            href: '/students',
            icon: 'students',
          } as const,
        ]
      : []),
    // UX §8 order: Attendance, Timetable, then Batches, then people.
    ...(can('attendance.read')
      ? [
          {
            key: 'attendance',
            label: t('attendance'),
            href: '/attendance',
            icon: 'attendance',
          } as const,
        ]
      : []),
    ...(can('timetable.read')
      ? [
          {
            key: 'timetable',
            label: t('timetable'),
            href: '/timetable',
            icon: 'timetable',
          } as const,
        ]
      : []),
    ...(can('batch.read')
      ? [
          {
            key: 'batches',
            label: t('batches', { term: (options.terms ?? DEFAULT_TERMINOLOGY).batch }),
            href: '/batches',
            icon: 'batches',
          } as const,
        ]
      : []),
    ...(can('teacher.read')
      ? [
          {
            key: 'teachers',
            label: t('teachers'),
            href: '/teachers',
            icon: 'teachers',
          } as const,
        ]
      : []),
    ...(can('parent.manage')
      ? [
          {
            key: 'joinRequests',
            label: t('joinRequests'),
            href: '/join-requests',
            icon: 'team',
          } as const,
        ]
      : []),
  ];
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
  // UX §25 (Owner/Admin): Today • Students • … • More; the rest is under More.
  const primary = run.find((i) => i.key === 'students') ?? run[0];
  return {
    groups: [
      { key: 'home', label: t('groups.home'), items: today },
      { key: 'run', label: t('groups.run'), items: run },
      { key: 'academy', label: t('groups.academy'), items: academy },
      account,
    ],
    bottom: [...today, ...(primary ? [primary] : []), more],
  };
}

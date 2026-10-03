import 'server-only';

import { type MeResponse } from '@academybee/contracts';
import { getTranslations } from 'next-intl/server';

import { type ShellNavGroup, type ShellNavItem } from './academy-shell';

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
 * capabilities open (ADR-008). Phase 2: Today and Team (Manage), Home (Teacher); "More" holds the
 * rest on phones. Grows phase by phase — never "coming soon" entries.
 */
export async function navigationFor(
  me: MeResponse,
  experience: Experience,
  roleHomes: boolean,
): Promise<{ groups: ShellNavGroup[]; bottom: ShellNavItem[] }> {
  const t = await getTranslations('shell.nav');
  const can = (capability: string) =>
    (me.academy?.capabilities as Record<string, string | undefined> | undefined)?.[capability] !==
    undefined;
  const more: ShellNavItem = { key: 'more', label: t('more'), href: '/more', icon: 'more' };

  if (experience === 'teach') {
    const home: ShellNavItem[] = roleHomes
      ? [{ key: 'teach', label: t('home'), href: '/teach', icon: 'home' }]
      : [];
    return {
      groups: [{ key: 'home', label: t('groups.home'), items: home }],
      bottom: [...home, more],
    };
  }
  const today: ShellNavItem[] = roleHomes
    ? [{ key: 'today', label: t('today'), href: '/today', icon: 'today' }]
    : [];
  const academy: ShellNavItem[] = can('team.read')
    ? [{ key: 'team', label: t('team'), href: '/settings/team', icon: 'team' }]
    : [];
  return {
    groups: [
      { key: 'home', label: t('groups.home'), items: today },
      { key: 'academy', label: t('groups.academy'), items: academy },
    ],
    bottom: [...today, more],
  };
}

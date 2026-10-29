import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { signOutLabels } from '@/components/auth/labels.server';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';

import type { TeachView } from './teach-app';
import { TeachAppLazy } from './teach-lazy';

/** Page title for a Teacher PWA screen. */
export async function teachMetadata(view: Exclude<TeachView, 'today'>): Promise<Metadata> {
  const t = await getTranslations('teach.metaTitle');
  return { title: t(view) };
}

/**
 * A Teacher PWA screen (C-124): the server renders only the shell and labels — no student data —
 * so the page can be cached and opened offline; the screen reads this device's copy.
 */
export async function TeachScreen({
  view,
  experience = 'teach',
  backHref,
}: {
  view: TeachView;
  /** Owners and admins take attendance in the Manage experience with the same screen (C-131). */
  experience?: 'teach' | 'manage';
  backHref?: string;
}) {
  const [{ me, academy }, { context }, messages, signOut] = await Promise.all([
    signedInMember({ experience }),
    hostContext(),
    getMessages(),
    signOutLabels(),
  ]);
  return (
    <TeachAppLazy
      view={view}
      userId={me.user.id}
      name={me.user.name}
      academy={academy}
      timeZone={academyTimeZone(context) ?? 'Asia/Kolkata'}
      canEditPast={holds(me, 'attendance.edit_past')}
      {...(backHref ? { backHref } : {})}
      labels={{
        teach: messages.teach,
        offline: messages.offline,
        signOut,
        switchHref: me.academy.experiences.includes('manage') ? '/today' : null,
      }}
    />
  );
}

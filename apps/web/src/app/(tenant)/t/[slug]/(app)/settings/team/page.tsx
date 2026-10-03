import {
  InvitationListSchema,
  RoleKeySchema,
  RoleListSchema,
  type TeamMember,
  TeamMemberPageSchema,
} from '@academybee/contracts';
import { formatDate } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { StatusBadge } from '@academybee/ui/components/display';
import { PermissionState } from '@academybee/ui/components/feedback';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { InvitationActions } from '@/components/team/invitation-actions';
import { InviteButton } from '@/components/team/invite-button';
import { MemberManage } from '@/components/team/member-manage';
import { type RoleOption } from '@/components/team/role-options';
import { apiServerGet } from '@/lib/api.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team');
  return { title: t('metaTitle') };
}

async function load<T>(path: string, parse: (v: unknown) => T): Promise<T> {
  const res = await apiServerGet(path);
  if (!res.ok) throw new Error(`team page: ${path} answered ${res.status}`);
  return parse(await res.json());
}

function Row({ children }: { children: ReactNode }) {
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 3,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBlock: 4,
        borderBlockEnd: '1px solid',
        borderColor: 'ab.border',
      }}
    >
      {children}
    </Box>
  );
}

const STATUS_TONE = { ACTIVE: 'success', DISABLED: 'neutral', INVITED: 'info' } as const;

/**
 * Team (plan 2.18, UX §23 "Team & Roles"): who works here, their roles and access, and pending
 * invitations. Read on the server; actions are sheets that call the API and refresh the page.
 * Online only: changes need a connection (CLAUDE.md §11).
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const [{ me, academy }, { context }, params, t, roleT] = await Promise.all([
    signedInMember({ experience: 'manage' }),
    hostContext(),
    searchParams,
    getTranslations('team'),
    getTranslations('auth.roles'),
  ]);
  if (!holds(me, 'team.read'))
    return (
      <PermissionState
        title={t('permission.title')}
        body={t('permission.body', { academy })}
        action={{ label: (await getTranslations('shell.permission'))('action'), href: homeFor(me) }}
      />
    );

  const after = typeof params.after === 'string' ? params.after : undefined;
  const [members, invitations, roleList] = await Promise.all([
    load(`/team/members?limit=50${after ? `&cursor=${encodeURIComponent(after)}` : ''}`, (v) =>
      TeamMemberPageSchema.parse(v),
    ),
    load('/team/invitations', (v) => InvitationListSchema.parse(v)),
    load('/team/roles', (v) => RoleListSchema.parse(v)),
  ]);

  const timeZone = academyTimeZone(context);
  const listFormat = new Intl.ListFormat(await getLocale(), { type: 'conjunction' });
  const list = (items: string[]) => listFormat.format(items);
  const date = (iso: string) => formatDate(iso, { ...(timeZone ? { timeZone } : {}) });
  const roleLabel = (key: string, name?: string) => {
    const known = RoleKeySchema.safeParse(key);
    return known.success ? roleT(known.data) : (name ?? key);
  };
  const staffRoles: RoleOption[] = roleList.roles
    .filter((r) => r.isSystem && r.experience !== 'hub')
    .map((r) => ({ value: r.key, label: roleLabel(r.key, r.name), grantable: r.grantable }));
  const canInvite = holds(me, 'team.invite') && staffRoles.some((r) => r.grantable);
  const canManage = holds(me, 'team.manage');

  const errors = {
    alreadyMember: t('errors.alreadyMember', { academy }),
    notGrantable: t('errors.notGrantable'),
    ownerOnly: t('errors.ownerOnly'),
    lastOwner: t('errors.lastOwner', { academy }),
    versionConflict: t('errors.versionConflict'),
    rateLimited: t('errors.rateLimited'),
    gone: t('errors.gone'),
    offline: t('errors.offline'),
    generic: t('errors.generic'),
  };
  const fields = await getTranslations('auth.fields');
  const common = await getTranslations('common.actions');

  const inviteButton = canInvite ? (
    <InviteButton
      roles={staffRoles}
      labels={{
        open: t('invite'),
        title: t('inviteSheet.title'),
        body: t('inviteSheet.body', { academy }),
        email: t('inviteSheet.email'),
        roles: t('inviteSheet.roles'),
        rolesHint: t('inviteSheet.rolesHint'),
        submit: t('inviteSheet.submit'),
        cancel: t('inviteSheet.cancel'),
        sentTemplate: t.raw('inviteSheet.sent') as string,
        close: common('close'),
        required: fields('required'),
        emailInvalid: fields('emailInvalid'),
        errors,
      }}
    />
  ) : undefined;

  const memberRow = (m: TeamMember) => (
    <Row key={m.id}>
      <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: '1 1 16rem' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Text as="span">
            <strong>{m.name}</strong>
          </Text>
          {m.isYou && <StatusBadge tone="info" label={t('members.you')} />}
        </Stack>
        <Text variant="bodySmall" tone="secondary">
          {m.email ?? m.phone ?? t('members.noEmail')}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {list(m.roles.map((r) => roleLabel(r.key, r.name)))}
        </Text>
        <Text variant="meta" tone="secondary">
          {m.lastLoginAt
            ? t('members.lastActive', { date: date(m.lastLoginAt) })
            : t('members.neverSignedIn')}
        </Text>
      </Stack>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <StatusBadge tone={STATUS_TONE[m.status]} label={t(`status.${m.status}`)} />
        {canManage && !m.isYou && (
          <MemberManage
            member={{
              id: m.id,
              status: m.status,
              version: m.version,
              roles: m.roles.map((r) => ({ value: r.key, label: roleLabel(r.key, r.name) })),
            }}
            roles={staffRoles}
            labels={{
              open: t('members.manage'),
              title: t('memberSheet.title', { name: m.name }),
              roles: t('memberSheet.roles'),
              rolesHint: t('memberSheet.rolesHint'),
              save: t('memberSheet.save'),
              saved: t('memberSheet.saved'),
              accessHeading: t('memberSheet.accessHeading'),
              disable: t('memberSheet.disable'),
              enable: t('memberSheet.enable'),
              disableTitle: t('memberSheet.disableTitle', { name: m.name }),
              disableBody: t('memberSheet.disableBody', { academy }),
              disabled: t('memberSheet.disabled'),
              enabled: t('memberSheet.enabled'),
              cancel: t('memberSheet.cancel'),
              close: common('close'),
              required: fields('required'),
              errors,
            }}
          />
        )}
      </Stack>
    </Row>
  );

  return (
    <Stack spacing={8}>
      <PageHeader title={t('title')} body={t('body', { academy })} action={inviteButton} />

      <Stack component="section" spacing={2} aria-labelledby="team-members">
        <Text variant="section" as="h2" id="team-members">
          {t('members.heading')}
        </Text>
        <Box component="ul" sx={{ margin: 0, padding: 0 }}>
          {members.items.map(memberRow)}
        </Box>
        {members.nextCursor && (
          <Stack direction="row">
            <Button
              variant="secondary"
              href={`/settings/team?after=${encodeURIComponent(members.nextCursor)}`}
            >
              {t('members.loadMore')}
            </Button>
          </Stack>
        )}
      </Stack>

      <Stack component="section" spacing={2} aria-labelledby="team-invitations">
        <Text variant="section" as="h2" id="team-invitations">
          {t('invitations.heading')}
        </Text>
        {invitations.invitations.length === 0 ? (
          <Stack
            spacing={2}
            sx={{
              padding: 5,
              borderRadius: 3,
              border: '1px dashed',
              borderColor: 'ab.border',
              alignItems: 'flex-start',
            }}
          >
            <Text as="h3">
              <strong>{t('invitations.emptyTitle')}</strong>
            </Text>
            <Text tone="secondary">{t('invitations.emptyBody')}</Text>
            {inviteButton}
          </Stack>
        ) : (
          <Box component="ul" sx={{ margin: 0, padding: 0 }}>
            {invitations.invitations.map((inv) => (
              <Row key={inv.id}>
                <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: '1 1 16rem' }}>
                  <Text as="span">
                    <strong>{inv.email}</strong>
                  </Text>
                  <Text variant="bodySmall" tone="secondary">
                    {list(inv.roles.map((r) => roleLabel(r)))}
                  </Text>
                  <Text variant="meta" tone="secondary">
                    {inv.status === 'EXPIRED'
                      ? t('invitations.expired', { date: date(inv.expiresAt) })
                      : t('invitations.expires', { date: date(inv.expiresAt) })}
                  </Text>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <StatusBadge
                    tone={inv.status === 'EXPIRED' ? 'warning' : 'info'}
                    label={t(`status.${inv.status}`)}
                  />
                  {holds(me, 'team.invite') && (
                    <InvitationActions
                      id={inv.id}
                      labels={{
                        resend: t('invitations.resend'),
                        revoke: t('invitations.revoke'),
                        resent: t('invitations.resent', { email: inv.email ?? '' }),
                        revoked: t('invitations.revoked'),
                        revokeTitle: t('invitations.revokeTitle'),
                        revokeBody: t('invitations.revokeBody', { email: inv.email ?? '' }),
                        keep: t('invitations.keep'),
                        errors,
                      }}
                    />
                  )}
                </Stack>
              </Row>
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}

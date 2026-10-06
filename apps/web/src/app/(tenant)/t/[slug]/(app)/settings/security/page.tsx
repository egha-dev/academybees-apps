import {
  DeviceSessionListSchema,
  type SecurityOverview,
  SecurityOverviewSchema,
  SecuritySettingsResponseSchema,
  STAFF_ROLE_KEYS,
} from '@academybee/contracts';
import { formatDate, formatTime } from '@academybee/i18n';
import { TextLink } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { authLabels, mfaLabels } from '@/components/auth/labels.server';
import { PageHeader } from '@/components/shell/page-header';
import { holds, signedInMember } from '@/components/shell/signed-in.server';
import { type SecurityErrorLabels } from '@/components/security/errors';
import { MfaManage } from '@/components/security/mfa-manage';
import { MfaRuleLazy as MfaRule } from '@/components/security/mfa-rule-lazy';
import { PasswordChange } from '@/components/security/password-change';
import { SessionAction } from '@/components/security/session-actions';
import { apiServerGet } from '@/lib/api.server';
import { roleHomesEnabled } from '@/lib/flags.server';
import { academyTimeZone, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.security');
  return { title: t('metaTitle') };
}

async function load<T>(path: string, parse: (v: unknown) => T): Promise<T> {
  const res = await apiServerGet(path);
  if (!res.ok) throw new Error(`security page: ${path} answered ${res.status}`);
  return parse(await res.json());
}

const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'safari']);
const SYSTEMS = new Set(['android', 'ios', 'windows', 'macos', 'linux']);

/**
 * A status label: words, with a shape for "on" (never colour alone, UX §6). Server markup, so the
 * route ships no badge JS (G-24).
 */
function Badge({ label, on }: { label: string; on: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        paddingInline: 2,
        paddingBlock: 0.5,
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: on ? 'ab.status.success.fg' : 'ab.status.neutral.fg',
        bgcolor: on ? 'ab.status.success.surface' : 'ab.status.neutral.surface',
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          inlineSize: 8,
          blockSize: 8,
          borderRadius: on ? '50%' : 0,
          border: '2px solid currentColor',
          bgcolor: on ? 'currentColor' : 'transparent',
        }}
      />
      {label}
    </Box>
  );
}

/** A titled section (plain markup: no client JS on this route, G-24). */
function Section({
  id,
  title,
  subtitle,
  status,
  children,
}: {
  /** Names the region by its heading. */
  id: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={{
        padding: 5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'ab.border',
        bgcolor: 'ab.surface',
      }}
    >
      <Stack spacing={3}>
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 3 }}
        >
          <Stack spacing={1}>
            <Text variant="section" as="h2" id={id}>
              {title}
            </Text>
            {subtitle && (
              <Text variant="bodySmall" tone="secondary">
                {subtitle}
              </Text>
            )}
          </Stack>
          {status}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
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
        paddingBlock: 3,
        borderBlockEnd: '1px solid',
        borderColor: 'ab.border',
        '&:last-of-type': { borderBlockEnd: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Security (plan 2.21, 2.22; G-11, C-80): the signed-in user's own two-step sign-in, password
 * and devices in this academy, and — for those who manage settings — the academy's 2FA rule.
 * Every staff member can open it. Owners and Accountants without 2FA arrive here after sign-in
 * (`?prompt=mfa`) and see the strong prompt first, on every visit, until 2FA is on. Read on the server; changes are sheets that call the API
 * and refresh the page. Online only.
 */
export default async function SecurityPage() {
  const [{ me, academy }, { context }, roleHomes, t, roleT, auth, steps] = await Promise.all([
    signedInMember(),
    hostContext(),
    roleHomesEnabled(),
    getTranslations('auth.security'),
    getTranslations('auth.roles'),
    authLabels(),
    mfaLabels(),
  ]);
  const canReadRule = holds(me, 'academy.settings.read');
  const [overview, sessions, rule] = await Promise.all([
    load('/auth/security', (v): SecurityOverview => SecurityOverviewSchema.parse(v)),
    load('/auth/sessions', (v) => DeviceSessionListSchema.parse(v)),
    canReadRule
      ? load('/settings/security', (v) => SecuritySettingsResponseSchema.parse(v))
      : undefined,
  ]);

  const timeZone = academyTimeZone(context);
  const tz = timeZone ? { timeZone } : {};
  const date = (iso: string) => formatDate(iso, tz);
  const time = (iso: string) => formatTime(iso, tz);
  const device = (code: string) => {
    const [browser = 'other', os = 'other'] = code.split('/');
    return t('sessions.device', {
      browser: BROWSERS.has(browser) ? browser : 'other',
      os: SYSTEMS.has(os) ? os : 'other',
    });
  };

  const errors: SecurityErrorLabels = {
    wrongPassword: t('errors.wrongPassword'),
    wrongCode: steps.errors.wrongCode,
    conflict: t('errors.conflict'),
    rateLimited: t('errors.rateLimited'),
    offline: t('errors.offline'),
    generic: t('errors.generic'),
  };
  const close = (await getTranslations('common.actions'))('close');
  const passwordStep = {
    prompt: t('mfa.passwordPrompt'),
    password: t('password.current'),
    required: auth.fields.required,
    toggle: auth.fields.password,
  };
  const mfaManage = (
    <MfaManage
      enabled={overview.mfa.enabled}
      required={overview.mfa.required}
      labels={{
        setUp: t('mfa.setUp'),
        newCodes: t('mfa.newCodes'),
        turnOff: t('mfa.turnOff'),
        turnOffBody: t('mfa.turnOffBody'),
        continue: t('mfa.continue'),
        enabled: t('mfa.enabled'),
        disabled: t('mfa.disabled'),
        newCodesBody: t('mfa.newCodesBody'),
        newCodesDone: t('mfa.newCodesDone'),
        close,
        password: passwordStep,
        steps,
        errors,
      }}
    />
  );

  // The strong prompt (G-11): after sign-in, or whenever an Owner/Accountant still has no 2FA.
  const prompted = overview.mfa.recommended;
  const others = sessions.items.filter((s) => !s.current);
  const staffRoles = STAFF_ROLE_KEYS.map((key) => ({ value: key, label: roleT(key) }));

  return (
    <Stack spacing={6}>
      <PageHeader title={t('title')} body={t('body', { academy })} />

      {prompted && (
        <Box
          component="section"
          aria-labelledby="mfa-prompt"
          sx={{
            padding: 5,
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'ab.accent',
            bgcolor: 'ab.surface',
          }}
        >
          <Stack spacing={3}>
            <Text variant="section" as="h2" id="mfa-prompt">
              {t('prompt.title', { academy })}
            </Text>
            <Text>{t('prompt.body')}</Text>
            <Stack direction="row" spacing={4} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {mfaManage}
              {roleHomes && <TextLink href={homeFor(me)}>{t('prompt.later')}</TextLink>}
            </Stack>
          </Stack>
        </Box>
      )}

      <Section
        id="security-mfa"
        title={t('mfa.title')}
        status={
          <Badge
            on={overview.mfa.enabled}
            label={overview.mfa.enabled ? t('mfa.on') : t('mfa.off')}
          />
        }
      >
        <Stack spacing={3}>
          {overview.mfa.enabled ? (
            <>
              {overview.mfa.enabledAt && (
                <Text>{t('mfa.onSince', { date: date(overview.mfa.enabledAt) })}</Text>
              )}
              {overview.mfa.recoveryCodesLeft <= 3 ? (
                <InlineAlert tone="warning">
                  {t('mfa.codesLeft', { count: overview.mfa.recoveryCodesLeft })}
                </InlineAlert>
              ) : (
                <Text tone="secondary">
                  {t('mfa.codesLeft', { count: overview.mfa.recoveryCodesLeft })}
                </Text>
              )}
              {overview.mfa.required && (
                <Text tone="secondary">{t('mfa.required', { academy })}</Text>
              )}
            </>
          ) : (
            <Text tone="secondary">{t('mfa.offBody')}</Text>
          )}
          {!prompted && mfaManage}
        </Stack>
      </Section>

      <Section id="security-password" title={t('password.title')}>
        <Stack spacing={3}>
          {overview.password.updatedAt && (
            <Text tone="secondary">
              {t('password.changedOn', { date: date(overview.password.updatedAt) })}
            </Text>
          )}
          <Box>
            <PasswordChange
              labels={{
                open: t('password.change'),
                current: t('password.current'),
                new: t('password.new'),
                submit: t('password.submit'),
                changed: t('password.changed'),
                sameAsCurrent: t('password.sameAsCurrent'),
                close,
                fields: auth.fields,
                errors,
              }}
            />
          </Box>
        </Stack>
      </Section>

      <Section
        id="security-devices"
        title={t('sessions.title')}
        subtitle={t('sessions.body', { academy })}
      >
        <Stack spacing={3}>
          <Box component="ul" sx={{ margin: 0, padding: 0 }}>
            {sessions.items.map((s) => (
              <Row key={s.id}>
                <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: '1 1 14rem' }}>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Text as="span">
                      <strong>{device(s.device)}</strong>
                    </Text>
                    {s.current && <Badge on label={t('sessions.thisDevice')} />}
                  </Stack>
                  <Text variant="meta" tone="secondary">
                    {t('sessions.lastUsed', { date: date(s.lastUsedAt), time: time(s.lastUsedAt) })}
                  </Text>
                </Stack>
                {!s.current && (
                  <SessionAction
                    sessionId={s.id}
                    label={t('sessions.signOut')}
                    done={t('sessions.signedOut')}
                    errors={errors}
                  />
                )}
              </Row>
            ))}
          </Box>
          {others.length > 0 ? (
            <Box>
              <SessionAction
                label={t('sessions.signOutOthers')}
                done={t('sessions.othersSignedOut')}
                errors={errors}
                variant="ghost"
              />
            </Box>
          ) : (
            <Text tone="secondary">{t('sessions.onlyThis')}</Text>
          )}
        </Stack>
      </Section>

      {rule && (
        <Section id="security-rule" title={t('rule.title')} subtitle={t('rule.body', { academy })}>
          {holds(me, 'academy.settings.manage') ? (
            <MfaRule
              roles={staffRoles}
              value={rule.requireMfaForRoles}
              version={rule.version}
              labels={{
                roles: t('rule.roles'),
                save: t('rule.save'),
                saved: t('rule.saved'),
                ownMfaFirst: t('rule.ownMfaFirst'),
                versionConflict: t('rule.versionConflict'),
                errors,
              }}
            />
          ) : (
            <Text>
              {rule.requireMfaForRoles.length
                ? t('rule.current', {
                    roles: new Intl.ListFormat(await getLocale(), { type: 'conjunction' }).format(
                      rule.requireMfaForRoles.map((r) => roleT(r)),
                    ),
                  })
                : t('rule.none')}
            </Text>
          )}
        </Section>
      )}
    </Stack>
  );
}

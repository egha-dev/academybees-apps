import {
  AcademyBrandingSchema,
  ONBOARDING_STEPS,
  type OnboardingStep,
  OnboardingStepSchema,
  REQUIRED_STEPS,
  SAVED_STEPS,
  type SavedStep,
} from '@academybee/contracts';
import { StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { stepLabels } from '@/components/onboarding/labels.server';
import { StepFormLazy } from '@/components/onboarding/onboarding-lazy';
import { loadOnboarding, onboardingOwner } from '@/components/onboarding/owner.server';
import { holds } from '@/components/shell/signed-in.server';
import { ReadyActions } from '@/components/onboarding/ready-actions';
import { stepName } from '@/components/onboarding/step-name';
import { StepProgress } from '@/components/onboarding/step-progress';
import { apiServerGet } from '@/lib/api.server';
import { academyName, hostContext } from '@/lib/host-context.server';
import { homeFor } from '@/lib/session.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ step: string }>;
}): Promise<Metadata> {
  const { step } = await params;
  const parsed = OnboardingStepSchema.safeParse(step);
  const t = await getTranslations('onboarding');
  return {
    title: parsed.success
      ? stepName(t as never, parsed.data, { batch: 'batch', course: 'course', teacher: 'teacher' })
      : '',
  };
}

/**
 * One guided-setup step (UX v1.1 §5, C-08): progress, what it is for, its form with Back, Skip
 * (except Profile and Type) and Save and continue; or Ready — what was set up, and Open my
 * academy (C-87). Phone-first.
 */
export default async function StepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step: raw } = await params;
  const parsed = OnboardingStepSchema.safeParse(raw);
  if (!parsed.success) notFound();
  const step: OnboardingStep = parsed.data;
  const owner = await onboardingOwner();
  if (owner.state !== 'signed-in') return null;
  const [state, t, { context }, peopleT] = await Promise.all([
    loadOnboarding(),
    getTranslations('onboarding'),
    hostContext(),
    getTranslations('people'),
  ]);
  // G-02: import offered beside the quick-add form.
  const importAvailable = holds(owner.me, 'student.import');
  // Finished: the academy's home, never `/` (which a stale gate could send back here, review H1).
  if (state.completed) redirect(homeFor(owner.me));
  const academy = academyName(context) ?? '';
  const terms = state.terminology;
  const name = (s: OnboardingStep) => stepName(t as never, s, terms);
  const index = ONBOARDING_STEPS.indexOf(step);
  const total = SAVED_STEPS.length;

  if (step === 'ready') {
    return (
      <Stack spacing={6}>
        <StepProgress
          current={total}
          total={total}
          label={t('frame.progress', { current: total, total })}
          name={name('ready')}
        />
        <Stack spacing={2}>
          <Text variant="title" as="h1">
            {t('ready.title', { academy })}
          </Text>
          <Text tone="secondary">{t('ready.body')}</Text>
        </Stack>
        <Box component="ul" aria-label={t('frame.progressLabel')} sx={{ margin: 0, padding: 0 }}>
          {SAVED_STEPS.map((s) => {
            const done = state.steps[s]?.status === 'done';
            return (
              <Box
                component="li"
                key={s}
                sx={{
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  paddingBlock: 3,
                  borderBlockEnd: '1px solid',
                  borderColor: 'ab.border',
                }}
              >
                <Box
                  component="a"
                  href={`/onboarding/${s}`}
                  sx={{ color: 'ab.textPrimary', fontWeight: 500 }}
                >
                  {name(s)}
                </Box>
                <StatusBadge
                  tone={done ? 'success' : 'neutral'}
                  label={done ? t('ready.done') : t('ready.skipped')}
                />
              </Box>
            );
          })}
        </Box>
        {state.values.timetable.upcoming.length > 0 && (
          <Stack spacing={1}>
            <Text variant="section" as="h2">
              {t('timetable.upcoming')}
            </Text>
            {state.values.timetable.upcoming.map((u) => (
              <Text key={`${u.date}${u.start}`} variant="bodySmall">
                <span data-i18n-exempt>
                  {u.date} · {u.start}–{u.end}
                </span>
              </Text>
            ))}
          </Stack>
        )}
        <ReadyActions
          canComplete={state.canComplete}
          labels={{
            open: t('ready.open'),
            notYet: t('ready.notYet'),
            offline: t('errors.offline'),
            generic: t('errors.generic'),
          }}
        />
      </Stack>
    );
  }

  const saved = step;
  const branding =
    saved === 'profile'
      ? await apiServerGet('/academy/branding').then(async (r) =>
          r.ok ? AcademyBrandingSchema.parse(await r.json()) : null,
        )
      : null;
  const titles: Record<SavedStep, { title: string; body: string }> = {
    profile: { title: t('profile.title'), body: t('profile.body') },
    type: { title: t('type.title'), body: t('type.body') },
    course: { title: t('course.title', { term: terms.course }), body: t('course.body') },
    teacher: {
      title: t('teacher.title'),
      body: t('teacher.body', { batch: t('terms.batch', { term: terms.batch }) }),
    },
    batch: { title: t('batch.title', { term: terms.batch }), body: t('batch.body') },
    students: { title: t('students.title'), body: t('students.body') },
    timetable: { title: t('timetable.title'), body: t('timetable.body') },
  };
  return (
    <Stack spacing={6}>
      <StepProgress
        current={index + 1}
        total={total}
        label={t('frame.progress', { current: index + 1, total })}
        name={name(step)}
      />
      <Stack spacing={2}>
        <Text variant="title" as="h1">
          {titles[saved].title}
        </Text>
        <Text tone="secondary">{titles[saved].body}</Text>
      </Stack>
      {saved === 'students' && importAvailable && (
        <Box
          sx={{
            padding: 3,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'ab.border',
            bgcolor: 'ab.surface',
          }}
        >
          <Text>
            {peopleT('import.setupHint')}{' '}
            <Box
              component="a"
              href="/onboarding/import"
              sx={{ fontWeight: 600, color: 'ab.textPrimary' }}
            >
              {peopleT('import.open')}
            </Box>
          </Text>
        </Box>
      )}
      <StepFormLazy
        step={saved}
        state={state}
        previous={index > 0 ? `/onboarding/${ONBOARDING_STEPS[index - 1]}` : '/welcome'}
        skippable={!(REQUIRED_STEPS as readonly string[]).includes(saved)}
        logo={{
          url: branding?.logoUrl ?? null,
          uploadsAvailable: branding?.uploadsAvailable ?? false,
        }}
        labels={await stepLabels(terms, academy)}
      />
    </Stack>
  );
}

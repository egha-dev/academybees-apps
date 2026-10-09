import { Button } from '@academybee/ui/components/actions';
import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { loadOnboarding, onboardingOwner } from '@/components/onboarding/owner.server';
import { stepName } from '@/components/onboarding/step-name';
import { StepProgress } from '@/components/onboarding/step-progress';
import { academyName, hostContext } from '@/lib/host-context.server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.welcome');
  return { title: t('metaTitle') };
}

/**
 * First visit (UX v1.1 §4): "this is my academy's workspace" — its name, a warm welcome, how far
 * the setup is, how long it takes, Continue / Finish later.
 */
export default async function WelcomePage() {
  const owner = await onboardingOwner();
  if (owner.state !== 'signed-in') return null;
  const [state, t, { context }] = await Promise.all([
    loadOnboarding(),
    getTranslations('onboarding'),
    hostContext(),
  ]);
  if (state.completed) redirect('/');
  const academy = academyName(context) ?? '';
  const total = 7;
  const done = Object.values(state.steps).filter((s) => s.status !== 'pending').length;
  const term = state.terminology;
  return (
    <Stack spacing={6}>
      <Stack spacing={2}>
        <Text variant="title" as="h1">
          {t('welcome.title', { academy })}
        </Text>
        <Text tone="secondary">
          {t('welcome.body', {
            course: t('terms.course', { term: term.course }),
            teacher: t('terms.teacher', { term: term.teacher }),
            batch: t('terms.batch', { term: term.batch }),
          })}
        </Text>
      </Stack>
      <StepProgress
        current={done}
        total={total}
        label={t('welcome.progress', { done, total })}
        name={stepName(t as never, state.currentStep, term)}
      />
      <Text tone="secondary">{t('welcome.time')}</Text>
      <Stack direction="row">
        <Button href={`/onboarding/${state.currentStep}`}>
          {done ? t('welcome.continue') : t('welcome.start')}
        </Button>
      </Stack>
    </Stack>
  );
}

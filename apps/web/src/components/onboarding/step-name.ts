import type { OnboardingStep, Terminology } from '@academybee/contracts';

type T = (key: string, values?: Record<string, string>) => string;

/** A step's name in the academy's own words ("First class", "First coach" …). */
export function stepName(t: T, step: OnboardingStep, terms: Terminology): string {
  const term = step === 'course' ? terms.course : step === 'teacher' ? terms.teacher : terms.batch;
  return t(`steps.${step}`, { term });
}

import { describe, expect, it } from 'vitest';

import {
  nextOnboardingStep,
  PhoneSchema,
  ProfileStepSchema,
  StudentsStepSchema,
  TimetableStepSchema,
} from './onboarding.js';

describe('onboarding steps (UX v1.1 §5, C-08)', () => {
  it('goes through the steps in order and ends on Ready', () => {
    expect(nextOnboardingStep('profile')).toBe('type');
    expect(nextOnboardingStep('teacher')).toBe('batch');
    expect(nextOnboardingStep('timetable')).toBe('ready');
  });

  it('accepts Indian mobile numbers as typed and stores E.164', () => {
    expect(PhoneSchema.parse('98400 12345')).toBe('+919840012345');
    expect(PhoneSchema.parse('+44 20 7946 0958')).toBe('+442079460958');
    expect(PhoneSchema.safeParse('12345').success).toBe(false);
  });

  it('defaults the profile to India and refuses unknown timezones', () => {
    expect(ProfileStepSchema.parse({ name: 'Gurushethra' })).toMatchObject({
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    });
    expect(ProfileStepSchema.safeParse({ name: 'X', timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('limits quick-add to 20 students and needs slots that end after they start', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ fullName: `S${i}` }));
    expect(StudentsStepSchema.safeParse({ students: many }).success).toBe(false);
    expect(
      TimetableStepSchema.safeParse({ slots: [{ weekday: 1, start: '18:00', end: '17:00' }] })
        .success,
    ).toBe(false);
    expect(
      TimetableStepSchema.safeParse({ slots: [{ weekday: 1, start: '17:00', end: '18:00' }] })
        .success,
    ).toBe(true);
  });
});

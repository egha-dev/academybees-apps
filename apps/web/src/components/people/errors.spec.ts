import messages from '@academybee/i18n/messages/en-IN/people.json';
import { describe, expect, it } from 'vitest';

import { peopleErrorMessage } from './errors';

const labels = { ...messages.errors, offline: messages.form.offline };

describe('peopleErrorMessage', () => {
  it('says a feature that is not set up is unavailable, and never suggests trying again', () => {
    const text = peopleErrorMessage({ code: 'SERVICE_UNAVAILABLE', status: 503 }, labels);
    expect(text).toBe(messages.errors.unavailable);
    expect(text).not.toMatch(/try again/i);
  });

  it('keeps the generic message for unexpected errors', () => {
    expect(peopleErrorMessage({ code: 'INTERNAL', status: 500 }, labels)).toBe(
      messages.errors.generic,
    );
  });
});

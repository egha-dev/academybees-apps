import type { Messages } from '@academybee/i18n';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import type { ApiError } from '@/lib/api';

export type FinanceErrorLabels = {
  finance: Messages['finance']['ui']['errors'];
  people: PeopleErrorLabels;
};

/** What a field's validation issue means, or undefined for the form-level message. */
export function issueMessage(issue: string, l: FinanceErrorLabels['finance']): string | undefined {
  switch (issue) {
    case 'invalid_vpa':
      return l.invalidVpa;
    case 'invalid_ifsc':
      return l.invalidIfsc;
    case 'invalid_account_number':
      return l.invalidAccount;
    case 'invalid_gstin':
      return l.invalidGstin;
    case 'invalid_prefix':
      return l.invalidPrefix;
    case 'prefix_in_use':
      return l.prefixInUse;
    case 'before_start':
      return l.beforeStart;
    case 'required':
    case 'required_for_custom':
    case 'too_small':
    case 'invalid_type':
      return l.required;
    default:
      return undefined;
  }
}

/** One message for a failed finance action; the API's codes and details, never its text. */
export function financeErrorMessage(error: ApiError, labels: FinanceErrorLabels): string {
  const issue = error.details?.[0]?.issue;
  switch (issue) {
    case 'prefix_in_use':
      return labels.finance.prefixInUse;
    case 'already_assigned':
      return labels.finance.alreadyAssigned;
    case 'no_students':
      return labels.finance.noStudents;
    case 'student_inactive':
      return labels.finance.studentInactive;
    default:
      return error.code === 'VALIDATION_FAILED'
        ? labels.finance.fixFields
        : peopleErrorMessage(error, labels.people);
  }
}

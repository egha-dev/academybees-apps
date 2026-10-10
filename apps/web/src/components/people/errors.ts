import type { Messages } from '@academybee/i18n';

import type { ApiError } from '@/lib/api';

export type PeopleErrorLabels = Messages['people']['errors'] & { offline: string };

/** One message for a failed people action, from the API's code and detail (never raw text). */
export function peopleErrorMessage(error: ApiError, labels: PeopleErrorLabels): string {
  const issue = error.details?.[0]?.issue;
  switch (error.code) {
    case 'OFFLINE':
      return labels.offline;
    case 'NETWORK':
      return labels.network;
    case 'NOT_FOUND':
      return labels.notFound;
    case 'VERSION_CONFLICT':
      return labels.conflict;
    case 'INVALID_STATE_TRANSITION':
      return issue === 'archived' ? labels.archived : labels.conflict;
    case 'CONFLICT':
      return issue === 'already_linked' ? labels.alreadyLinked : labels.conflict;
    case 'ENTITLEMENT_LIMIT_REACHED':
      return labels.limit;
    case 'FORBIDDEN':
      return labels.forbidden;
    default:
      return labels.generic;
  }
}

/** Field errors from a 400 `VALIDATION_FAILED`, keyed by the API path (`parent.phone`, …). */
export function fieldErrors(error: ApiError): Record<string, string> {
  if (error.code !== 'VALIDATION_FAILED') return {};
  return Object.fromEntries((error.details ?? []).map((d) => [d.path, d.issue]));
}

/** Errors after which the page shows stale data and should be re-read. */
export const REFRESH_AFTER = new Set(['VERSION_CONFLICT', 'NOT_FOUND', 'CONFLICT']);

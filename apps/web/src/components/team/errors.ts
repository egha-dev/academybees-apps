import type { ApiError } from '@/lib/api';

export type TeamErrorLabels = {
  alreadyMember: string;
  notGrantable: string;
  ownerOnly: string;
  lastOwner: string;
  versionConflict: string;
  rateLimited: string;
  gone: string;
  offline: string;
  generic: string;
};

/** One message for a failed team action, from the API's code and detail (never raw text). */
export function teamErrorMessage(error: ApiError, labels: TeamErrorLabels): string {
  const issue = error.details?.[0]?.issue;
  switch (error.code) {
    case 'CONFLICT':
      if (issue === 'already_member') return labels.alreadyMember;
      if (issue === 'last_owner') return labels.lastOwner;
      return labels.generic;
    case 'FORBIDDEN':
      return issue === 'owner_only' ? labels.ownerOnly : labels.notGrantable;
    case 'VERSION_CONFLICT':
      return labels.versionConflict;
    case 'RATE_LIMITED':
      return labels.rateLimited;
    case 'NOT_FOUND':
      return labels.gone;
    case 'OFFLINE':
      return labels.offline;
    default:
      return labels.generic;
  }
}

/** Errors after which the page shows stale data and should be re-read. */
export const REFRESH_AFTER = new Set(['VERSION_CONFLICT', 'NOT_FOUND', 'CONFLICT']);

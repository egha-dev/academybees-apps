import type { ApiError } from '@/lib/api';

export type SecurityErrorLabels = {
  wrongPassword: string;
  wrongCode: string;
  conflict: string;
  rateLimited: string;
  offline: string;
  generic: string;
};

/** One message for a failed security action (API codes, never raw text, UX §31). */
export function securityErrorMessage(
  error: ApiError,
  labels: SecurityErrorLabels,
  wrong: 'password' | 'code' = 'password',
): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return wrong === 'code' ? labels.wrongCode : labels.wrongPassword;
    case 'CONFLICT':
    case 'VERSION_CONFLICT':
    case 'NOT_FOUND':
      return labels.conflict;
    case 'RATE_LIMITED':
      return labels.rateLimited;
    case 'OFFLINE':
    case 'NETWORK':
      return labels.offline;
    default:
      return labels.generic;
  }
}

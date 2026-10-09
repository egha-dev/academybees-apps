import { type ApiError } from '@/lib/api';

type ErrorKey =
  | 'errors.offline'
  | 'errors.notFound'
  | 'errors.invalidState'
  | 'errors.forbidden'
  | 'errors.conflict'
  | 'errors.unavailable'
  | 'errors.rateLimited'
  | 'errors.generic';
type T = (key: ErrorKey) => string;

/** One message per outcome a console action can have (UX §24: what happened, what to do). */
export function consoleErrorMessage(error: ApiError, t: T): string {
  switch (error.code) {
    case 'OFFLINE':
    case 'NETWORK':
      return t('errors.offline');
    case 'NOT_FOUND':
      return t('errors.notFound');
    case 'INVALID_STATE_TRANSITION':
      return t('errors.invalidState');
    case 'FORBIDDEN':
      return t('errors.forbidden');
    case 'CONFLICT':
      return t('errors.conflict');
    case 'SERVICE_UNAVAILABLE':
      return t('errors.unavailable');
    case 'RATE_LIMITED':
      return t('errors.rateLimited');
    default:
      return t('errors.generic');
  }
}

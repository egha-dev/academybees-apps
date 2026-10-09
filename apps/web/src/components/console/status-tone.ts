import { type StatusTone } from '@academybee/ui/tokens';

/** Academy status → badge tone (never colour alone: the badge always carries its label). */
export const STATUS_TONE: Record<string, StatusTone> = {
  PENDING_APPROVAL: 'info',
  SETUP: 'info',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
};

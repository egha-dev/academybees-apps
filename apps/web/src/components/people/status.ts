import type { StatusTone } from '@academybee/ui/tokens';

/** Status badges: tone plus the status word (never colour alone, UX §31). */
export const STATUS_TONE: Record<
  'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'LEFT' | 'ARCHIVED',
  StatusTone
> = {
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'info',
  LEFT: 'neutral',
  ARCHIVED: 'neutral',
};

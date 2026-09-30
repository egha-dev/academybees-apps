import { newId } from '@academybee/contracts';

/**
 * Minimal factory helper: `defineFactory(defaults)` returns `build(overrides)`.
 * Domain factories (tenant, user, student …) are added by the phases that create those models.
 */
export function defineFactory<T extends object>(defaults: () => T) {
  return (overrides: Partial<T> = {}): T => ({ ...defaults(), ...overrides });
}

export const buildAuditEntry = defineFactory(() => ({
  id: newId(),
  actorType: 'SYSTEM' as const,
  action: 'test.action',
}));

export const buildOutboxEvent = defineFactory(() => ({
  id: newId(),
  type: 'test.event',
  payload: { hello: 'world' },
}));

import common from '../messages/en-IN/common.json' with { type: 'json' };
import designSystem from '../messages/en-IN/design-system.json' with { type: 'json' };
import errors from '../messages/en-IN/errors.json' with { type: 'json' };
import offline from '../messages/en-IN/offline.json' with { type: 'json' };
import shell from '../messages/en-IN/shell.json' with { type: 'json' };
import tenant from '../messages/en-IN/tenant.json' with { type: 'json' };

/**
 * The en-IN catalogue, one JSON file per namespace (C-33, ADR-040). Shared by web, API and
 * worker. Keys are typed from this object, so a missing key is a type error.
 */
export const EN_IN_MESSAGES = {
  common,
  errors,
  shell,
  tenant,
  offline,
  designSystem,
};

export type Messages = typeof EN_IN_MESSAGES;
export type Namespace = keyof Messages;

/** Namespace name → catalogue file name. */
export const NAMESPACE_FILES: Record<Namespace, string> = {
  common: 'common.json',
  errors: 'errors.json',
  shell: 'shell.json',
  tenant: 'tenant.json',
  offline: 'offline.json',
  designSystem: 'design-system.json',
};

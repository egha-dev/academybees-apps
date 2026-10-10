import academy from '../messages/en-IN/academy.json' with { type: 'json' };
import auth from '../messages/en-IN/auth.json' with { type: 'json' };
import common from '../messages/en-IN/common.json' with { type: 'json' };
import consoleMessages from '../messages/en-IN/console.json' with { type: 'json' };
import designSystem from '../messages/en-IN/design-system.json' with { type: 'json' };
import email from '../messages/en-IN/email.json' with { type: 'json' };
import errors from '../messages/en-IN/errors.json' with { type: 'json' };
import marketing from '../messages/en-IN/marketing.json' with { type: 'json' };
import offline from '../messages/en-IN/offline.json' with { type: 'json' };
import onboarding from '../messages/en-IN/onboarding.json' with { type: 'json' };
import people from '../messages/en-IN/people.json' with { type: 'json' };
import shell from '../messages/en-IN/shell.json' with { type: 'json' };
import team from '../messages/en-IN/team.json' with { type: 'json' };
import tenant from '../messages/en-IN/tenant.json' with { type: 'json' };

/**
 * The en-IN catalogue, one JSON file per namespace (C-33, ADR-040). Shared by web, API and
 * worker. Keys are typed from this object, so a missing key is a type error.
 */
export const EN_IN_MESSAGES = {
  common,
  auth,
  errors,
  email,
  shell,
  team,
  tenant,
  marketing,
  offline,
  designSystem,
  console: consoleMessages,
  academy,
  onboarding,
  people,
};

export type Messages = typeof EN_IN_MESSAGES;
export type Namespace = keyof Messages;

/** Namespace name → catalogue file name. */
export const NAMESPACE_FILES: Record<Namespace, string> = {
  common: 'common.json',
  auth: 'auth.json',
  errors: 'errors.json',
  email: 'email.json',
  shell: 'shell.json',
  team: 'team.json',
  marketing: 'marketing.json',
  tenant: 'tenant.json',
  offline: 'offline.json',
  designSystem: 'design-system.json',
  console: 'console.json',
  academy: 'academy.json',
  onboarding: 'onboarding.json',
  people: 'people.json',
};

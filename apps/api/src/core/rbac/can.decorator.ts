import { type Capability } from '@academybee/contracts';
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_CAPABILITY = 'academybee:capability';
export const SIGNED_IN_ONLY = 'academybee:signed-in';

/**
 * The capability a route needs (ADR-008). Evaluated against the caller's roles in the request's
 * academy; the scope it was granted with is then applied by the resource's policy.
 */
export const Can = (capability: Capability) => SetMetadata(REQUIRED_CAPABILITY, capability);

/**
 * Any signed-in user may call this route (their own profile, sessions, sign-out). Every
 * non-public route must declare either `@Can(…)` or `@SignedIn()` — a test enforces it.
 */
export const SignedIn = () => SetMetadata(SIGNED_IN_ONLY, true);

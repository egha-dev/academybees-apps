export {
  classifyHost,
  type HostClass,
  type HostKind,
  normalizeHost,
  normalizeRootDomain,
  tenantHost,
} from './host.js';
export {
  IMPERSONATION_EXACT,
  IMPERSONATION_PREFIXES,
  isImpersonatingSlug,
  isReservedSlug,
  RESERVED_SLUGS,
} from './reserved.js';
export {
  isSlugShaped,
  normalizeSlug,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  type SlugCheck,
  slugAlternatives,
  slugFromName,
  type SlugProblem,
  validateSlug,
} from './slug.js';

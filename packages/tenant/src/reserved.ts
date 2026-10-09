/**
 * Slugs that normal provisioning can never use (ARCHITECTURE §4.1, ADR-003). Only a
 * platform-owned tenant created by seed/CLI may use one (e.g. the sales demo `demo`, C-36).
 * Anything shorter than three characters is also refused (see `validateSlug`).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'my',
  'hub',
  'family',
  'parents',
  'api',
  'admin',
  'console',
  'platform',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'account',
  'accounts',
  'mail',
  'email',
  'smtp',
  'static',
  'assets',
  'cdn',
  'media',
  'files',
  'img',
  'images',
  'docs',
  'help',
  'support',
  'status',
  'blog',
  'news',
  'billing',
  'pay',
  'payments',
  'invoice',
  'invoices',
  'dev',
  'staging',
  'stage',
  'test',
  'qa',
  'demo',
  'sandbox',
  'preview',
  'internal',
  'ops',
  'root',
  'system',
  'security',
  'academybee',
  'bee',
  'public',
  'private',
  'www2',
  'm',
  'mobile',
  'ftp',
  'ns1',
  'ns2',
  'localhost',
]);

export function isReservedSlug(slug: string): boolean {
  return slug.length < 3 || RESERVED_SLUGS.has(slug);
}

/**
 * Names an academy subdomain must not imitate (ARCHITECTURE §4.1, C-88): AcademyBee itself,
 * government bodies, banks and payment brands, and big technology names. These are refused
 * exactly and as the first word (`paytm-classes`, `academybee-support`).
 */
export const IMPERSONATION_PREFIXES: ReadonlySet<string> = new Set([
  'academybee',
  'academybees',
  'acadamybee',
  'uidai',
  'aadhaar',
  'aadhar',
  'incometax',
  'govt',
  'rbi',
  'sebi',
  'cbse',
  'ncert',
  'sbi',
  'hdfc',
  'icici',
  'paytm',
  'phonepe',
  'gpay',
  'googlepay',
  'bhim',
  'npci',
  'razorpay',
  'cashfree',
  'paypal',
  'mastercard',
  'rupay',
  'google',
  'gmail',
  'microsoft',
  'icloud',
  'amazon',
  'facebook',
  'instagram',
  'whatsapp',
  'youtube',
  'linkedin',
  'openai',
  'anthropic',
]);

/**
 * Ordinary words that are also brands or institutions: refused only on their own, so real
 * academies (`apple-kids-school`, `axis-dance`) keep their names (C-88).
 */
export const IMPERSONATION_EXACT: ReadonlySet<string> = new Set([
  'academy-bee',
  'academy-bees',
  'gov',
  'government',
  'nic',
  'india',
  'gst',
  'icse',
  'ugc',
  'police',
  'upi',
  'axis',
  'kotak',
  'visa',
  'apple',
  'meta',
  'twitter',
  'byjus',
  'unacademy',
  'vedantu',
]);

/** Would this (normalised) slug pass as one of the names above? */
export function isImpersonatingSlug(slug: string): boolean {
  if (IMPERSONATION_EXACT.has(slug) || IMPERSONATION_PREFIXES.has(slug)) return true;
  const first = slug.split('-')[0] ?? '';
  return IMPERSONATION_PREFIXES.has(first) || slug.startsWith('academybee');
}

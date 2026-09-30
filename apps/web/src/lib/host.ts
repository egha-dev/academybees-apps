/**
 * Host classification STUB (C-34). Phase 1 replaces this with the shared `@academybee/tenant`
 * parser (reserved slugs, punycode, custom domains, REDIRECT domains) and real rewrites.
 */
export type HostKind = 'marketing' | 'console' | 'hub' | 'tenant';

export function classifyHost(hostHeader: string): HostKind {
  const host = hostHeader.toLowerCase().replace(/\.$/, '').split(':')[0] ?? '';
  const labels = host.split('.');
  const isLocal = host === 'localhost' || host.endsWith('.localhost');
  const baseLabels = isLocal ? 1 : 2; // localhost vs academybee.com
  if (labels.length <= baseLabels || labels[0] === 'www') return 'marketing';
  if (labels[0] === 'console') return 'console';
  if (labels[0] === 'app') return 'hub';
  return 'tenant';
}

/**
 * Connection URLs whose startup errors get a redacted description (C-77): the URL's shape with
 * the password replaced by its length, so a broken deploy variable can be diagnosed from logs
 * without revealing a secret.
 */
export const CONNECTION_URL_VARIABLES = [
  'DATABASE_URL',
  'PLATFORM_DATABASE_URL',
  'REDIS_URL',
  'MIGRATOR_DATABASE_URL',
] as const;

const URL_PARTS =
  /^([a-z][a-z0-9+.-]*):\/\/(?:([^:@/]*)(?::([^@]*))?@)?(\[[^\]]*\]|[^:/?#]*)(?::([^/?#]*))?(\/[^?#]*)?(?:\?([^#]*))?$/i;

/**
 * A safe description of a connection URL: scheme, user, host, port and path as given; the
 * password only as its length; query parameters by name only. Reports empty values, unresolved
 * `${{…}}` references and whitespace. Never returns the password or any query value.
 */
export function describeConnectionUrl(raw: string | undefined): string {
  if (raw === undefined) return 'not set';
  if (raw.trim() === '') return 'empty';
  const notes: string[] = [];
  if (raw.includes('${{')) notes.push('contains an unresolved ${{…}} reference');
  const ws = raw.search(/\s/);
  if (ws >= 0) notes.push(`contains whitespace at character ${ws + 1}`);
  const m = URL_PARTS.exec(raw.trim());
  if (!m) return [`unparseable (${raw.length} characters)`, ...notes].join('; ');
  const [, scheme, user, password, host, port, path, query] = m;
  const shape =
    `${scheme}://` +
    (user !== undefined || password !== undefined
      ? `${user || '<empty user>'}:${password ? `<${password.length}-character password>` : '<empty password>'}@`
      : '') +
    (host || '<EMPTY HOST>') +
    (port !== undefined ? `:${port || '<empty port>'}` : '') +
    (path === undefined ? '' : path === '/' ? '/<empty database>' : path) +
    (query
      ? `?${query
          .split('&')
          .map((p) => `${p.split('=')[0]}=…`)
          .join('&')}`
      : '');
  return [shape, ...notes].join('; ');
}

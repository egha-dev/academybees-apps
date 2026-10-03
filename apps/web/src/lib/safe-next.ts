/**
 * A same-origin path to return to after signing in, or undefined. Only plain absolute paths:
 * no scheme, no protocol-relative `//host`, no backslashes (open-redirect safe, OWASP).
 */
export function safeNext(value: string | null | undefined): string | undefined {
  if (!value || value.length > 512) return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return undefined;
  if ([...value].some((c) => c.charCodeAt(0) < 0x20)) return undefined;
  if (value === '/login' || value.startsWith('/login?')) return undefined;
  return value;
}

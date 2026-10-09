/** The full URL of an academy host, with the browser's protocol and port (from proxy.ts). */
export function academyUrl(apexUrl: string, host: string): string {
  try {
    const apex = new URL(apexUrl);
    return `${apex.protocol}//${host}${apex.port ? `:${apex.port}` : ''}`;
  } catch {
    return `https://${host}`;
  }
}

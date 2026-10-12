/**
 * Fill `{name}` placeholders in a catalogue string (no ICU). Plain module: usable from server
 * and client components alike (the copy in shell-labels lives behind a client boundary).
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

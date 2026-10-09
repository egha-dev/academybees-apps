/** Fill `{name}` placeholders in a catalogue string passed raw from the server. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

export type AcademyErrorLabels = Record<
  | 'too_large'
  | 'unsupported_type'
  | 'too_large_dimensions'
  | 'uploads_unavailable'
  | 'low_contrast'
  | 'versionConflict'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'required'
  | 'offline'
  | 'generic',
  string
>;

/** The message for an API error on these pages (UX §24: what happened, what to do). */
export function academyErrorMessage(
  error: { code: string; details?: { path: string; issue: string }[] | undefined },
  labels: AcademyErrorLabels,
): string {
  const issue = error.details?.[0]?.issue;
  if (issue && issue in labels) return labels[issue as keyof AcademyErrorLabels];
  if (error.code === 'VERSION_CONFLICT') return labels.versionConflict;
  if (error.code === 'OFFLINE' || error.code === 'NETWORK') return labels.offline;
  if (error.code === 'SERVICE_UNAVAILABLE') return labels.uploads_unavailable;
  return labels.generic;
}

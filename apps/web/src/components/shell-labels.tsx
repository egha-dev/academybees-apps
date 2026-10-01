'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * Pre-translated labels for shell UI that renders on the client (toasts, PWA prompts, the error
 * boundary). The server layout translates them, so no ICU runtime ships in every page's initial
 * JavaScript (G-24 budget). Templates keep their `{placeholder}` and are filled with `fill()`.
 */
export type ShellLabels = {
  close: string;
  retry: string;
  goHome: string;
  install: string;
  installBody: string;
  updateAvailable: string;
  update: string;
  later: string;
  errorTitle: string;
  errorBody: string;
  /** Template with `{requestId}`. */
  errorReference: string;
};

const ShellLabelsContext = createContext<ShellLabels | null>(null);

export function ShellLabelsProvider({
  labels,
  children,
}: {
  labels: ShellLabels;
  children: ReactNode;
}) {
  return <ShellLabelsContext.Provider value={labels}>{children}</ShellLabelsContext.Provider>;
}

export function useShellLabels(): ShellLabels {
  const labels = useContext(ShellLabelsContext);
  if (!labels) throw new Error('useShellLabels must be used inside <ShellLabelsProvider>');
  return labels;
}

/** Fill `{name}` placeholders of a pre-translated template (values are data, e.g. a request ID). */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

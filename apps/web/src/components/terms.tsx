'use client';

import { createContext, type ReactNode, useContext } from 'react';

import type { TermLabels } from '@/lib/terms.server';

const TermsContext = createContext<TermLabels | null>(null);

/** The academy's words for client components (C-118); filled by the academy layout. */
export function TermsProvider({ terms, children }: { terms: TermLabels; children: ReactNode }) {
  return <TermsContext.Provider value={terms}>{children}</TermsContext.Provider>;
}

/** `useTerm().Batches` → "Classes" for a dance academy (ADR-029). */
export function useTerm(): TermLabels {
  const terms = useContext(TermsContext);
  if (!terms) throw new Error('useTerm outside TermsProvider');
  return terms;
}

'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

/** False in the server render and until React has hydrated; then true. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

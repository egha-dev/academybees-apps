// Loaded inside the Teacher PWA's lazy chunk.
import { liveQuery } from 'dexie';
import { type DependencyList, useEffect, useState } from 'react';

/**
 * A Dexie live query as React state: re-runs when the tables it read change, in this tab or
 * another. `undefined` until the first result (loading).
 */
export function useLive<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({ next: setValue, error: () => undefined });
    return () => subscription.unsubscribe();
  }, deps);
  return value;
}

/** The current time, refreshed every `everyMs` (status texts like "synced just now"). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Retry schedule (ARCHITECTURE §11.4): exponential from 2 s, capped at 5 min, with jitter. */
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 5 * 60_000;

/** Un-jittered delay before retry `attempt` (1-based). */
export function backoffBase(attempt: number): number {
  const exp = Math.max(0, attempt - 1);
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.min(exp, 30), BACKOFF_CAP_MS);
}

/**
 * "Equal jitter": half fixed, half random, so devices that went offline together don't retry in
 * lock-step, while the wait never drops below half the base.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = backoffBase(attempt);
  return Math.round(base / 2 + random() * (base / 2));
}

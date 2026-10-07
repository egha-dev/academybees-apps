'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

const WELL_FORMED = /^[A-Za-z0-9_-]{16,128}$/;

type FragmentToken = { token: string; invalidate: () => void };
const Ctx = createContext<FragmentToken | null>(null);

/**
 * Emailed links carry their secret in the URL fragment (`/invite#token=…`): browsers never send a
 * fragment to any server, so it never reaches the web, API, Railway or Cloudflare request logs
 * (review M3, C-83; the handoff code works the same way, C-73). This reads it once, removes it
 * from the address bar, and shows `valid` (whose forms read it with `useFragmentToken`) or
 * `invalid`; `pending` shows until the browser has read it.
 */
export function FragmentTokenGate({
  valid,
  invalid,
  pending,
}: {
  valid: ReactNode;
  invalid: ReactNode;
  pending: ReactNode;
}) {
  const [state, setState] = useState<{ kind: 'reading' | 'valid' | 'invalid'; token?: string }>({
    kind: 'reading',
  });

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    void Promise.resolve().then(() =>
      setState(WELL_FORMED.test(token) ? { kind: 'valid', token } : { kind: 'invalid' }),
    );
  }, []);

  if (state.kind === 'reading') return pending;
  if (state.kind === 'invalid' || !state.token) return invalid;
  return (
    <Ctx.Provider value={{ token: state.token, invalidate: () => setState({ kind: 'invalid' }) }}>
      {valid}
    </Ctx.Provider>
  );
}

/** The link's token, inside `FragmentTokenGate`'s `valid` branch. */
export function useFragmentToken(): FragmentToken {
  const value = useContext(Ctx);
  if (!value) throw new Error('useFragmentToken outside FragmentTokenGate');
  return value;
}

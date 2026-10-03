'use client';

import { THEME_ATTRIBUTE, THEME_MODE_STORAGE_KEY } from '@academybee/ui/tokens';
import { useSyncExternalStore } from 'react';

type Mode = 'system' | 'light' | 'dark';
const ORDER: Mode[] = ['system', 'light', 'dark'];

function readMode(): Mode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

const CHANGE = 'ab:theme-mode';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function apply(mode: Mode) {
  const dark =
    mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute(THEME_ATTRIBUTE, dark ? 'dark' : 'light');
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // private mode: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * Light / dark / match-device switch (C-49). The inline theme script has already applied the
 * stored choice before paint; this only changes it. One button that cycles, labelled with the
 * current choice.
 */
export function ThemeToggle({ labels }: { labels: Record<Mode, string> & { label: string } }) {
  // The server renders "match device"; the stored choice is read after hydration.
  const mode = useSyncExternalStore(subscribe, readMode, () => 'system' as const);
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] ?? 'system';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`${labels.label}: ${labels[mode]}`}
      title={`${labels.label}: ${labels[mode]}`}
      onClick={() => apply(next)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        {mode === 'dark' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        ) : mode === 'light' ? (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </g>
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </button>
  );
}

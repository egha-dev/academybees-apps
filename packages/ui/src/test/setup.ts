import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks matchMedia (MUI useMediaQuery); default to a desktop viewport.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: /min-width:\s*(\d+)/.test(query)
        ? Number(/min-width:\s*(\d+)/.exec(query)?.[1]) <= 1280
        : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => cleanup());

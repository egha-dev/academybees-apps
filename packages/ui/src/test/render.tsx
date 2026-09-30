import { render, type RenderResult } from '@testing-library/react';
import axe from 'axe-core';
import { type ReactElement } from 'react';
import { expect } from 'vitest';

import { UiProvider } from '../provider.js';

export function renderUi(ui: ReactElement): RenderResult {
  return render(<UiProvider>{ui}</UiProvider>);
}

/**
 * axe on a rendered component. Colour contrast needs real layout, so it is checked in the
 * Playwright axe run against /dev/design-system (S11), not in jsdom.
 */
export async function expectAccessible(container: Element): Promise<void> {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

'use client';

import { PlainButton } from '@academybee/ui/components/plain-button';

/** Opens the browser's print dialog (the page's print styles show only the poster). */
export function PrintButton({ label }: { label: string }) {
  return (
    <PlainButton variant="primary" onClick={() => window.print()}>
      {label}
    </PlainButton>
  );
}

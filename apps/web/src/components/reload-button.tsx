'use client';

import { Button } from '@academybee/ui/components/actions';

/** Reload the current page (used where the next step is simply "try again"). */
export function ReloadButton({ label }: { label: string }) {
  return <Button onClick={() => window.location.reload()}>{label}</Button>;
}

'use client';

import { EmptyState } from '@academybee/ui/components/feedback';
import { CloudOffIcon } from '@academybee/ui/icons';

export function OfflineRetry({
  title,
  body,
  retryLabel,
}: {
  title: string;
  body: string;
  retryLabel: string;
}) {
  return (
    <EmptyState
      illustration={<CloudOffIcon sx={{ fontSize: 48, color: 'ab.textSecondary' }} aria-hidden />}
      title={title}
      body={body}
      action={{ label: retryLabel, onClick: () => window.location.reload() }}
    />
  );
}

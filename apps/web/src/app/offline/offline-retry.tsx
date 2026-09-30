'use client';

import { CloudOffIcon, color, EmptyState } from '@academybee/ui';

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
      illustration={<CloudOffIcon sx={{ fontSize: 48, color: color.neutral[500] }} aria-hidden />}
      title={title}
      body={body}
      action={{ label: retryLabel, onClick: () => window.location.reload() }}
    />
  );
}

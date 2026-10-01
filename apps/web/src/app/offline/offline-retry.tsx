'use client';

import { EmptyState } from '@academybee/ui/components/feedback';
import { CloudOffIcon } from '@academybee/ui/icons';
import { color } from '@academybee/ui/tokens';

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

import { Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type ReactNode } from 'react';

/** Page title, one line of context and the page's primary action (UX §10: where am I, what can I do). */
export function PageHeader({
  title,
  body,
  action,
}: {
  title: string;
  body?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{ gap: 3, alignItems: { sm: 'flex-end' }, justifyContent: 'space-between' }}
    >
      <Stack spacing={1} sx={{ minInlineSize: 0 }}>
        <Text variant="title" as="h1">
          {title}
        </Text>
        {body && <Text tone="secondary">{body}</Text>}
      </Stack>
      {action}
    </Stack>
  );
}

import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

import { monogram } from '@/lib/monogram';

/** The academy's identity on its own surfaces (UX v1.1 §8): monogram + name. */
export function AcademyIdentity({ name }: { name: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minInlineSize: 0 }}>
      <Box
        aria-hidden
        sx={{
          inlineSize: 40,
          blockSize: 40,
          flexShrink: 0,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          backgroundColor: 'ab.inverse',
          color: 'ab.onInverse',
          fontWeight: 700,
        }}
      >
        {monogram(name)}
      </Box>
      <Text variant="section" as="span">
        {name}
      </Text>
    </Stack>
  );
}

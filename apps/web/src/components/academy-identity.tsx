import { brandIdentityColors } from '@academybee/ui/brand';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

import { monogram } from '@/lib/monogram';

/**
 * The academy's identity on its own surfaces (UX v1.1 §8): monogram + name. The brand colour
 * tints the monogram tile only, and only when its text reads at ≥ 4.5:1 (C-49).
 */
export function AcademyIdentity({
  name,
  primaryColor,
}: {
  name: string;
  primaryColor?: string | null | undefined;
}) {
  const brand = brandIdentityColors(primaryColor);
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
          backgroundColor: brand?.background ?? 'ab.inverse',
          color: brand?.foreground ?? 'ab.onInverse',
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

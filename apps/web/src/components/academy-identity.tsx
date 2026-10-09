import { brandIdentityColors } from '@academybee/ui/brand';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { palettes } from '@academybee/ui/tokens';

import { monogram } from '@/lib/monogram';

/**
 * The academy's identity on its own surfaces (UX v1.1 §8): its uploaded logo (C-97) or, without
 * one, its initials on a tile. The brand colour tints that tile only, and only when its text reads
 * at ≥ 4.5:1 (C-49). The name is always written next to it, so the image is decorative.
 */
export function AcademyIdentity({
  name,
  primaryColor,
  logoUrl,
}: {
  name: string;
  primaryColor?: string | null | undefined;
  logoUrl?: string | null | undefined;
}) {
  const brand = brandIdentityColors(primaryColor);
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minInlineSize: 0 }}>
      {logoUrl ? (
        <Box
          component="img"
          src={logoUrl}
          alt=""
          width={40}
          height={40}
          sx={{
            inlineSize: 40,
            blockSize: 40,
            flexShrink: 0,
            objectFit: 'contain',
            borderRadius: 2,
            // The light surface in both themes: most logos are made for light backgrounds.
            backgroundColor: palettes.light.surface,
            border: '1px solid',
            borderColor: 'ab.border',
          }}
        />
      ) : (
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
      )}
      <Text variant="section" as="span">
        {name}
      </Text>
    </Stack>
  );
}

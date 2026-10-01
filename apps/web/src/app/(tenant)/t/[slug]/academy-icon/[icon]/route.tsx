import { brandIdentityColors } from '@academybee/ui/brand';
import { palettes } from '@academybee/ui/tokens';
import { ImageResponse } from 'next/og';

import { academyColor, hostContext } from '@/lib/host-context.server';
import { slugInitials } from '@/lib/short-name';

export const dynamic = 'force-dynamic';

const ICONS = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-180.png': { size: 180, maskable: true },
} as const;

/**
 * Generated academy app icon and favicon: initials on the academy's identity tile (brand colour
 * when its text passes contrast, else the neutral ink tile — C-49). Uploaded logos replace this
 * from Phase 3 (`TenantBranding.logoKey`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; icon: string }> },
) {
  const [{ slug, icon }, { context }] = await Promise.all([params, hostContext()]);
  const spec = ICONS[icon as keyof typeof ICONS];
  if (!spec || !context || !('slug' in context) || context.slug !== slug)
    return new Response(null, { status: 404 });
  const brand = brandIdentityColors(academyColor(context)) ?? {
    background: palettes.light.textPrimary,
    foreground: palettes.light.background,
  };
  const { size, maskable } = spec;
  const tile = Math.round(size * (maskable ? 1 : 0.9));
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: maskable ? brand.background : 'transparent',
      }}
    >
      <div
        style={{
          width: tile,
          height: tile,
          borderRadius: maskable ? 0 : Math.round(tile * 0.22),
          background: brand.background,
          color: brand.foreground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * (maskable ? 0.34 : 0.42)),
          fontWeight: 700,
        }}
      >
        {slugInitials(slug)}
      </div>
    </div>,
    {
      width: size,
      height: size,
      headers: { 'cache-control': 'private, max-age=300' },
    },
  );
}

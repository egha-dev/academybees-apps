import { brandIdentityColors } from '@academybee/ui/brand';
import { palettes } from '@academybee/ui/tokens';
import { getTranslations } from 'next-intl/server';

import { academyColor, academyName, hostContext } from '@/lib/host-context.server';
import { shortName } from '@/lib/short-name';

export const dynamic = 'force-dynamic';

/**
 * Per-academy web app manifest (ADR-015, ARCHITECTURE §5.5): each academy origin installs as its
 * own branded app for staff. Served at `/manifest.webmanifest` on the academy host.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, { context }, t] = await Promise.all([
    params,
    hostContext(),
    getTranslations('common'),
  ]);
  const name = academyName(context);
  if (!name || !context || !('slug' in context) || context.slug !== slug)
    return new Response(null, { status: 404 });
  const brand = brandIdentityColors(academyColor(context));
  const manifest = {
    id: '/',
    name,
    short_name: shortName(name),
    description: t('tagline'),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: palettes.light.background,
    theme_color: brand?.background ?? palettes.light.background,
    icons: [
      { src: '/academy-icon/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/academy-icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/academy-icon/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'private, max-age=300',
    },
  });
}

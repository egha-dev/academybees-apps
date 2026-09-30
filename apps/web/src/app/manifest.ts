import { createServerTranslator } from '@academybee/i18n';
import { color } from '@academybee/ui/tokens';
import type { MetadataRoute } from 'next';

/** Static manifest for Phase 0; Phase 1 serves a per-academy manifest (ADR-015, ARCHITECTURE §5.5). */
export default function manifest(): MetadataRoute.Manifest {
  const t = createServerTranslator('common');
  return {
    id: '/',
    name: t('appName'),
    short_name: t('appName'),
    description: t('tagline'),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: color.ivory,
    theme_color: color.ivory,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

import { color, palettes } from '@academybee/ui/tokens';
import { ImageResponse } from 'next/og';

import { t } from '@/lib/site';

export const dynamic = 'force-static';
export const alt = t('meta.ogAlt');
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview (Open Graph / X), rendered once at build time: ivory, ink, a gold honeycomb. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        background: palettes.light.background,
        color: color.ink,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg width="88" height="88" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="14" fill={color.ink} />
          <path d="M32 12 49.3 22v20L32 52 14.7 42V22Z" fill={color.gold} />
          <path d="M32 24.5 40.7 29.5v10L32 44.5 23.3 39.5v-10Z" fill={color.ink} />
        </svg>
        <div style={{ fontSize: 48, fontWeight: 700 }}>{t('meta.brand')}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ width: 96, height: 8, borderRadius: 4, background: color.gold }} />
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          {t('hero.title')}
        </div>
        <div style={{ fontSize: 30, color: palettes.light.textSecondary }}>{t('meta.ogLine')}</div>
      </div>
    </div>,
    size,
  );
}

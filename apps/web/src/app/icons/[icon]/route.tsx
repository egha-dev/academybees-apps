import { color } from '@academybee/ui/tokens';
import { ImageResponse } from 'next/og';

/** PNG app icons rendered at build time (no binaries in git, ADR-041). */
const ICONS = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-180.png': { size: 180, maskable: true },
} as const;

type IconName = keyof typeof ICONS;

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(ICONS).map((icon) => ({ icon }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  const { icon } = await params;
  const spec = ICONS[icon as IconName];
  if (!spec) return new Response(null, { status: 404 });
  const { size, maskable } = spec;
  // Maskable icons keep the mark inside the 80 % safe zone on a full-bleed background.
  const mark = Math.round(size * (maskable ? 0.62 : 0.86));
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: maskable ? color.ink : 'transparent',
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 64 64">
        <rect width="64" height="64" rx={maskable ? 0 : 14} fill={color.ink} />
        <path d="M32 12 49.3 22v20L32 52 14.7 42V22Z" fill={color.gold} />
        <path d="M32 24.5 40.7 29.5v10L32 44.5 23.3 39.5v-10Z" fill={color.ink} />
      </svg>
    </div>,
    { width: size, height: size },
  );
}

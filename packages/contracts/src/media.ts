import { z } from 'zod';

/**
 * Media purposes (C-93, C-97). Each purpose fixes its visibility and limits: only branding is
 * public (served from the public bucket's domain); everything else is private and read through
 * short-lived signed URLs. A purpose can never change visibility.
 */
export const MEDIA_PURPOSES = {
  'branding.logo': { visibility: 'PUBLIC', maxBytes: 2 * 1024 * 1024, area: 'branding' },
  'branding.favicon': { visibility: 'PUBLIC', maxBytes: 512 * 1024, area: 'branding' },
} as const satisfies Record<
  string,
  { visibility: 'PUBLIC' | 'PRIVATE'; maxBytes: number; area: string }
>;
export type MediaPurpose = keyof typeof MEDIA_PURPOSES;

/** Image types accepted for branding: no SVG (scripts), no GIF (C-93). */
export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type ImageMimeType = keyof typeof IMAGE_TYPES;

export type SniffedImage = { mimeType: ImageMimeType; width: number | null; height: number | null };

/**
 * What a file really is, from its first bytes — never from its name or the header the browser
 * sent. PNG, JPEG and WebP only; dimensions when the header carries them.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const b = bytes;
  const u32be = (i: number) =>
    ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const ascii = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 'PNG\r\n\x1a\n') && ascii(12, 'IHDR'))
    return { mimeType: 'image/png', width: u32be(16), height: u32be(20) };

  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Walk the segments to the frame header (SOF0–SOF15 except DHT/JPG/DAC) for the size.
    let i = 2;
    while (i + 9 < b.length && b[i] === 0xff) {
      const marker = b[i + 1]!;
      const length = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { mimeType: 'image/jpeg', width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + length;
    }
    return { mimeType: 'image/jpeg', width: null, height: null };
  }

  if (b.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8X'))
      return {
        mimeType: 'image/webp',
        width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      };
    if (ascii(12, 'VP8 ') && b.length >= 30)
      return { mimeType: 'image/webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (ascii(12, 'VP8L') && b.length >= 25) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return {
        mimeType: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return { mimeType: 'image/webp', width: null, height: null };
  }
  return null;
}

/** Largest side we accept for branding images (anything bigger is a photo, not a logo). */
export const MAX_IMAGE_SIDE = 4096;

/** `GET /academy/settings` — the academy profile (Settings → Academy, UX v1.1 §6). */
export const AcademySettingsSchema = z.object({
  name: z.string(),
  academyType: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  version: z.number().int(),
});
export type AcademySettings = z.infer<typeof AcademySettingsSchema>;

/** `GET /academy/branding` — identity on every surface (UX v1.1 §6, §8; C-49). */
export const AcademyBrandingSchema = z.object({
  displayName: z.string(),
  primaryColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  /** The AcademyBee address (changed only from the console, C-95). */
  host: z.string(),
  publicProfile: z.object({ enabled: z.boolean() }),
  /** Uploads work in this deployment (C-97: never faked when storage isn't configured). */
  uploadsAvailable: z.boolean(),
  version: z.number().int(),
});
export type AcademyBranding = z.infer<typeof AcademyBrandingSchema>;

/** `PATCH /academy/branding` — colour and the public-profile switch (Phase 8 builds the page). */
export const UpdateBrandingSchema = z.object({
  version: z.number().int(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  publicProfileEnabled: z.boolean().optional(),
});
export type UpdateBranding = z.infer<typeof UpdateBrandingSchema>;

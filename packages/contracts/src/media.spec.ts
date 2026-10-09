import { describe, expect, it } from 'vitest';

import { MEDIA_PURPOSES, sniffImage } from './media.js';

const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

describe('media (C-93, C-97)', () => {
  it('only branding is public', () => {
    for (const [purpose, def] of Object.entries(MEDIA_PURPOSES))
      expect(def.visibility === 'PUBLIC', purpose).toBe(purpose.startsWith('branding.'));
  });

  it('reads the real type and size from the bytes', () => {
    expect(sniffImage(png(512, 256))).toEqual({ mimeType: 'image/png', width: 512, height: 256 });
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 0, 0, 0, 0,
    ]);
    expect(sniffImage(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 128, height: 64 });
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8X\0\0\0\0\0\0\0\0');
    const vp8x = new Uint8Array(30);
    vp8x.set(webp);
    vp8x.set([99, 0, 0, 49, 0, 0], 24);
    expect(sniffImage(vp8x)).toEqual({ mimeType: 'image/webp', width: 100, height: 50 });
  });

  it('refuses SVG, GIF, HTML and anything renamed', () => {
    for (const text of [
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'GIF89a......',
      '<html>',
      '%PDF-1.7',
    ])
      expect(sniffImage(new TextEncoder().encode(text.padEnd(40, ' ')))).toBeNull();
  });
});

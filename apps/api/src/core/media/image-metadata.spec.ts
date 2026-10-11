import { sniffImage } from '@academybee/contracts';
import { describe, expect, it } from 'vitest';

import { stripImageMetadata } from './image-metadata.js';

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));

describe('stripImageMetadata', () => {
  it('drops EXIF (GPS), XMP and comments from a JPEG, keeping JFIF, ICC and the image data', () => {
    const seg = (marker: number, payload: string) => [
      0xff,
      marker,
      ...[(payload.length + 2) >> 8, (payload.length + 2) & 0xff],
      ...[...payload].map((c) => c.charCodeAt(0)),
    ];
    const jpeg = bytes(
      [0xff, 0xd8],
      seg(0xe0, 'JFIF\0\x01\x01'),
      seg(0xe1, 'Exif\0\0GPS 13.0827N 80.2707E'),
      seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'),
      seg(0xe2, 'ICC_PROFILE\0\x01\x01profile'),
      seg(0xfe, 'taken at home'),
      seg(0xc0, '\x08\x00\x10\x00\x20\x03'),
      [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9],
    );
    const out = stripImageMetadata(jpeg, 'image/jpeg');
    expect(has(out, 'GPS')).toBe(false);
    expect(has(out, 'xmpmeta')).toBe(false);
    expect(has(out, 'taken at home')).toBe(false);
    expect(has(out, 'JFIF')).toBe(true);
    expect(has(out, 'ICC_PROFILE')).toBe(true);
    expect(sniffImage(out)).toEqual({ mimeType: 'image/jpeg', width: 32, height: 16 });
    expect([...out.subarray(-9)]).toEqual([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
  });

  it('drops text and eXIf chunks from a PNG', () => {
    const chunk = (type: string, data: string) =>
      bytes([0, 0, 0, data.length], type, data, [0, 0, 0, 0]);
    const png = new Uint8Array([
      ...bytes([0x89], 'PNG\r\n\x1a\n'),
      ...chunk('IHDR', '\0\0\0\x02\0\0\0\x03\x08\x02\0\0\0'),
      ...chunk('tEXt', 'Author\0Parent'),
      ...chunk('eXIf', 'GPS'),
      ...chunk('IDAT', 'xx'),
      ...chunk('IEND', ''),
    ]);
    const out = stripImageMetadata(png, 'image/png');
    expect(has(out, 'tEXt')).toBe(false);
    expect(has(out, 'eXIf')).toBe(false);
    expect(has(out, 'IDAT')).toBe(true);
    expect(sniffImage(out)).toEqual({ mimeType: 'image/png', width: 2, height: 3 });
  });

  it('drops EXIF and XMP from an extended WebP, clearing the flags and fixing the size', () => {
    const chunk = (type: string, data: number[]) => [
      ...[...type].map((c) => c.charCodeAt(0)),
      data.length & 0xff,
      0,
      0,
      0,
      ...data,
      ...(data.length & 1 ? [0] : []),
    ];
    const body = [
      ...chunk('VP8X', [0b1100, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
      ...chunk('VP8 ', [1, 2, 3, 4]),
      ...chunk(
        'EXIF',
        [...'GPS'].map((c) => c.charCodeAt(0)),
      ),
      ...chunk('XMP ', [9, 9]),
    ];
    const webp = bytes('RIFF', [0, 0, 0, 0], 'WEBP', body);
    new DataView(webp.buffer).setUint32(4, webp.byteLength - 8, true);
    const out = stripImageMetadata(webp, 'image/webp');
    expect(has(out, 'EXIF')).toBe(false);
    expect(has(out, 'XMP ')).toBe(false);
    expect(out[20]! & 0b1100).toBe(0);
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.byteLength - 8);
    expect(sniffImage(out)).toEqual({ mimeType: 'image/webp', width: 2, height: 2 });
  });

  it('returns malformed input unchanged', () => {
    const broken = bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
    expect(stripImageMetadata(broken, 'image/jpeg')).toBe(broken);
  });
});

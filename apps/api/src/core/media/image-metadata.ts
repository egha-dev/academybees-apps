/**
 * Remove metadata from an uploaded image before it is stored (ARCHITECTURE §14 media; G-05,
 * G-06): EXIF (GPS position, camera, time), XMP, IPTC, comments and text chunks. Pixels and the
 * colour profile stay; nothing is re-encoded, so there is no native dependency. The browser
 * already redraws photos upright before uploading (student-photo.tsx), so the EXIF orientation is
 * not needed. Returns the input unchanged for anything it does not recognise as well-formed: the
 * caller has already sniffed the type, and a malformed file is rejected by the sniff.
 */
export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  if (mimeType === 'image/jpeg') return stripJpeg(bytes) ?? bytes;
  if (mimeType === 'image/png') return stripPng(bytes) ?? bytes;
  if (mimeType === 'image/webp') return stripWebp(bytes) ?? bytes;
  return bytes;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

const ascii = (b: Uint8Array, at: number, s: string) =>
  [...s].every((c, k) => b[at + k] === c.charCodeAt(0));

/**
 * JPEG: keep SOI, APP0 (JFIF), APP2 only when it is an ICC profile, APP14 (Adobe colour
 * transform) and every non-APP segment; drop APP1 (EXIF/XMP), other APPn and COM. Everything
 * from SOS on (the image data) is copied as is.
 */
function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda) {
      parts.push(b.subarray(i));
      return concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      return concat(parts);
    }
    const length = (b[i + 2]! << 8) | b[i + 3]!;
    if (length < 2 || i + 2 + length > b.length) return null;
    const segment = b.subarray(i, i + 2 + length);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep =
      (!isApp && marker !== 0xfe) ||
      marker === 0xe0 ||
      marker === 0xee ||
      (marker === 0xe2 && ascii(b, i + 4, 'ICC_PROFILE\0'));
    if (keep) parts.push(segment);
    i += 2 + length;
  }
  return null;
}

/** PNG: drop tEXt, zTXt, iTXt, eXIf and tIME chunks (each chunk carries its own CRC). */
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || b[0] !== 0x89 || !ascii(b, 1, 'PNG\r\n\x1a\n')) return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
    const end = i + 12 + length;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}

/**
 * WebP: in an extended (VP8X) file, drop the EXIF and XMP chunks, clear their flags and fix the
 * RIFF size. Simple (VP8/VP8L) files carry no metadata.
 */
function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null;
  if (!ascii(b, 12, 'VP8X')) return b;
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = (b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24)) >>> 0;
    const end = i + 8 + size + (size & 1);
    if (end > b.length) return null;
    if (!ascii(b, i, 'EXIF') && !ascii(b, i, 'XMP ')) parts.push(b.subarray(i, end));
    i = end;
  }
  if (i !== b.length) return null;
  const body = concat(parts);
  // VP8X flags: bit 3 = EXIF, bit 2 = XMP.
  body[8] = body[8]! & ~0b1100;
  const out = new Uint8Array(12 + body.byteLength);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.byteLength - 8, true);
  return out;
}

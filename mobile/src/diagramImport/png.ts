/**
 * A minimal PNG encoder (8-bit RGBA, no filtering, stored deflate blocks) for pictures the app makes itself, such as
 * the straightened floor of a 3D stage drawing. No compression: a 1024 x 768 picture is about 3 MB, which the import's
 * 50 MB file limit allows. Pure TypeScript, so it runs the same on the phone, on the web and in tests.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
export function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || rgba.length !== width * height * 4)
    throw new Error('Invalid picture size for PNG.');
  // Raw scanlines: filter byte 0, then the row.
  const rowBytes = width * 4 + 1, raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * rowBytes + 1);
  // zlib stream of stored blocks (at most 65535 bytes each).
  const blocks = Math.max(1, Math.ceil(raw.length / 65535)), zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78; zlib[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535, len = Math.min(65535, raw.length - start);
    zlib[o++] = b === blocks - 1 ? 1 : 0; zlib[o++] = len & 0xff; zlib[o++] = len >>> 8; zlib[o++] = ~len & 0xff; zlib[o++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), o); o += len;
  }
  const adler = adler32(raw);
  zlib[o++] = adler >>> 24; zlib[o++] = (adler >>> 16) & 0xff; zlib[o++] = (adler >>> 8) & 0xff; zlib[o++] = adler & 0xff;
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const header = new Uint8Array(13), hv = new DataView(header.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height); header[8] = 8; header[9] = 6; // 8-bit RGBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

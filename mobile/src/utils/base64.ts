const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => { const t = new Uint8Array(128).fill(255); for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i; return t; })();

/** Strict standard base64 to bytes. Hermes-safe (no Buffer/atob); O(1) per character. */
export function base64ToBytes(text: string): Uint8Array {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid base64 data.');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(text.length / 4 * 3 - padding);
  const value = (i: number) => { const code = text.charCodeAt(i); return code === 61 ? 0 : LOOKUP[code]; };
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = value(i), b = value(i + 1), c = value(i + 2), d = value(i + 3);
    out[offset++] = (a << 2) | (b >> 4);
    if (offset < out.length) out[offset++] = ((b & 15) << 4) | (c >> 2);
    if (offset < out.length) out[offset++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** Little-endian signed 16-bit PCM (base64) to floats in [-1, 1]. */
export function pcm16ToFloat32(text: string): Float32Array {
  const bytes = base64ToBytes(text);
  if (bytes.length % 2 !== 0) throw new Error('PCM data has an odd byte count.');
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) {
    const raw = bytes[2 * i] | (bytes[2 * i + 1] << 8);
    out[i] = (raw >= 0x8000 ? raw - 0x10000 : raw) / 32767;
  }
  return out;
}

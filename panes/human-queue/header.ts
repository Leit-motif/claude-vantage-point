// A picture's type and size from its first bytes (issue 152), pure. Windows has no sips, so the
// card fetches a picture as it is and reads its size here instead.

export type Header = { type: 'png' | 'jpeg' | 'gif' | 'webp'; width: number; height: number }

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))

/** The type, width and height a PNG, JPEG, GIF or WebP opens with, or null for anything else or too few bytes. */
export function headerOf(bytes: Uint8Array): Header | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fits = (end: number) => end <= bytes.length
  const sized = (type: Header['type'], width: number, height: number): Header | null => (width > 0 && height > 0 ? { type, width, height } : null)
  if (fits(24) && ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR') return sized('png', view.getUint32(16), view.getUint32(20))
  if (fits(10) && ascii(bytes, 0, 4) === 'GIF8') return sized('gif', view.getUint16(6, true), view.getUint16(8, true))
  if (fits(30) && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4)
    // Lossy: a frame tag at 23, then 14-bit sides. Lossless: a 0x2f signature, then 14-bit sides packed less one.
    if (chunk === 'VP8 ') return sized('webp', view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return sized('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X') return sized('webp', (view.getUint32(24, true) & 0xffffff) + 1, (view.getUint32(27, true) & 0xffffff) + 1)
    return null
  }
  if (fits(4) && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk the segments to the first start of frame; each segment says its own length.
    let at = 2
    while (fits(at + 4)) {
      if (bytes[at] !== 0xff) return null
      const marker = bytes[at + 1]!
      if (marker === 0xff) {
        at++
        continue
      }
      const length = view.getUint16(at + 2)
      const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (frame) return fits(at + 9) ? sized('jpeg', view.getUint16(at + 7), view.getUint16(at + 5)) : null
      at += 2 + length
    }
  }
  return null
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The bytes of `base64`'s first `most` characters, by hand: the engine's globals are not the browser's. */
export function bytesOf(base64: string, most = base64.length): Uint8Array {
  const text = base64.slice(0, most).replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4))
  let bits = 0
  let held = 0
  let at = 0
  for (const char of text) {
    const value = ALPHABET.indexOf(char)
    if (value < 0) break
    bits = (bits << 6) | value
    held += 6
    if (held >= 8) {
      held -= 8
      bytes[at++] = (bits >>> held) & 0xff
    }
  }
  return bytes.subarray(0, at)
}

/** The most base64 a header is read from: 256 KiB, past the longest EXIF block a JPEG holds before its size. */
export const HEADER_BASE64 = 349_528

/** `headerOf` over base64, decoding only what a header needs. */
export const headerOfBase64 = (base64: string): Header | null => headerOf(bytesOf(base64, HEADER_BASE64))

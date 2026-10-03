/** A PNG writer for a pixel buffer (RGBA, no filter, zlib from node), and a reader for reference pictures. Enough for the mock's pictures. */

import { deflateSync, inflateSync } from 'node:zlib'

let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set([...type].map((c) => c.charCodeAt(0)), 4)
  out.set(data, 8)
  const crcInput = new Uint8Array(4 + data.length); crcInput.set(out.subarray(4, 8)); crcInput.set(data, 4)
  view.setUint32(8 + data.length, crc32(crcInput))
  return out
}

export function encodePng(width: number, height: number, rgba: Uint8ClampedArray, scale = 1): Buffer {
  const outWidth = width * scale, outHeight = height * scale
  const raw = new Uint8Array((outWidth * 4 + 1) * outHeight)
  for (let y = 0; y < outHeight; y += 1) {
    const rowStart = y * (outWidth * 4 + 1)
    raw[rowStart] = 0
    const sy = Math.floor(y / scale)
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.floor(x / scale)
      const si = (sy * width + sx) * 4
      raw.set(rgba.subarray(si, si + 4), rowStart + 1 + x * 4)
    }
  }
  const header = new Uint8Array(13); const hv = new DataView(header.buffer)
  hv.setUint32(0, outWidth); hv.setUint32(4, outHeight); header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))])
}

/** A PNG reader: 8-bit RGB or RGBA, not interlaced — enough for a reference picture. Returns RGBA. */
export function decodePng(file: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let at = 8, width = 0, height = 0, channels = 0
  let palette: Uint8Array | null = null, alpha: Uint8Array | null = null
  const parts: Uint8Array[] = []
  while (at < file.length) {
    const length = view.getUint32(at), type = String.fromCharCode(...file.subarray(at + 4, at + 8))
    const data = file.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8); height = view.getUint32(at + 12)
      const depth = data[8], color = data[9], interlace = data[12]
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6 && color !== 3)) throw new Error('PNG: only 8-bit RGB, RGBA or palette, not interlaced')
      channels = color === 6 ? 4 : color === 3 ? 1 : 3
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') alpha = data
    else if (type === 'IDAT') parts.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const out = new Uint8ClampedArray(width * height * 4)
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 0xff
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4
      if (channels === 1 && palette) {
        const k = cur[x]
        out[o] = palette[k * 3]; out[o + 1] = palette[k * 3 + 1]; out[o + 2] = palette[k * 3 + 2]; out[o + 3] = alpha && k < alpha.length ? alpha[k] : 255
      } else { out[o] = cur[x * channels]; out[o + 1] = cur[x * channels + 1]; out[o + 2] = cur[x * channels + 2]; out[o + 3] = channels === 4 ? cur[x * channels + 3] : 255 }
    }
    prev.set(cur)
  }
  return { width, height, rgba: out }
}

/** An indexed PNG: a palette of up to 256 colours, one byte a pixel; index 0 transparent when `clearZero`. Small for pixel art. */
export function encodeIndexedPng(width: number, height: number, indices: Uint8Array, palette: ReadonlyArray<readonly [number, number, number]>, clearZero = false): Buffer {
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y += 1) { raw[y * (width + 1)] = 0; raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1) }
  const header = new Uint8Array(13); const hv = new DataView(header.buffer)
  hv.setUint32(0, width); hv.setUint32(4, height); header[8] = 8; header[9] = 3; header[10] = 0; header[11] = 0; header[12] = 0
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach(([r, g, b], i) => { plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b })
  const chunks = [chunk('IHDR', header), chunk('PLTE', plte)]
  if (clearZero) chunks.push(chunk('tRNS', Uint8Array.of(0)))
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0)))
  return Buffer.concat([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks])
}

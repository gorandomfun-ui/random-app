/** A PNG writer for a pixel buffer: RGBA, no filter, zlib from node. Enough for the mock's pictures. */

import { deflateSync } from 'node:zlib'

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

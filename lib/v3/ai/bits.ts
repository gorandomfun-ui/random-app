/**
 * The fingerprint's bits, as the site reads them: pack, compare, find the
 * centres of a taste. Nothing here loads the model — that is
 * lib/v3/ai/fingerprint.ts, for the ingestion server only; the site must
 * never pull the model's runtime into its build (the deploy of 2 October
 * failed on it).
 */

import { Binary } from 'mongodb'

export const DIMS = 384
export const BYTES = DIMS / 8
/** The field a fingerprint is stored in, on the item itself. */
export const FIELD = 'vec'

/** The signs of a vector, packed: bit i set when dimension i is positive. */
export function pack(vector: ArrayLike<number>): Uint8Array {
  const bits = new Uint8Array(BYTES)
  for (let index = 0; index < DIMS; index += 1) if ((vector[index] ?? 0) > 0) bits[index >> 3] |= 1 << (index & 7)
  return bits
}

/** The packed bits as ±1 numbers. */
export function unpack(bits: Uint8Array): Float32Array {
  const out = new Float32Array(DIMS)
  for (let index = 0; index < DIMS; index += 1) out[index] = bits[index >> 3] & (1 << (index & 7)) ? 1 : -1
  return out
}

const POPCOUNT = new Uint8Array(256)
for (let value = 0; value < 256; value += 1) POPCOUNT[value] = (value & 1) + POPCOUNT[value >> 1]

/** How alike two fingerprints are: 1 when every bit agrees, 0 when none does, 0.5 for strangers. */
export function alike(a: Uint8Array, b: Uint8Array): number {
  let differ = 0
  for (let index = 0; index < BYTES; index += 1) differ += POPCOUNT[a[index] ^ b[index]]
  return 1 - differ / DIMS
}

/** The likeness of a fingerprint to a centre of taste (a mean of ±1 vectors): the cosine, between -1 and 1. */
export function towards(bits: Uint8Array, centre: Float32Array): number {
  let dot = 0, norm = 0
  for (let index = 0; index < DIMS; index += 1) {
    const sign = bits[index >> 3] & (1 << (index & 7)) ? 1 : -1
    dot += sign * centre[index]
    norm += centre[index] * centre[index]
  }
  return norm ? dot / Math.sqrt(norm * DIMS) : 0
}

/** A few centres of taste out of the fingerprints of what was liked: k-means in the ±1 space, a handful of rounds. */
export function centres(fingerprints: readonly Uint8Array[], k = 4, rounds = 8): Float32Array[] {
  const points = fingerprints.map(unpack)
  if (!points.length) return []
  const count = Math.min(k, points.length)
  let means = points.slice(0, count).map((point) => Float32Array.from(point))
  for (let round = 0; round < rounds; round += 1) {
    const sums = means.map(() => new Float32Array(DIMS)), sizes = means.map(() => 0)
    for (const point of points) {
      let best = 0, bestScore = -Infinity
      means.forEach((mean, index) => { let dot = 0; for (let d = 0; d < DIMS; d += 1) dot += point[d] * mean[d]; if (dot > bestScore) { bestScore = dot; best = index } })
      for (let d = 0; d < DIMS; d += 1) sums[best][d] += point[d]
      sizes[best] += 1
    }
    means = sums.map((sum, index) => (sizes[index] ? sum.map((value) => value / sizes[index]) : means[index]))
  }
  return means
}

/** The fingerprint as a row stores it, and back. */
export const toBinary = (bits: Uint8Array): Binary => new Binary(Buffer.from(bits))
export function fromRow(value: unknown): Uint8Array | null {
  const buffer = value instanceof Binary ? value.buffer : Buffer.isBuffer(value) ? value : null
  return buffer && buffer.length === BYTES ? new Uint8Array(buffer) : null
}

/** Characters of the description the model reads after the title: the title says what a video is, the description's first line confirms it. */
export const DESCRIPTION_CHARS = 120

/**
 * What the model reads for a video: its title, then the start of its
 * description. Short on purpose: the model's time grows with the words,
 * and the ingestion server's shared core read two videos a second with
 * three hundred characters of description (2 October) — too slow for the
 * day's intake. The first line is enough to tell a dinner from a match.
 */
export function textOf(row: { title?: unknown; description?: unknown }): string {
  return `${String(row.title ?? '')}. ${String(row.description ?? '').replace(/\s+/g, ' ').slice(0, DESCRIPTION_CHARS)}`.trim()
}


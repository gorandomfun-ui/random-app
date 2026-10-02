/**
 * The fingerprint of a video: what it is about, as a small open model reads
 * its title and description, in any language (the owner, 1 October: "une
 * petite IA locale… ça ressemble à ce que j'aime, même si c'est un autre
 * pays, un autre auteur").
 *
 * The model (paraphrase-multilingual-MiniLM-L12-v2, quantised, ~120 MB on
 * disk, 410 MB in memory on the ingestion server, 45 titles a second there)
 * gives 384 numbers; only their signs are kept — 384 bits, 48 bytes a video,
 * 58 MB for the whole stock — and two videos are as close as their bits
 * agree. Coarser than the full numbers, good enough to tell a family dinner
 * on VHS from a Minecraft episode, and cheap enough to live on every row.
 *
 * Nothing here calls anyone: the model runs on our machine, from its cache.
 */

import { Binary } from 'mongodb'

export const DIMS = 384
export const BYTES = DIMS / 8
export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
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

/** What the model reads for a video: its title, then the first lines of its description. */
export function textOf(row: { title?: unknown; description?: unknown }): string {
  return `${String(row.title ?? '')}. ${String(row.description ?? '').replace(/\s+/g, ' ').slice(0, 300)}`.trim()
}

type Extractor = (texts: string[], options: Record<string, unknown>) => Promise<{ dims: number[]; data: Float32Array }>

let loaded: Promise<Extractor> | null = null
let disposer: (() => Promise<void>) | null = null

/** The model let go before the process ends: its runtime's threads crash a bare exit. */
export async function disposeModel(): Promise<void> {
  const dispose = disposer
  disposer = null; loaded = null
  if (dispose) await dispose().catch(() => undefined)
}

/** The model, loaded once per process from its cache (`RANDOM_MODELS_DIR`, the server's /home/random/models). */
export async function model(): Promise<Extractor> {
  loaded ??= (async () => {
    const transformers = await import('@huggingface/transformers')
    transformers.env.cacheDir = process.env.RANDOM_MODELS_DIR ?? './models'
    const pipe = await transformers.pipeline('feature-extraction', MODEL, { dtype: 'q8' })
    disposer = () => (pipe as unknown as { dispose: () => Promise<void> }).dispose()
    return (texts, options) => pipe(texts, options) as unknown as Promise<{ dims: number[]; data: Float32Array }>
  })()
  return loaded
}

/** The fingerprints of a batch of texts. */
export async function fingerprints(texts: string[]): Promise<Uint8Array[]> {
  if (!texts.length) return []
  const extractor = await model()
  const out = await extractor(texts, { pooling: 'mean', normalize: true, batch_size: 32 })
  const width = out.dims[1] ?? DIMS
  return texts.map((_, index) => pack(out.data.subarray(index * width, index * width + DIMS)))
}

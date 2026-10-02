/**
 * The fingerprint of a video: what it is about, as a small open model reads
 * its title and description, in any language (the owner, 1 October: "une
 * petite IA locale… ça ressemble à ce que j'aime, même si c'est un autre
 * pays, un autre auteur").
 *
 * The model (paraphrase-multilingual-MiniLM-L12-v2, quantised, ~120 MB on
 * disk) gives 384 numbers; only their signs are kept — 384 bits, 48 bytes a
 * video, 58 MB for the whole stock — and two videos are as close as their
 * bits agree. Coarser than the full numbers, good enough to tell a family
 * dinner on VHS from a Minecraft episode, and cheap enough to live on every
 * row.
 *
 * Memory, measured 2 October: 700 MB once loaded (270 MB for the word
 * cutter's 250,000-entry vocabulary, 340 MB for the weights), and the texts
 * handed to it at once add their activations on top — two hundred at once
 * added 400 MB and swapped the ingestion server (969 MB) to a standstill, so
 * the texts go through in slices of `CHUNK`, 50 MB more at most, as fast.
 * The server's unit gives the line that room and makes it run alone
 * (server/units/random-line@vec.service.d, server/run-line.sh).
 *
 * Nothing here calls anyone: the model runs on our machine, from its cache.
 */

import { DIMS, pack } from './bits'

export * from './bits'
export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

export type Extractor = (texts: string[], options: Record<string, unknown>) => Promise<{ dims: number[]; data: Float32Array }>

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

/** Texts handed to the model at once: its activations grow with the slice, not the run. */
export const CHUNK = 16

/** The fingerprints of a batch of texts, in order; the model is `run`, loaded from its cache unless a test hands one in. */
export async function fingerprints(texts: string[], run?: Extractor): Promise<Uint8Array[]> {
  if (!texts.length) return []
  const extractor = run ?? await model()
  const prints: Uint8Array[] = []
  for (let start = 0; start < texts.length; start += CHUNK) {
    const slice = texts.slice(start, start + CHUNK)
    const out = await extractor(slice, { pooling: 'mean', normalize: true })
    const width = out.dims[1] ?? DIMS
    for (let index = 0; index < slice.length; index += 1) prints.push(pack(out.data.subarray(index * width, index * width + DIMS)))
  }
  return prints
}

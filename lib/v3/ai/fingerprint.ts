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

import { DIMS, pack } from './bits'

export * from './bits'
export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

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

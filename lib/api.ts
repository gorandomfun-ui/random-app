// lib/api.ts
import type { RandomApiResponse, RandomContentItem } from './random/clientTypes'
import type { VideoPool } from './random/types'
import type { ItemType } from './random/types'
import type { WaveSimilarityHint } from './random/wave'

export type RandomTypes = Array<'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'>

export async function fetchRandom({
  types,
  lang,
  strong = false,
  videoPool,
  preview = false,
  timeoutMs = 2500,
}: {
  types: RandomTypes
  lang: 'en' | 'fr' | 'de' | 'jp' | 'es'
  strong?: boolean
  videoPool?: VideoPool
  preview?: boolean
  timeoutMs?: number
}): Promise<RandomApiResponse> {
  const qs = new URLSearchParams({
    types: types.join(','),
    lang,
    // anti-cache dev/proxy
    t: String(Date.now()),
  })
  if (strong) qs.set('pool', 'strong')
  if (videoPool) qs.set('videoPool', videoPool)
  if (preview) qs.set('preview', '1')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(250, timeoutMs))
  try {
    const res = await fetch(`/api/random?${qs.toString()}`, {
      cache: 'no-store', // Next 14: désactive le cache fetch côté client
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // l’API renvoie { item: {...} } — on renvoie tel quel pour que page.tsx fasse res.item
    return (await res.json()) as RandomApiResponse
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchWave({
  anchor,
  lang,
  excludeIds = [],
  limit = 10,
  types,
  factVariant,
  signal,
}: {
  anchor: WaveSimilarityHint
  lang: 'en' | 'fr' | 'de' | 'jp' | 'es'
  excludeIds?: string[]
  limit?: number
  types?: ItemType[]
  factVariant?: 'quiz' | 'text'
  signal?: AbortSignal
}): Promise<{ items: RandomContentItem[] }> {
  const res = await fetch('/api/wave', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anchor, lang, excludeIds, limit, types, factVariant }),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json() as { items: RandomContentItem[] }
}

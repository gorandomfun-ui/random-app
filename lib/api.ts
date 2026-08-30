// lib/api.ts
import type { RandomApiResponse } from './random/clientTypes'
import type { VideoPool } from './random/types'

export type RandomTypes = Array<'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'>

export async function fetchRandom({
  types,
  lang,
  strong = false,
  videoPool,
  preview = false,
}: {
  types: RandomTypes
  lang: 'en' | 'fr' | 'de' | 'jp' | 'es'
  strong?: boolean
  videoPool?: VideoPool
  preview?: boolean
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
  const res = await fetch(`/api/random?${qs.toString()}`, {
    cache: 'no-store', // Next 14: désactive le cache fetch côté client
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // l’API renvoie { item: {...} } — on renvoie tel quel pour que page.tsx fasse res.item
  return (await res.json()) as RandomApiResponse
}
